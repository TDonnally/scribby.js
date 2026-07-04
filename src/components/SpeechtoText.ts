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
    private transcribeQueue: Promise<void> = Promise.resolve();

    private recordingId: string | null = null;
    private activeSegmentId: string | null = null;
    private nextPartNumber = 1;
    private segmentStartedAt: number | null = null;
    private segmentTimelineOffsetMs = 0;

    private static readonly MULTIPART_MIN_BYTES = 5 * 1024 * 1024;

    private headerBlob: Blob | null = null;
    private pendingChunks: Blob[] = [];
    private pendingBytes = 0;
    private hasUploadedMultipartPart = false;
    private currentMimeType = "audio/webm";

    private transcriptHeaderBlob: Blob | null = null;
    private transcriptChunks: Blob[] = [];
    private transcriptBytes = 0;

    private static readonly TRANSCRIBE_MIN_BYTES = 120000;
    private static readonly TRANSCRIBE_MIN_MS = 10000;
    private static readonly RECORDER_TIMESLICE_MS = 1000;

    private transcriptWindowStartedAt: number | null = null;

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

        if (!this.scribby.whisperEnabled || !this.scribby.modelReadyPromise) {
            this.el.hidden = true;
            return;
        }

        await this.scribby.modelReadyPromise;

        if (!this.scribby.whisperEnabled || !this.scribby.whisper) {
            this.el.hidden = true;
            return;
        }

        this.whisper = this.scribby.whisper;
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

    private getTranscriptWindowDurationMs(): number {
        if (this.transcriptWindowStartedAt === null) {
            return 0;
        }

        return Math.max(0, this.getSegmentDurationMs() - this.transcriptWindowStartedAt);
    }

    private shouldFlushTranscript(): boolean {
        return (
            this.transcriptBytes >= SpeechToText.TRANSCRIBE_MIN_BYTES &&
            this.getTranscriptWindowDurationMs() >= SpeechToText.TRANSCRIBE_MIN_MS
        );
    }

    private enqueueTranscribe(blob: Blob, startMs: number, endMs: number) {
        const speechOutput = this.speechOutput;
        const segmentId = this.activeSegmentId;
        const timelineOffsetMs = this.segmentTimelineOffsetMs;
        const threads = this.scribby.whisperThreadCount || 4;

        this.transcribeQueue = this.transcribeQueue
            .then(async () => {
                const audioSeconds = Math.max(0, (endMs - startMs) / 1000);
                const label = `whisper ${audioSeconds.toFixed(1)}s ${crypto.randomUUID().slice(0, 8)}`;

                let transcript = "";

                console.time(label);

                try {
                    if (!this.whisper) {
                        return;
                    }

                    transcript = await this.whisper.transcribeBlob(blob, {
                        language: "en",
                        threads,
                    });
                } finally {
                    console.timeEnd(label);
                }

                console.log({
                    audioSeconds,
                    threads,
                    crossOriginIsolated: window.crossOriginIsolated,
                    hardwareConcurrency: navigator.hardwareConcurrency,
                    sharedArrayBuffer: typeof SharedArrayBuffer,
                });

                if (transcript.includes("BLANK_AUDIO")) {
                    return;
                }

                const text = transcript.trim();

                if (!text) {
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

        const blob = new Blob([this.headerBlob, ...this.pendingChunks], {
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
        if (!this.transcriptHeaderBlob || this.transcriptChunks.length === 0) {
            return;
        }

        const startMs = this.transcriptWindowStartedAt ?? 0;
        const endMs = this.getSegmentDurationMs();

        const blob = new Blob([this.transcriptHeaderBlob, ...this.transcriptChunks], {
            type: this.currentMimeType,
        });

        this.enqueueTranscribe(blob, startMs, endMs);

        this.transcriptChunks = [];
        this.transcriptBytes = 0;
        this.transcriptWindowStartedAt = endMs;
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

        this.transcriptHeaderBlob = null;
        this.transcriptChunks = [];
        this.transcriptBytes = 0;
        this.transcriptWindowStartedAt = null;
    }

    private createRecorder(
        audioStream: MediaStream,
        analyser: AnalyserNode,
        bufferLength: number,
        dataArray: Uint8Array<ArrayBuffer>
    ): MediaRecorder {
        this.headerBlob = null;
        this.pendingChunks = [];
        this.pendingBytes = 0;
        this.hasUploadedMultipartPart = false;

        this.transcriptHeaderBlob = null;
        this.transcriptChunks = [];
        this.transcriptBytes = 0;
        this.transcriptWindowStartedAt = null;

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
                this.transcriptHeaderBlob = e.data;
                return;
            }

            if (this.transcriptWindowStartedAt === null) {
                this.transcriptWindowStartedAt = this.getSegmentDurationMs();
            }

            this.pendingChunks.push(e.data);
            this.pendingBytes += e.data.size;

            this.transcriptChunks.push(e.data);
            this.transcriptBytes += e.data.size;

            if (this.shouldFlushTranscript()) {
                this.flushPendingTranscript();
            }

            if (volume < 1 && this.pendingBytes >= SpeechToText.MULTIPART_MIN_BYTES) {
                this.flushPendingAudio(false).catch((err) => {
                    console.error("multipart flush failed", err);
                });
            }
        };

        recorder.onstop = () => {
            this.flushPendingTranscript();

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

    public async stopRecording() {
        this.isListening = false;
        this.el.classList.remove("active");

        if (this.recorder && this.recorder.state !== "inactive") {
            this.recorder.stop();
        }

        this.recorder = null;

        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;

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
        if (!this.scribby.whisperEnabled || !this.scribby.whisper || !this.scribby.modelReadyPromise) {
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

        try {
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

            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(audioStream);

            const analyser = audioContext.createAnalyser();
            source.connect(analyser);
            analyser.fftSize = 256;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            this.recorder = this.createRecorder(audioStream, analyser, bufferLength, dataArray);
            this.segmentStartedAt = Date.now();

            this.recorder.start(SpeechToText.RECORDER_TIMESLICE_MS);

            audioTracks[0].addEventListener("ended", () => {
                this.isListening = false;

                if (this.recorder && this.recorder.state !== "inactive") {
                    this.recorder.stop();
                }

                this.recorder = null;

                this.el.classList.remove("active");

                audioStream.getTracks().forEach((t) => t.stop());
                audioContext.close().catch(() => { });

                if (this.speechOutput) {
                    this.speechOutput.recording = false;
                    this.speechOutput.refreshButtons();
                }
            });
        } catch (err) {
            console.error("audio capture failed:", err);
        }
    }
}