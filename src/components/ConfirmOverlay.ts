const confirmOverlayTemplate = document.createElement("template");

confirmOverlayTemplate.innerHTML = `
    <form class="confirm-overlay-form">
        <div class="overlay-header">
            <h3 class="confirm-title">Confirm</h3>
        </div>

        <p class="confirm-message"></p>

        <div class="row-buttons">
            <button class="continue btn-small confirm" type="submit">Continue</button>
            <button class="cancel btn-small" type="button">Cancel</button>
        </div>
    </form>
`;

type ConfirmOverlayOptions = {
    message?: string;
    continueBtnTxt?: string;
    cancelBtnTxt?: string;
};

export class ConfirmOverlay extends HTMLElement {
    private main: HTMLElement | null = null;
    private outsideClickHandler?: (e: MouseEvent) => void;
    private keydownHandler?: (e: KeyboardEvent) => void;

    private formEl!: HTMLFormElement;
    private messageEl!: HTMLElement;
    private continueBtn!: HTMLButtonElement;
    private cancelBtn!: HTMLButtonElement;

    private resolveResult!: (confirmed: boolean) => void;
    private resultPromise: Promise<boolean>;

    private hasResolved = false;

    constructor() {
        super();

        this.resultPromise = new Promise<boolean>((resolve) => {
            this.resolveResult = resolve;
        });
    }

    connectedCallback() {
        this.classList.add("overlay");

        this.main = document.querySelector("main");
        this.main?.classList.add("overlay-active");

        this.render();
        this.bindEvents();
    }

    disconnectedCallback() {
        this.cleanup();
    }

    static open(options: ConfirmOverlayOptions = {}): Promise<boolean> {
        const overlay = document.createElement("confirm-overlay") as ConfirmOverlay;

        if (options.message !== undefined) {
            overlay.setAttribute("data-message", options.message);
        }

        if (options.continueBtnTxt !== undefined) {
            overlay.setAttribute("data-continue-btn-txt", options.continueBtnTxt);
        }

        if (options.cancelBtnTxt !== undefined) {
            overlay.setAttribute("data-cancel-btn-txt", options.cancelBtnTxt);
        }

        document.body.appendChild(overlay);

        return overlay.wait();
    }

    wait(): Promise<boolean> {
        return this.resultPromise;
    }

    private render() {
        this.innerHTML = "";

        const frag = confirmOverlayTemplate.content.cloneNode(true) as DocumentFragment;
        this.appendChild(frag);

        this.formEl = this.querySelector(".confirm-overlay-form")!;
        this.messageEl = this.querySelector(".confirm-message")!;
        this.continueBtn = this.querySelector(".continue")!;
        this.cancelBtn = this.querySelector(".cancel")!;

        this.messageEl.textContent =
            this.getAttribute("data-message") || "Are you sure you want to continue?";

        this.continueBtn.textContent =
            this.getAttribute("data-continue-btn-txt") || "Continue";

        this.cancelBtn.textContent =
            this.getAttribute("data-cancel-btn-txt") || "Cancel";
    }

    private bindEvents() {
        this.formEl.addEventListener("submit", (e) => {
            e.preventDefault();
            this.finish(true);
        });

        this.cancelBtn.addEventListener("click", () => {
            this.finish(false);
        });

        this.addEventListener("close-overlay", () => {
            this.finish(false);
        });

        this.outsideClickHandler = (e: MouseEvent) => {
            const target = e.target as Node;

            if (this.contains(target)) return;

            this.finish(false);
        };

        this.keydownHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                this.finish(false);
            }
        };

        document.addEventListener("click", this.outsideClickHandler, true);
        document.addEventListener("keydown", this.keydownHandler);
    }

    private finish(confirmed: boolean) {
        if (this.hasResolved) return;

        this.hasResolved = true;

        this.dispatchEvent(
            new CustomEvent("confirm-overlay-result", {
                bubbles: true,
                detail: { confirmed },
            })
        );

        this.resolveResult(confirmed);
        this.cleanup();
        this.remove();
    }

    private cleanup() {
        if (this.outsideClickHandler) {
            document.removeEventListener("click", this.outsideClickHandler, true);
            this.outsideClickHandler = undefined;
        }

        if (this.keydownHandler) {
            document.removeEventListener("keydown", this.keydownHandler);
            this.keydownHandler = undefined;
        }

        this.main?.classList.remove("overlay-active");
    }
}

