const BLOCK_SELECTOR = "p,img,h1,h2,h3,h4,h5,h6,li,blockquote";
const parser = new DOMParser();

class Scribby {
    selector: string;
    content: string;
    el!: HTMLDivElement;
    toolbar!: Toolbar;
    textElement: string;
    styleElements: Map<string, string>;
    selection!: Selection | null;
    allowedBlockStyles: Set<string>;
    allowedSpanStyles: Set<string>;

    constructor(
        selector = "",
        content = `
            <h1>Hi there!</h1>
            <p>Jot something down.</p>
            <p>This is a <span style = "font-weight: bold;">test</span> paragraph</p>
            <p>Another paragraph</p>
            <p>And a paragraph with <a href = "https://google.com">some link</a> inline</p>
        `,
    ) {
        this.selector = selector;
        this.el;
        this.content = content;
        this.textElement = "p";
        this.styleElements = new Map;
        this.selection;
        this.allowedBlockStyles = new Set;
        this.allowedSpanStyles = new Set;
        this.toolbar = new Toolbar(this).mount();
    }
    mount() {
        const container = document.querySelector<HTMLDivElement>(`${this.selector}`);
        if (!container) {
            throw new Error(`No element with selector: ${this.selector}`);
        }

        this.el = document.createElement("div");
        this.el.contentEditable = 'true';
        this.el.classList.add("scribby");
        this.el.innerHTML = this.content;

        container.appendChild(this.el);

        this.el.insertAdjacentElement("beforebegin", this.toolbar.el);

        this.el.addEventListener("keydown", (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.selection = window.getSelection();
                const sel = this.selection;
                if (!sel || sel.rangeCount === 0) return;
                const range = sel.getRangeAt(0);
                range.deleteContents();
                const startEl = range.startContainer.parentElement;
                if (startEl == null) {
                    return
                }
                const block = getBlock(startEl, this.el);

                if (e.shiftKey) {
                    const br = document.createElement("br");
                    range.insertNode(br);

                    const spacer = document.createTextNode("\u200B");
                    br.after(spacer);

                    const newRange = document.createRange();
                    newRange.setStartAfter(spacer);
                    newRange.collapse(true);

                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
                else {
                    // check where we are in block
                    const caretToEnd = sel.getRangeAt(0).cloneRange();
                    const end = document.createRange();
                    end.selectNodeContents(block);
                    end.collapse(false);

                    caretToEnd.setEnd(end.endContainer, end.endOffset);

                    // end of block
                    if (caretToEnd.toString().length === 0) {
                        const newLineEl = document.createElement(this.textElement);
                        let cursorEl = newLineEl;
                        if (this.styleElements.size > 0) {
                            const newLineSpan = document.createElement("span");
                            for (const [k, v] of this.styleElements) {
                                newLineSpan.style.setProperty(v, String(k));
                            }
                            cursorEl = newLineSpan;
                            newLineEl.appendChild(newLineSpan);
                        }


                        const spacer = document.createTextNode("\u200B");
                        cursorEl.appendChild(spacer);

                        block.insertAdjacentElement("afterend", newLineEl);

                        const newRange = document.createRange();
                        newRange.setStart(spacer, spacer.length);
                        newRange.collapse(true);

                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    }
                    // middle of block
                    else {
                        // This doesn't work if the range covers multiple blocks. Will need to use getBlockRanges() method
                        const tailRange = range.cloneRange();
                        tailRange.setEndAfter(block);

                        const tailFrag = tailRange.extractContents();

                        const newBlock = cloneBlockShallow(block);

                        let caretTarget: HTMLElement = newBlock;
                        if (this.styleElements && (this.styleElements as Map<string, string>).size > 0) {
                            const span = document.createElement("span");
                            for (const [prop, val] of this.styleElements as Map<string, string>) {
                                span.style.setProperty(prop, String(val));
                            }
                            caretTarget = span;
                            newBlock.appendChild(span);
                        }
                        if (tailFrag.childNodes.length) {
                            while (tailFrag.firstChild) {
                                // if span is created and the first node is inline text, put it inside the span
                                if (caretTarget !== newBlock &&
                                    (tailFrag.firstChild.nodeType === Node.TEXT_NODE ||
                                        (tailFrag.firstChild as Element).nodeType === Node.ELEMENT_NODE)) {
                                    caretTarget.appendChild(tailFrag.firstChild);
                                } else {
                                    newBlock.appendChild(tailFrag.firstChild);
                                }
                            }
                        } else {
                            (caretTarget === newBlock ? newBlock : caretTarget)
                                .appendChild(document.createTextNode("\u200B"));
                        }


                        block.insertAdjacentElement("afterend", newBlock);


                        block.normalize();
                        newBlock.normalize();


                        placeCaretAtStart(caretTarget);
                    }


                }
            }
        })
        this.el.addEventListener("click", (e) => {
            this.selection = window.getSelection();
            const sel = this.selection;
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            let startEl = range.startContainer.parentElement;
            if (startEl == null) return;
            const styles = startEl.style;
            this.styleElements = new Map;
            const blockRanges = getBlockRanges(range, this.el);
            console.log(blockRanges);

            for (let i = 0; i < styles.length; i++) {
                const value = styles.getPropertyValue(styles[i]);
                this.styleElements.set(value, styles[i]);
            }

            const allButtons = document.querySelectorAll<HTMLElement>(`${this.selector} [data-attribute]`);
            allButtons.forEach((el) => {
                const key = el.dataset.attribute;
                if (key && this.styleElements.has(key)) {
                    el.classList.add("active");
                }
                else {
                    el.classList.remove("active");
                }
            })
        })
        this.el.addEventListener("paste", (e) => {
            /**
             * steps:
             * 1. Grab blocks
             * 2. If no blocks, extract text content 
             * 3. Retain links/images in both cases
             * 4. Remove any hot allowed block styles 
             * 5. If cursor is at end of block or at new block, paste as blocks
             * 6. Else if, cursor is within block, paste as plain text within block
             * */
            e.preventDefault();
            this.selection = window.getSelection();
            const sel = this.selection;
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            const blockRanges = getBlockRanges(range, this.el);
            console.log(range.startContainer.parentElement);

            const lastBlock = blockRanges[blockRanges.length-1];
            const tailRange = document.createRange();
            tailRange.setStart(lastBlock.blockRange.endContainer, lastBlock.blockRange.endOffset); 
            tailRange.setEnd(lastBlock.block, lastBlock.block.childNodes.length);
            const tailFrag = tailRange.extractContents();

            const marker = document.createTextNode('');

            if (e.clipboardData == null) {
                return;
            }
            let html = e.clipboardData?.getData('text/html') || '';
            const plain = e.clipboardData?.getData('text/plain') || '';

            const frag = document.createDocumentFragment();

            if (!html && plain) {
                console.log("no html")
                html = '<p>' + plain
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/\r\n/g, '\n')
                    .replace(/\n{2,}/g, '</p><p>')
                    .replace(/\n/g, '<br>') + '</p>';
            }

            const snippet = parser.parseFromString(html, 'text/html');
            const snippetBlocks = snippet.querySelectorAll(BLOCK_SELECTOR);

            if (snippetBlocks.length > 0) {
                snippetBlocks.forEach((el) => {
                    const htmlEl = el as HTMLElement;
                    htmlEl.querySelectorAll('*:not(a, img, span)').forEach(child => {
                        const text = child.textContent || '';
                        if (text) {
                            const textNode = document.createTextNode(text);
                            child.replaceWith(textNode);
                        }
                    });

                    htmlEl.querySelectorAll('a').forEach(anchor => {
                        const href = anchor.getAttribute('href');
                        while (anchor.attributes.length > 0) {
                            anchor.removeAttribute(anchor.attributes[0].name);
                        }
                        if (href) {
                            anchor.setAttribute('href', href);
                        } else {
                            const text = anchor.textContent || '';
                            anchor.replaceWith(document.createTextNode(text));
                        }
                    });
                    
                    htmlEl.querySelectorAll('img').forEach(img => {
                        img.removeAttribute('style');
                        img.removeAttribute('class');
                    });

                    htmlEl.querySelectorAll('span').forEach(span => {
                        const [spanClassesSet, spanStylesMap] = getElementAttributes(span);
                        if (spanStylesMap) {
                            for (const [prop, value] of spanStylesMap) {
                                if (!this.allowedSpanStyles.has(prop)) {
                                    span.style.removeProperty(prop);
                                }

                            }
                        }
                        span.innerHTML = span.textContent;
                    });

                    const [elClassesSet, elStylesMap] = getElementAttributes(htmlEl);
                    if (elStylesMap) {
                        for (const [prop, value] of elStylesMap) {
                            if (!this.allowedBlockStyles.has(prop)) {
                                htmlEl.style.removeProperty(prop);
                            }

                        }
                    }

                    
                    for (const name of htmlEl.getAttributeNames()) {
                        htmlEl.removeAttribute(name);
                    }
                    const clone = document.importNode(el, true);
                    frag.appendChild(clone);
                })
                // insertion
                const startBlock = range.startContainer.parentElement;
                let lastInserted = startBlock;
                range.deleteContents();

                let i = 0;
                while (frag.firstChild) {
                    const node = frag.firstChild as Node;  

                    if (i === 0) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            
                            while ((node as Element).firstChild) {
                                startBlock!.appendChild((node as Element).firstChild!);
                            }
                            (node as Element).remove();
                        } else {
                            marker.appendChild(node);
                        }
                        lastInserted = startBlock;
                    } else {
                        lastInserted!.after(node);              
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            lastInserted = node as HTMLElement;  
                        }
                    }

                    i++;
                }
                while (tailFrag.firstChild) {
                    lastInserted!.appendChild(tailFrag.firstChild);
                }
                
                
                
            }
            // no blocks; just text/spans/anchors/images
            else if (snippetBlocks.length == 0) {
                console.log("no blocks");
                const temp = document.createElement('div');
                temp.innerHTML = snippet.body?.innerHTML || '';

                temp.querySelectorAll('*:not(a, img, span)').forEach(child => {
                    const text = child.textContent || '';
                    if (text) {
                        const textNode = document.createTextNode(text);
                        child.replaceWith(textNode);
                    }
                });
                temp.querySelectorAll('a').forEach(anchor => {
                    const href = anchor.getAttribute('href');
                    while (anchor.attributes.length > 0) {
                        anchor.removeAttribute(anchor.attributes[0].name);
                    }
                    if (href) {
                        anchor.setAttribute('href', href);
                    } else {
                        const text = anchor.textContent || '';
                        anchor.replaceWith(document.createTextNode(text));
                    }
                });
                temp.querySelectorAll('img').forEach(img => {
                    img.removeAttribute('style');
                    img.removeAttribute('class');
                });
                temp.querySelectorAll('span').forEach(span => {
                    const [spanClassesSet, spanStylesMap] = getElementAttributes(span);
                    if (spanStylesMap) {
                        for (const [prop, value] of spanStylesMap) {
                            if (!this.allowedSpanStyles.has(prop)) {
                                span.style.removeProperty(prop);
                            }

                        }
                    }
                    span.innerHTML = span.textContent;

                });
                while (temp.firstChild) {
                    temp.firstChild.normalize();
                    frag.appendChild(temp.firstChild);
                }
                // insertion
                range.deleteContents();
                range.insertNode(marker);
                marker.before(frag, tailFrag);
            }
            
            const newRange = document.createRange();
            newRange.setStartAfter(marker);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            marker.remove();

        })
        return this
    }

}
class Toolbar {
    scribby!: Scribby;
    el!: HTMLDivElement;
    //textType: ToolbarButton;
    bold: ToolbarButton;
    italic: ToolbarButton;
    underline: ToolbarButton;
    strikethrough: ToolbarButton;
    //code: ToolbarButton;
    //codeBlock: ToolbarButton;
    //insert: ToolbarButton;

