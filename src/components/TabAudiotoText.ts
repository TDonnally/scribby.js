import { Scribby } from "./Scribby.js";
import { SpeechOutput } from "../custom_elements/SpeechOutput.js";
import * as utils from "../utilities/utilities.js"

export class TabAudioText {
    scribby: Scribby;
    innerContent: string;
    el!: HTMLButtonElement;
    recognition!: any;
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
    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;


        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            const recognition = this.recognition;
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            let interimSpan: HTMLSpanElement | null = null;

            recognition.onresult = (event: SpeechRecognitionEvent) => {
                const current = event.resultIndex;
                const transcript = event.results[current][0].transcript;

                if (event.results[current].isFinal) {
                    if (interimSpan) {
                        interimSpan.remove();
                        interimSpan = null;
                    }
                    if (this.outputEl.querySelector('span[style*="color"]')) {
                        this.outputEl.innerHTML = '';
                    }
                    this.outputEl.appendChild(document.createTextNode(transcript + ' '));

                } else {
                    if (!interimSpan) {
                        interimSpan = document.createElement('span');
                        interimSpan.style.color = '#999';
                        this.outputEl.appendChild(interimSpan);
                    }
                    interimSpan.textContent = transcript;
                }
            };

            recognition.onstart = () => {
                console.log('Voice recognition started');
                this.el.classList.add("active");
            };

            recognition.onend = () => {
                this.isListening = false;
                this.el.classList.remove("active");
                utils.replaceElementWithChildren(this.outputEl)
            };
            recognition.onerror = () => {
                this.isListening = false;
                utils.replaceElementWithChildren(this.outputEl)
            };
        }
        this.el.addEventListener("click", async (e) => {
            if (this.isListening) {
                this.recognition.stop();
                this.isListening = false;

            } else {
                try {
                    const constraints = {
                        video: true,
                        audio: true,
                    } as any;

                    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);


                    const audioTracks = stream.getAudioTracks();
                    console.log("Audio tracks:", audioTracks);

                    if (!audioTracks.length) {
                        alert("No audio track detected. Make sure you checked 'Share system audio'.");
                        return;
                    }

                    const audioStream = new MediaStream(audioTracks);
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
                        if (!e.data || e.data.size === 0) return;

                        console.log("Audio chunk blob:", e.data, "size:", e.data.size);
                        const buf = await e.data.arrayBuffer();
                        console.log("Chunk ArrayBuffer bytes:", buf.byteLength);

                    };

                    recorder.onstart = () => console.log("Recorder started");
                    recorder.onstop = () => console.log("Recorder stopped");

                    recorder.start(250);
                    audioTracks[0].addEventListener("ended", () => {
                        recorder.stop();
                    });

                } catch (err) {
                    console.error("getDisplayMedia failed:", err);
                }

            }
        });
    }
}

