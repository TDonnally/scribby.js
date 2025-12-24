import { Scribby } from "./Scribby.js";
import { SpeechOutput } from "../custom_elements/SpeechOutput.js";
import { TextBuffer } from "../buffers/text_buffer.js";
import { AudioStorage } from "../dbs/audio_db.js";
import { WhisperClient } from "../whisper/whisper.js";
import * as utils from "../utilities/utilities.js";

export class TabAudioText {
    scribby: Scribby;
    innerContent: string;
    el!: HTMLButtonElement;
    outputEl!: SpeechOutput;
    constructor(
        scribby: Scribby,
        innerContent: string,
    ) {
        this.scribby = scribby;
        this.innerContent = innerContent;
        this.el = document.createElement("button");
    }
    private isListening = false;

    private whisper = new WhisperClient();
    private modelReady = false;
    private modelReadyPromise: Promise<void> | null = null;

    private stream: MediaStream | null = null;
    private recorder: MediaRecorder | null = null;
    private buffer!: TextBuffer;

    private storage = new AudioStorage();

    private worker!: Worker;
    
    async mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        (globalThis as any).Module = {
            print: () => { },
            printErr: () => { },
        };
        await this.whisper.initRuntime("/whisper/main.js");
        this.modelReadyPromise = this.whisper
            .loadModel("/whisper/ggml-tiny.bin", (p) => {
                console.log("model", Math.round(p * 100), "%");
            })
            .then(() => {
                this.modelReady = true;
            });

        this.worker = new Worker("/scripts/text_buffer_loop.js");
        this.worker.onmessage = (e) => {
            this.buffer.remove();
        }
        this.el.addEventListener("click", async (e) => {
            if (this.isListening) {
                this.isListening = false;
                this.el.classList.remove("active");

                if (this.recorder) {
                    this.recorder?.stop();
                }
                this.recorder = null;
                this.stream?.getTracks().forEach(t => t.stop());
                this.stream = null;

                utils.replaceElementWithChildren(this.outputEl);
            } else {
                const range = this.scribby.selection;
                if (!range) return;

                this.outputEl = document.createElement("span");
                this.outputEl.classList.add("output");
                range.collapse(false);
                range.insertNode(this.outputEl);

                this.isListening = true;
                this.el.classList.add("active");

                this.buffer = new TextBuffer("", this.outputEl);
                try {
                    const constraints = {
                        video: true,
                        audio: true,
                    } as any;

                    this.stream = await navigator.mediaDevices.getDisplayMedia(constraints);
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
        });
    }
    private createRecorder(audioStream: MediaStream, analyser: AnalyserNode, bufferLength: number, dataArray: Uint8Array<ArrayBuffer>): MediaRecorder {
        const MIN_BLOB_SIZE = 200000;
        let currentBlobSize = 0;
        let packageReady = false;

        const candidates = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg",
        ];

        const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) || "";
        console.log("Using mimeType:", mimeType || "(browser default)");

        const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);

        recorder.ondataavailable = async (e: BlobEvent) => {
            const volume = this.checkVolumeLevel(analyser, bufferLength, dataArray);
            if (e.data.size > 200){
                currentBlobSize += e.data.size;
                await this.storage.addBlob(e.data);
            }
            if (currentBlobSize >= MIN_BLOB_SIZE){
                packageReady = true;
            }
            if (volume <= 1 && packageReady && this.modelReady){
                recorder.stop();
            }
        };

        recorder.onstart = () => console.log("Recorder started");
        recorder.onstop = async () => {
            const records = await this.storage.getAllByTimestamp();

            const blobs = records.map(r => r.blob);
            const finalBlob = new Blob(blobs, { type: mimeType });
            await this.storage.deleteAll();

            this.recorder = null;
            this.recorder = this.createRecorder(audioStream, analyser, bufferLength, dataArray);
            this.recorder.start(200);

            const transcript = await this.whisper.transcribeBlob(finalBlob, { language: "en", threads: 8 });
            console.log(transcript);
            this.buffer.add(transcript)
            this.worker.postMessage([transcript])
            
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
}

