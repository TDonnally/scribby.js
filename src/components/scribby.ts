import { Normailzer } from "../normalizer/normalizer.js";

import { Toolbar } from "./Toolbar.js";
import { InsertModal } from "./Modal.js";

import * as utils from "../utilities/utilities.js"


const parser = new DOMParser();


export class Scribby {
    selector: string;
    content: string;
    el!: HTMLDivElement;
    toolbar!: Toolbar;
    textElement: string;
    styleElements: Map<string, string>;
    selection!: Selection | null;
    allowedBlockStyles: Set<string>;
    allowedSpanStyles: Set<string>;
    normalizer!: Normailzer;

    currentModal: InsertModal | null = null;

    constructor(
        selector = "",
        content = `
            <h1>Hi there!</h1>
            <p>Jot something down.</p>
            <p>This is a <span style = "font-weight: bold;">test</span> paragraph</p>
            <p>Another paragraph</p>
            <p>And a paragraph with some <a href = "https://google.com">link</a> inline</p>
            <a href><p>tester</p></a>
            <ol>
            <li><span>test</span> test</li>
            <ul>
            <p>test</p>
            </ul>
            <li><h3>test
            </h3>
            <p>test</p>
            </li>
            </ol>
            <scroomble>test <span>test</span> <a href><p>tester</p></a>test</scroomble>
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
        this.normalizer;
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
        this.normalizer = new Normailzer(this.el);

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
                const block = utils.getBlock(startEl, this.el);

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

                        const newBlock = utils.cloneBlockShallow(block);

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


                        utils.placeCaretAtStart(caretTarget);
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
            const blockRanges = utils.getBlockRanges(range, this.el);
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
            const blockRanges = utils.getBlockRanges(range, this.el);
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
            const snippetBlocks = snippet.querySelectorAll(utils.BLOCK_SELECTOR);

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
                        const [spanClassesSet, spanStylesMap] = utils.getElementAttributes(span);
                        if (spanStylesMap) {
                            for (const [prop, value] of spanStylesMap) {
                                if (!this.allowedSpanStyles.has(prop)) {
                                    span.style.removeProperty(prop);
                                }

                            }
                        }
                        span.innerHTML = span.textContent;
                    });

                    const [elClassesSet, elStylesMap] = utils.getElementAttributes(htmlEl);
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
                    const [spanClassesSet, spanStylesMap] = utils.getElementAttributes(span);
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
        this.el.addEventListener("focusin", (e) => {
            if (this.currentModal){
                this.currentModal.unmount();
                this.currentModal = null;
            }
        })
        this.el.addEventListener("input", (e) => {
            this.normalizer.removeNotSupportedNodes(this.el);
            const outOfOrderNodes = this.normalizer.flagNodeHierarchyViolations(this.el);
            console.log(outOfOrderNodes);
            this.normalizer.fixHierarchyViolations(outOfOrderNodes);
            
        })
        
        return this
    }

}

/* lists */

/* links */

/* tables (this is going to suck) */

/* colors will be implemented like so:
This is [important text]{style = [color: #0000]}

Will need to:

parse html and create it afterwards and create the process back and forth. 
*/

/* convert between md and html */

