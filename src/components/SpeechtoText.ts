import { Scribby } from "./Scribby.js";
import { TextBuffer } from "../buffers/text_buffer.js";
import { WhisperClient } from "../whisper/whisper.js";
import { SpeechOutput } from "./SpeechOutput/SpeechOutput.js";
import * as events from "../events/custom_events.js";
import * as utils from "../utilities/utilities.js";

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

    speechOutput!: SpeechOutput
    waitingSpan: HTMLSpanElement | null = null;
    waitingInterval: number | null = null;

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
    private isListening = false;

    private stream: MediaStream | null = null;
    private recorder: MediaRecorder | null = null;
    private buffer!: TextBuffer;
    private transcribeQueue: Promise<void> = Promise.resolve();


    private worker!: Worker;

    async mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        this.el.disabled = true;
        await this.scribby.modelReadyPromise;
        this.whisper = this.scribby.whisper
        this.el.disabled = false;

        this.waitingSpan = document.createElement("span");
        this.waitingSpan.classList.add("waiting-span");
        this.waitingSpan.innerText = "listening.";

        this.worker = new Worker("/scripts/text_buffer_loop.js");
        this.worker.onmessage = (e) => {
            this.buffer.remove();
        }
        document.addEventListener("stop-recording", async (e) => {
            await this.stopRecording();
        })
        this.el.addEventListener("click", async (e) => {
            if (this.isListening) {
                this.stopRecording();
            } else {
                await this.startRecording(null);
            }
        });
    }
    private enqueueTranscribe(blob: Blob) {
        this.transcribeQueue = this.transcribeQueue
            .then(async () => {
                const transcript = await this.whisper.transcribeBlob(blob, { language: "en", threads: 8 });
                console.log(transcript);
                if (!transcript.includes("BLANK_AUDIO")) {
                    if(this.waitingSpan){
                        this.waitingSpan.remove();
                        this.waitingSpan = null;
                        if (this.waitingInterval){
                            clearInterval(this.waitingInterval);
                        }
                    }
                    this.buffer.add(transcript);
                    this.speechOutput.dataset.transcription = this.speechOutput.dataset.transcription + transcript;
                    this.worker.postMessage([transcript]);
                }
            })
            .catch((err) => console.error("transcribe failed", err));
    }
    private createRecorder(audioStream: MediaStream, analyser: AnalyserNode, bufferLength: number, dataArray: Uint8Array<ArrayBuffer>): MediaRecorder {
        const MIN_BLOB_SIZE = 200000;

        let currentBlobSize = 0;
        let packageReady = false;

        let headerBlob: Blob | null = null;
        let segmentChunks: Blob[] = [];


        const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
        const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) || "";
        const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);

        recorder.ondataavailable = (e: BlobEvent) => {
            const volume = this.checkVolumeLevel(analyser, bufferLength, dataArray);
            if (!headerBlob) {
                headerBlob = e.data;
                return;
            }

            segmentChunks.push(e.data);
            currentBlobSize += e.data.size;

            if (currentBlobSize >= MIN_BLOB_SIZE) {
                packageReady = true;
            }

            if (volume < 1 && packageReady) {
                const finalBlob = new Blob([headerBlob, ...segmentChunks], { type: mimeType });

                segmentChunks = [];
                currentBlobSize = 0;
                packageReady = false;

                this.enqueueTranscribe(finalBlob);
            }
        };

        recorder.onstop = () => {
            if (headerBlob && segmentChunks.length) {
                const finalBlob = new Blob([headerBlob, ...segmentChunks], { type: mimeType });
                this.enqueueTranscribe(finalBlob);
            }
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

        return volumePercent
    }
    public stopRecording() {
        this.isListening = false;
        this.el.classList.remove("active");

        if (this.recorder) {
            this.recorder?.stop();
        }
        this.recorder = null;
        this.stream?.getTracks().forEach(t => t.stop());
        this.stream = null;

        if (this.waitingInterval){
            clearInterval(this.waitingInterval);
        }
    }
    public async startRecording(target: SpeechOutput | null) {
        const stopRecording = new CustomEvent("stop-recording");
        document.dispatchEvent(stopRecording);
        if (this.waitingInterval){
            clearInterval(this.waitingInterval);
        }
        const range = this.scribby.selection;
        if (!range) return;

        if (!target){
            const res = await fetch("/audio", {
                method: "POST", 
                headers: {
                    Accept: "application/json"
                },
            })
            if (!res.ok){
                const msg = await res.text().catch(() => "");
                console.error(`Create audio failed: ${res.status}`, msg);
                return
            }

            const data = await res.json();
            const id = data.id;

            this.speechOutput = document.createElement("speech-output") as SpeechOutput;
            this.speechOutput.dataset.audioId = id;
            this.speechOutput.controller = this;

            let container =
                range.startContainer.nodeType === Node.TEXT_NODE
                    ? range.startContainer.parentElement
                    : range.startContainer as HTMLElement | null;

            while (container && container.parentElement && container.parentElement !== this.scribby.el) {
                container = container.parentElement;
            }

            if (container && container.parentElement === this.scribby.el) {
                this.scribby.el.insertBefore(this.speechOutput, container.nextSibling);
            }
            else {
                range.insertNode(this.speechOutput);
            }

            range.setStartAfter(this.speechOutput);
            range.collapse(true);
        }
        else{
            this.speechOutput = target;
        }
        
        this.outputEl = this.speechOutput.querySelector(".output") as HTMLSpanElement;
        if(this.waitingSpan){
            this.outputEl.append(this.waitingSpan);
            this.waitingInterval = setInterval(() => {
                if (!this.waitingSpan) return;
                const text = this.waitingSpan.innerText!;
                const count = text.split(".").length - 1;

                if (count < 3){
                    this.waitingSpan.textContent = text + ".";
                }   
                else {
                    this.waitingSpan.textContent = text.slice(0, -2);
                }
                 
            }, 1000)
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
                }
                catch {
                    const stopRecording = new CustomEvent("stop-recording");
                    document.dispatchEvent(stopRecording);
                }

            }
            else if (this.input === Input.speaker) {
                try {
                    this.stream = await navigator.mediaDevices.getDisplayMedia(constraints);
                }
                catch {
                    const stopRecording = new CustomEvent("stop-recording");
                    document.dispatchEvent(stopRecording);
                }
            }
            if (!this.stream) return;
            const audioTracks = this.stream.getAudioTracks();

            console.log("Audio tracks:", audioTracks);

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

                audioStream.getTracks().forEach(t => t.stop());

                audioContext?.close().catch(() => { });

                utils.replaceElementWithChildren(this.outputEl);
            });

        } catch (err) {
            console.error("getDisplayMedia failed:", err);
        }


    }
}

