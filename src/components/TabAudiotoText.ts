import { Scribby } from "./Scribby.js";
import { SpeechOutput } from "../custom_elements/SpeechOutput.js";
import { TextBuffer } from "../buffers/text_buffer.js";
import { AudioStorage } from "../audio_db/audio_db.js";
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

    private stream: MediaStream | null = null;
    private recorder: MediaRecorder | null = null;
    private buffer!: TextBuffer;

    private storage = new AudioStorage();
    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;

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
                    this.recorder = this.createRecorder(audioStream);

                    this.recorder.start(10_000);

                    audioTracks[0].addEventListener("ended", () => {
                        this.isListening = false;

                        this.recorder?.stop();
                        this.recorder = null;

                        this.el.classList.remove("active");
                        this.buffer.removeAll(this.outputEl);

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
    private createRecorder(audioStream: MediaStream): MediaRecorder {
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
            await this.storage.addBlob(e.data);
        };

        recorder.onstart = () => console.log("Recorder started");
        recorder.onstop = async (e) => {
            const records = await this.storage.getAllByTimestamp();
            
            const blobs = records.map(r => r.blob);
            const finalBlob = new Blob(blobs, { type: 'audio/webm' });

            await this.storage.deleteAll();
            const response = await fetch("http://localhost:8080/audio/store", {
                method: "POST",
                headers: {
                    "Content-Type": 'audio/webm',
                },
                body: finalBlob,
            });

            if (!response.ok) {
                console.error("Upload failed:", response.status, await response.text());
                return;
            }

            const data = await response.json();
            console.log(data);
        };

        return recorder;
    }
}

