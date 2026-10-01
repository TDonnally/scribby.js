import type { Scribby } from "../../Scribby.js"
import { LinkModal } from "../../LinkModal.js";

export function handleChangeSelection(scribby: Scribby) {
    const activeElement = document.activeElement as HTMLElement | null;

    // if we are in a modal do not change the stored selection
    if (activeElement?.closest(".insert-modal, .latex-modal")) {
        return;
    }

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
        scribby.selection = null;
        return;
    }

    const range = selection.getRangeAt(0);

    if (!scribby.el.contains(range.commonAncestorContainer)) {
        return;
    }

    const parent = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer as HTMLElement
        : range.commonAncestorContainer.parentElement;

    const closestLatexBlock = parent?.closest<HTMLElement>("scribby-latex-block",);

    if (closestLatexBlock) {
        if (scribby.currentInsertModal) {
            scribby.currentInsertModal.close();
            scribby.currentInsertModal = null;
        }

        if (scribby.currentTextModal) {
            scribby.currentTextModal.unmount();
            scribby.currentTextModal = null;
        }

        return;
    }

    if (scribby.currentInsertModal) {
        scribby.currentInsertModal.close();
        scribby.currentInsertModal = null;
    }

    if (scribby.currentTextModal) {
        scribby.currentTextModal.unmount();
        scribby.currentTextModal = null;
    }

    scribby.selection = range;
    const activateStyleButtons = new CustomEvent('activate-style-buttons', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(activateStyleButtons);

    const closestAnchor = parent?.closest("a");
    const closestCodeBlock = parent?.closest("scribby-code-block");
    const closestSummary = parent?.closest("summary-output");
    const closestAudioBlock = parent?.closest("speech-output");
    const closestCanvas = parent?.closest("inline-canvas");

    if (
        closestAnchor &&
        scribby.currentInsertModal === null
    ) {
        const linkModal = new LinkModal(
            scribby,
            scribby.selection.getBoundingClientRect(),
            closestAnchor,
        );

        scribby.currentTextModal = linkModal;
        linkModal.mount();

        return;
    }

    if (
        !closestCodeBlock &&
        !closestSummary &&
        !closestAudioBlock &&
        !closestCanvas
    ) {
        scribby.el.focus();
    }
}

export function handleFocusIn(scribby: Scribby, e: Event) {
    if (scribby.currentInsertModal) {
        scribby.currentInsertModal.unmount();
        scribby.currentInsertModal = null;
    }
}