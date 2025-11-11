/**
 * This file is the normalization layer for Scribby.
 * It's purpose is to apply DOM hierarchy and layout rules on Scribby element changes
 */
import { schema } from "../schema/schema.js";

export class Normailzer{
    scribbyEl: HTMLDivElement;
    constructor(
        scribbyEl: HTMLDivElement,
    ){
        this.scribbyEl = scribbyEl;
    }
    flagNodeHierarchyViolations(root: Node): Node[]{
        console.log("normalizing");
        const scribbyEl = this.scribbyEl;
        const outOfOrderNodes = new Array();

        function checkNode(node:Node){
            console.log(node)
            const el = node as HTMLElement;
            const children = Array.from(el.childNodes);
            for (const child of children){
                checkNode(child);
            }
        }

        checkNode(root);
        return outOfOrderNodes;
    }
}
