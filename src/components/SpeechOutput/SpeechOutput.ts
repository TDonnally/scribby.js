import { SpeechToText } from "../SpeechtoText";

const tpl = document.createElement("template");
tpl.innerHTML = `
    <div contenteditable = "false">
        <div class = "output-header">
            <div class = "buttons">
                <stop-button></stop-button>
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

    connectedCallback(){
        this.appendChild(tpl.content.cloneNode(true));
        
        const btnsContainer = this.querySelector(".buttons");

        this.addEventListener("start-recording", async (e) => {
            await this.controller.startRecording();
            btnsContainer?.replaceChildren(recordingBtnsState.content.cloneNode(true));
        })
        this.addEventListener("stop-recording", async (e) => {
            await this.controller.stopRecording();
            btnsContainer?.replaceChildren(nonRecordingBtnsState.content.cloneNode(true));
        })
    }
}