import katex from "katex";

import { LatexModal, type LatexModalPlacement } from "./LatexModal.js";

export type LatexDisplayMode = "inline" | "display";

export interface LatexBlockSettings {
    value: string;
    displayMode: LatexDisplayMode;
    label: string;
}

export interface ParsedLatexMarkdown {
    value: string;
    inferredMode: LatexDisplayMode | null;
}

const SETTINGS_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
        <title>cog</title>
        <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
    </svg>
`;

export function parseLatexMarkdown(source: string): ParsedLatexMarkdown {
    const value = source.trim();

    const wrappers: Array<{
        start: string;
        end: string;
        mode: LatexDisplayMode;
    }> = [
        { start: "$$", end: "$$", mode: "display" },
        { start: "\\[", end: "\\]", mode: "display" },
        { start: "\\(", end: "\\)", mode: "inline" },
        { start: "$", end: "$", mode: "inline" },
    ];

    for (const wrapper of wrappers) {
        const minimumLength = wrapper.start.length + wrapper.end.length;

        if (
            value.length >= minimumLength &&
            value.startsWith(wrapper.start) &&
            value.endsWith(wrapper.end)
        ) {
            return {
                value: value.slice(wrapper.start.length, -wrapper.end.length).trim(),
                inferredMode: wrapper.mode,
            };
        }
    }

    return {
        value,
        inferredMode: null,
    };
}

export class LatexBlock extends HTMLElement {
    public static get observedAttributes(): string[] {
        return ["data-value", "data-display", "data-label"];
    }

    private renderEl?: HTMLDivElement;
    private captionEl?: HTMLDivElement;
    private settingsButton?: HTMLButtonElement;
    private modal?: LatexModal;
    private hasMounted = false;
    private batchingAttributeChanges = false;

    public get value(): string {
        return this.getAttribute("data-value") ?? "";
    }

    public set value(value: string) {
        const parsed = parseLatexMarkdown(value);
        this.setAttributeIfChanged("data-value", parsed.value);

        if (parsed.inferredMode) {
            this.setAttributeIfChanged("data-display", parsed.inferredMode);
        }
    }

    public get displayMode(): LatexDisplayMode {
        return this.getAttribute("data-display") === "display"
            ? "display"
            : "inline";
    }

    public set displayMode(value: LatexDisplayMode) {
        this.setAttributeIfChanged("data-display", value);
    }

    public get label(): string {
        return this.getAttribute("data-label") ?? "";
    }

    public set label(value: string) {
        const normalized = value.trim();

        if (normalized) {
            this.setAttributeIfChanged("data-label", normalized);
            return;
        }

        this.removeAttribute("data-label");
    }

    public connectedCallback(): void {
        this.contentEditable = "false";
        this.draggable = false;
        this.classList.add("latex-block");

        this.normalizeInitialAttributes();

        if (!this.hasMounted) {
            this.mountComponent();
        }

        this.render();
    }

    public disconnectedCallback(): void {
        this.modal?.unmount();
        this.modal = undefined;
    }

    public attributeChangedCallback(
        _name: string,
        oldValue: string | null,
        newValue: string | null,
    ): void {
        if (oldValue === newValue || this.batchingAttributeChanges) return;
        if (!this.hasMounted) return;

        this.render();
    }

    public applySettings(settings: LatexBlockSettings): void {
        const parsed = parseLatexMarkdown(settings.value);

        this.batchingAttributeChanges = true;

        try {
            this.setAttributeIfChanged("data-value", parsed.value);
            this.setAttributeIfChanged("data-display", settings.displayMode);

            const normalizedLabel = settings.label.trim();
            if (normalizedLabel) {
                this.setAttributeIfChanged("data-label", normalizedLabel);
            } else {
                this.removeAttribute("data-label");
            }
        } finally {
            this.batchingAttributeChanges = false;
        }

        this.render();
        this.notifyChange();
    }

    public openEditor(referenceRect?: DOMRectReadOnly): void {
        const isDisplay = this.displayMode === "display";

        const anchor = isDisplay && this.settingsButton
            ? this.settingsButton
            : referenceRect ?? this.getBoundingClientRect();

        const placement: LatexModalPlacement = isDisplay
            ? "settings"
            : "inline";

        this.modal?.unmount();
        this.modal = new LatexModal(
            this,
            anchor,
            placement,
            () => {
                this.modal = undefined;
            },
        );
        this.modal.mount();
    }

    public getValue(): string {
        return this.value;
    }

    public isEmpty(): boolean {
        return this.value.trim().length === 0;
    }

    public focusStart(): void {
        this.openEditor();
    }

    public focusEnd(): void {
        this.openEditor();
    }

    private mountComponent(): void {
        this.hasMounted = true;

        const shell = document.createElement("div");
        shell.classList.add("latex-block-shell");
        shell.contentEditable = "false";

        const render = document.createElement("div");
        render.classList.add("latex-block-render");
        render.setAttribute("aria-live", "polite");
        render.contentEditable = "false";

        const caption = document.createElement("div");
        caption.classList.add("latex-block-caption");
        caption.contentEditable = "false";

        const settingsButton = document.createElement("button");
        settingsButton.type = "button";
        settingsButton.classList.add("latex-block-settings");
        settingsButton.setAttribute("aria-label", "Edit formula settings");
        settingsButton.setAttribute("title", "Edit formula settings");
        settingsButton.contentEditable = "false";
        settingsButton.innerHTML = SETTINGS_ICON;

        settingsButton.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        settingsButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openEditor();
        });

        /*
         * Prevent the parent contenteditable editor from placing its caret
         * inside KaTeX before the click is handled. The zero-sized DOMRect
         * makes the desktop modal open at the exact pointer position.
         */
        shell.addEventListener("pointerdown", (event) => {
            if (this.displayMode !== "inline") return;
            if (!event.isPrimary || event.button !== 0) return;

            const target = event.target as HTMLElement | null;
            if (target?.closest("button")) return;

            event.preventDefault();
            event.stopPropagation();

            this.openEditor(
                new DOMRect(
                    event.clientX,
                    event.clientY,
                    0,
                    0,
                ),
            );
        });

        /*
         * pointerdown opens the editor. Suppress the following click so it
         * cannot focus the Scribby contenteditable or reopen the modal.
         */
        shell.addEventListener("click", (event) => {
            if (this.displayMode !== "inline") return;

            event.preventDefault();
            event.stopPropagation();
        });

        /*
         * Defensive fallback for browsers that try to dispatch an edit
         * operation against descendants of a contenteditable=false host.
         */
        this.addEventListener("beforeinput", (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        this.addEventListener("keydown", (event) => {
            if (this.displayMode !== "inline") return;
            if (event.key !== "Enter" && event.key !== " ") return;

            event.preventDefault();
            event.stopPropagation();
            this.openEditor();
        });

        shell.appendChild(render);
        shell.appendChild(settingsButton);
        shell.appendChild(caption);

        this.replaceChildren(shell);

        this.renderEl = render;
        this.captionEl = caption;
        this.settingsButton = settingsButton;
    }

    private normalizeInitialAttributes(): void {
        const parsed = parseLatexMarkdown(this.value);

        this.batchingAttributeChanges = true;

        try {
            this.setAttributeIfChanged("data-value", parsed.value);

            if (!this.hasAttribute("data-display")) {
                this.setAttribute(
                    "data-display",
                    parsed.inferredMode ?? "inline",
                );
            } else if (
                this.getAttribute("data-display") !== "inline" &&
                this.getAttribute("data-display") !== "display"
            ) {
                this.setAttribute("data-display", "inline");
            }
        } finally {
            this.batchingAttributeChanges = false;
        }
    }

    private render(): void {
        if (!this.renderEl || !this.captionEl || !this.settingsButton) return;

        const isDisplay = this.displayMode === "display";
        const latex = this.value.trim();
        const label = this.label.trim();

        this.dataset.display = this.displayMode;
        this.classList.toggle("is-inline", !isDisplay);
        this.classList.toggle("is-display", isDisplay);
        this.classList.toggle("is-empty", latex.length === 0);

        this.tabIndex = isDisplay ? -1 : 0;
        this.settingsButton.hidden = !isDisplay;

        this.captionEl.textContent = label;
        this.captionEl.hidden = !isDisplay || label.length === 0;

        this.renderEl.replaceChildren();
        this.renderEl.removeAttribute("title");
        this.classList.remove("has-latex-error");

        if (!latex) {
            const placeholder = document.createElement("span");
            placeholder.classList.add("latex-block-placeholder");
            placeholder.textContent = "Add a formula";
            this.renderEl.appendChild(placeholder);
            this.updateAccessibilityLabel();
            return;
        }

        try {
            katex.render(latex, this.renderEl, {
                displayMode: isDisplay,
                output: "htmlAndMathml",
                throwOnError: false,
                strict: "warn",
                trust: false,
            });
        } catch (error) {
            this.classList.add("has-latex-error");
            this.renderEl.textContent = latex;
            this.renderEl.title = error instanceof Error
                ? error.message
                : "Unable to render this formula.";
        }

        this.updateAccessibilityLabel();
    }

    private updateAccessibilityLabel(): void {
        if (this.displayMode === "inline") {
            this.setAttribute("aria-label", "Edit inline formula");
            this.setAttribute("role", "button");
            return;
        }

        this.removeAttribute("aria-label");
        this.removeAttribute("role");
    }

    private notifyChange(): void {
        this.dispatchEvent(
            new CustomEvent("scribby:block-change", {
                bubbles: true,
            }),
        );
    }

    private setAttributeIfChanged(name: string, value: string): void {
        if (this.getAttribute(name) === value) return;
        this.setAttribute(name, value);
    }
}