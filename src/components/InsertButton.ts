import { Scribby } from "./Scribby.js";
import { InsertModal } from "./InsertModal.js";

import * as utils from "../utilities/utilities.js"

export enum insertElementType {
    Anchor = "a",
    Image = "img",
    Video = "video",
    Canvas = "canvas",
    OrderedList = "ol",
    UnorderedList = "ul",
    CodeBlock = "code"
}


export class ToolbarInsertButton {
    scribby!: Scribby;
    innerContent: string;
    attributes: Map<string, string> | null;
    insertElType: insertElementType;
    customEventKeyword: string | null
    el!: HTMLButtonElement;
    constructor(
        scribby: Scribby,
        innerContent: string,
        attributes: Map<string, string> | null,
        insertElType: insertElementType,
        customEventKeyword: string | null = null,
    ) {
        this.scribby = scribby;
        this.el = document.createElement("button");
        this.innerContent = innerContent;
        this.attributes = attributes;
        this.insertElType = insertElType;
        this.customEventKeyword = customEventKeyword;
    }
    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        if (this.customEventKeyword) {
            this.scribby.el.addEventListener(this.customEventKeyword, (e) => {
                this.el.dispatchEvent(new Event("click"));
            });
        }
        this.el.addEventListener("click", async (e) => {
            if (this.scribby.currentInsertModal) {
                this.scribby.currentInsertModal.unmount();
            }
            const range = this.scribby.selection;
            if (!range) return;
            const rangeMarker = document.createElement("range-marker");
            const rangeLength = range?.toString().length;
            const blockRanges = utils.getBlockRanges(range, this.scribby.el);

            /**
             * 1. extract range
             * 2. if anchor, insert anchor tag into each block
             * 3. if list, wrap blocks in type and wrap all elements in li
             * 4. if other insert type delete range and insert that element
             */
            if (this.insertElType === insertElementType.Anchor) {
                const endRange = range.cloneRange();
                endRange.collapse(false);
                endRange.insertNode(rangeMarker);

                this.scribby.currentInsertModal = new InsertModal(
                    this.scribby,
                    `
                    <label>
                        Url
                        <input name="href" type="text" required />
                    </label>
                    ${range.toString().length > 0 ? '' : `
                    <label>
                        Title
                        <input name="title" type="text" required />
                    </label>
                    `}
                    `,
                    rangeMarker.getBoundingClientRect(),
                );
                const modal = this.scribby.currentInsertModal;

                const values = await modal.submission();
                console.log(values)
                if (range.toString().length > 0) {

                    blockRanges.forEach(({ block, blockRange }) => {
                        const anchor = document.createElement("a");
                        const href = utils.normalizeUrl(values!.href)
                        if (href) {
                            anchor.href = href;
                        }
                        const extractedContents = blockRange.extractContents();

                        // replace the nested anchors
                        const nestedAnchors = extractedContents.querySelectorAll("a");
                        nestedAnchors.forEach(nestedAnchor => {
                            const textNode = document.createTextNode(nestedAnchor.textContent || "");
                            nestedAnchor.replaceWith(textNode);
                        });

                        anchor.appendChild(extractedContents);
                        blockRange.insertNode(anchor);
                    })
                }
                else {
                    const anchor = document.createElement("a");
                    anchor.href = values!.href;
                    anchor.innerText = values!.title;
                    range.insertNode(anchor);
                }


            }
            else if (this.insertElType === insertElementType.OrderedList || this.insertElType === insertElementType.UnorderedList) {
                const containerNode = range.commonAncestorContainer;
                const containerEl = containerNode.nodeType === Node.TEXT_NODE
                    ? containerNode.parentElement as HTMLElement
                    : containerNode as HTMLElement;

                const currentLi = containerEl?.closest("li");
                const currentList = containerEl?.closest("ol, ul") as HTMLElement | null;

                if (currentList) {
                    const endRange = range.cloneRange();
                    endRange.collapse(false);
                    endRange.insertNode(rangeMarker);

                    const tagName = currentList.tagName.toLowerCase();

                    if (tagName == this.insertElType) {
                        utils.replaceElementWithChildren(currentList);
                    }
                    else {
                        utils.changeElementTag(currentList, this.insertElType);
                    }
                }
                else if (currentLi && currentLi.parentElement && (currentLi.parentElement.tagName.toLowerCase() == "ol" || currentLi.parentElement.tagName.toLowerCase() == "ul")) {
                    const endRange = range.cloneRange();
                    endRange.collapse(false);
                    endRange.insertNode(rangeMarker);

                    const list = currentLi.parentElement;
                    const tagName = list.tagName.toLowerCase();

                    if (tagName == this.insertElType) {
                        utils.replaceElementWithChildren(list);
                    }
                    else {
                        utils.changeElementTag(list, this.insertElType);
                    }
                }
                else {
                    const list = document.createElement(this.insertElType);

                    blockRanges.forEach(({ blockRange }) => {
                        const listEl = document.createElement("li");

                        if (!blockRange.toString().length) {
                            listEl.innerText = "\u200B";
                        }
                        else {
                            const extractedContents = blockRange.extractContents();
                            listEl.appendChild(extractedContents);
                        }

                        list.appendChild(listEl);
                    });

                    range.deleteContents();
                    range.insertNode(list);

                    const lastListItem = list.lastElementChild;
                    lastListItem?.appendChild(rangeMarker);
                }
            }
            else if (this.insertElType === insertElementType.CodeBlock) {
                const container = range.commonAncestorContainer.parentElement;

                // If cursor is inside an existing block, you can remove/unwrap it
                const existing = container?.closest("scribby-code-block");
                if (existing) {
                    existing.replaceWith(document.createTextNode(existing.getAttribute("data-value") ?? ""));
                    return;
                }

                const block = document.createElement("scribby-code-block");
                block.setAttribute("data-lang", "javascript");

                if (range.toString().length) {
                    block.setAttribute("data-value", range.toString());
                } else {
                    block.setAttribute("data-value", ""); // empty block
                }

                range.deleteContents();
                range.insertNode(block);

                // Put your caret after the block (since it’s contenteditable=false)
                const after = document.createTextNode("\u200B");
                block.after(after);

                const sel = window.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    const r = document.createRange();
                    r.setStart(after, 1);
                    r.collapse(true);
                    sel.addRange(r);
                }
            }
            else {
                const newEl = document.createElement(this.insertElType);
                range.insertNode(newEl);
                utils.placeCaretatEndofElement(newEl);
            }
            this.scribby.el.dispatchEvent(new Event('input'));
            utils.placeCaretatEndofElement(rangeMarker);
            rangeMarker.remove();
        })
    }
}