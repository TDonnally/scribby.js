export const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,blockquote,code";
export const PROTECTED_BLOCK_SELECTOR = "scribby-code-block, speech-output, summary-output, inline-canvas";

import { ConfirmOverlay } from "../components/ConfirmOverlay";

export type CaretEdge = "start" | "end";
/**
 * Get Element object/objects or Element attributes
 */
export function getBlock(el: HTMLElement, root: HTMLElement): HTMLElement | null {
    return el.closest(BLOCK_SELECTOR) as HTMLElement | null;
}
export function getBlockRanges(range: Range, root: HTMLElement): Array<{ block: HTMLElement, blockRange: Range }> {
    const result = new Array();

    const container = range.commonAncestorContainer.parentElement!;

    const blocks = Array.from(container.querySelectorAll(BLOCK_SELECTOR))
        .filter(block => range.intersectsNode(block));

    if (blocks.length === 0) {
        const block = getBlock(range.startContainer.parentElement as HTMLElement, root);
        if (block) {
            blocks.push(block);
        }
    }

    blocks.forEach((block, index) => {
        const blockRange = document.createRange();

        if (blocks.length === 1) {
            blockRange.setStart(range.startContainer, range.startOffset);
            blockRange.setEnd(range.endContainer, range.endOffset);
        } else if (index === 0) {
            blockRange.setStart(range.startContainer, range.startOffset);
            blockRange.setEndAfter(block.lastChild || block);
        } else if (index === blocks.length - 1) {
            blockRange.setStartBefore(block.firstChild || block);
            blockRange.setEnd(range.endContainer, range.endOffset);
        } else {
            blockRange.selectNodeContents(block);
        }

        result.push({ block, blockRange });
    });

    return result;
}
export function getElementAttributes(element: HTMLElement): [classes: Set<string>, styles: Map<string, string>] {
    const classes = new Set(element.className.split(/\s+/).filter(c => c));

    const styles = new Map<string, string>();
    for (let i = 0; i < element.style.length; i++) {
        const prop = element.style[i];
        styles.set(prop, element.style.getPropertyValue(prop));
    }

    return [classes, styles];
}



/**
 * Comparisons
 */
export function areSiblingsAdjacent(a: Node, b: Node): boolean {
    return a.nextSibling === b;
}
export function areSiblingsEqual(a: Element, b: Element): boolean {
    const [aClasses, aStyles] = getElementAttributes(a as HTMLElement);
    const [bClasses, bStyles] = getElementAttributes(b as HTMLElement);

    // compare classes, styles, and tags.
    return (aClasses.size === bClasses.size && [...aClasses].every(x => bClasses.has(x)) &&
        aStyles.size === bStyles.size && [...aStyles].every(([k, v]) => bStyles.get(k) === v) &&
        a.tagName === b.tagName)
}

/**
 * utilities that involve DOM manipulation
 */
export function createElement(tag: string, attributes: Map<string, string>, classes: Set<string>): HTMLElement {
    const newEl = document.createElement(tag);
    for (const [k, v] of attributes) {
        newEl.setAttribute(k, v)
    }
    for (const c of classes) {
        newEl.classList.add(c)
    }
    return newEl
}
export function mergeElementBintoElementA(a: Element, b: Element): Element {
    while (b.firstChild) a.appendChild(b.firstChild);
    a.normalize();
    b.remove();
    return a;
}
export function removeEmptyTextNodes(parent: Node): void {
    const nodes = Array.from(parent.childNodes);
    nodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent) {
            node.remove();
        }
    });
}
export function replaceElementWithChildren(el: Element): void {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
    }
    el.remove();
}
export function changeElementTag(el: Element, tag: string): void {
    const parent = el.parentElement;
    if (!parent) return;
    const newEl = document.createElement(tag);
    parent.insertBefore(newEl, el)
    newEl.appendChild(el);
    replaceElementWithChildren(el);
}
export function makeChildSiblingofParent(el: HTMLElement): void {
    const parent = el.parentElement;
    if (!parent || !parent.parentElement) {
        return;
    }
    const children = Array.from(parent.childNodes);
    const childIndex = children.indexOf(el);
    if (childIndex === -1) {
        return
    }
    const nodesBefore = children.slice(0, childIndex);
    const nodesAfter = children.slice(childIndex + 1);

    let beforeParent: HTMLElement | null = null;
    if (nodesBefore.length > 0) {
        beforeParent = parent.cloneNode(false) as HTMLElement;
        nodesBefore.forEach(node => beforeParent!.appendChild(node));
    }
    let afterParent: HTMLElement | null = null;
    if (nodesAfter.length > 0) {
        afterParent = parent.cloneNode(false) as HTMLElement;
        nodesAfter.forEach(node => afterParent!.appendChild(node));
    }
    const grandparent = parent.parentElement;

    if (beforeParent) {
        grandparent.insertBefore(beforeParent, parent);
    }
    grandparent.insertBefore(el, parent);
    if (afterParent) {
        grandparent.insertBefore(afterParent, parent);
    }
    parent.remove();
}
/**
 * This method removes undesired external attributes
 * The only attributes it keeps is href.
 */
