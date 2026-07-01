import { PromptTextBox } from "./PromptTextBox";

const tpl = document.createElement("template");
tpl.innerHTML = `
    <div class = "controls-container">
        <div class = "controls">
            <button data-action = "undo">
                <svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M20 13.5C20 17.09 17.09 20 13.5 20H6V18H13.5C16 18 18 16 18 13.5S16 9 13.5 9H7.83L10.91 12.09L9.5 13.5L4 8L9.5 2.5L10.92 3.91L7.83 7H13.5C17.09 7 20 9.91 20 13.5Z" />
                </svg>
            </button>
            <button data-action = "redo">
                <svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M10.5 18H18V20H10.5C6.91 20 4 17.09 4 13.5S6.91 7 10.5 7H16.17L13.08 3.91L14.5 2.5L20 8L14.5 13.5L13.09 12.09L16.17 9H10.5C8 9 6 11 6 13.5S8 18 10.5 18Z" />
                </svg>
            </button>
            <button data-action = "insert">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <title>Insert into document</title>
                    <path d="M15,20H9V12H4.16L12,4.16L19.84,12H15V20Z" />
                </svg>
            </button>
            <button data-action = "delete">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <title>Delete summary block</title>
                    <path d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z"></path>
                </svg>
            </button>
        </div>
    </div>
    <div class = "output-section">
        <div class = "output-container">
            <button data-action = "expand">
                <svg class="expand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <title>arrow-expand</title>
                    <path d="M10,21V19H6.41L10.91,14.5L9.5,13.09L5,17.59V14H3V21H10M14.5,10.91L19,6.41V10H21V3H14V5H17.59L13.09,9.5L14.5,10.91Z" />
                </svg>
            </button>
            <div class = "output">
            </div>
        </div>
    </div>
    <prompt-text-box>
    </prompt-text-box>
`

const generatingTpl = document.createElement("template");
generatingTpl.innerHTML =  `
    <div class = "generating-message">
        <scribby-mascot data-state="reading"></scribby-mascot>
        <p class = "message"></p>
    </div>
`

export type State = "idle" | "summarizing" | "generating"

export class SummaryOutput extends HTMLElement{
    previousOutputs: string[] = new Array();

    undoButton!: HTMLButtonElement;
    redoButton!: HTMLButtonElement;
    insertButton!: HTMLButtonElement;
    deleteButton!: HTMLButtonElement;
    expandElement!: HTMLButtonElement;
    PromptTextBox!: PromptTextBox;

    OutputContainer!: HTMLDivElement;
    Output!: HTMLDivElement;
    
    state: State = "idle";
    private mounted = false;

    connectedCallback(){
        if (this.mounted) {
            return;
        }
        this.mounted = true;
        this.replaceChildren();

        this.appendChild(tpl.content.cloneNode(true));
        this.contentEditable = "false";

        this.OutputContainer = this.querySelector(".output-container")!;
        this.Output = this.querySelector(".output")!;
        
        if (this.dataset.value){
            this.Output.innerHTML = this.dataset.value!;
        }

        this.undoButton = this.querySelector('[data-action = "undo"]')!;
        this.redoButton = this.querySelector('[data-action = "redo"]')!;
        this.insertButton = this.querySelector('[data-action = "insert"]')!;
        this.deleteButton = this.querySelector('[data-action = "delete"]')!;
        this.expandElement = this.querySelector('[data-action = "expand"]')!;
        this.PromptTextBox = this.querySelector('prompt-text-box')! as PromptTextBox;

        this.undoButton.addEventListener("click", (e) => {

        });
        this.redoButton.addEventListener("click", (e) => {

        });
        this.insertButton.addEventListener("click", (e) => {

        });
        this.deleteButton.addEventListener("click", (e) => {

        });
        this.expandElement.addEventListener("click", (e) => {

        });

    }
    disconnectedCallback(){

    }

    public setState(state: State){
        this.state = state;

        const previousMessage = this.OutputContainer.querySelector(".generating-message");
        if(previousMessage){
            previousMessage.remove();
        }
        if (this.state = "idle"){
            return;
        }

        const messageTpl = generatingTpl.content.cloneNode(true) as HTMLElement;
        const message = messageTpl.querySelector(".message")!;

        message.textContent = this.state;
        this.OutputContainer.appendChild(messageTpl);
    }
}