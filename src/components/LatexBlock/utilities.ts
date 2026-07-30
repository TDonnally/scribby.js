export type LatexSelectionPoint = {
    node: Node;
    offset: number;
};

export type LatexSelectionBoundaryBias = "before" | "after";

export type LatexClipboardPayload = {
    range: Range;
    html: string;
    text: string;
};

/**
 * Replaces each rendered LaTeX component with a clean host containing only
 * the attributes required to reconstruct it.
 *
 * This prevents generated KaTeX divs from being serialized inside a p and
 * subsequently moved outside the custom element by the HTML parser.
 */
export function preserveLatexBlock(root: ParentNode): void {
    const blocks = Array.from(
        root.querySelectorAll<HTMLElement>("scribby-latex-block"),
    );

    for (const block of blocks) {
        const preserved = document.createElement("scribby-latex-block");
        const value = block.getAttribute("data-value");
        const label = block.getAttribute("data-label");

        if (value !== null) {
            preserved.setAttribute("data-value", value);
        }

        preserved.setAttribute(
            "data-display",
            block.getAttribute("data-display") === "display"
                ? "display"
                : "inline",
        );

        if (label !== null && label.trim().length > 0) {
            preserved.setAttribute("data-label", label);
        }

        block.replaceWith(preserved);
    }

    root
        .querySelectorAll<HTMLElement>(".latex-block-shell")
        .forEach((shell) => {
            if (!shell.closest("scribby-latex-block")) {
                shell.remove();
            }
        });
}

/**
 * A selection path cannot point into generated KaTeX children because those
 * children are removed from history snapshots. Move that point to the host's
 * boundary instead.
 */
export function normalizeLatexSelectionPoint(
    rootEl: HTMLElement,
    node: Node,
    offset: number,
    bias: LatexSelectionBoundaryBias,
): LatexSelectionPoint {
    const element =
        node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;

    const latexBlock =
        element?.closest<HTMLElement>("scribby-latex-block") ?? null;

    if (!latexBlock || !rootEl.contains(latexBlock)) {
        return { node, offset };
    }

    const parent = latexBlock.parentNode;
    if (!parent) {
        return { node, offset };
    }

    const blockIndex = Array.prototype.indexOf.call(
        parent.childNodes,
        latexBlock,
    );

    return {
        node: parent,
        offset: blockIndex + (bias === "after" ? 1 : 0),
    };
}

/**
 * If a selection begins or ends inside generated KaTeX markup, expand the
 * boundary around the complete custom element so copy and cut remain atomic.
 */
export function expandRangeAroundLatexBlock(
    range: Range,
    rootEl: HTMLElement,
): Range {
    const expanded = range.cloneRange();

    const startElement =
        expanded.startContainer.nodeType === Node.ELEMENT_NODE
            ? expanded.startContainer as Element
            : expanded.startContainer.parentElement;

    const endElement =
        expanded.endContainer.nodeType === Node.ELEMENT_NODE
            ? expanded.endContainer as Element
            : expanded.endContainer.parentElement;

    const startLatex =
        startElement?.closest<HTMLElement>("scribby-latex-block") ?? null;

    const endLatex =
        endElement?.closest<HTMLElement>("scribby-latex-block") ?? null;

    if (startLatex && rootEl.contains(startLatex)) {
        expanded.setStartBefore(startLatex);
    }

    if (endLatex && rootEl.contains(endLatex)) {
        expanded.setEndAfter(endLatex);
    }

    return expanded;
}

/**
 * Produces canonical Scribby HTML for the clipboard. The HTML contains the
 * LaTeX host and its state attributes, not generated KaTeX markup.
 */
