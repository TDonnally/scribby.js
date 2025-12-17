import { Scribby } from "./Scribby.js";

export class InsertModal {
    scribby!: Scribby;
    innerContent: string;
    modalForm: HTMLFormElement;
    submitButton: HTMLButtonElement;
    referenceRect: DOMRect;
    anchor: HTMLAnchorElement | null;
    resolveFn!: (value: Record<string, string> | null) => void;
    constructor(
        scribby: Scribby,
        innerContent: string,
        referenceRect: DOMRect,
        anchor: HTMLAnchorElement | null = null,
    ) {
        this.scribby = scribby;
        this.innerContent = innerContent;
        this.referenceRect = referenceRect;
        this.anchor = anchor;

        this.modalForm = document.createElement("form");
        this.submitButton = document.createElement("button");
        this.submitButton.type = "submit"
        this.submitButton.innerText = "insert";

        this.modalForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const formData = new FormData(this.modalForm);
            const values: Record<string, string> = {};

            for (const [key, value] of formData.entries()) {
                values[key] = value.toString();
            }

            this.resolveFn(values);
            this.unmount();
        });
    }
    mount() {
        this.modalForm.classList.add("insert-modal");
        this.modalForm.classList.add("modal");
        this.modalForm.innerHTML = this.innerContent;
        this.modalForm.append(this.submitButton);
        this.scribby.el.parentElement!.append(this.modalForm);
        // positioning
        const modalRect = this.modalForm.getBoundingClientRect();
        const parent = this.modalForm.offsetParent as HTMLElement;
        const parentRect = parent.getBoundingClientRect();

        const left = this.referenceRect.left - parentRect.left + (this.referenceRect.width / 2) - (modalRect.width / 2);
        const top = this.referenceRect.bottom - parentRect.top + 12;
        this.modalForm.style.left = `${left}px`;
        this.modalForm.style.top = `${top}px`;

        const firstInput = this.modalForm.querySelector("input");
        firstInput!.focus();
    }
    unmount() {
        this.modalForm.remove();
    }
    submission(): Promise<Record<string, string> | null> {
        return new Promise((resolve) => {
            this.resolveFn = resolve;
            this.mount();
        });

    }
}