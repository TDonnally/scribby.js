import { Scribby } from "../Scribby.js";

const promptModalTemplate = document.createElement("template");

promptModalTemplate.innerHTML = `
    <form class="prompt-modal-form">
        <h4>Have Scribby write some notes</h4>
        <p class = "small">The highlighted selection will be used in your request</p>

        <textarea
            id="additional-context"
            name="additional_context"
            rows="5"
            placeholder="Ex. Write me section on the Battle of Waterloo"
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

    private scrollParent!: HTMLElement;
    private scrollOrigin = { left: 0, top: 0 };

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

    private positionModal = () => {
        const parentRect = this.scrollParent.getBoundingClientRect();
        const dx = parentRect.left - this.scrollParent.scrollLeft - this.scrollOrigin.left;
        const dy = parentRect.top - this.scrollParent.scrollTop - this.scrollOrigin.top;
        const modalRect = this.getBoundingClientRect();

        const left =
            this.referenceRect.left +
            dx +
            this.referenceRect.width / 2 -
            modalRect.width / 2;

        const top = this.referenceRect.bottom + dy + 12;

        this.style.left = `${left}px`;
        this.style.top = `${top}px`;
    };

    private mount() {
        const mobile = window.matchMedia("(max-width: 768px)").matches;

        this.render();
        this.setAttribute("popover", "manual");

        if (mobile) {
            this.classList.add("mobile-overlay");
            document.querySelector("main")?.classList.add("overlay-active");
        }

        document.body.append(this);
        this.showPopover();

        if (!mobile) {
            this.scrollParent = this.scribby.el.parentElement!;

            const parentRect = this.scrollParent.getBoundingClientRect();

            this.scrollOrigin = {
                left: parentRect.left - this.scrollParent.scrollLeft,
                top: parentRect.top - this.scrollParent.scrollTop,
            };

            this.positionModal();

            window.addEventListener("scroll", this.positionModal, true);
            window.addEventListener("resize", this.positionModal);
        }

        this.textareaEl.focus();
    }

    private unmount() {
        this.formEl?.removeEventListener("submit", this.onSubmit);
        this.cancelButton?.removeEventListener("click", this.onCancel);
        document.removeEventListener("keydown", this.onKeydown);
        window.removeEventListener("scroll", this.positionModal, true);
        window.removeEventListener("resize", this.positionModal);

        document.querySelector("main")?.classList.remove("overlay-active");

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