    constructor(
        scribby = new Scribby()
    ) {
        this.scribby = scribby
        this.el = document.createElement("div");
        //this.insert = document.createElement("button");
        this.bold = new ToolbarButton(scribby, "B", { "font-weight": "bold" });
        this.italic = new ToolbarButton(scribby, "I", { "font-style": "italic" });
        this.underline = new ToolbarButton(scribby, "U", { "text-decoration": "underline" });
        this.strikethrough = new ToolbarButton(scribby, "S", { "text-decoration": "line-through" });
        //this.code = new ToolbarButton(scribby, "<>", "code");
        //this.codeBlock = new ToolbarButton(scribby, "[</>]", "chroma");
        //this.insert = document.createElement("button");
    }
    mount() {
        this.el.classList.add("toolbar");
        this.bold.mount();
        this.italic.mount();
        this.underline.mount();
        this.strikethrough.mount();
        //this.code.mount();
        //this.codeBlock.mount();

        this.el.appendChild(this.bold.el)
        this.el.appendChild(this.italic.el)
        this.el.appendChild(this.underline.el)
        this.el.appendChild(this.strikethrough.el)
        //this.el.appendChild(this.code.el)
        //this.el.appendChild(this.codeBlock.el)

        return this;
    }
}
enum affectedElementType {
    Block = "block",
    Span = "span",
}
class ToolbarButton {
    scribby: Scribby
    innerContent: string;
    attributes: Record<string, string>;
    el!: HTMLButtonElement;
    affectedElType: affectedElementType;

