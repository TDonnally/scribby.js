import { Scribby } from "../Scribby.js";

const promptModalTemplate = document.createElement("template");

promptModalTemplate.innerHTML = `
    <form class="prompt-modal-form">
        <h4>Generate a Summary</h4>
        <p class = "small">(This will replace your selection with a summary block)</p>
        <label for="additional-context">
            Provide additional context
        </label>

        <textarea
            id="additional-context"
            name="additional_context"
            rows="5"
            placeholder="What are you wanting to change about this excerpt?"
        ></textarea>

        <div class="row-buttons">
            <button class="btn-small confirm" type="submit">Insert</button>
            <button class="btn-small cancel" type="button">Cancel</button>
        </div>
    </form>
`;

export class PromptModal extends HTMLElement {
    private scribby!: Scribby;
    private referenceRect!: DOMRect;

    private formEl!: HTMLFormElement;
    private textareaEl!: HTMLTextAreaElement;
    private cancelButton!: HTMLButtonElement;

    private resolveFn!: (value: Record<string, string> | null) => void;

    constructor() {
        super();
    }

    private render() {
        this.classList.add("prompt-modal", "modal");

        this.innerHTML = "";
        this.append(promptModalTemplate.content.cloneNode(true));

        this.formEl = this.querySelector("form") as HTMLFormElement;
        this.textareaEl = this.querySelector("textarea") as HTMLTextAreaElement;
        this.cancelButton = this.querySelector('button[type="button"]') as HTMLButtonElement;

        this.formEl.addEventListener("submit", this.onSubmit);
        this.cancelButton.addEventListener("click", this.onCancel);
        document.addEventListener("keydown", this.onKeydown);
    }

    private onSubmit = (e: SubmitEvent) => {
        e.preventDefault();

        const formData = new FormData(this.formEl);
        const values: Record<string, string> = {};

        for (const [key, value] of formData.entries()) {
            values[key] = value.toString();
        }

        this.resolveFn(values);
        this.unmount();
    };

    private onCancel = () => {
        this.resolveFn(null);
        this.unmount();
    };
    public close() {
        this.resolveFn?.(null);
        this.unmount();
    }

    private onKeydown = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;

        this.resolveFn(null);
        this.unmount();
    };

    private mount() {
        this.render();

        this.scribby.el.parentElement!.append(this);

        const modalRect = this.getBoundingClientRect();
        const parent = this.offsetParent as HTMLElement;
        const parentRect = parent.getBoundingClientRect();

        const left =
            this.referenceRect.left -
            parentRect.left +
            this.referenceRect.width / 2 -
            modalRect.width / 2;

        const top = this.referenceRect.bottom - parentRect.top + 12;

        this.style.left = `${left}px`;
        this.style.top = `${top}px`;

        this.textareaEl.focus();
    }

    private unmount() {
        this.formEl?.removeEventListener("submit", this.onSubmit);
        this.cancelButton?.removeEventListener("click", this.onCancel);
        document.removeEventListener("keydown", this.onKeydown);

        this.remove();
    }

    submission(
        scribby: Scribby,
        referenceRect: DOMRect,
    ): Promise<Record<string, string> | null> {
        this.scribby = scribby;
        this.referenceRect = referenceRect;

        return new Promise((resolve) => {
            this.resolveFn = resolve;
            this.mount();
        });
    }
}