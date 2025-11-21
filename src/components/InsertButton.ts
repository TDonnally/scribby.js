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
}
export class ToolbarInsertButton{
    scribby!: Scribby;
    innerContent: string;
    attributes: Map<string, string> | null;
    insertElType: insertElementType;
    el!: HTMLButtonElement;
    constructor(
        scribby: Scribby,
        innerContent: string,
        attributes: Map<string, string> | null,
        insertElType: insertElementType,
    ){
        this.scribby = scribby;
        this.el = document.createElement("button");
        this.innerContent = innerContent;
        this.attributes = attributes;
        this.insertElType = insertElType;
    }
    mount(){
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        this.el.addEventListener("click", async (e) => {
            if (this.scribby.currentModal){
                this.scribby.currentModal.unmount();
            }
            const range = this.scribby.selection;
            if(!range) return;
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
                
                const list = document.createElement(this.insertElType);
                blockRanges.forEach(({ block, blockRange }) => {
                    const listEl = document.createElement("li");
                    const extractedContents = blockRange.extractContents();

                    listEl.appendChild(extractedContents);
                    list.appendChild(listEl);
                })
                range.deleteContents();
                range.insertNode(list);
                
                
                
            }
            else{
                const newEl = document.createElement(this.insertElType);
                range.insertNode(newEl);
            }
            const outOfOrderNodes = this.scribby.normalizer.flagNodeHierarchyViolations(this.scribby.el)
            console.log(outOfOrderNodes);
            this.scribby.normalizer.fixHierarchyViolations(outOfOrderNodes)
        })
    }
}