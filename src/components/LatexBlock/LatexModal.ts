import type { LatexBlockSettings, LatexDisplayMode,
    LatexBlock, } from "./LatexBlock";

export type LatexModalPlacement = "inline" | "settings";

export class LatexModal {
    private static activeModal?: LatexModal;

    private readonly block: LatexBlock;
    private readonly anchor: HTMLElement;
    private readonly placement: LatexModalPlacement;
    private readonly onUnmount?: () => void;

    private readonly modalForm: HTMLFormElement;
    private syntaxInput!: HTMLTextAreaElement;
    private labelInput!: HTMLInputElement;
    private labelField!: HTMLLabelElement;
    private modeButton!: HTMLButtonElement;

    private pendingMode: LatexDisplayMode;
    private mounted = false;

    constructor(
        block: LatexBlock,
        anchor: HTMLElement,
        placement: LatexModalPlacement,
        onUnmount?: () => void,
    ) {
        this.block = block;
        this.anchor = anchor;
        this.placement = placement;
        this.onUnmount = onUnmount;
        this.pendingMode = block.displayMode;
        this.modalForm = document.createElement("form");
    }

    public mount(): this {
        LatexModal.activeModal?.unmount();
        LatexModal.activeModal = this;

        this.modalForm.classList.add("latex-modal", "modal");
        this.modalForm.setAttribute("role", "dialog");
        this.modalForm.setAttribute("aria-label", "Edit LaTeX formula");
        this.modalForm.style.position = "fixed";

        this.modalForm.innerHTML = `
            <label class="latex-modal-field">
                <span>LaTeX syntax</span>
                <textarea
                    name="latex"
                    rows="4"
                    spellcheck="false"
                    autocapitalize="off"
                    autocomplete="off"
                    required
                ></textarea>
            </label>

            <button
                class="latex-modal-mode-toggle"
                type="button"
            ></button>

            <label class="latex-modal-field latex-modal-label-field">
                <span>Description</span>
                <input
                    name="label"
                    type="text"
                    maxlength="300"
                    placeholder="Describe this formula"
                />
            </label>

            <div class="latex-modal-actions">
                <button class="latex-modal-cancel" type="button">Cancel</button>
                <button class="latex-modal-submit" type="submit">Apply</button>
            </div>
        `;

        this.syntaxInput = this.requireElement<HTMLTextAreaElement>("textarea[name='latex']");
        this.labelInput = this.requireElement<HTMLInputElement>("input[name='label']");
        this.labelField = this.requireElement<HTMLLabelElement>(".latex-modal-label-field");
        this.modeButton = this.requireElement<HTMLButtonElement>(".latex-modal-mode-toggle");

        this.syntaxInput.value = this.block.value;
        this.labelInput.value = this.block.label;
        this.syncModeControls();

        this.modeButton.addEventListener("click", this.handleModeToggle);
        this.modalForm
            .querySelector<HTMLButtonElement>(".latex-modal-cancel")
            ?.addEventListener("click", this.handleCancel);
        this.modalForm.addEventListener("submit", this.handleSubmit);
        this.modalForm.addEventListener("mousedown", this.stopPropagation);
        this.modalForm.addEventListener("click", this.stopPropagation);

        document.body.appendChild(this.modalForm);
        this.mounted = true;

        this.positionModal();

        window.addEventListener("resize", this.positionModal);
        window.addEventListener("scroll", this.positionModal, true);
        window.visualViewport?.addEventListener("resize", this.positionModal);
        window.visualViewport?.addEventListener("scroll", this.positionModal);
        document.addEventListener("keydown", this.handleDocumentKeydown);

        queueMicrotask(() => {
            if (!this.mounted) return;

            document.addEventListener("pointerdown", this.handleOutsidePointerDown);
            this.syntaxInput.focus();
            this.syntaxInput.select();
        });

        return this;
    }

