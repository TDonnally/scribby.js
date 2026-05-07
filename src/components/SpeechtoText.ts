import { Scribby } from "./Scribby.js";
import { TextBuffer } from "../buffers/text_buffer.js";
import { WhisperClient } from "../whisper/whisper.js";
import { SpeechOutput } from "./SpeechOutput/SpeechOutput.js";

export enum Input {
    mic = "mic",
    speaker = "speaker"
}

export class SpeechToText {
    scribby: Scribby;
    innerContent: string;
    input: Input;
    el!: HTMLButtonElement;
    outputEl!: HTMLSpanElement;
    whisper!: WhisperClient;

    speechOutput!: SpeechOutput;
    waitingSpan: HTMLSpanElement | null = null;
    waitingInterval: number | null = null;

    private isListening = false;

    private stream: MediaStream | null = null;
    private recorder: MediaRecorder | null = null;
    private buffer!: TextBuffer;
    private transcribeQueue: Promise<void> = Promise.resolve();
    private worker!: Worker;

    private recordingId: string | null = null;
    private activeSegmentId: string | null = null;
    private nextPartNumber = 1;

    private static readonly MULTIPART_MIN_BYTES = 5 * 1024 * 1024;

    private headerBlob: Blob | null = null;
    private pendingChunks: Blob[] = [];
    private pendingBytes = 0;
    private hasUploadedMultipartPart = false;
    private currentMimeType = "audio/webm";

    private transcriptHeaderBlob: Blob | null = null;
    private transcriptChunks: Blob[] = [];
    private transcriptBytes = 0;
    private static readonly TRANSCRIBE_MIN_BYTES = 200000;

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
        await this.scribby.modelReadyPromise;
        this.whisper = this.scribby.whisper;
        this.el.disabled = false;

        this.waitingSpan = document.createElement("span");
        this.waitingSpan.classList.add("waiting-span");
        this.waitingSpan.innerText = "listening.";

        this.worker = new Worker("/scripts/text_buffer_loop.js");
        this.worker.onmessage = () => {
            this.buffer.remove();
        };

        document.addEventListener("stop-recording", async () => {
            await this.stopRecording();
        });