export function createLatexClipboardPayload(
    range: Range,
    rootEl: HTMLElement,
): LatexClipboardPayload {
    const expandedRange = expandRangeAroundLatexBlock(range, rootEl);
    const fragment = expandedRange.cloneContents();

    preserveLatexBlock(fragment);

    const htmlContainer = document.createElement("div");
    htmlContainer.appendChild(fragment.cloneNode(true));

    const textContainer = htmlContainer.cloneNode(true) as HTMLDivElement;

    textContainer
        .querySelectorAll<HTMLElement>("scribby-latex-block")
        .forEach((block) => {
            const value = block.getAttribute("data-value") ?? "";
            const display =
                block.getAttribute("data-display") === "display";

            block.replaceWith(
                document.createTextNode(
                    display
                        ? `\n$$${value}$$\n`
                        : `$${value}$`,
                ),
            );
        });

    return {
        range: expandedRange,
        html: htmlContainer.innerHTML,
        text: textContainer.innerText || textContainer.textContent || "",
    };
}

/**
 * Returns true when a node contributes no editable content between the caret
 * and an inline formula. BR and zero-width-space placeholders count as empty.
 */
export function isEmptyLatexInlineArtifact(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
        return !(node.nodeValue ?? "").replace(/[\s\u200B]+/g, "");
    }

    if (node.nodeType === Node.COMMENT_NODE) {
        return true;
    }

    if (!(node instanceof HTMLElement)) {
        return false;
    }

    if (node.matches("br")) {
        return true;
    }

    if (node.matches("scribby-latex-block")) {
        return false;
    }

    if (!node.matches("span, a, range-marker")) {
        return false;
    }

    return Array.from(node.childNodes).every(
        isEmptyLatexInlineArtifact,
    );
}

/**
 * Finds the nearest inline formula immediately before or after the caret,
 * ignoring only BR, whitespace, and zero-width-space caret artifacts.
 */
export function getAdjacentInlineLatexBlock(
    range: Range,
    container: HTMLElement,
    side: "before" | "after",
): HTMLElement | null {
    if (!range.collapsed) return null;

    if (
        range.startContainer !== container &&
        !container.contains(range.startContainer)
    ) {
        return null;
    }

    const caret = range.cloneRange();
    caret.collapse(true);

    const formulas = Array.from(
        container.querySelectorAll<HTMLElement>(
            "scribby-latex-block[data-display='inline']",
        ),
    );

    if (side === "before") {
        formulas.reverse();
    }

    for (const formula of formulas) {
        const formulaRange = document.createRange();
        formulaRange.selectNode(formula);

        let relation: number;

        try {
            relation = formulaRange.comparePoint(
                caret.startContainer,
                caret.startOffset,
            );
        } catch {
            continue;
        }

        /*
         * comparePoint returns 0 for the two boundary positions in the
         * host's parent -- (parent, index) and (parent, index + 1) --
         * as well as for positions inside the formula's own markup.
         * Browsers report the caret at those parent-level offsets when it
         * sits directly against a contenteditable=false inline element,
         * so boundary positions must resolve to before/after.
         */
        if (relation === 0) {
            if (caret.startContainer !== formula.parentNode) {
                continue;
            }

            const formulaIndex = Array.prototype.indexOf.call(
                caret.startContainer.childNodes,
                formula,
            );

            relation = caret.startOffset <= formulaIndex ? -1 : 1;
        }

        if (side === "before" && relation !== 1) {
            continue;
        }

        if (side === "after" && relation !== -1) {
            continue;
        }

        const between = document.createRange();

        try {
            if (side === "before") {
                between.setStartAfter(formula);
                between.setEnd(
                    caret.startContainer,
                    caret.startOffset,
                );
            } else {
                between.setStart(
                    caret.startContainer,
                    caret.startOffset,
                );
                between.setEndBefore(formula);
            }
        } catch {
            continue;
        }

        const contents = between.cloneContents();
        const containsOnlyArtifacts = Array.from(
            contents.childNodes,
        ).every(isEmptyLatexInlineArtifact);

        if (containsOnlyArtifacts) {
            return formula;
        }
    }

    return null;
}

/**
 * Splits a text block when Enter is pressed immediately before or after an
 * inline LaTeX host.
 *
 * The browser's native contenteditable split inserts a BR before a leading
 * contenteditable=false element. Moving the existing DOM nodes ourselves
 * preserves the LaTeX host and avoids creating:
 *
 * <p><br><scribby-latex-block>...</scribby-latex-block></p>
 */
