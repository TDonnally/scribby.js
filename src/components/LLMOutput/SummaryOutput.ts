import { PromptTextBox } from "./PromptTextBox";
import { ConfirmOverlay } from "../ConfirmOverlay.js";

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
generatingTpl.innerHTML = `
    <div class = "generating-message">
        <scribby-mascot data-state="reading"></scribby-mascot>
        <p class = "message"></p>
    </div>
`

export type State = "idle" | "summarizing" | "generating"

export class SummaryOutput extends HTMLElement {
    previousOutputs: string[] = [];

    undoButton!: HTMLButtonElement;
    redoButton!: HTMLButtonElement;
    insertButton!: HTMLButtonElement;
    deleteButton!: HTMLButtonElement;
    expandElement!: HTMLButtonElement;
    PromptTextBox!: PromptTextBox;

    OutputContainer!: HTMLDivElement;
    Output!: HTMLDivElement;

    state: State = "idle";

    private outputExpanded = false;
    private mounted = false;
    private outputIndex = -1;

    connectedCallback() {
        if (this.mounted) {
            return;
        }

        this.mounted = true;
        this.replaceChildren();

        this.appendChild(tpl.content.cloneNode(true));
        this.contentEditable = "false";

        this.OutputContainer = this.querySelector(".output-container") as HTMLDivElement;
        this.Output = this.querySelector(".output") as HTMLDivElement;

        const initialValue = this.dataset.value ?? "";

        if (initialValue) {
            this.Output.innerHTML = initialValue;
        }

        this.undoButton = this.querySelector('[data-action="undo"]') as HTMLButtonElement;
        this.redoButton = this.querySelector('[data-action="redo"]') as HTMLButtonElement;
        this.insertButton = this.querySelector('[data-action="insert"]') as HTMLButtonElement;
        this.deleteButton = this.querySelector('[data-action="delete"]') as HTMLButtonElement;
        this.expandElement = this.querySelector('[data-action="expand"]') as HTMLButtonElement;
        this.PromptTextBox = this.querySelector("prompt-text-box") as PromptTextBox;

        this.undoButton.addEventListener("click", this.handleUndo);
        this.redoButton.addEventListener("click", this.handleRedo);

        this.insertButton.addEventListener("click", this.handleInsert);
        this.deleteButton.addEventListener("click", this.handleDelete);
        this.expandElement.addEventListener("click", this.handleExpand);

        this.updateHistoryButtons();
    }

    disconnectedCallback() {
        this.undoButton?.removeEventListener("click", this.handleUndo);
        this.redoButton?.removeEventListener("click", this.handleRedo);
        this.insertButton?.removeEventListener("click", this.handleInsert);
        this.deleteButton?.removeEventListener("click", this.handleDelete);
        this.expandElement?.removeEventListener("click", this.handleExpand);

        this.mounted = false;
    }

    public sendMessage(message: string) {
        if (this.state !== "idle") {
            return;
        }

        this.dispatchEvent(
            new CustomEvent("summary-generate", {
                bubbles: true,
                composed: true,
                detail: {
                    summaryOutput: this,
                    additionalContext: message,
                },
            })
        );
    }

    public setState(state: State) {
        this.state = state;

        const previousMessage = this.OutputContainer.querySelector(".generating-message");
        
        const isBusy = this.state !== "idle";

        this.setControlsDisabled(isBusy);

        if (this.state === "idle") {
            this.updateHistoryButtons();
            previousMessage?.remove();
            return;
        }

        const messageTpl = generatingTpl.content.cloneNode(true) as DocumentFragment;
        const message = messageTpl.querySelector(".message") as HTMLParagraphElement;
        
        message.textContent = this.state;
        previousMessage?.remove();
        this.OutputContainer.appendChild(messageTpl);
    }
    public prepareForGeneration() {
        const currentHTML = this.Output.innerHTML;


        if (this.outputIndex < this.previousOutputs.length - 1) {
            this.previousOutputs = this.previousOutputs.slice(0, this.outputIndex + 1);
        }

        const currentHistoryValue = this.previousOutputs[this.outputIndex] ?? "";

        if (currentHTML.trim() && currentHistoryValue !== currentHTML) {
            this.pushOutputHistory(currentHTML);
        }

        this.updateHistoryButtons();
    }

    public commitCurrentOutputToHistory() {
        const currentHTML = this.Output.innerHTML;

        if (!currentHTML.trim()) {
            this.updateHistoryButtons();
            return;
        }

        this.pushOutputHistory(currentHTML);
        this.dataset.value = currentHTML;
        this.updateHistoryButtons();
    }