        this.el.addEventListener("click", async () => {
            if (this.isListening) {
                await this.stopRecording();
            } else {
                await this.startRecording(null, this.input);
            }
        });
    }

    private enqueueTranscribe(blob: Blob) {
        this.transcribeQueue = this.transcribeQueue
            .then(async () => {
                const transcript = await this.whisper.transcribeBlob(blob, { language: "en", threads: 8 });
                if (!transcript.includes("BLANK_AUDIO")) {
                    if (this.waitingSpan) {
                        this.waitingSpan.remove();
                        this.waitingSpan = null;
                        if (this.waitingInterval) {
                            clearInterval(this.waitingInterval);
                        }
                    }
                    this.buffer.add(transcript);
                    this.speechOutput.dataset.transcription = (this.speechOutput.dataset.transcription || "") + transcript;
                    this.worker.postMessage([transcript]);
                }
            })
            .catch((err) => console.error("transcribe failed", err));
    }

    private async saveMultipartPart(blob: Blob, finalPart = false): Promise<void> {
        if (!this.activeSegmentId) {
            throw new Error("No active segment id");
        }

        const res = await fetch(
            `/audio/segments/${this.activeSegmentId}/blob?part_number=${this.nextPartNumber}&final_part=${finalPart}`,
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
            const text = await res.text();
            throw new Error(`Failed to upload multipart blob: ${res.status} ${text}`);
        }

        this.nextPartNumber += 1;
        this.hasUploadedMultipartPart = true;
    }

    private async saveWholeFile(blob: Blob): Promise<void> {
        if (!this.activeSegmentId) {
            throw new Error("No active segment id");
        }

        const res = await fetch(`/audio/segments/${this.activeSegmentId}/file`, {
            method: "PUT",
            credentials: "include",
            headers: {
                "Content-Type": blob.type || "audio/webm",
            },
            body: blob,
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Failed to upload single file: ${res.status} ${text}`);
        }
    }

    private async flushPendingAudio(finalPart: boolean): Promise<void> {
        if (!this.headerBlob || this.pendingChunks.length === 0) {
            return;
        }

        const blob = new Blob([this.headerBlob, ...this.pendingChunks], { type: this.currentMimeType });

        if (this.hasUploadedMultipartPart || this.pendingBytes >= SpeechToText.MULTIPART_MIN_BYTES) {
            await this.saveMultipartPart(blob, finalPart);
        } else if (finalPart) {
            await this.saveWholeFile(blob);
        } else {
            await this.saveMultipartPart(blob, false);
        }

        this.pendingChunks = [];
        this.pendingBytes = 0;
    }

    private flushPendingTranscript(): void {
        if (!this.transcriptHeaderBlob || this.transcriptChunks.length === 0) {
            return;
        }

        const blob = new Blob([this.transcriptHeaderBlob, ...this.transcriptChunks], {
            type: this.currentMimeType,
        });

        this.enqueueTranscribe(blob);
        this.transcriptChunks = [];
        this.transcriptBytes = 0;
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

    private resetUploadState() {
        this.nextPartNumber = 1;
        this.headerBlob = null;
        this.pendingChunks = [];
        this.pendingBytes = 0;
        this.hasUploadedMultipartPart = false;
        this.transcriptHeaderBlob = null;
        this.transcriptChunks = [];
        this.transcriptBytes = 0;
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

        const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
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

            this.pendingChunks.push(e.data);
            this.pendingBytes += e.data.size;

            this.transcriptChunks.push(e.data);
            this.transcriptBytes += e.data.size;

            if (this.transcriptBytes >= SpeechToText.TRANSCRIBE_MIN_BYTES) {
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

            this.flushPendingAudio(true).catch((err) => {
                console.error("final audio flush failed", err);
            });
        };

        return recorder;
    }

    private checkVolumeLevel(analyser: AnalyserNode, bufferLength: number, dataArray: Uint8Array<ArrayBuffer>): number {
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

        if (this.recorder) {
            this.recorder.stop();
        }
        this.recorder = null;
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;

        if (this.waitingInterval) {
            clearInterval(this.waitingInterval);
        }

        if (this.speechOutput) {
            this.speechOutput.recording = false;
            this.speechOutput.refreshButtons();
        }
    }

    public async startRecording(target: SpeechOutput | null, inputOverride?: Input) {
        const stopRecording = new CustomEvent("stop-recording");
        document.dispatchEvent(stopRecording);

        if (inputOverride) {
            this.input = inputOverride;
        }

        if (this.waitingInterval) {
            clearInterval(this.waitingInterval);
        }

        const range = this.scribby.selection;
        if (!range && !target) return;

        if (!target) {
            const res = await fetch("/audio", {
                method: "POST",
                credentials: "include",
                headers: {
                    Accept: "application/json"
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

            range!.setStartAfter(this.speechOutput);
            range!.collapse(true);
        } else {
            this.speechOutput = target;
            this.speechOutput.controller = this;
            this.recordingId = this.speechOutput.dataset.audioId || null;

            if (!this.recordingId) {
                console.error("Missing recording id on speech output");
                return;
            }

            try {
                this.activeSegmentId = await this.createNewSegment(this.recordingId);
                this.resetUploadState();
                this.speechOutput.recording = true;
                this.speechOutput.refreshButtons();
            } catch (err) {
                console.error(err);
                return;
            }
        }

        this.outputEl = this.speechOutput.querySelector(".output") as HTMLSpanElement;
        if (this.waitingSpan) {
            this.outputEl.append(this.waitingSpan);
            this.waitingInterval = setInterval(() => {
                if (!this.waitingSpan) return;
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

        this.buffer = new TextBuffer("", this.outputEl);

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

            if (!this.stream) return;

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
            this.recorder.start(200);

            audioTracks[0].addEventListener("ended", () => {
                this.isListening = false;

                this.recorder?.stop();
                this.recorder = null;

                this.el.classList.remove("active");
                this.buffer.removeAll();

                audioStream.getTracks().forEach((t) => t.stop());
                audioContext.close().catch(() => {});

                if (this.speechOutput) {
                    this.speechOutput.recording = false;
                    this.speechOutput.refreshButtons();
                }
            });
        } catch (err) {
            console.error("getDisplayMedia failed:", err);
        }
    }
}