/**
 * I wrote this before creating schema and normalizer
 * It could probably be rewritten with those and that would be cleaner
 * But it currently works fine so until it becomes an issue we will leave as is
 */

import { Scribby } from "./Scribby.js";
import * as utils from "../utilities/utilities.js"
import { Normalizer } from "../normalizer/normalizer.js";

export enum affectedElementType {
    Block = "block",
    Span = "span",
}
export class ToolbarStyleButton {
    scribby: Scribby;
    innerContent: string;
    attributes: Map<string, string> | null;
    el!: HTMLButtonElement;
    affectedElType: affectedElementType;
    tag: string | null;
    customEventKeyword: string | null;
    styleClass: string | null;

    constructor(
        scribby: Scribby,
        innerContent = "",
        attributes: Map<string, string> | null = null,
        styleClass: string | null = null,
        affectedElType = affectedElementType.Span,
        customEventKeyword: string | null = null,
        tag: string | null = null,
        el = document.createElement("button"),
    ) {
        this.scribby = scribby;
        this.el = el;
        this.innerContent = innerContent;
        this.attributes = attributes;
        this.affectedElType = affectedElType;
        this.customEventKeyword = customEventKeyword;
        this.tag = tag;
        this.styleClass = styleClass;
    }
    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        let dataAttributeString: string = "";
        if (this.attributes) {
            for (const [k, v] of this.attributes) {
                if (this.affectedElType === affectedElementType.Block) {
                    this.scribby.allowedBlockStyles.add(k);
                }
                else if (this.affectedElType === affectedElementType.Span) {
                    this.scribby.allowedSpanStyles.add(k);
                }
                dataAttributeString += v;
                this.el.setAttribute("data-key", k);
                this.el.setAttribute("data-attribute", v);
            }
        }
        if (this.styleClass) {
            this.el.setAttribute("data-key", "class");
            this.el.setAttribute("data-attribute", this.styleClass);
        }
        if (this.tag) {
            this.el.setAttribute("data-tag", this.tag);
        }
        this.el.setAttribute("data-button-type", this.affectedElType);