export function removeElementAttributes(root: Element): void {
    if (root.nodeType === Node.ELEMENT_NODE) {
        const el = root as Element;
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    }
}
export function stripAttributes(root: DocumentFragment | Element): void {
    const isInsideCodeBlock = (el: Element) =>
        el.tagName.toLowerCase() === "scribby-code-block" ||
        !!el.closest("scribby-code-block");

    if (root.nodeType === Node.ELEMENT_NODE) {
        const el = root as Element;
        if (!isInsideCodeBlock(el)) {
            for (const attr of Array.from(el.attributes)) {
                if (attr.name !== "href") el.removeAttribute(attr.name);
            }
        }
    }

    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
        if (isInsideCodeBlock(el)) continue;

        for (const attr of Array.from(el.attributes)) {
            if (attr.name !== "href") {
                el.removeAttribute(attr.name);
            }
        }
    }
}
export function removeAllComments(root: DocumentFragment | Element): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);

    const toRemove: Comment[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        toRemove.push(n as Comment);
    }

    for (const c of toRemove) c.remove();
}

/**
 * Caret
 */
export function placeCaretatEndofElement(el: HTMLElement) {
    const sel = window.getSelection();
    if (!sel) return;

    sel.removeAllRanges();

    const caretRange = document.createRange();
    caretRange.selectNodeContents(el);
    caretRange.collapse(false);
    sel.addRange(caretRange);
}

/**
 * Miscelaneous
 */
export function toggle(Options: Record<string, string>, Key: string): string {
    return Options[Key]
}
export function normalizeUrl(input: string): string | null {
    const raw = input.trim();

    if (!raw) return null;
    const stripped = raw.replace(/^(https?:)?\/\//i, "");

    try {
        const url = new URL(`https://${stripped}`);
        if (!["http:", "https:"].includes(url.protocol)) {
            return null;
        }

        return url.href;
    } catch {
        return null;
    }
}


export function cleanText(value: string | null | undefined): string {
    return (value ?? "").replace(/[\s\u200B]+/g, "");
}

export function hasRealText(node: Node): boolean {
    return !!cleanText(node.textContent);
}

export function makePlaceholderText(): Text {
    return document.createTextNode("\u200B");
}

export function makePlaceholderP(): HTMLParagraphElement {
    const p = document.createElement("p");
    p.appendChild(makePlaceholderText());
    return p;
}

export function placeRange(range: Range): Range | null {
    const selection = window.getSelection();
    if (!selection) return null;

    selection.removeAllRanges();
    selection.addRange(range);

    return range;
}

export function placeCaretInTextNode(textNode: Text, offset = textNode.nodeValue?.length ?? 0): Range | null {
    const range = document.createRange();
    range.setStart(textNode, offset);
    range.collapse(true);

    return placeRange(range);
}

export function resetPlaceholderBlock(el: HTMLElement): Range | null {
    el.innerHTML = "";

    const textNode = makePlaceholderText();
    el.appendChild(textNode);

    return placeCaretInTextNode(textNode, 1);
}

export function getTopLevelChild(node: Node, root: HTMLElement): HTMLElement | null {
    let el =
        node.nodeType === Node.ELEMENT_NODE
            ? node as HTMLElement
            : node.parentElement;

    while (el && el.parentElement !== root) {
        el = el.parentElement;
    }

    return el;
}

export function getFirstTextNode(root: HTMLElement): Text | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
        const textNode = walker.currentNode as Text;
        if ((textNode.nodeValue ?? "").length) return textNode;
    }

    return null;
}

export function getLastTextNode(root: HTMLElement): Text | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;

    while (walker.nextNode()) {
        const textNode = walker.currentNode as Text;
        if ((textNode.nodeValue ?? "").length) last = textNode;
    }

    return last;
}