export function splitTextBlockAtInlineLatexBoundary(
    range: Range,
    textContainer: HTMLElement,
): Range | null {
    if (!range.collapsed) return null;

    const latexAfter = getAdjacentInlineLatexBlock(
        range,
        textContainer,
        "after",
    );

    const latexBefore = getAdjacentInlineLatexBlock(
        range,
        textContainer,
        "before",
    );

    /*
     * When the caret is between two formulas, split before the formula on
     * the right so each formula remains on the expected side of the break.
     */
    const latexBlock = latexAfter ?? latexBefore;
    if (!latexBlock) return null;

    const directChild = getDirectChildOf(
        textContainer,
        latexBlock,
    );

    if (!directChild) return null;

    const nextBlock = document.createElement(
        textContainer.matches("li") ? "li" : "p",
    );

    if (latexAfter) {
        /*
         * The formula and everything after it belongs on the new line.
         * Empty caret artifacts between the caret and formula remain behind
         * temporarily and are removed below.
         */
        moveNodeAndFollowingSiblings(
            directChild,
            nextBlock,
        );

        removeTrailingLatexArtifacts(textContainer);
        ensureLatexTextPlaceholder(textContainer);

        /*
         * The formula must be the first real child. In particular, do not
         * place a BR before a contenteditable=false inline component.
         */
        removeLeadingLatexArtifacts(nextBlock);

        textContainer.after(nextBlock);

        const nextRange = document.createRange();
        nextRange.setStart(nextBlock, 0);
        nextRange.collapse(true);
        setBrowserRange(nextRange);

        return nextRange;
    }

    /*
     * The formula stays on the current line. Everything after the formula
     * moves into the new block.
     */
    const firstNodeAfterLatex = directChild.nextSibling;

    if (firstNodeAfterLatex) {
        moveNodeAndFollowingSiblings(
            firstNodeAfterLatex,
            nextBlock,
        );
    }

    removeLeadingLatexArtifacts(nextBlock);
    textContainer.after(nextBlock);

    const nextRange = document.createRange();

    if (!nextBlock.childNodes.length) {
        const placeholder = document.createTextNode("\u200B");
        nextBlock.appendChild(placeholder);
        nextRange.setStart(placeholder, 1);
    } else {
        nextRange.setStart(nextBlock, 0);
    }

    nextRange.collapse(true);
    setBrowserRange(nextRange);

    return nextRange;
}

function getDirectChildOf(
    container: HTMLElement,
    descendant: Node,
): ChildNode | null {
    let current: Node | null = descendant;

    while (current && current.parentNode !== container) {
        current = current.parentNode;
    }

    return current?.parentNode === container
        ? current as ChildNode
        : null;
}

function moveNodeAndFollowingSiblings(
    firstNode: ChildNode,
    destination: HTMLElement,
): void {
    let current: ChildNode | null = firstNode;

    while (current) {
        const next: ChildNode | null = current.nextSibling;

        destination.appendChild(current);
        current = next;
    }
}

function removeLeadingLatexArtifacts(
    element: HTMLElement,
): void {
    while (
        element.firstChild &&
        isEmptyLatexInlineArtifact(element.firstChild)
    ) {
        element.firstChild.remove();
    }

    const first = element.firstChild;

    if (first?.nodeType === Node.TEXT_NODE) {
        first.nodeValue = (first.nodeValue ?? "")
            .replace(/^[\s\u200B]+/g, "");

        if (!first.nodeValue) {
            first.remove();
        }
    }
}

function removeTrailingLatexArtifacts(
    element: HTMLElement,
): void {
    while (
        element.lastChild &&
        isEmptyLatexInlineArtifact(element.lastChild)
    ) {
        element.lastChild.remove();
    }

    const last = element.lastChild;

    if (last?.nodeType === Node.TEXT_NODE) {
        last.nodeValue = (last.nodeValue ?? "")
            .replace(/[\s\u200B]+$/g, "");

        if (!last.nodeValue) {
            last.remove();
        }
    }
}

