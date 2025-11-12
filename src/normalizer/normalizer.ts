/**
 * This file is the normalization layer for Scribby.
 * It's purpose is to apply DOM hierarchy and layout rules on Scribby element changes
 * Rules are based on schema map
 */
import * as utils from "../utilities/utilities.js"
import { schema } from "../schema/schema.js";

export class Normailzer{
    scribbyEl: HTMLDivElement;
    constructor(
        scribbyEl: HTMLDivElement,
    ){
        this.scribbyEl = scribbyEl;
    }
    removeNotSupportedNodes(root: Node): void{
        const rootEl = root as HTMLElement;
        const allowedTags = new Set(
            Array.from(schema.keys()).map(k => k.toLowerCase())
        );

        const allEls = rootEl.querySelectorAll<HTMLElement>("*");

        const notInSchema = Array.from(allEls).filter(el =>
            !allowedTags.has(el.tagName.toLowerCase())
        );
        for (const el of notInSchema){
            utils.replaceElementWithChildren(el);
        }
    }
    flagNodeHierarchyViolations(root: Node): Node[]{
        const outOfOrderNodes = new Array();
        const startEl = root as HTMLElement;
        const children = Array.from(startEl.childNodes);

        while(children.length){
            const child = children.pop();
            if (!child){
                continue;
            }
            if (child.nodeType === Node.TEXT_NODE){
                if(child.nodeValue?.includes("\n")){
                    continue;
                }
                const parent = child.parentNode as HTMLElement;
                const parentTag = parent?.tagName.toLocaleLowerCase();
                if(parent && !schema.get("text")?.allowedParents.has(parentTag)){
                    outOfOrderNodes.push(child)
                }
                continue;
            }
            const childEl = child as HTMLElement;
            const childTag = childEl.tagName.toLowerCase();
            const parent = childEl.parentElement;
            const parentTag = parent?.tagName.toLocaleLowerCase();

            if (parentTag && !schema.get(childTag)?.allowedParents.has(parentTag)){
                outOfOrderNodes.push(child)
            }
            const grandChildren = Array.from(childEl.childNodes);
            children.push(...grandChildren);
        }
        return outOfOrderNodes;
    }
}
