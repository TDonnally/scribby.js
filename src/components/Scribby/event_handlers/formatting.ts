import type { Scribby } from "../../Scribby.js"
import * as utils from "../../../utilities/utilities.js"
import {
    containsInlineLatexBlock,
    getAdjacentInlineLatexBlock,
    isCaretAtLatexTextBoundary,
    mergeTextBlocksPreservingLatexBlock,
    removeInlineLatexBlock,
    splitTextBlockAtInlineLatexBoundary,
} from "../../LatexBlock/utilities.js";

export function handleEnter(scribby: Scribby, e: Event) {
    const range = scribby.selection;
    if (!range || !range.collapsed) return;

    const parent =
        range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer as HTMLElement
            : range.startContainer.parentElement;

    if (!parent) return;

    const codeBlock = parent.closest("scribby-code-block") as HTMLElement | null;

    /*
     * Native contenteditable inserts a BR when splitting directly
     * before a contenteditable=false inline component. Split the
     * nodes ourselves so a leading formula remains:
     *
     * <p><scribby-latex-block>...</scribby-latex-block></p>
     *
     * rather than:
     *
     * <p><br><scribby-latex-block>...</scribby-latex-block></p>
     */
    if (!codeBlock) {
        const latexTextContainer = parent.closest(
            "p, h1, h2, h3, h4, h5, h6, li",
        ) as HTMLElement;

        if (latexTextContainer) {
            const splitRange =
                splitTextBlockAtInlineLatexBoundary(
                    range,
                    latexTextContainer,
                );

            if (splitRange) {
                e.preventDefault();
                scribby.selection = splitRange;
                scribby.el.dispatchEvent(new Event("input"));
                return;
            }
        }
    }

    // Normal editor text: h1/p/etc.
    if (!codeBlock) {
        const block = parent.closest("h1, h2, h3, h4, h5, h6, p") as HTMLElement | null;
        if (!block) return;

        const beforeRange = document.createRange();
        beforeRange.selectNodeContents(block);
        beforeRange.setEnd(range.startContainer, range.startOffset);

        const afterRange = document.createRange();
        afterRange.selectNodeContents(block);
        afterRange.setStart(range.startContainer, range.startOffset);

        const isAtStart = !(beforeRange.toString() ?? "").replace(/[\s\u200B]+/g, "");
        const isAtEnd = !(afterRange.toString() ?? "").replace(/[\s\u200B]+/g, "");

        e.preventDefault();

        // line break at end
        if (isAtEnd) {
            const nextP = document.createElement("p");
            const textNode = document.createTextNode("\u200B");

            nextP.dataset.uuid = crypto.randomUUID();
            nextP.appendChild(textNode);
            block.after(nextP);

            const newRange = document.createRange();
            newRange.setStart(textNode, 1);
            newRange.collapse(true);

            scribby.selection = utils.placeRange(newRange);
            scribby.el.dispatchEvent(new Event("input"));

            return;
        }

        // line break at beginning
        if (isAtStart) {
            const previousBlock = document.createElement(block.tagName.toLowerCase());
            const textNode = document.createTextNode("\u200B");

            previousBlock.dataset.uuid = crypto.randomUUID();
            previousBlock.appendChild(textNode);
            block.before(previousBlock);

            const newRange = document.createRange();
            newRange.setStart(textNode, 1);
            newRange.collapse(true);

            scribby.selection = utils.placeRange(newRange);
            scribby.el.dispatchEvent(new Event("input"));

            return;
        }

        // line break in middle
        const nextBlock = document.createElement(block.tagName.toLowerCase());

        for (const attribute of Array.from(block.attributes)) {
            if (attribute.name === "data-uuid") continue;

            nextBlock.setAttribute(attribute.name, attribute.value);
        }

        nextBlock.dataset.uuid = crypto.randomUUID();

        const contents = afterRange.extractContents();
        nextBlock.appendChild(contents);
        block.after(nextBlock);

        const newRange = document.createRange();
        newRange.selectNodeContents(nextBlock);
        newRange.collapse(true);

        scribby.selection = utils.placeRange(newRange);
        scribby.el.dispatchEvent(new Event("input"));

        return;
    }

    // CodeMirror / scribby-code-block exit behavior.
    const closestLine = parent.closest(".cm-line") as HTMLElement | null;
    if (!closestLine) return;

    const prev = closestLine.previousElementSibling as HTMLElement | null;
    const next = closestLine.nextElementSibling?.nextElementSibling as HTMLElement | null;

    const prevHasNoText = !!prev && !(prev.textContent ?? "").replace(/[\s\u200B]+/g, "");

    if (next === null && prevHasNoText) {
        e.preventDefault();

        let target = codeBlock.nextElementSibling as HTMLElement | null;

        if (!target) {
            target = document.createElement("p");

            const textNode = document.createTextNode("\u200B");
            target.appendChild(textNode);

            codeBlock.after(target);
        }

        let caretNode = Array.from(target.childNodes).find(
            node => node.nodeType === Node.TEXT_NODE
        ) as Text | undefined;

        if (!caretNode) {
            target.innerHTML = "";
            caretNode = document.createTextNode("\u200B");
            target.appendChild(caretNode);
        }

        const newRange = document.createRange();
        newRange.setStart(caretNode, caretNode.nodeValue?.length ?? 0);
        newRange.collapse(true);

        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(newRange);

        scribby.selection = newRange;
        scribby.el.dispatchEvent(new Event("input"));
    }
}
export async function handleBackSpace(scribby: Scribby, e: KeyboardEvent) {
    const range = scribby.selection;
    if (!range) return;

    const protectedSelector = utils.PROTECTED_BLOCK_SELECTOR;
    const blockSelector = utils.BLOCK_SELECTOR;

    const startEl =
        range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer as HTMLElement
            : range.startContainer.parentElement;

    if (!startEl) return;
    if (startEl.closest(".cm-content")) return;

    const currentLi = startEl.closest<HTMLElement>("li");
    const topLevelChild = utils.getTopLevelChild(range.startContainer, scribby.el);
    const isBackspace = e.key === "Backspace";

    const place = (r: Range | null): void => {
        if (r) scribby.selection = r;
    };

    const emitInput = (): void => {
        scribby.el.dispatchEvent(new Event("input"));
    };

    // After removing a node, guarantee the editor is never empty
    const finishRemoval = (fallback: () => Range | null): void => {
        if (scribby.el.children.length === 0) {
            const p = utils.makePlaceholderP();
            scribby.el.appendChild(p);
            place(utils.placeCaretAtStart(p));
        } else {
            place(fallback());
        }
        emitInput();
    };

    const textContainer = startEl.closest<HTMLElement>(
        "p, h1, h2, h3, h4, h5, h6, li",
    );

    if (!range.collapsed) {
        const protectedBlocks = utils.getProtectedBlocksInsideSelection(range);

        if (protectedBlocks.length > 0) {
            e.preventDefault();

            const confirmed = await utils.confirmProtectedBlockDelete(protectedBlocks[0]);
            if (!confirmed) return;

            range.deleteContents();
            finishRemoval(() => utils.placeRange(range));
            return;
        }

        if (currentLi && utils.selectionWouldEmpty(range, currentLi)) {
            e.preventDefault();
            place(utils.resetPlaceholderBlock(currentLi));
            emitInput();
            return;
        }

        if (
            topLevelChild &&
            topLevelChild.matches(blockSelector) &&
            utils.selectionWouldEmpty(range, topLevelChild) &&
            (topLevelChild.previousElementSibling?.matches(protectedSelector) ||
                topLevelChild.nextElementSibling?.matches(protectedSelector))
        ) {
            e.preventDefault();
            place(utils.resetPlaceholderBlock(topLevelChild));
            emitInput();
            return;
        }

        return;
    }

    if (textContainer) {
        const adjacentLatex = getAdjacentInlineLatexBlock(
            range,
            textContainer,
            isBackspace ? "before" : "after",
        );

        if (adjacentLatex) {
            e.preventDefault();

            const confirmed =
                await utils.confirmProtectedBlockDelete(
                    adjacentLatex,
                );

            if (!confirmed) return;

            place(
                removeInlineLatexBlock(
                    adjacentLatex,
                    textContainer,
                ),
            );

            emitInput();
            return;
        }

        const mergeableTextSelector =
            "p, h1, h2, h3, h4, h5, h6, li";

        if (
            isBackspace &&
            isCaretAtLatexTextBoundary(
                range,
                textContainer,
                "start",
            )
        ) {
            const previous =
                textContainer.previousElementSibling as HTMLElement | null;

            if (
                previous?.matches(mergeableTextSelector) &&
                (
                    containsInlineLatexBlock(textContainer) ||
                    containsInlineLatexBlock(previous)
                )
            ) {
                e.preventDefault();

                place(
                    mergeTextBlocksPreservingLatexBlock(
                        textContainer,
                        previous,
                    ),
                );

                emitInput();
                return;
            }
        }

        if (
            !isBackspace &&
            isCaretAtLatexTextBoundary(
                range,
                textContainer,
                "end",
            )
        ) {
            const next =
                textContainer.nextElementSibling as HTMLElement | null;

            if (
                next?.matches(mergeableTextSelector) &&
                (
                    containsInlineLatexBlock(textContainer) ||
                    containsInlineLatexBlock(next)
                )
            ) {
                e.preventDefault();

                place(
                    mergeTextBlocksPreservingLatexBlock(
                        next,
                        textContainer,
                    ),
                );

                emitInput();
                return;
            }
        }
    }

    // One remaining char in a list item
    if (currentLi && utils.collapsedDeleteWouldEmpty(range, currentLi, e.key)) {
        e.preventDefault();
        place(utils.resetPlaceholderBlock(currentLi));
        emitInput();
        return;
    }

    // Empty list item
    if (currentLi && utils.isPlaceholderOnlyBlock(currentLi)) {
        const list = currentLi.parentElement as HTMLElement | null;
        const prevLi = currentLi.previousElementSibling as HTMLElement | null;
        const nextLi = currentLi.nextElementSibling as HTMLElement | null;
        const prevIsLi = !!prevLi?.matches("li");
        const nextIsLi = !!nextLi?.matches("li");

        e.preventDefault();

        let target: HTMLElement | null = null;
        let caretAtEnd = false;

        if (isBackspace) {
            if (prevIsLi) { target = prevLi; caretAtEnd = true; }
            else if (nextIsLi) { target = nextLi; caretAtEnd = false; }
        } else {
            if (nextIsLi) { target = nextLi; caretAtEnd = false; }
            else if (prevIsLi) { target = prevLi; caretAtEnd = true; }
        }

        if (target) {
            currentLi.remove();
            place(caretAtEnd ? utils.placeCaretAtEnd(target) : utils.placeCaretAtStart(target));
            emitInput();
            return;
        }

        if (list && (list.matches("ul") || list.matches("ol"))) {
            const p = utils.makePlaceholderP();
            list.replaceWith(p);
            place(utils.placeCaretAtStart(p));
            emitInput();
            return;
        }

        place(utils.resetPlaceholderBlock(currentLi));
        return;
    }

    // One remaining char in a protected adjacent block
    if (
        topLevelChild &&
        topLevelChild.matches(blockSelector) &&
        (topLevelChild.previousElementSibling?.matches(protectedSelector) ||
            topLevelChild.nextElementSibling?.matches(protectedSelector)) &&
        utils.collapsedDeleteWouldEmpty(range, topLevelChild, e.key)
    ) {
        e.preventDefault();
        place(utils.resetPlaceholderBlock(topLevelChild));
        emitInput();
        return;
    }

    // Caret sitting directly inside a protected block.
    const directProtectedBlock = startEl.closest<HTMLElement>(protectedSelector);

    if (directProtectedBlock) {
        e.preventDefault();

        if (directProtectedBlock.matches("scribby-code-block")) {
            place(utils.placeCaretInProtectedBlock(directProtectedBlock, "end"));
            return;
        }

        const confirmed = await utils.confirmProtectedBlockDelete(directProtectedBlock);
        if (!confirmed) return;

        const after = directProtectedBlock.nextElementSibling as HTMLElement | null;
        const before = directProtectedBlock.previousElementSibling as HTMLElement | null;
        const caretTarget = after ?? before;

        directProtectedBlock.remove();

        finishRemoval(() => {
            if (caretTarget && caretTarget.isConnected) {
                return after
                    ? utils.placeCaretAtStart(caretTarget)
                    : utils.placeCaretAtEnd(caretTarget);
            }
            const first = scribby.el.firstElementChild as HTMLElement | null;
            return first ? utils.placeCaretAtStart(first) : null;
        });
        return;
    }

    // Empty top level block next to a protected block.
    if (topLevelChild && utils.isPlaceholderOnlyBlock(topLevelChild)) {
        const previous = topLevelChild.previousElementSibling as HTMLElement | null;
        const next = topLevelChild.nextElementSibling as HTMLElement | null;
        const neighbor = isBackspace ? previous : next;   // block in the key's direction
        const opposite = isBackspace ? next : previous;

        e.preventDefault();

        if (neighbor?.matches("scribby-code-block")) {
            place(utils.placeCaretInProtectedBlock(neighbor, isBackspace ? "end" : "start"));
            return;
        }

        if (neighbor?.matches(protectedSelector)) {
            const confirmed = await utils.confirmProtectedBlockDelete(neighbor);
            if (!confirmed) return;

            neighbor.remove();
            finishRemoval(() => utils.placeCaretAtStart(topLevelChild));
            return;
        }

        if (scribby.el.children.length === 1 || (!neighbor && opposite?.matches(protectedSelector))) {
            place(utils.resetPlaceholderBlock(topLevelChild));
            return;
        }

        const mergeTarget = neighbor ?? opposite;

        if (mergeTarget) {
            topLevelChild.remove();
            place(
                mergeTarget === previous
                    ? utils.placeCaretAtEnd(mergeTarget)
                    : utils.placeCaretAtStart(mergeTarget)
            );
            emitInput();
            return;
        }

        place(utils.resetPlaceholderBlock(topLevelChild));
        return;
    }

    if (topLevelChild && isBackspace && utils.isAtStartOf(range, topLevelChild)) {
        const previous = topLevelChild.previousElementSibling as HTMLElement | null;

        if (previous?.matches("scribby-code-block")) {
            e.preventDefault();
            place(utils.placeCaretInProtectedBlock(previous, "end"));
            return;
        }

        if (previous?.matches(protectedSelector)) {
            e.preventDefault();

            const confirmed = await utils.confirmProtectedBlockDelete(previous);
            if (!confirmed) return;

            previous.remove();
            place(utils.placeCaretAtStart(topLevelChild));
            emitInput();
            return;
        }
    }

    if (topLevelChild && !isBackspace && utils.isAtEndOf(range, topLevelChild)) {
        const next = topLevelChild.nextElementSibling as HTMLElement | null;

        if (next?.matches("scribby-code-block")) {
            e.preventDefault();
            place(utils.placeCaretInProtectedBlock(next, "start"));
            return;
        }

        if (next?.matches(protectedSelector)) {
            e.preventDefault();

            const confirmed = await utils.confirmProtectedBlockDelete(next);
            if (!confirmed) return;

            next.remove();
            place(utils.placeCaretAtEnd(topLevelChild));
            emitInput();
            return;
        }
    }

    if (
        scribby.el.children.length === 1 &&
        scribby.el.children[0] instanceof HTMLElement &&
        utils.isPlaceholderOnlyBlock(scribby.el.children[0])
    ) {
        e.preventDefault();
        place(utils.resetPlaceholderBlock(scribby.el.children[0]));
        return;
    }
}
export function handleTab(scribby: Scribby, e: Event) {
    e.preventDefault();
    const range = scribby.selection;
    if (!range) return;
    const parent = range.startContainer;
    const parentEl = parent as HTMLElement;
    let closestElement: HTMLElement | null;
    if (parent.nodeType != Node.ELEMENT_NODE) {
        const nodeParent = parent.parentElement;
        if (!nodeParent) return;
        closestElement = nodeParent.closest("li, code");
    }
    else if (parentEl.tagName.toLowerCase() === "ol" || parentEl.tagName.toLowerCase() === "ul") {
        parentEl.remove();
        return
    }
    else {
        closestElement = parentEl.closest("li, code");
    }
    /**
     * Pausing nested lists for now. Is going to take more time.
     *
    if (closestElement && closestElement.tagName.toLowerCase() === "li") {
        const text = closestElement.textContent.replace(/[\s\u200B]+/g, "");

        const hasOnlyBrChildren = Array.from(closestElement.children).every(
            (child) => child.tagName === "BR"
        );

        if (!text && (!closestElement.children.length || hasOnlyBrChildren)) {
            closestElement.remove();
        }
        else {
            const parentContainer = closestElement.parentElement;
            if (!parentContainer) return;
            const parentTag = parentContainer.tagName.toLowerCase();
            const listContainer = document.createElement(parentTag);
            const content = range.extractContents();
            const li = document.createElement("li");
            if (!content.querySelector("li")) {
                li.appendChild(content);
                if (!li.childNodes.length) {
                    li.appendChild(document.createTextNode("\u200B"));
                }
                listContainer.appendChild(li);
            }
            else {
                li.remove();
                listContainer.appendChild(content);
            }
            range.insertNode(listContainer);
            utils.placeCaretatEndofElement(listContainer);
            scribby.el.normalize();
        }
            
    }*/
    if (closestElement && closestElement.tagName.toLowerCase() === "code") {
        const fourSpaces = document.createTextNode("\t");
        range.insertNode(fourSpaces);
        const contents = range.extractContents();
        const brTags = contents.querySelectorAll("br");

        brTags.forEach((br) => {
            const fourSpaces = document.createTextNode("\t");
            br.after(fourSpaces);
        })

        range.insertNode(contents);
        range.collapse(false);
        closestElement.normalize();
    }
    scribby.el.dispatchEvent(new Event('input'));
}
