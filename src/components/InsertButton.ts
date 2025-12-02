import { Scribby } from "./Scribby.js";
import { InsertModal } from "./Modal.js";

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


export class ToolbarInsertButton{
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
    ){
        this.scribby = scribby;
        this.el = document.createElement("button");
        this.innerContent = innerContent;
        this.attributes = attributes;
        this.insertElType = insertElType;
        this.customEventKeyword = customEventKeyword;
    }
    mount(){
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        if (this.customEventKeyword){
            this.scribby.el.addEventListener(this.customEventKeyword, (e) => {
                this.el.dispatchEvent(new Event("click"));
            });
        }
        this.el.addEventListener("click", async (e) => {
            if (this.scribby.currentModal){
                this.scribby.currentModal.unmount();
            }
            const range = this.scribby.selection;
            if(!range) return;
            const rangeMarker = document.createElement("range-marker");
            const rangeLength = range?.toString().length;
            const blockRanges = utils.getBlockRanges(range, this.scribby.el);

            /**
             * 1. extract range
             * 2. if anchor, insert anchor tag into each block
             * 3. if list, wrap blocks in type and wrap all elements in li
             * 4. if other insert type delete range and insert that element
             */
            if (this.insertElType === insertElementType.Anchor){

                this.scribby.currentModal = new InsertModal(
                    this.scribby,
                    `
                    <label>
                        URL
                        <input name="href" type="text" required />
                    </label>
                    ${range.toString().length > 0 ? '' : `
                    <label>
                        Title
                        <input name="title" type="text" />
                    </label>
                    `}
                    `,
                    range.getBoundingClientRect(),
                );
                const modal = this.scribby.currentModal;

                const values = await modal.submission();
                console.log(values)
                if (range.toString().length > 0){
                    
                    blockRanges.forEach(({ block, blockRange }) => {
                        const anchor = document.createElement("a");
                        anchor.href = values!.href;
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
                else{
                    const anchor = document.createElement("a");
                    anchor.href = values!.href;
                    anchor.innerText = values!.title;
                    range.insertNode(anchor);
                }
                

            }
            else if (this.insertElType === insertElementType.OrderedList || this.insertElType === insertElementType.UnorderedList){ 
                const parent = range.commonAncestorContainer as HTMLElement;

                if (parent.nodeType != Node.TEXT_NODE && (parent.tagName.toLowerCase() == "ul" || parent.tagName.toLowerCase() == "ol")){
                    const endRange = range.cloneRange();
                    endRange.collapse(false);
                    endRange.insertNode(rangeMarker);
                    const tagName:string = parent.tagName.toLowerCase()
                    const options = {
                        [insertElementType.OrderedList]: insertElementType.UnorderedList,
                        [insertElementType.UnorderedList]: insertElementType.OrderedList
                    }
                    if (rangeLength > 0){
                        if (tagName != this.insertElType){
                            const newTag = utils.toggle(options,tagName);
                            utils.changeElementTag(parent, newTag);
                        }
                        else {
                            utils.replaceElementWithChildren(parent);
                        }
                    }
                }
                else if(parent.nodeType != Node.TEXT_NODE && parent.tagName.toLowerCase() == "li" && parent.parentElement){
                    const tagName:string = parent.parentElement.tagName.toLowerCase()
                    const endRange = range.cloneRange();
                    endRange.collapse(false);
                    endRange.insertNode(rangeMarker);
                    const options = {
                        [insertElementType.OrderedList]: insertElementType.UnorderedList,
                        [insertElementType.UnorderedList]: insertElementType.OrderedList
                    }
                    if(tagName == this.insertElType){
                        utils.replaceElementWithChildren(parent.parentElement);
                    }
                    else if (tagName != this.insertElType){
                        const newTag = utils.toggle(options,tagName);
                        utils.changeElementTag(parent.parentElement, newTag);
                    }
                }
                else{
                    const list = document.createElement(this.insertElType);
                    blockRanges.forEach(({ block, blockRange }) => {
                        const listEl = document.createElement("li");
                        
                        if(!range.toString().length){
                            listEl.innerText = "\u200B";
                        }
                        else{
                            const extractedContents = blockRange.extractContents();
                            listEl.appendChild(extractedContents);
                        }
                        
                        list.appendChild(listEl);
                    })
                    range.deleteContents();
                    range.insertNode(list);

                    // add a range marker to recreate range
                    const lastListItem = list.lastElementChild
                    lastListItem?.appendChild(rangeMarker);
                }
            }
            else if(this.insertElType === insertElementType.CodeBlock){
                const pre = document.createElement("pre");
                const codeBlock = document.createElement("code");
                codeBlock.innerHTML = range.toString();

                range.deleteContents();

                codeBlock.appendChild(rangeMarker);
                pre.appendChild(codeBlock);
                range.insertNode(pre);
            }
            else{
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