function ensureLatexTextPlaceholder(
    element: HTMLElement,
): void {
    if (element.childNodes.length > 0) return;

    element.appendChild(
        document.createTextNode("\u200B"),
    );
}

/**
 * Treats BR and zero-width-space placeholders as empty when deciding whether
 * the caret is at the start or end of a text block.
 */
export function isCaretAtLatexTextBoundary(
    range: Range,
    container: HTMLElement,
    boundary: "start" | "end",
): boolean {
    if (!range.collapsed) return false;

    const between = document.createRange();

    try {
        if (boundary === "start") {
            between.setStart(container, 0);
            between.setEnd(
                range.startContainer,
                range.startOffset,
            );
        } else {
            between.setStart(
                range.startContainer,
                range.startOffset,
            );
            between.setEnd(
                container,
                container.childNodes.length,
            );
        }
    } catch {
        return false;
    }

    return Array.from(
        between.cloneContents().childNodes,
    ).every(isEmptyLatexInlineArtifact);
}

export function containsInlineLatexBlock(
    element: Element | null,
): boolean {
    return !!element?.querySelector(
        "scribby-latex-block[data-display='inline']",
    );
}

/**
 * Removes an inline formula as one atomic node and restores the caret where
 * the host used to be. Empty wrapper spans are removed with the formula.
 */
export function removeInlineLatexBlock(
    latexBlock: HTMLElement,
    textContainer: HTMLElement,
): Range | null {
    if (!textContainer.contains(latexBlock)) return null;

    let removalTarget: Node = latexBlock;

    while (
        removalTarget.parentNode instanceof HTMLElement &&
        removalTarget.parentNode !== textContainer
    ) {
        const parent = removalTarget.parentNode;
        const canRemoveWrapper = Array.from(parent.childNodes).every(
            (child) =>
                child === removalTarget ||
                isEmptyLatexInlineArtifact(child),
        );

        if (!canRemoveWrapper) break;
        removalTarget = parent;
    }

    const parent = removalTarget.parentNode;
    if (!parent) return null;

    const index = Array.prototype.indexOf.call(
        parent.childNodes,
        removalTarget,
    );

    parent.removeChild(removalTarget);

    const textContainerIsEmpty = Array.from(
        textContainer.childNodes,
    ).every(isEmptyLatexInlineArtifact);

    const range = document.createRange();

    if (textContainerIsEmpty) {
        textContainer.replaceChildren(document.createElement("br"));
        range.setStart(textContainer, 0);
    } else {
        range.setStart(
            parent,
            Math.min(index, parent.childNodes.length),
        );
    }

    range.collapse(true);
    setBrowserRange(range);

    return range;
}

/**
 * Moves every child from source into destination without serializing either
 * block. Inline LaTeX therefore remains a complete custom element.
 */
export function mergeTextBlocksPreservingLatexBlock(
    source: HTMLElement,
    destination: HTMLElement,
): Range | null {
    if (source === destination) return null;
    if (!source.isConnected || !destination.isConnected) return null;

    const destinationIsEmpty = Array.from(
        destination.childNodes,
    ).every(isEmptyLatexInlineArtifact);

    if (destinationIsEmpty) {
        destination.replaceChildren();
    }

    while (
        source.firstChild &&
        isEmptyLatexInlineArtifact(source.firstChild)
    ) {
        source.firstChild.remove();
    }

    const joinOffset = destination.childNodes.length;

    while (source.firstChild) {
        destination.appendChild(source.firstChild);
    }

    source.remove();

    if (!destination.childNodes.length) {
        destination.appendChild(document.createElement("br"));
    }

    const range = document.createRange();
    range.setStart(
        destination,
        Math.min(joinOffset, destination.childNodes.length),
    );
    range.collapse(true);

    setBrowserRange(range);

    return range;
}

function setBrowserRange(range: Range): void {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}