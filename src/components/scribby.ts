import { Normalizer } from "../normalizer/normalizer.js";

import { Toolbar } from "./Toolbar.js";
import { InsertModal } from "./InsertModal.js";
import { LinkModal } from "./LinkModal.js";

import * as events from "../events/custom_events.js";
import { HistoryManager, Snapshot } from "../history_manager/history_manager.js";

import * as utils from "../utilities/utilities.js"


const parser = new DOMParser();


export class Scribby {
    selector: string;
    content: string;
    el!: HTMLDivElement;
    toolbar!: Toolbar;
    textElement: string;
    selection!: Range | null;
    allowedBlockStyles: Set<string>;
    allowedSpanStyles: Set<string>;
    normalizer!: Normalizer;
    historyManager: HistoryManager;

    timeoutId: number | null;
    historyUpdateDelayonInput: number;

    currentInsertModal: InsertModal | null = null;
    currentTextModal: LinkModal | null = null;

    constructor(
        selector = "",
        content = `
            <h1>Hi there!</h1>
            <p>Jot something down.</p>
        `,
    ) {
        this.selector = selector;
        this.el;
        this.content = content;
        this.textElement = "p";
        this.selection;
        this.allowedBlockStyles = new Set;
        this.allowedSpanStyles = new Set;
        this.normalizer;
        this.historyManager = new HistoryManager();
        this.timeoutId = null;
        this.historyUpdateDelayonInput = 1000;
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

        const initSnapshot: Snapshot = {
            timestamp: Date.now(),
            html: this.content,
        }

        this.historyManager.push(initSnapshot);

        container.appendChild(this.el);
        this.toolbar = new Toolbar(this).mount();
        this.normalizer = new Normalizer(this.el);

        this.el.insertAdjacentElement("beforebegin", this.toolbar.el);

        this.el.addEventListener("keydown", (e) => {
            if (e.ctrlKey) {
                if (e.shiftKey) {
                    e.preventDefault();
                    const key = e.key.toLowerCase()
                    if (key === "x") {
                        this.el.dispatchEvent(events.strikethrough);
                    }
                    else if (key === "l") {
                        this.el.dispatchEvent(events.alignLeft);
                    }
                    else if (key === "e") {
                        this.el.dispatchEvent(events.alignCenter);
                    }
                    else if (key === "c") {
                        this.el.dispatchEvent(events.alignRight);
                    }
                    else if (key === "&") {
                        this.el.dispatchEvent(events.createOrderedList);
                    }
                    else if (key === "*") {
                        this.el.dispatchEvent(events.createUnorderedList);
                    }
                }
                if (e.key === "z") {
                    e.preventDefault();
                    const snapshot = this.historyManager.undo();
                    if (!snapshot) return;
                    this.el.innerHTML = snapshot.html;
                }
                else if (e.key === "y") {
                    e.preventDefault();
                    const snapshot = this.historyManager.redo();
                    if (!snapshot) return;
                    this.el.innerHTML = snapshot.html;
                }
                else if (e.key === "b") {
                    e.preventDefault();
                    this.el.dispatchEvent(events.bold);
                }
                else if (e.key === "i") {
                    e.preventDefault();
                    this.el.dispatchEvent(events.italic);
                }
                else if (e.key === "u") {
                    e.preventDefault();
                    this.el.dispatchEvent(events.underline);
                }
                else if (e.key === "k") {
                    e.preventDefault();
                    this.el.dispatchEvent(events.createAnchor);
                }
                else if (e.key === "e") {
                    e.preventDefault();
                    this.el.dispatchEvent(events.createCodeBlock);
                }


            }
            if (e.key === "Tab") {
                e.preventDefault();
                const range = this.selection;
                if (!range) return;
                const parent = range.startContainer;
                const parentEl = parent as HTMLElement;
                let closestElement: HTMLLIElement | null;
                if (parent.nodeType != Node.ELEMENT_NODE) {
                    const nodeParent = parent.parentElement;
                    if (!nodeParent) return;
                    closestElement = nodeParent.closest("li, code");
                }
                else {
                    closestElement = parentEl.closest("li, code");
                }
                if (closestElement && closestElement.tagName.toLowerCase() === "li") {
                    if ((!closestElement.textContent.trim() || closestElement.textContent.trim() == '\u200B') && !closestElement.children.length) {
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
                                li.innerText = "\u200B";
                            }
                            listContainer.appendChild(li);
                        }
                        else {
                            li.remove();
                            listContainer.appendChild(content);
                        }
                        range.insertNode(listContainer);
                        utils.placeCaretatEndofElement(listContainer);
                    }
                }
                else if (closestElement && closestElement.tagName.toLowerCase() === "code") {
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
                this.el.dispatchEvent(new Event('input'));
            }
            if (e.key === 'Enter') {
                const range = this.selection;
                if (!range) return;
                console.log(range.startContainer)
                let node: Node | null = range.startContainer;
                if (node.nodeType === Node.TEXT_NODE) {
                    node = node.parentElement;
                }

                const el = node as HTMLElement | null;
                const codeAncestor = el?.closest("code");

                if (codeAncestor) {
                    e.preventDefault();

                    const beforeRange = range.cloneRange();

                    beforeRange.setStart(codeAncestor, 0);

                    const textBeforeCaret = beforeRange.toString();
                    const lines = textBeforeCaret.split("\n");
                    const currentLine = lines.pop() ?? "";
                    const match = currentLine.match(/^[\t ]*/);
                    let indent = match ? match[0] : "";

                    if (currentLine.slice(-1) === "{") {
                        indent = "\t" + indent;
                    }

                    range.deleteContents();
                    const br = document.createTextNode("\n");
                    const text = document.createTextNode(indent);
                    range.insertNode(text);
                    range.insertNode(br);
                    range.setStartAfter(text);
                    range.collapse(true);
                    codeAncestor.normalize();
                    return;
                }
                
            }
        })

