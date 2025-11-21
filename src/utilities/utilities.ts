export const BLOCK_SELECTOR = "p,img,h1,h2,h3,h4,h5,h6,li,blockquote,code";

export function getBlock(el: HTMLElement, root: HTMLElement): HTMLElement {
    const block = el.closest(BLOCK_SELECTOR);
    return (block as HTMLElement) ?? (root as HTMLElement);
}
export function getBlockRanges(range: Range, root: HTMLElement): Array<{ block: HTMLElement, blockRange: Range }> {
    const result = new Array();

    const container = range.commonAncestorContainer.parentElement!;

    const blocks = Array.from(container.querySelectorAll(BLOCK_SELECTOR))
        .filter(block => range.intersectsNode(block));

    if (blocks.length === 0) {
        blocks.push(getBlock(range.startContainer.parentElement as HTMLElement, root));
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
export function createElement(tag: string, attributes: Map<string, string>, classes: Set<string>): HTMLElement{
    const newEl = document.createElement(tag);
    for(const [k, v] of attributes){
        newEl.setAttribute(k, v)
    }
    for(const c of classes){
        newEl.classList.add(c)
    }
    return newEl
}

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
export function placeCaretAtStart(el: HTMLElement) {
    const sel = window.getSelection();
    if (!sel) return;
    if (!el.firstChild) el.appendChild(document.createTextNode(""));
    const r = document.createRange();
    r.setStart(el, 0);
    r.collapse(true);
    (el.closest<HTMLElement>("[contenteditable]") || el).focus();
    sel.removeAllRanges();
    sel.addRange(r);
}
export function cloneBlockShallow(src: HTMLElement): HTMLElement {
    const clone = src.cloneNode(false) as HTMLElement;
    clone.removeAttribute("id");
    return clone;
}

/**
 * utilities that involve DOM manipulation
 */
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
export function replaceElementWithChildren(el: Element): void{
    const parent = el.parentElement;
    if (!parent) return;
    while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
    }
    el.remove();
}
export function changeElementTag(el: Element, tag: string): void{
    const parent = el.parentElement;
    if (!parent) return;
    const newEl = document.createElement(tag);
    parent.insertBefore(newEl, el)
    newEl.appendChild(el);
    replaceElementWithChildren(el);
}
export function makeChildSiblingofParent(el: HTMLElement): void {
    console.log(el)
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