    constructor(
        scribby: Scribby,
        innerContent = "",
        attributes = {},
        affectedElType = affectedElementType.Span,
        el = document.createElement("button"),
    ) {
        this.scribby = scribby;
        this.el = el;
        this.innerContent = innerContent;
        this.attributes = attributes;
        this.affectedElType = affectedElType;
    }
    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        let dataAttributeString: string = "";
        for (const [k, v] of Object.entries(this.attributes)) {
            if (this.affectedElType === affectedElementType.Block) {
                this.scribby.allowedBlockStyles.add(k);
            }
            else if (this.affectedElType === affectedElementType.Span) {
                this.scribby.allowedSpanStyles.add(k);
            }
            dataAttributeString += v;
        }

        this.el.setAttribute("data-attribute", dataAttributeString);
        this.el.addEventListener("click", (e) => {
            const sel = this.scribby.selection;
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            const blockRanges = getBlockRanges(range, this.scribby.el)
            /**
             * 1. extract range
             * 2. manipulate nodes
             * 3. replace
             * 4. cleanup
             */
            blockRanges.forEach(({ block, blockRange }) => {
                const rangeOffset = blockRange.startOffset;
                let startEl = blockRange.startContainer.nodeType === Node.ELEMENT_NODE
                    ? blockRange.startContainer as HTMLElement
                    : blockRange.startContainer.parentElement;
                if (startEl == null) return;
                if (blockRange.toString().length > 0) {
                    const extractedContents = blockRange.extractContents();
                    for (const node of extractedContents.childNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const span = document.createElement('span');
                            let parentClasses: Set<string> | null = null;
                            let parentStyles: Map<string, string> | null = null;
                            if (blockRange.startContainer === blockRange.endContainer && startEl?.tagName === 'SPAN' && startEl.contains(blockRange.startContainer)) {
                                const [parentClassesSet, parentStylesMap] = getElementAttributes(startEl as HTMLElement);
                                parentStyles = parentStylesMap;
                                parentClasses = parentClassesSet

                            }
                            if (parentStyles) {
                                for (const [prop, value] of parentStyles) {
                                    span.style.setProperty(prop, value);
                                }
                            }
                            if (parentClasses) {
                                for (const elClass of parentClasses) {
                                    span.classList.add(elClass);
                                }
                            }
                            for (const [k, v] of Object.entries(this.attributes)) {
                                if (span.style.getPropertyValue(k) != v) {
                                    span.style.setProperty(k, String(v));
                                }
                                else {
                                    span.style.removeProperty(k);
                                }

                            }

                            span.textContent = node.textContent;
                            node.replaceWith(span);

                        }
                        else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'SPAN') {
                            const span = node as HTMLSpanElement;

                            for (const [k, v] of Object.entries(this.attributes)) {
                                if (span.style.getPropertyValue(k) != v) {
                                    span.style.setProperty(k, String(v));
                                }
                                else {
                                    span.style.removeProperty(k);
                                }
                            }
                        }
                    }
                    if (blockRange.startContainer === blockRange.endContainer && startEl != block) {
                        const lastSpan = startEl.cloneNode(true);
                        lastSpan.textContent = startEl.textContent?.substring(rangeOffset);
                        startEl.textContent = startEl.textContent?.substring(0, rangeOffset);
                        startEl.after(extractedContents, lastSpan);
                    }
                    else {
                        const referenceNode = document.createTextNode('');
                        blockRange.insertNode(referenceNode);
                        referenceNode.replaceWith(extractedContents);
                    }

                    blockRange.selectNodeContents(extractedContents);
                    blockRange.collapse(true);
                }

                else if (blockRange.toString().length == 0 && startEl.tagName === "SPAN") {

                    for (const [k, v] of Object.entries(this.attributes)) {
                        if (startEl.style.getPropertyValue(k) == v) {
                            startEl.style.removeProperty(k);
                        }
                        else {
                            startEl.style.setProperty(k, String(v));
                        }
                    }
                    if (startEl.style.length == 0) {
                        const innerHtml = startEl.innerHTML;
                        const frag = document.createRange().createContextualFragment(innerHtml);
                        startEl.replaceWith(frag);
                    }
                }

                // cleanup
                removeEmptyTextNodes(block);
                const children = block.children;

                for (let i = 0; i < children.length;) {
                    const child = children[i]
                    if (child.innerHTML.length == 0) {
                        child.remove();
                    }
                    if (i >= children.length - 1) {
                        break;
                    }
                    const nextChild = children[i + 1]
                    const adjacent = areSiblingsAdjacent(child, nextChild);
                    const equal = areSiblingsEqual(child, nextChild);
                    if (adjacent && equal) {
                        mergeElementBintoElementA(child, nextChild);
                    }
                    else {
                        i++;
                    }
                }
                block.normalize();
            });
        })
    }
}

