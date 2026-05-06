import { SpeechToText } from "../SpeechtoText";

const tpl = document.createElement("template");
tpl.innerHTML = `
    <div contenteditable = "false">
        <div class = "output-header">
            <audio-visualizer></audio-visualizer>
            <div class = "buttons">
            </div>
        </div>
        <div class = "output-container">
            <span class = "output"></span>
        </div>
    </div>
`

const recordingBtnsState = document.createElement("template");
recordingBtnsState.innerHTML = `
    <stop-button></stop-button>
`

const nonRecordingBtnsState = document.createElement("template");
nonRecordingBtnsState.innerHTML = `
    <record-button></record-button>
    <play-button></play-button>
`




export class SpeechOutput extends HTMLElement{
    controller!: SpeechToText;
    recording: Boolean = false; 

    connectedCallback(){
        this.appendChild(tpl.content.cloneNode(true));
        const output = this.querySelector(".output") as HTMLElement;
        if(this.dataset.transcription){
            output!.innerText = this.dataset.transcription
        }
        else {
            this.dataset.transcription = ""
        }
        const btnsContainer = this.querySelector(".buttons");

        if (this.recording){
            btnsContainer?.appendChild(recordingBtnsState.content.cloneNode(true))
        }
        else {
            btnsContainer?.appendChild(nonRecordingBtnsState.content.cloneNode(true))
        }

        this.addEventListener("start-recording", async (e) => {
            await this.controller.startRecording(this);
            btnsContainer?.replaceChildren(recordingBtnsState.content.cloneNode(true));
        })
        document.addEventListener("stop-recording", async (e) => {
            btnsContainer?.replaceChildren(nonRecordingBtnsState.content.cloneNode(true));
            await this.controller.stopRecording();
        })
    }
}