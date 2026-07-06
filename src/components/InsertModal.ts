import { Scribby } from "./Scribby.js";

export class InsertModal {
    scribby!: Scribby;
    innerContent: string;
    modalForm: HTMLFormElement;
    submitButton: HTMLButtonElement;
    cancelButton: HTMLButtonElement;
    buttonRow: HTMLDivElement;
    referenceRect: DOMRect;
    anchor: HTMLAnchorElement | null;
    resolveFn!: (value: Record<string, string> | null) => void;

    private isMounted = false;
    private hasResolved = false;

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
        this.submitButton.type = "submit";
        this.submitButton.innerText = "insert";

        this.cancelButton = document.createElement("button");
        this.cancelButton.type = "button";
        this.cancelButton.innerText = "cancel";

        this.buttonRow = document.createElement("div");
        this.buttonRow.classList.add("row-buttons");

        this.modalForm.addEventListener("submit", this.onSubmit);
        this.cancelButton.addEventListener("click", this.onCancel);
    }

    private onSubmit = (e: SubmitEvent) => {
        e.preventDefault();

        const formData = new FormData(this.modalForm);
        const values: Record<string, string> = {};

        for (const [key, value] of formData.entries()) {
            values[key] = value.toString();
        }

        this.finish(values);
    };

    private onCancel = () => {
        this.finish(null);
    };

    private onKeydown = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;

        this.finish(null);
    };

    private onOutsideClick = (e: MouseEvent) => {
        const target = e.target as Node;

        if (this.modalForm.contains(target)) return;

        this.finish(null);
    };

    private finish(value: Record<string, string> | null) {
        if (this.hasResolved) return;

        this.hasResolved = true;
        this.resolveFn(value);
        this.unmount();
    }

    public close() {
        this.finish(null);
    }

    mount() {
        if (this.isMounted) return;

        this.isMounted = true;
        this.hasResolved = false;

        const mobile = window.matchMedia("(max-width: 768px)").matches;

        this.modalForm.classList.add("insert-modal");
        this.modalForm.classList.add("modal");

        if (mobile) {
            this.modalForm.classList.add("mobile-overlay");
            document.querySelector("main")?.classList.add("overlay-active");
        }

        this.submitButton.classList.add("btn-small", "confirm");
        this.cancelButton.classList.add("btn-small", "cancel");

        this.buttonRow.innerHTML = "";
        this.buttonRow.append(this.submitButton, this.cancelButton);

        this.modalForm.innerHTML = this.innerContent;
        this.modalForm.append(this.buttonRow);

        if (mobile) {
            document.body.append(this.modalForm);
        } else {
            this.scribby.el.parentElement!.append(this.modalForm);

            const modalRect = this.modalForm.getBoundingClientRect();
            const parent = this.modalForm.offsetParent as HTMLElement;
            const parentRect = parent.getBoundingClientRect();

            const left =
                this.referenceRect.left -
                parentRect.left +
                parent.scrollLeft +
                this.referenceRect.width / 2 -
                modalRect.width / 2;

            const top =
                this.referenceRect.bottom -
                parentRect.top +
                parent.scrollTop +
                12;

            this.modalForm.style.left = `${left}px`;
            this.modalForm.style.top = `${top}px`;
        }

        document.addEventListener("keydown", this.onKeydown);

        setTimeout(() => {
            document.addEventListener("click", this.onOutsideClick, true);
        });

        const firstInput = this.modalForm.querySelector("input") as HTMLInputElement | null;
        firstInput?.focus();
    }

    unmount() {
        if (!this.isMounted) return;

        this.isMounted = false;

        document.removeEventListener("keydown", this.onKeydown);
        document.removeEventListener("click", this.onOutsideClick, true);

        document.querySelector("main")?.classList.remove("overlay-active");

        if (this.scribby.currentInsertModal === this) {
            this.scribby.currentInsertModal = null;
        }

        this.modalForm.remove();
    }

    submission(): Promise<Record<string, string> | null> {
        return new Promise((resolve) => {
            this.resolveFn = resolve;
            this.mount();
        });
    }
}