    public unmount(): void {
        if (!this.mounted && !this.modalForm.isConnected) return;

        this.mounted = false;

        this.modeButton?.removeEventListener("click", this.handleModeToggle);
        this.modalForm
            .querySelector<HTMLButtonElement>(".latex-modal-cancel")
            ?.removeEventListener("click", this.handleCancel);
        this.modalForm.removeEventListener("submit", this.handleSubmit);
        this.modalForm.removeEventListener("mousedown", this.stopPropagation);
        this.modalForm.removeEventListener("click", this.stopPropagation);

        window.removeEventListener("resize", this.positionModal);
        window.removeEventListener("scroll", this.positionModal, true);
        window.visualViewport?.removeEventListener("resize", this.positionModal);
        window.visualViewport?.removeEventListener("scroll", this.positionModal);
        document.removeEventListener("keydown", this.handleDocumentKeydown);
        document.removeEventListener("pointerdown", this.handleOutsidePointerDown);

        this.modalForm.remove();

        if (LatexModal.activeModal === this) {
            LatexModal.activeModal = undefined;
        }

        this.onUnmount?.();
    }

    private handleModeToggle = (): void => {
        this.pendingMode = this.pendingMode === "inline" ? "display" : "inline";
        this.syncModeControls();

        requestAnimationFrame(this.positionModal);
    };

    private handleCancel = (event: MouseEvent): void => {
        event.preventDefault();
        this.unmount();
    };

    private handleSubmit = (event: SubmitEvent): void => {
        event.preventDefault();

        const settings: LatexBlockSettings = {
            value: this.syntaxInput.value,
            displayMode: this.pendingMode,
            label: this.labelInput.value.trim(),
        };

        this.block.applySettings(settings);
        this.unmount();
    };

    private handleDocumentKeydown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape") return;

        event.preventDefault();
        this.unmount();
    };

    private handleOutsidePointerDown = (event: PointerEvent): void => {
        const target = event.target as Node | null;
        if (!target) return;

        if (
            this.modalForm.contains(target) ||
            this.anchor.contains(target) ||
            this.block.contains(target)
        ) {
            return;
        }

        this.unmount();
    };

    private stopPropagation = (event: Event): void => {
        event.stopPropagation();
    };

    private syncModeControls(): void {
        const isDisplay = this.pendingMode === "display";

        this.modeButton.textContent = isDisplay
            ? "Switch to inline"
            : "Switch to display";
        this.modeButton.setAttribute("aria-pressed", String(isDisplay));

        this.labelField.hidden = !isDisplay;
        this.labelInput.disabled = !isDisplay;
    }

    private positionModal = (): void => {
        if (!this.mounted || !this.anchor.isConnected) return;

        const anchorRect = this.anchor.getBoundingClientRect();
        const modalRect = this.modalForm.getBoundingClientRect();
        const viewport = window.visualViewport;

        const viewportLeft = viewport?.offsetLeft ?? 0;
        const viewportTop = viewport?.offsetTop ?? 0;
        const viewportWidth = viewport?.width ?? window.innerWidth;
        const viewportHeight = viewport?.height ?? window.innerHeight;
        const viewportRight = viewportLeft + viewportWidth;
        const viewportBottom = viewportTop + viewportHeight;

        const gap = 10;
        const edgePadding = 12;
        const availableAbove = anchorRect.top - viewportTop;
        const availableBelow = viewportBottom - anchorRect.bottom;
        const fitsBelow = availableBelow >= modalRect.height + gap;
        const fitsAbove = availableAbove >= modalRect.height + gap;

        const placeAbove = fitsAbove && (!fitsBelow || availableAbove > availableBelow);

        let top = placeAbove
            ? anchorRect.top - modalRect.height - gap
            : anchorRect.bottom + gap;

        let left = this.placement === "inline"
            ? anchorRect.left + (anchorRect.width / 2) - (modalRect.width / 2)
            : anchorRect.right - modalRect.width;

        left = Math.max(
            viewportLeft + edgePadding,
            Math.min(left, viewportRight - modalRect.width - edgePadding),
        );

        top = Math.max(
            viewportTop + edgePadding,
            Math.min(top, viewportBottom - modalRect.height - edgePadding),
        );

        this.modalForm.dataset.placement = placeAbove ? "above" : "below";
        this.modalForm.style.left = `${Math.round(left)}px`;
        this.modalForm.style.top = `${Math.round(top)}px`;
    };

    private requireElement<T extends Element>(selector: string): T {
        const element = this.modalForm.querySelector<T>(selector);

        if (!element) {
            throw new Error(`LatexModal is missing required element: ${selector}`);
        }

        return element;
    }
}