    public undoOutput() {
        if (this.state !== "idle") {
            return;
        }

        if (this.outputIndex <= 0) {
            return;
        }

        this.outputIndex -= 1;
        this.applyHistoryIndex();
    }

    public redoOutput() {
        if (this.state !== "idle") {
            return;
        }

        if (this.outputIndex >= this.previousOutputs.length - 1) {
            return;
        }

        this.outputIndex += 1;
        this.applyHistoryIndex();
    }

    private handleUndo = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.undoOutput();
    };

    private handleRedo = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.redoOutput();
    };
    private handleExpand = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        this.outputExpanded = !this.outputExpanded;

        this.OutputContainer.classList.toggle("expanded", this.outputExpanded);

        this.expandElement.innerHTML = this.outputExpanded
            ? `
            <svg class="collapse-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <title>window-minimize</title>
                <path d="M20,14H4V10H20" />
            </svg>
        `
            : `
            <svg class="expand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <title>arrow-expand</title>
                <path d="M10,21V19H6.41L10.91,14.5L9.5,13.09L5,17.59V14H3V21H10M14.5,10.91L19,6.41V10H21V3H14V5H17.59L13.09,9.5L14.5,10.91Z" />
            </svg>
        `;

        this.expandElement.setAttribute(
            "aria-label",
            this.outputExpanded ? "Collapse summary" : "Expand summary"
        );
    };

    private handleInsert = async (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        if (this.state !== "idle") {
            return;
        }

        const confirmed = await ConfirmOverlay.open({
            message: "Are you ready to insert the summary into the document?",
            continueBtnTxt: "Insert",
            cancelBtnTxt: "Cancel",
        });

        if (!confirmed) {
            return;
        }

        const html = this.dataset.value || this.Output.innerHTML;

        if (!html.trim()) {
            this.remove();
            return;
        }

        const tpl = document.createElement("template");
        tpl.innerHTML = html;

        const fragment = document.createDocumentFragment();

        const meaningfulTextNodes = Array.from(tpl.content.childNodes).filter((node) => {
            return node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim();
        });

        const topLevelElements = Array.from(tpl.content.children);

        if (
            topLevelElements.length === 1 &&
            meaningfulTextNodes.length === 0 &&
            topLevelElements[0].tagName.toLowerCase() === "div"
        ) {
            const wrapper = topLevelElements[0];

            while (wrapper.firstChild) {
                fragment.appendChild(wrapper.firstChild);
            }
        } else {
            while (tpl.content.firstChild) {
                fragment.appendChild(tpl.content.firstChild);
            }
        }

        this.replaceWith(fragment);

        document.dispatchEvent(new CustomEvent("save-document"));
    };

    private handleDelete = async (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        if (this.state !== "idle") {
            return;
        }

        const confirmed = await ConfirmOverlay.open({
            message: "Are you sure you want to delete this summary block?",
            continueBtnTxt: "Delete",
            cancelBtnTxt: "Cancel",
        });

        if (!confirmed) {
            return;
        }

        this.remove();

        document.dispatchEvent(new CustomEvent("save-document"));
    };

    private pushOutputHistory(html: string) {
        if (!html.trim()) {
            return;
        }

        const currentHistoryValue = this.previousOutputs[this.outputIndex];

        if (currentHistoryValue === html) {
            return;
        }

        if (this.outputIndex < this.previousOutputs.length - 1) {
            this.previousOutputs = this.previousOutputs.slice(0, this.outputIndex + 1);
        }

        this.previousOutputs.push(html);
        this.outputIndex = this.previousOutputs.length - 1;
    }

    private applyHistoryIndex() {
        const html = this.previousOutputs[this.outputIndex] ?? "";

        this.Output.innerHTML = html;
        this.dataset.value = html;

        this.updateHistoryButtons();
    }

    private updateHistoryButtons() {
        if (!this.undoButton || !this.redoButton) {
            return;
        }

        const isBusy = this.state !== "idle";

        this.undoButton.disabled = isBusy || this.outputIndex <= 0;
        this.redoButton.disabled = isBusy || this.outputIndex >= this.previousOutputs.length - 1;
    }

    private setControlsDisabled(disabled: boolean) {
        const buttons = this.querySelectorAll<HTMLButtonElement>("button");

        buttons.forEach((button) => {
            button.disabled = disabled;
        });

        const textarea = this.querySelector<HTMLTextAreaElement>('textarea[name="summary-message"]');

        if (textarea) {
            textarea.disabled = disabled;
        }

        this.updateHistoryButtons();
    }
}