export function placeCaretAtStart(el: HTMLElement): Range | null {
    if (!hasRealText(el)) {
        return resetPlaceholderBlock(el);
    }

    const textNode = getFirstTextNode(el);

    if (textNode) {
        return placeCaretInTextNode(textNode, 0);
    }

    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);

    return placeRange(range);
}

export function placeCaretAtEnd(el: HTMLElement): Range | null {
    if (!hasRealText(el)) {
        return resetPlaceholderBlock(el);
    }

    const textNode = getLastTextNode(el);

    if (textNode) {
        return placeCaretInTextNode(textNode, textNode.nodeValue?.length ?? 0);
    }

    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);

    return placeRange(range);
}

export function placeCaretInProtectedBlock(block: HTMLElement, edge: CaretEdge): Range | null {
    if (block.matches("scribby-code-block")) {
        const methodName = edge === "start" ? "focusStart" : "focusEnd";
        const method = (block as any)[methodName];

        if (typeof method === "function") {
            method.call(block);
            return null;
        }
    }

    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(edge === "start");

    return placeRange(range);
}

export function isEmptyInlineArtifact(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
        return !cleanText(node.textContent);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return true;
    }

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") return true;

    if (tag === "span" || tag === "a") {
        return Array.from(el.childNodes).every(isEmptyInlineArtifact);
    }

    return false;
}

export function isPlaceholderOnlyBlock(el: HTMLElement): boolean {
    if (!el.matches(BLOCK_SELECTOR)) return false;
    if (hasRealText(el)) return false;
    if (el.querySelector(PROTECTED_BLOCK_SELECTOR)) return false;

    return Array.from(el.childNodes).every(isEmptyInlineArtifact);
}

export function isAtStartOf(range: Range, el: HTMLElement): boolean {
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(el);
    beforeRange.setEnd(range.startContainer, range.startOffset);

    return !cleanText(beforeRange.toString());
}

export function isAtEndOf(range: Range, el: HTMLElement): boolean {
    const afterRange = document.createRange();
    afterRange.selectNodeContents(el);
    afterRange.setStart(range.startContainer, range.startOffset);

    return !cleanText(afterRange.toString());
}

export function rangeIsInside(range: Range, el: HTMLElement): boolean {
    return el.contains(range.startContainer) && el.contains(range.endContainer);
}

export function selectionWouldEmpty(range: Range, el: HTMLElement): boolean {
    if (range.collapsed) return false;
    if (!rangeIsInside(range, el)) return false;

    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(el);
    beforeRange.setEnd(range.startContainer, range.startOffset);

    const afterRange = document.createRange();
    afterRange.selectNodeContents(el);
    afterRange.setStart(range.endContainer, range.endOffset);

    return !cleanText(beforeRange.toString()) && !cleanText(afterRange.toString());
}

export function collapsedDeleteWouldEmpty(range: Range, el: HTMLElement, key: string): boolean {
    if (!range.collapsed) return false;
    if (!rangeIsInside(range, el)) return false;

    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(el);
    beforeRange.setEnd(range.startContainer, range.startOffset);

    const afterRange = document.createRange();
    afterRange.selectNodeContents(el);
    afterRange.setStart(range.startContainer, range.startOffset);

    const before = cleanText(beforeRange.toString());
    const after = cleanText(afterRange.toString());

    if (key === "Backspace") {
        return before.length === 1 && after.length === 0;
    }

    if (key === "Delete") {
        return before.length === 0 && after.length === 1;
    }

    return false;
}

export function getProtectedBlocksInsideSelection(range: Range): HTMLElement[] {
    const fragment = range.cloneContents();

    return Array.from(
        fragment.querySelectorAll<HTMLElement>(PROTECTED_BLOCK_SELECTOR)
    );
}
export const getProtectedBlockLabel = (block: HTMLElement | null): string => {
    if (!block) return "block";

    if (block.matches("scribby-code-block")) return "code block";
    if (block.matches("summary-output")) return "summary block";
    if (block.matches("inline-canvas")) return "drawing canvas";

    return "audio block";
};

export const confirmProtectedBlockDelete = async (block: HTMLElement | null): Promise<boolean> => {
    if (!block) return false;

    const label = getProtectedBlockLabel(block);

    return await ConfirmOverlay.open({
        message: `This action will delete this ${label}. Are you sure?`,
        continueBtnTxt: "Continue",
        cancelBtnTxt: "Cancel",
    });
};