function getBlock(el: HTMLElement, root: HTMLElement): HTMLElement {
    const block = el.closest(BLOCK_SELECTOR);
    return (block as HTMLElement) ?? (root as HTMLElement);
}
function getBlockRanges(range: Range, root: HTMLElement): Array<{ block: HTMLElement, blockRange: Range }> {
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
function getElementAttributes(element: HTMLElement): [classes: Set<string>, styles: Map<string, string>] {
    const classes = new Set(element.className.split(/\s+/).filter(c => c));

    const styles = new Map<string, string>();
    for (let i = 0; i < element.style.length; i++) {
        const prop = element.style[i];
        styles.set(prop, element.style.getPropertyValue(prop));
    }

    return [classes, styles];
}
function areSiblingsAdjacent(a: Node, b: Node): boolean {
    return a.nextSibling === b;
}
function areSiblingsEqual(a: Element, b: Element): boolean {
    const [aClasses, aStyles] = getElementAttributes(a as HTMLElement);
    const [bClasses, bStyles] = getElementAttributes(b as HTMLElement);

    // compare classes, styles, and tags.
    return (aClasses.size === bClasses.size && [...aClasses].every(x => bClasses.has(x)) &&
        aStyles.size === bStyles.size && [...aStyles].every(([k, v]) => bStyles.get(k) === v) &&
        a.tagName === b.tagName)
}
function mergeElementBintoElementA(a: Element, b: Element): Element {
    while (b.firstChild) a.appendChild(b.firstChild);
    a.normalize();
    b.remove();
    return a;
}
function placeCaretAtStart(el: HTMLElement) {
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
function cloneBlockShallow(src: HTMLElement): HTMLElement {
    const clone = src.cloneNode(false) as HTMLElement;
    clone.removeAttribute("id");
    return clone;
}
function removeEmptyTextNodes(parent: Node) {
    const nodes = Array.from(parent.childNodes);
    nodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent) {
            node.remove();
        }
    });
}

/*
class ToolbarDropdownButton{
    innerContent: string;
    dropdownMenu: ToolbarButton[];
}
*/

/* text Hierarchy toggle */

/* lists */

/* links */

/* tables (this is going to suck) */

/* colors will be implemented like so:
This is [important text]{style = [color: #0000]}

Will need to:

parse html and create it afterwards and create the process back and forth. 
*/

/* convert between md and html */

(() => {
    let scribby = new Scribby('#scribby-editor').mount();
    let scribby2 = new Scribby('#scribby-editor2').mount();
    console.log(scribby)
    console.log("scribby!")
})();