        if (this.customEventKeyword) {
            this.scribby.el.addEventListener(this.customEventKeyword, (e) => {
                this.el.dispatchEvent(new Event("click"));
            });
        }
        this.el.addEventListener("click", (e) => {
            e.preventDefault();
            const range = this.scribby.selection;
            if (!range) return;
            const isRangeCollapsed = range.collapsed;

            const frontMarker = document.createElement("range-marker");
            const backMarker = document.createElement("range-marker");
            frontMarker.classList.add("front");
            backMarker.classList.add("back");

            range.insertNode(frontMarker);
            const endRange = range.cloneRange();
            endRange.collapse(false);
            endRange.insertNode(backMarker);


            const blockRanges = utils.getBlockRanges(range.cloneRange(), this.scribby.el);

            const queryString = this.affectedElType == "block" ? utils.BLOCK_SELECTOR : "span";
            const fragment = range.cloneContents();
            const affectedElements = fragment.querySelectorAll(queryString);
            let isThereAttributeParity: boolean = true;
            const haveAttribute: Array<HTMLElement> = new Array();
            const dontHaveAttribute: Array<Element> = new Array();
            /**
             * CHECK:
             * 1. check if all blocks have/don't have attribute/tag
             * 2. If true, toggle off/on
             * 3. If false, apply attribute/tag to ones that don't have
             * DOM CHANGES:
             * 1. extract range
             * 2. manipulate nodes
             * 3. replace
             * 4. cleanup
             */

            // check for text nodes for buttons that affect spans (if present there isn't parity among affected nodes)
            if (this.affectedElType == "span") {
                for (let i = 0; i < blockRanges.length; i++) {
                    let nodes = blockRanges[i].blockRange.cloneContents();
                    for (const node of nodes.childNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            isThereAttributeParity = false;
                            break;
                        }
                    }
                    if (!isThereAttributeParity) {
                        break;
                    }
                }
            }
            // check for parity among element nodes
            let i = 0;
            while (isThereAttributeParity && i < affectedElements.length) {
                const el = affectedElements[i] as HTMLElement;
                if (this.attributes) {
                    for (const [k, v] of this.attributes) {
                        if (el.style.getPropertyValue(k) == v) {
                            haveAttribute.push(el)
                        }
                        else {
                            dontHaveAttribute.push(el);
                        }
                    }
                }
                else {
                    break;
                }
                if (haveAttribute.length && dontHaveAttribute.length) {
                    isThereAttributeParity = false;
                }
                i++;
            }
            console.log(isThereAttributeParity);
            blockRanges.forEach(({ block, blockRange }) => {
                // handle block buttons
                if (this.affectedElType == "block" && !this.tag && this.attributes) {
                    for (const [k, v] of this.attributes) {
                        if (block.style.getPropertyValue(k) == v && isThereAttributeParity) {
                            block.style.removeProperty(k);
                        }
                        else {
                            block.style.setProperty(k, String(v));
                        }
                    }
                    return
                }
                else if (this.affectedElType == "block" && this.tag) {

                    utils.changeElementTag(block, this.tag);
                    return
                }

                // handle span buttons
                const rangeOffset = blockRange.startOffset;
                let startEl = blockRange.startContainer.nodeType === Node.ELEMENT_NODE
                    ? blockRange.startContainer as HTMLElement
                    : blockRange.startContainer.parentElement;
                if (startEl == null) return;
                const extractedContents = blockRange.extractContents();
                for (const node of extractedContents.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const span = document.createElement('span');
                        let parentClasses: Set<string> | null = null;
                        let parentStyles: Map<string, string> | null = null;
                        if (blockRange.startContainer === blockRange.endContainer && startEl?.tagName === 'SPAN' && startEl.contains(blockRange.startContainer)) {
                            const [parentClassesSet, parentStylesMap] = utils.getElementAttributes(startEl as HTMLElement);
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
                        if (this.attributes) {
                            for (const [k, v] of this.attributes) {
                                if (span.style.getPropertyValue(k) != v) {
                                    span.style.setProperty(k, String(v));
                                }
                                else {
                                    span.style.removeProperty(k);

                                }

                            }
                        }
                        if (span.style.length === 0) {
                            span.removeAttribute("style");
                        }
                        if (this.styleClass) {
                            span.classList.toggle(this.styleClass);
                            if (!span.classList.length) {
                                span.removeAttribute("class");
                            }
                        }
                        span.textContent = node.textContent;
                        node.replaceWith(span);

                    }
                    else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'SPAN') {
                        const span = node as HTMLSpanElement;
                        if (this.attributes) {
                            for (const [k, v] of this.attributes) {
                                if (span.style.getPropertyValue(k) == v && isThereAttributeParity) {
                                    span.style.removeProperty(k);
                                }
                                else {
                                    span.style.setProperty(k, String(v));
                                }
                            }
                        }
                        if (span.style.length === 0) {
                            span.removeAttribute("style");
                        }
                        if (this.styleClass) {
                            span.classList.toggle(this.styleClass);
                            if (!span.classList.length) {
                                span.removeAttribute("class");
                            }
                        }

                    }
                }

                if (blockRange.startContainer === blockRange.endContainer && startEl != block) {
                    const splitRange = document.createRange();
                    const textNode = startEl.firstChild ?? startEl;

                    splitRange.setStart(textNode, rangeOffset);
                    splitRange.setEnd(startEl, startEl.childNodes.length);

                    const tailFragment = splitRange.extractContents();

                    const lastSpan = startEl.cloneNode(false);
                    lastSpan.appendChild(tailFragment);

                    if (textNode.nodeType === Node.TEXT_NODE) {
                        textNode.textContent = textNode.textContent?.substring(0, rangeOffset) ?? "";
                    }

                    startEl.after(extractedContents, lastSpan);
                }
                else {
                    const referenceNode = document.createTextNode('');
                    blockRange.insertNode(referenceNode);
                    referenceNode.replaceWith(extractedContents);
                }
                if (isRangeCollapsed) {
                    console.log(startEl)
                    const span = startEl != block ? startEl.cloneNode(false) as HTMLElement : document.createElement("span");
                    if (this.attributes) {
                        for (const [k, v] of this.attributes) {
                            if (span.style.getPropertyValue(k) == v) {
                                span.style.removeProperty(k);
                            }
                            else {
                                span.style.setProperty(k, String(v));
                            }
                        }
                    }
                    if (span.style.length === 0) {
                        span.removeAttribute("style");
                    }
                    if (this.styleClass) {
                        span.classList.toggle(this.styleClass);
                        if (!span.classList.length) {
                            span.removeAttribute("class");
                        }
                    }
                    span.appendChild(document.createTextNode("\u200B"));
                    frontMarker.after(span);
                    span.appendChild(backMarker);

                }

                // cleanup
                utils.removeEmptyTextNodes(block);
                const children = block.children;
                for (let i = 0; i < children.length;) {
                    const child = children[i]
                    if (child.tagName.toLowerCase() !== "range-marker" && child.innerHTML.length == 0) {
                        child.remove();
                    }
                    if (!child.hasAttributes()) {
                        utils.replaceElementWithChildren(child)
                    }
                    if (i >= children.length - 1) {
                        break;
                    }
                    const nextChild = children[i + 1]
                    // handle range-markers
                    if (nextChild.tagName.toLowerCase() == "range-marker" && children[i + 2] && utils.areSiblingsEqual(child, children[i + 2])) {
                        child.appendChild(nextChild);
                        continue;
                    }

                    const adjacent = utils.areSiblingsAdjacent(child, nextChild);
                    const equal = utils.areSiblingsEqual(child, nextChild);
                    if (adjacent && equal) {
                        utils.mergeElementBintoElementA(child, nextChild);
                    }
                    else {
                        i++;
                    }
                }
                block.normalize();
            });
            const sel = window.getSelection();
            sel?.removeAllRanges();
            const newRange = document.createRange();
            newRange.setStartAfter(frontMarker);
            newRange.setEndBefore(backMarker);
            if(isRangeCollapsed){
                newRange.collapse(false);
            }
        
            sel?.addRange(newRange);
            const fMarkerParent = frontMarker.parentElement;
            const bMarkerParent = backMarker.parentElement;
            frontMarker.remove();
            backMarker.remove();
            fMarkerParent?.normalize();
            bMarkerParent?.normalize();

            this.scribby.normalizer.removeEmptyNodes(this.scribby.el);
        })
    }
}