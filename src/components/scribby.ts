import { Normailzer } from "../normalizer/normalizer.js";

import { Toolbar } from "./Toolbar.js";
import { InsertModal } from "./Modal.js";

import { activateStyleButtons } from "../events/custom_events.js";
import { HistoryManager, Snapshot } from "../history_manager/history_manager.js";

import * as utils from "../utilities/utilities.js"


const parser = new DOMParser();


export class Scribby {
    selector: string;
    content: string;
    el!: HTMLDivElement;
    toolbar!: Toolbar;
    textElement: string;
    styleElements: Map<string, string>;
    selection!: Range | null;
    allowedBlockStyles: Set<string>;
    allowedSpanStyles: Set<string>;
    normalizer!: Normailzer;
    historyManager: HistoryManager;

    timeoutId: number | null;
    historyUpdateDelayonInput: number;

    currentModal: InsertModal | null = null;

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
        this.styleElements = new Map;
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
        this.normalizer = new Normailzer(this.el);

        this.el.insertAdjacentElement("beforebegin", this.toolbar.el);

        this.el.addEventListener("keydown", (e) => {
            if (e.ctrlKey) {
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
            }
            if (e.key === "Tab"){

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
            if (this.currentModal) {
                this.currentModal.unmount();
                this.currentModal = null;
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
            this.normalizer.fixHierarchyViolations(outOfOrderNodes);
        });
        this.el.addEventListener("activateStyleButtons", (e) => {
            const range = this.selection;
            if (!range) return;
            let startEl = range.startContainer.parentElement;
            if (startEl == null) return;
            const styles = startEl.style;
            this.styleElements = new Map;

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

        document.addEventListener("selectionchange", () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                this.selection = null;
                return;
            }

            const range = sel.getRangeAt(0);
            if(this.el.contains(range.commonAncestorContainer)){
                this.selection = range;
                this.el.dispatchEvent(activateStyleButtons);
            }
            
        });

        return this
    }
}
