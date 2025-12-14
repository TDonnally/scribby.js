import { Scribby } from "./Scribby.js";
import { SpeechOutput } from "../custom_elements/SpeechOutput.js";
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
    private intervalId: number | null = null;
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
                if (this.intervalId){
                    clearInterval(this.intervalId);
                }
            } else {
                this.isListening = true;
                this.el.classList.add("active");
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

                    let prevVolume = this.checkVolumeLevel(analyser, bufferLength, dataArray);


                    this.intervalId = setInterval(() => {
                        const volume = this.checkVolumeLevel(analyser, bufferLength, dataArray);

                        if (this.isRecording && prevVolume < 1 && volume < 1) {
                            this.isRecording = false;
                            this.recorder?.stop();
                            this.recorder = null;
                        }
                        else if (!this.isRecording && volume >= 1) {
                            this.isRecording = true;
                            this.recorder = this.createRecorder(audioStream);
                        }

                        prevVolume = volume;
                    }, 500);

                    audioTracks[0].addEventListener("ended", () => {
                        this.isRecording = false;
                        this.isListening = false;
                        this.recorder?.stop();
                        this.recorder = null;
                        if(this.intervalId){
                            clearInterval(this.intervalId);
                        }
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

            console.log(await response.json());
        };

        recorder.start();
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

