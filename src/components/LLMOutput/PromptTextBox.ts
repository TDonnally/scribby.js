import { SummaryOutput } from "./SummaryOutput";

const tpl = document.createElement("template");
tpl.innerHTML = `
    <div class="text-box">
        <button type="button" data-action="send">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <title>send</title>
                <path d="M2,21L23,12L2,3V10L17,12L2,14V21Z" />
            </svg>
        </button>
        <textarea name="summary-message" rows="2" placeholder="Want to change anything else?"></textarea>
    </div>
`;

export class PromptTextBox extends HTMLElement {
    sendButton!: HTMLButtonElement;
    textArea!: HTMLTextAreaElement;
    SummaryOutput!: SummaryOutput;

    private mounted = false;

    connectedCallback() {
        if (this.mounted) {
            return;
        }

        this.mounted = true;
        this.appendChild(tpl.content.cloneNode(true));

        this.SummaryOutput = this.closest("summary-output") as SummaryOutput;
        this.textArea = this.querySelector('[name="summary-message"]') as HTMLTextAreaElement;
        this.sendButton = this.querySelector('[data-action="send"]') as HTMLButtonElement;

        this.sendButton.addEventListener("click", this.handleSend);

        this.textArea.addEventListener("keydown", this.handleKeyDown);

        this.textArea.addEventListener("input", this.stopEditorInput);

        this.textArea.addEventListener("keyup", this.stopEditorInput);
        this.textArea.addEventListener("paste", this.stopEditorInput);
        this.textArea.addEventListener("cut", this.stopEditorInput);
    }

    disconnectedCallback() {
        this.sendButton?.removeEventListener("click", this.handleSend);
        this.textArea?.removeEventListener("keydown", this.handleKeyDown);
        this.textArea?.removeEventListener("input", this.stopEditorInput);
        this.textArea?.removeEventListener("keyup", this.stopEditorInput);
        this.textArea?.removeEventListener("paste", this.stopEditorInput);
        this.textArea?.removeEventListener("cut", this.stopEditorInput);

        this.mounted = false;
    }

    private handleSend = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        if (this.SummaryOutput.state !== "idle") {
            return;
        }

        const message = this.textArea.value.trim();

        if (!message) {
            return;
        }

        this.SummaryOutput.sendMessage(message);
        this.textArea.value = "";
    };

    private handleKeyDown = (e: KeyboardEvent) => {
        e.stopPropagation();

        const key = e.key.toLowerCase();
        const isUndo = (e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey;
        const isRedo =
            ((e.ctrlKey || e.metaKey) && key === "y") ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "z");

        if (isUndo) {
            e.preventDefault();
            this.SummaryOutput.undoOutput();
            return;
        }

        if (isRedo) {
            e.preventDefault();
            this.SummaryOutput.redoOutput();
            return;
        }

        if (e.key !== "Enter") {
            return;
        }

        if (e.shiftKey) {
            return;
        }

        e.preventDefault();
        this.handleSend(e);
    };

    private stopEditorInput = (e: Event) => {
        e.stopPropagation();
    };
}