        this.el.addEventListener("paste", (e) => {
            /**
             * steps:
             * 1. Clean clipboard
             * 2. Insert into DOM
             * 3. Normalize
             * */
            e.preventDefault();
            const range = this.selection;
            if (!range) return;

            if (e.clipboardData == null) {
                return;
            }
            let html = e.clipboardData?.getData('text/html') || '';
            const plain = e.clipboardData?.getData('text/plain') || '';

            if (!html && plain) {
                console.log("no html")
                html = '<p>' + plain
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/\r\n/g, '\n')
                    .replace(/\n{2,}/g, '</p><p>')
                    .replace(/\n/g, '<br>') + '</p>';
            }

            const snippet = parser.parseFromString(html, 'text/html');
            const fragment = document.createDocumentFragment();

            // normalize fragment
            this.normalizer.removeNotSupportedNodes(fragment);

            // insert
            while (snippet.body.firstChild) {
                fragment.appendChild(snippet.body.firstChild);
            }
            range.deleteContents();
            range.insertNode(fragment);

            // normalize after inserting
            const outOfOrderNodes = this.normalizer.flagNodeHierarchyViolations(range.commonAncestorContainer);
            console.log(outOfOrderNodes)
            this.normalizer.fixHierarchyViolations(outOfOrderNodes);
        })
        this.el.addEventListener("focusin", (e) => {
            if (this.currentInsertModal) {
                this.currentInsertModal.unmount();
                this.currentInsertModal = null;
            }
        })

        this.el.addEventListener("input", (e) => {
            if (this.timeoutId !== null) {
                clearTimeout(this.timeoutId);
            }
            this.timeoutId = window.setTimeout(() => {
                this.timeoutId = null;

                const html = this.el.innerHTML.toString();;

                const snapshot: Snapshot = {
                    timestamp: Date.now(),
                    html,
                };
                this.historyManager.push(snapshot);
            }, this.historyUpdateDelayonInput);
            // normalize after input
            this.normalizer.removeNotSupportedNodes(this.el);
            const outOfOrderNodes = this.normalizer.flagNodeHierarchyViolations(this.el);
            console.log(outOfOrderNodes);
            this.normalizer.fixHierarchyViolations(outOfOrderNodes);
            this.normalizer.removeEmptyNodes(this.el);

        });
        this.el.addEventListener("activateStyleButtons", (e) => {
            const range = this.selection;
            if (!range) return;
            /**
             * steps: 
             * 1) check all blocks. 
             * 2) If no blocks, get closest block 
             * 3) Activate Block buttons
             * 4) check if contents would be one contiguous span 
             * 5) If not return 
             * 6) else we grab all styles and classes 
             * 7) Activate those buttons
             * 8) Change state of dropdown based on what blocks are selected
             */

            // handle blocks
            let blocks = utils.getBlockRanges(range.cloneRange(), this.el);
            const blockTags: Array<string> = [];

            for (const block of blocks) {
                const el = block.block as HTMLElement;
                if (!blockTags.includes(el.tagName.toLowerCase())) {
                    blockTags.push(el.tagName.toLowerCase());
                }
                if (blockTags.length > 1) break;
            }

            const dropDownOpen = document.querySelector(".dropdown-open");

            dropDownOpen!.textContent = blockTags.length > 1 ? "Body" : document.querySelector(`${this.selector} [data-tag="${blockTags[0]}"]`)?.textContent ?? "Body";

            let attributes: Record<string, string> = {}
            for (var i = 0; i < blocks.length; i++) {
                const el = blocks[i].block as HTMLElement;
                let newAttributes: Record<string, string> = {}
                if (i === 0) {
                    for (let j = 0; j < el.style.length; j++) {
                        const prop = el.style[j];
                        const value = el.style.getPropertyValue(prop);
                        attributes[prop] = value;
                    }
                }
                for (let j = 0; j < el.style.length; j++) {
                    const prop = el.style[j];
                    const value = el.style.getPropertyValue(prop);
                    if (attributes[prop] == value) {
                        newAttributes[prop] = value;
                    }
                }
                attributes = newAttributes;
            }
            const blockStyleButtons = document.querySelectorAll<HTMLElement>(`${this.selector} [data-button-type="block"]`);
            blockStyleButtons.forEach((el) => {
                const key = el.dataset.key;
                if (key && el.dataset.attribute == attributes[key]) {
                    el.classList.add("active");
                }
                else {
                    el.classList.remove("active");
                }
            })

            // handle spans

            const commonAncestorParent = range.commonAncestorContainer.parentElement;
            const classes: Record<string, Array<string>> = { "class": [] }
            attributes = {}
            if (commonAncestorParent?.tagName.toLowerCase() == "span") {
                const classList = Array.from(commonAncestorParent.classList);
                classes["class"] = classList
                const style = commonAncestorParent.getAttribute("style");
                if (style) {
                    style.split(";").forEach(rule => {
                        const [prop, value] = rule.split(":").map(s => s.trim());
                        if (prop && value) attributes[prop] = value;
                    });
                }

            }
            else {
                for (var i = 0; i < blocks.length; i++) {
                    const blockContent = blocks[i].blockRange.cloneContents();
                    const nodes = blockContent.childNodes;
                    console.log(nodes);
                    for (let i = 0; i < nodes.length; i++) {
                        const node = nodes[i];
                        if (node.nodeType === Node.TEXT_NODE) {
                            return;
                        }
                        const el = node as HTMLElement;
                        const classList = Array.from((node as HTMLElement).classList);
                        if (i === 0) {
                            classes["class"] = classList
                            const style = el.getAttribute("style");
                            if (style) {
                                style.split(";").forEach(rule => {
                                    const [prop, value] = rule.split(":").map(s => s.trim());
                                    if (prop && value) attributes[prop] = value;
                                });
                            }
                        }
                        else {
                            const newClassList = [];
                            const newAttributes: Record<string, string> = {}

                            // keep consistent classes
                            for (const nodeClass of classList) {
                                if (classes["class"].includes(nodeClass)) {
                                    newClassList.push(nodeClass);
                                }
                            }
                            classes["class"] = newClassList;
                            // keep consisten attributes
                            const style = el.getAttribute("style");
                            if (style) {
                                style.split(";").forEach(rule => {
                                    const [prop, value] = rule.split(":").map(s => s.trim());
                                    if (attributes[prop] == value) newAttributes[prop] == value;
                                });
                            }
                            attributes = newAttributes;
                        }
                    }
                }
            }

            const spanStyleButtons = document.querySelectorAll<HTMLElement>(`${this.selector} [data-button-type="span"]`);
            spanStyleButtons.forEach((el) => {
                const key = el.dataset.key;
                if (key && el.dataset.attribute == attributes[key]) {
                    el.classList.add("active");
                }
                else {
                    el.classList.remove("active");
                }
            })


        })

        document.addEventListener("selectionchange", () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                this.selection = null;
                return;
            }
            if (this.currentTextModal) this.currentTextModal.unmount();
            const range = sel.getRangeAt(0);
            if (this.el.contains(range.commonAncestorContainer)) {
                this.selection = range;
                this.el.dispatchEvent(events.activateStyleButtons);

                // check if we are inside an anchor and activate modal
                const parent = range.commonAncestorContainer.parentElement;
                const closestAnchor = parent?.closest("a");
                if (closestAnchor && this.currentInsertModal == null){
                    const linkModal = new LinkModal(
                        this,
                        this.selection.getBoundingClientRect(),
                        closestAnchor,
                    );
                    this.currentTextModal = linkModal;
                    linkModal.mount();
                }
            }

        });

        return this
    }
}
