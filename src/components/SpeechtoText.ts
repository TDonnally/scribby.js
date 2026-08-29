import { Scribby } from "./Scribby.js";
import type { WhisperClient } from "../whisper/whisper.js";
import { SpeechOutput } from "./SpeechOutput/SpeechOutput.js";

export enum Input {
    mic = "mic",
    speaker = "speaker"
}

type TranscriptChunk = {
    id: string;
    text: string;
    start_sec: number;
    end_sec: number;
    segment_id: string | null;
};

export class SpeechToText {
    scribby: Scribby;
    innerContent: string;
    input: Input;
    el!: HTMLButtonElement;
    outputEl!: HTMLDivElement;
    whisper: WhisperClient | null = null;

    speechOutput!: SpeechOutput;
    waitingSpan: HTMLSpanElement | null = null;
    waitingInterval: number | null = null;

    private isListening = false;

    private stream: MediaStream | null = null;
    private recorder: MediaRecorder | null = null;
    private audioContext: AudioContext | null = null;
    private pcmNode: AudioWorkletNode | null = null;
    private transcribeQueue: Promise<void> = Promise.resolve();

    private recordingId: string | null = null;
    private activeSegmentId: string | null = null;
    private nextPartNumber = 1;
    private segmentStartedAt: number | null = null;
    private segmentTimelineOffsetMs = 0;
    private recordingGeneration = 0;

    private static readonly MULTIPART_MIN_BYTES = 5 * 1024 * 1024;

    private headerBlob: Blob | null = null;
    private pendingChunks: Blob[] = [];
    private pendingBytes = 0;
    private hasUploadedMultipartPart = false;
    private currentMimeType = "audio/webm";

    private pcmWindow: Float32Array[] = [];
    private pcmWindowSamples = 0;
    private pcmFlushedSamples = 0;

    private static readonly TRANSCRIBE_SAMPLE_RATE = 16000;
    private static readonly TRANSCRIBE_MIN_SAMPLES = 16000 * 10;
    private static readonly RECORDER_TIMESLICE_MS = 1000;
    private static readonly PCM_WORKLET_URL = "/scripts/pcm-tap.js";

    constructor(
        scribby: Scribby,
        innerContent: string,
        input: Input,
    ) {
        this.scribby = scribby;
        this.innerContent = innerContent;
        this.input = input;
        this.el = document.createElement("button");
    }

    async mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        this.el.disabled = true;

        if (!this.scribby.whisperEnabled) {
            this.el.hidden = true;
            return;
        }

        /*
         * Whisper is intentionally not initialized here. The worker and model
         * are created only when recording actually starts.
         */
        this.el.disabled = false;

        this.waitingSpan = this.createWaitingSpan();

        document.addEventListener("stop-recording", async () => {
            await this.stopRecording();
        });

        document.addEventListener("request-speech-controller", async (e: Event) => {
            const custom = e as CustomEvent<{ input?: Input; target?: SpeechOutput }>;

            if (!custom.detail?.input || !custom.detail?.target) {
                return;
            }

            if (custom.detail.input !== this.input) {
                return;
            }

            custom.detail.target.controller = this;
            await this.startRecording(custom.detail.target, custom.detail.input);
        });

