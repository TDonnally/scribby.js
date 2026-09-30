import type { Scribby } from "../../Scribby.js"
import * as utils from "../../../utilities/utilities.js"

export function handleArrowDown(scribby: Scribby, e: Event) {
    const range = scribby.selection;
    if (!range) return;
    const parent = range.startContainer;
    const parentEl = parent as HTMLElement;

    let closestLine: HTMLElement | null;
    let codeBlock: HTMLElement | null;
    if (parent.nodeType != Node.ELEMENT_NODE) {
        const nodeParent = parent.parentElement;
        if (!nodeParent) return;
        closestLine = nodeParent.closest(".cm-line");
        codeBlock = nodeParent.closest("scribby-code-block");
    }
    else {
        closestLine = parentEl.closest(".cm-line");
        codeBlock = parentEl.closest("scribby-code-block");
    }

    if (closestLine?.nextElementSibling === null) {
        e.preventDefault();
        let target = codeBlock?.nextElementSibling as HTMLElement;
        if (target === null) {
            const entryP = document.createElement("p");
            const br = document.createElement("br");
            entryP.appendChild(br);
            codeBlock?.after(entryP);
            target = entryP;
        }
        const newRange = document.createRange();
        newRange.selectNodeContents(target);
        newRange.collapse(false);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
        }
        selection?.addRange(newRange);
    }
}