import "./RecordInputModal.js";

const tpl = document.createElement("template");

tpl.innerHTML = `
<button type="button">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <title>record</title>
        <path d="M19,12C19,15.86 15.86,19 12,19C8.14,19 5,15.86 5,12C5,8.14 8.14,5 12,5C15.86,5 19,8.14 19,12Z" />
    </svg>
</button>
`;

export class RecordButton extends HTMLElement {
    btn!: HTMLButtonElement;
    menu: HTMLElement | null = null;

    connectedCallback() {
        if (!this.firstChild) {
            this.appendChild(tpl.content.cloneNode(true));
        }

        this.style.position = "relative";
        this.style.display = "inline-block";

        this.btn = this.querySelector("button")!;

        this.btn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        this.addEventListener("choose-record-input", (e: Event) => {
            const custom = e as CustomEvent<{ input: "mic" | "speaker" }>;
            e.stopPropagation();
            this.closeMenu();

            const startRecording = new CustomEvent("start-recording", {
                bubbles: true,
                composed: true,
                detail: { input: custom.detail.input }
            });

            this.dispatchEvent(startRecording);
        });
    }

    disconnectedCallback() {
        this.closeMenu();
    }

    private toggleMenu() {
        if (this.menu) {
            this.closeMenu();
            return;
        }

        this.menu = document.createElement("record-input-modal");
        this.menu.style.position = "absolute";
        this.menu.style.left = "50%";
        this.menu.style.top = "calc(100% + 14px)";
        this.menu.style.transform = "translateX(-50%)";
        this.menu.style.zIndex = "20";

        this.appendChild(this.menu);

        queueMicrotask(() => {
            document.addEventListener("click", this.handleOutsideClick, { once: true });
        });
    }

    private closeMenu() {
        this.menu?.remove();
        this.menu = null;
    }

    private handleOutsideClick = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (target && this.contains(target)) {
            return;
        }
        this.closeMenu();
    };
}