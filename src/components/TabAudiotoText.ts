import { Scribby } from "./Scribby.js";
import { SpeechOutput } from "../custom_elements/SpeechOutput.js";
import { TextBuffer } from "../buffers/text_buffer.js";
import * as utils from "../utilities/utilities.js"

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
    /**
     *  this is controlled by sound thresholds
     *  recording is stopped and started in phrase chunks to increase accuracy and lower amount of requests
    */
    private isRecording = false;

    private stream: MediaStream | null = null;
    private recorder: MediaRecorder | null = null;
    private buffer!: TextBuffer;
    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;

        this.el.addEventListener("click", async (e) => {
            if (this.isListening) {
                this.isListening = false;
                this.isRecording = false;
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
                    await audioContext.audioWorklet.addModule(
                        new URL("../workers/volume_processor.js", import.meta.url)
                    );
                    const source = audioContext.createMediaStreamSource(audioStream);
                    const volumeNode = new AudioWorkletNode(audioContext, "volume-processor");

                    source.connect(volumeNode);
                    volumeNode.connect(audioContext.destination);

                    volumeNode.port.onmessage = (e) => {
                        const { vol, avgVol } = e.data as { vol: number; avgVol: number };

                        if (this.isRecording && avgVol < 1) {
                            this.isRecording = false;
                            this.recorder?.stop();
                            this.recorder = null;
                        }
                        else if (!this.isRecording && avgVol >= 1) {
                            this.isRecording = true;
                            this.recorder = this.createRecorder(audioStream);
                        }

                        this.outputEl.append(this.buffer.remove());
                    };
                    audioTracks[0].addEventListener("ended", () => {
                        this.isRecording = false;
                        this.isListening = false;
                        this.recorder?.stop();
                        this.recorder = null;
                        this.el.classList.remove("active");
                        volumeNode.disconnect();
                        utils.replaceElementWithChildren(this.outputEl);
                    });

                } catch (err) {
                    console.error("getDisplayMedia failed:", err);
                }

            }
        });
    }
    private createRecorder(audioStream: MediaStream): MediaRecorder {
        const chunks: BlobPart[] = [];

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
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstart = () => console.log("Recorder started");
        recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });

            const response = await fetch("http://localhost:8080/audio/summarize", {
                method: "POST",
                headers: {
                    "Content-Type": blob.type,
                },
                body: blob,
            });

            if (!response.ok) {
                console.error("Upload failed:", response.status, await response.text());
                return;
            }

            const data = await response.json();
            const text = data.text
            this.buffer.add(text);
        };

        recorder.start();
        return recorder;
    }
}