        this.el.addEventListener("click", async () => {
            if (this.isListening) {
                await this.stopRecording();
            } else {
                await this.startRecording(null, this.input);
            }
        });
    }

    private createWaitingSpan(): HTMLSpanElement {
        const span = document.createElement("span");
        span.classList.add("waiting-span");
        span.innerText = "listening.";
        return span;
    }

    private shouldFlushTranscript(): boolean {
        return this.pcmWindowSamples >= SpeechToText.TRANSCRIBE_MIN_SAMPLES;
    }

    private enqueueTranscribe(samples: Float32Array, startMs: number, endMs: number) {
        const speechOutput = this.speechOutput;
        const segmentId = this.activeSegmentId;
        const timelineOffsetMs = this.segmentTimelineOffsetMs;
        const threads = this.scribby.whisperThreadCount;
        const whisper = this.whisper;

        if (!whisper) {
            console.warn("[whisper] dropped window, no client", { startMs, endMs });
            return;
        }

        this.transcribeQueue = this.transcribeQueue
            .then(async () => {
                const audioSeconds = Math.max(0, (endMs - startMs) / 1000);
                const label = `whisper ${audioSeconds.toFixed(1)}s ${crypto.randomUUID().slice(0, 8)}`;

                let transcript = "";

                console.time(label);

                try {
                    console.log("[whisper] starting transcription", {
                        samples: samples.length,
                        byteLength: samples.byteLength,
                        startMs,
                        endMs,
                        threads,
                    });

                    transcript = await whisper.transcribeSamples(samples, {
                        language: "en",
                        threads,
                    });

                    console.log("[whisper] transcription result", {
                        transcript,
                    });
                } finally {
                    console.timeEnd(label);
                }

                if (transcript.includes("BLANK_AUDIO")) {
                    console.debug("[whisper] blank window", { startMs, endMs });
                    return;
                }

                const text = transcript.trim();

                if (!text) {
                    console.debug("[whisper] empty window", { startMs, endMs });
                    return;
                }

                if (this.waitingSpan) {
                    this.waitingSpan.remove();
                    this.waitingSpan = null;

                    if (this.waitingInterval) {
                        clearInterval(this.waitingInterval);
                        this.waitingInterval = null;
                    }
                }

                const chunk: TranscriptChunk = {
                    id: crypto.randomUUID(),
                    text,
                    start_sec: (timelineOffsetMs + startMs) / 1000,
                    end_sec: (timelineOffsetMs + endMs) / 1000,
                    segment_id: segmentId,
                };

                speechOutput.addTranscriptChunk(chunk);
                const saveEvent = new CustomEvent("save-document")
                document.dispatchEvent(saveEvent);
            })
            .catch((err) => console.error("transcribe failed", err));
    }

    private async saveMultipartPart(blob: Blob, finalPart = false, durationMs?: number): Promise<void> {
        if (!this.activeSegmentId) {
            throw new Error("No active segment id");
        }

        const params = new URLSearchParams({
            part_number: String(this.nextPartNumber),
            final_part: String(finalPart),
        });

        if (finalPart && typeof durationMs === "number") {
            params.set("duration_ms", String(durationMs));
        }

        const res = await fetch(
            `/audio/segments/${this.activeSegmentId}/blob?${params.toString()}`,
            {
                method: "PUT",
                credentials: "include",
                headers: {
                    "Content-Type": blob.type || "audio/webm",
                },
                body: blob,
            }
        );

        if (!res.ok) {
            const msg = await res.text().catch(() => "");

            let errorBody: any = {};

            try {
                errorBody = msg ? JSON.parse(msg) : {};
            } catch {
                errorBody = {
                    error: msg || `Failed to upload multipart blob: ${res.status}`,
                };
            }

            if (res.status === 402) {
                window.dispatchEvent(
                    new CustomEvent("usage-limit", {
                        detail: errorBody,
                    })
                );
            }

            throw new Error(`Failed to upload multipart blob: ${res.status} ${errorBody.error || msg}`);
        }

        this.nextPartNumber += 1;
        this.hasUploadedMultipartPart = true;
    }

    private async saveWholeFile(blob: Blob, durationMs: number): Promise<void> {
        if (!this.activeSegmentId) {
            throw new Error("No active segment id");
        }

        const params = new URLSearchParams({
            duration_ms: String(durationMs),
        });

        const res = await fetch(`/audio/segments/${this.activeSegmentId}/file?${params.toString()}`, {
            method: "PUT",
            credentials: "include",
            headers: {
                "Content-Type": blob.type || "audio/webm",
            },
            body: blob,
        });

        if (!res.ok) {
            const msg = await res.text().catch(() => "");

            let errorBody: any = {};

            try {
                errorBody = msg ? JSON.parse(msg) : {};
            } catch {
                errorBody = {
                    error: msg || `Failed to upload single file: ${res.status}`,
                };
            }

            if (res.status === 402) {
                window.dispatchEvent(
                    new CustomEvent("usage-limit", {
                        detail: errorBody,
                    })
                );
            }

            throw new Error(`Failed to upload single file: ${res.status} ${errorBody.error || msg}`);
        }
    }

    private async flushPendingAudio(finalPart: boolean): Promise<void> {
        if (!this.headerBlob || this.pendingChunks.length === 0) {
            return;
        }

        /*
         * The header belongs only to the first part. Later parts are raw
         * continuations of the same stream.
         */
        const parts = this.nextPartNumber === 1
            ? [this.headerBlob, ...this.pendingChunks]
            : [...this.pendingChunks];

        const blob = new Blob(parts, {
            type: this.currentMimeType,
        });

        const durationMs = this.getSegmentDurationMs();

        if (this.hasUploadedMultipartPart || this.pendingBytes >= SpeechToText.MULTIPART_MIN_BYTES) {
            await this.saveMultipartPart(blob, finalPart, durationMs);
        } else if (finalPart) {
            await this.saveWholeFile(blob, durationMs);
        } else {
            await this.saveMultipartPart(blob, false);
        }

        this.pendingChunks = [];
        this.pendingBytes = 0;

        if (finalPart && this.speechOutput) {
            this.speechOutput.refreshPlayback().catch(console.error);
        }
    }

    private flushPendingTranscript(): void {
        console.log("[pcm] flushPendingTranscript called", {
            pcmWindowSamples: this.pcmWindowSamples,
            chunks: this.pcmWindow.length,
        });

        if (this.pcmWindowSamples === 0) {
            console.warn("[pcm] flush aborted: zero samples");
            return;
        }

        const samples = new Float32Array(this.pcmWindowSamples);
        let offset = 0;

        for (const chunk of this.pcmWindow) {
            samples.set(chunk, offset);
            offset += chunk.length;
        }

        let sum = 0;

        for (const sample of samples) {
            sum += sample * sample;
        }

        console.log("[pcm] assembled window", {
            samples: samples.length,
            bytes: samples.byteLength,
            rms: Math.sqrt(sum / samples.length),
        });

        const rate = SpeechToText.TRANSCRIBE_SAMPLE_RATE;
        const startMs = (this.pcmFlushedSamples / rate) * 1000;
        const endMs = ((this.pcmFlushedSamples + this.pcmWindowSamples) / rate) * 1000;

        this.pcmFlushedSamples += this.pcmWindowSamples;
        this.pcmWindow = [];
        this.pcmWindowSamples = 0;

        console.log("[pcm] enqueueing whisper", {
            startMs,
            endMs,
            samples: samples.length,
        });

        this.enqueueTranscribe(samples, startMs, endMs);
    }

    private async createNewSegment(recordingId: string): Promise<string> {
        const res = await fetch(`/audio/${recordingId}/segments`, {
            method: "POST",
            credentials: "include",
            headers: {
                Accept: "application/json",
            },
        });

        if (!res.ok) {
            const msg = await res.text().catch(() => "");
            throw new Error(`Create segment failed: ${res.status} ${msg}`);
        }

        const data = await res.json();
        return data.segment_id;
    }

    private getSegmentDurationMs(): number {
        if (!this.segmentStartedAt) {
            return 0;
        }

        return Math.max(0, Date.now() - this.segmentStartedAt);
    }

    private resetUploadState() {
        this.nextPartNumber = 1;

        this.headerBlob = null;
        this.pendingChunks = [];
        this.pendingBytes = 0;
        this.hasUploadedMultipartPart = false;

        this.pcmWindow = [];
        this.pcmWindowSamples = 0;
        this.pcmFlushedSamples = 0;
    }

    private createRecorder(
        audioStream: MediaStream,
        analyser: AnalyserNode,
        bufferLength: number,
        dataArray: Uint8Array<ArrayBuffer>,
        whisper: WhisperClient,
        releaseWhisper: () => void,
        generation: number,
    ): MediaRecorder {
        this.headerBlob = null;
        this.pendingChunks = [];
        this.pendingBytes = 0;
        this.hasUploadedMultipartPart = false;

        const candidates = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg",
        ];

        const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm";
        this.currentMimeType = mimeType;

        const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);

        recorder.ondataavailable = (e: BlobEvent) => {
            const volume = this.checkVolumeLevel(analyser, bufferLength, dataArray);

            if (!this.headerBlob) {
                this.headerBlob = e.data;
                return;
            }

            this.pendingChunks.push(e.data);
            this.pendingBytes += e.data.size;

            if (volume < 1 && this.pendingBytes >= SpeechToText.MULTIPART_MIN_BYTES) {
                this.flushPendingAudio(false).catch((err) => {
                    console.error("multipart flush failed", err);
                });
            }
        };

        recorder.onstop = () => {
            this.flushPendingTranscript();

            /*
             * flushPendingTranscript() synchronously appends the final Whisper
             * job to transcribeQueue. Keep this worker lease alive until that
             * queue is completely drained, then Scribby can terminate the
             * worker and release its WASM heap.
             */
            const finalTranscription = this.transcribeQueue;

            finalTranscription.finally(() => {
                releaseWhisper();

                if (this.recordingGeneration === generation && this.whisper === whisper) {
                    this.whisper = null;
                }
            });

            this.flushPendingAudio(true)
                .catch((err) => {
                    console.error("final audio flush failed", err);
                })
                .finally(() => {
                    this.segmentStartedAt = null;
                });
        };

        return recorder;
    }

    private checkVolumeLevel(
        analyser: AnalyserNode,
        bufferLength: number,
        dataArray: Uint8Array<ArrayBuffer>
    ): number {
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;

        for (let i = 0; i < bufferLength; i++) {
            const value = dataArray[i] - 128;
            sum += value * value;
        }

        const average = sum / bufferLength;
        const rms = Math.sqrt(average);

        const volumePercent = Math.min(100, Math.floor((rms / 90) * 100));

        return volumePercent;
    }

    private teardownPcmTap() {
        if (!this.pcmNode) {
            return;
        }

        this.pcmNode.port.onmessage = null;
        this.pcmNode.disconnect();
        this.pcmNode = null;
    }

    public async stopRecording() {
        this.isListening = false;
        this.el.classList.remove("active");

        const recorder = this.recorder;
        this.recorder = null;

        if (recorder && recorder.state !== "inactive") {
            recorder.stop();
        }

        this.teardownPcmTap();

        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;

        const audioContext = this.audioContext;
        this.audioContext = null;

        if (audioContext) {
            await audioContext.close().catch(() => { });
        }

        if (this.waitingInterval) {
            clearInterval(this.waitingInterval);
            this.waitingInterval = null;
        }

        if (this.speechOutput) {
            this.speechOutput.recording = false;
            this.speechOutput.refreshButtons();
        }
    }

    public async startRecording(target: SpeechOutput | null, inputOverride?: Input) {
        if (!this.scribby.whisperEnabled) {
            console.warn("[whisper] recording blocked because local transcription is disabled");
            return;
        }

        const stopRecording = new CustomEvent("stop-recording");
        document.dispatchEvent(stopRecording);

        if (inputOverride) {
            this.input = inputOverride;
        }

        if (this.waitingInterval) {
            clearInterval(this.waitingInterval);
            this.waitingInterval = null;
        }

        if (!this.waitingSpan) {
            this.waitingSpan = this.createWaitingSpan();
        }

        const range = this.scribby.selection;

        if (!range && !target) {
            return;
        }

        const generation = ++this.recordingGeneration;

        const whisperLease = await this.scribby.acquireWhisper();

        if (!whisperLease) {
            console.warn("[whisper] worker could not be initialized");
            return;
        }

        const whisper = whisperLease.client;
        this.whisper = whisper;

        let recorderOwnsWhisperLease = false;
        let whisperLeaseReleased = false;

        const releaseWhisper = () => {
            if (whisperLeaseReleased) {
                return;
            }

            whisperLeaseReleased = true;
            whisperLease.release();

            if (this.recordingGeneration === generation && this.whisper === whisper) {
                this.whisper = null;
            }
        };

        try {
            if (!target) {
                const res = await fetch("/audio", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        Accept: "application/json",
                    },
                });

                if (!res.ok) {
                    const msg = await res.text().catch(() => "");
                    console.error(`Create audio failed: ${res.status}`, msg);
                    return;
                }

                const data = await res.json();

                this.recordingId = data.recording_id;
                this.activeSegmentId = data.segment_id;
                this.resetUploadState();
                this.segmentTimelineOffsetMs = 0;

                this.speechOutput = document.createElement("speech-output") as SpeechOutput;

                if (this.recordingId) {
                    this.speechOutput.dataset.audioId = this.recordingId;
                }

                this.speechOutput.controller = this;
                this.speechOutput.recording = true;

                let container =
                    range!.startContainer.nodeType === Node.TEXT_NODE
                        ? range!.startContainer.parentElement
                        : range!.startContainer as HTMLElement | null;

                while (container && container.parentElement && container.parentElement !== this.scribby.el) {
                    container = container.parentElement;
                }

                if (container && container.parentElement === this.scribby.el) {
                    this.scribby.el.insertBefore(this.speechOutput, container.nextSibling);
                } else {
                    range!.insertNode(this.speechOutput);
                }

                const p = document.createElement("p");
                p.appendChild(document.createElement("br"));
                this.speechOutput.after(p);

                const sel = window.getSelection();

                if (sel) {
                    sel.removeAllRanges();

                    const r = document.createRange();
                    r.setStart(p, 0);
                    r.collapse(true);

                    sel.addRange(r);
                }
            } else {
                this.speechOutput = target;
                this.speechOutput.controller = this;
                this.recordingId = this.speechOutput.dataset.audioId || null;

                if (!this.recordingId) {
                    console.error("Missing recording id on speech output");
                    return;
                }

                try {
                    await this.speechOutput.refreshPlayback();

                    this.segmentTimelineOffsetMs = this.speechOutput.getTimelineDurationMs();
                    this.activeSegmentId = await this.createNewSegment(this.recordingId);

                    this.resetUploadState();

                    this.speechOutput.recording = true;
                    this.speechOutput.refreshButtons();
                } catch (err) {
                    console.error(err);
                    return;
                }
            }

            this.outputEl = this.speechOutput.querySelector(".output") as HTMLDivElement;

            if (this.waitingSpan) {
                this.outputEl.append(this.waitingSpan);

                this.waitingInterval = window.setInterval(() => {
                    if (!this.waitingSpan) {
                        return;
                    }

                    const text = this.waitingSpan.innerText;
                    const count = text.split(".").length - 1;

                    if (count < 3) {
                        this.waitingSpan.textContent = text + ".";
                    } else {
                        this.waitingSpan.textContent = text.slice(0, -2);
                    }
                }, 1000);
            }

            this.isListening = true;
            this.el.classList.add("active");
            const saveEvent = new CustomEvent("save-document")
            document.dispatchEvent(saveEvent);
            const constraints = {
                video: this.input === Input.mic ? false : true,
                audio: true,
            } as any;

            if (this.input === Input.mic) {
                try {
                    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                } catch {
                    document.dispatchEvent(new CustomEvent("stop-recording"));
                }
            } else if (this.input === Input.speaker) {
                try {
                    this.stream = await navigator.mediaDevices.getDisplayMedia(constraints);
                } catch {
                    document.dispatchEvent(new CustomEvent("stop-recording"));
                }
            }

            if (!this.stream) {
                return;
            }

            const audioTracks = this.stream.getAudioTracks();

            if (!audioTracks.length) {
                alert("No audio track detected. Make sure you checked 'Share system audio'.");
                return;
            }

            const audioStream = new MediaStream(audioTracks);

            /*
             * Running the graph at Whisper's rate means the worklet emits
             * exactly the mono 16k float samples the model expects.
             */
            const audioContext = new AudioContext({
                sampleRate: SpeechToText.TRANSCRIBE_SAMPLE_RATE,
            });

            this.audioContext = audioContext;

            if (audioContext.state !== "running") {
                await audioContext.resume();
            }

            console.log("[pcm] audio context", {
                state: audioContext.state,
                sampleRate: audioContext.sampleRate,
            });

            const source = audioContext.createMediaStreamSource(audioStream);
            const analyser = audioContext.createAnalyser();
            source.connect(analyser);
            analyser.fftSize = 256;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            await audioContext.audioWorklet.addModule(SpeechToText.PCM_WORKLET_URL);

            const pcmNode = new AudioWorkletNode(audioContext, "pcm-tap", {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                channelCount: 1,
                channelCountMode: "explicit",
            });

            pcmNode.onprocessorerror = (e) => {
                console.error("[pcm] AudioWorklet processor crashed", e);
            };

            /*
             * A node with no downstream path is never pulled, so route the tap
             * into a silent gain to keep it processing.
             */
            const mute = audioContext.createGain();
            mute.gain.value = 0;

            source.connect(pcmNode);
            pcmNode.connect(mute);
            mute.connect(audioContext.destination);

            let pcmDebugCount = 0;

            pcmNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
                pcmDebugCount++;

                const samples = e.data;

                this.pcmWindow.push(samples);
                this.pcmWindowSamples += samples.length;

                if (pcmDebugCount === 1 || pcmDebugCount % 100 === 0) {
                    let sum = 0;
                    let min = Infinity;
                    let max = -Infinity;

                    for (const sample of samples) {
                        sum += sample * sample;
                        min = Math.min(min, sample);
                        max = Math.max(max, sample);
                    }

                    console.log("[pcm] received", {
                        messages: pcmDebugCount,
                        chunkSamples: samples.length,
                        windowSamples: this.pcmWindowSamples,
                        rms: Math.sqrt(sum / samples.length),
                        min,
                        max,
                    });
                }

                if (this.shouldFlushTranscript()) {
                    console.log("[pcm] threshold reached", {
                        samples: this.pcmWindowSamples,
                    });

                    this.flushPendingTranscript();
                }
            };

            this.pcmNode = pcmNode;

            const recorder = this.createRecorder(
                audioStream,
                analyser,
                bufferLength,
                dataArray,
                whisper,
                releaseWhisper,
                generation,
            );

            this.recorder = recorder;
            this.segmentStartedAt = Date.now();

            recorder.start(SpeechToText.RECORDER_TIMESLICE_MS);
            recorderOwnsWhisperLease = true;

            audioTracks[0].addEventListener("ended", () => {
                this.isListening = false;

                if (recorder.state !== "inactive") {
                    recorder.stop();
                }

                if (this.recorder === recorder) {
                    this.recorder = null;
                }

                this.el.classList.remove("active");

                if (this.pcmNode === pcmNode) {
                    this.teardownPcmTap();
                }

                audioStream.getTracks().forEach((t) => t.stop());

                if (this.audioContext === audioContext) {
                    this.audioContext = null;
                }

                audioContext.close().catch(() => { });

                if (this.speechOutput) {
                    this.speechOutput.recording = false;
                    this.speechOutput.refreshButtons();
                }
            });
        } catch (err) {
            console.error("audio capture failed:", err);
        } finally {
            if (!recorderOwnsWhisperLease) {
                releaseWhisper();
            }
        }
    }
}