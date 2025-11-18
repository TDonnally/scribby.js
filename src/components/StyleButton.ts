import { Scribby } from "./Scribby.js";

import { activateStyleButtons } from "../events/custom_events.js";

import * as utils from "../utilities/utilities.js"

export enum affectedElementType {
    Block = "block",
    Span = "span",
}
export class ToolbarStyleButton {
    scribby: Scribby
    innerContent: string;
    attributes: Map<string, string> | null;
    el!: HTMLButtonElement;
    affectedElType: affectedElementType;
    tag: string | null

    constructor(
        scribby: Scribby,
        innerContent = "",
        attributes: Map<string, string> | null = null,
        affectedElType = affectedElementType.Span,
        tag:string | null = null,
        el = document.createElement("button"),
    ) {
        this.scribby = scribby;
        this.el = el;
        this.innerContent = innerContent;
        this.attributes = attributes;
        this.affectedElType = affectedElType;
        this.tag = tag;
    }
    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        let dataAttributeString: string = "";
        if (this.attributes){
            for (const [k, v] of this.attributes) {
                if (this.affectedElType === affectedElementType.Block) {
                    this.scribby.allowedBlockStyles.add(k);
                }
                else if (this.affectedElType === affectedElementType.Span) {
                    this.scribby.allowedSpanStyles.add(k);
                }
                dataAttributeString += v;
            }
        }
        

        this.el.setAttribute("data-attribute", dataAttributeString);
        this.el.addEventListener("click", (e) => {
            const sel = this.scribby.selection;
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            const blockRanges = utils.getBlockRanges(range, this.scribby.el)
            /**
             * 1. extract range
             * 2. manipulate nodes
             * 3. replace
             * 4. cleanup
             */
            blockRanges.forEach(({ block, blockRange }) => {
                // handle block buttons
                if (this.affectedElType == "block" && !this.tag && this.attributes){
                    for (const [k, v] of this.attributes) {
                        if (block.style.getPropertyValue(k) != v) {
                            block.style.setProperty(k, String(v));
                        }
                        else {
                            block.style.removeProperty(k);
                        }
                    }
                    return
                }
                else if (this.affectedElType == "block" && this.tag){
                    const newTagEl = document.createElement(this.tag);
                    for (const { name, value } of Array.from(block.attributes)) {
                        newTagEl.setAttribute(name, value);
                    }
                    while (block.firstChild){
                        newTagEl.appendChild(block.firstChild);
                    }
                    block.replaceWith(newTagEl);
                    return
                }
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
                            if(this.attributes){
                                for (const [k, v] of this.attributes) {
                                    if (span.style.getPropertyValue(k) != v) {
                                        span.style.setProperty(k, String(v));
                                    }
                                    else {
                                        span.style.removeProperty(k);
                                    }

                                }
                            }
                            span.textContent = node.textContent;
                            node.replaceWith(span);

                        }
                        else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'SPAN') {
                            const span = node as HTMLSpanElement;
                            if (this.attributes){
                                for (const [k, v] of this.attributes) {
                                    if (span.style.getPropertyValue(k) != v) {
                                        span.style.setProperty(k, String(v));
                                    }
                                    else {
                                        span.style.removeProperty(k);
                                    }
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
                    if(this.attributes){
                        for (const [k, v] of this.attributes) {
                            if (startEl.style.getPropertyValue(k) == v) {
                                startEl.style.removeProperty(k);
                            }
                            else {
                                startEl.style.setProperty(k, String(v));
                            }
                        }
                    }
                    
                    if (startEl.style.length == 0) {
                        const innerHtml = startEl.innerHTML;
                        const frag = document.createRange().createContextualFragment(innerHtml);
                        startEl.replaceWith(frag);
                    }
                }

                // cleanup
                utils.removeEmptyTextNodes(block);
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
            
            this.scribby.el.dispatchEvent(activateStyleButtons);
        })
    }
}