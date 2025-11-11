/**
 * This file is the normalization layer for Scribby.
 * It's purpose is to apply DOM hierarchy and layout rules on Scribby element changes
 */
import { schema } from "../schema/schema";

export class Normailzer{
    scribbyEl: HTMLDivElement;
    constructor(
        scribbyEl: HTMLDivElement,
    ){
        this.scribbyEl = scribbyEl;
    }
    enforceNodeHierarchy(root: Node): Node{
        const rootCopy = root.cloneNode(true);
        const scribbyEl = this.scribbyEl

        function fixNode(node:Node){
            const el = node as HTMLElement;
            const tag = el.tagName.toLowerCase();
            const nodeSchema = schema.get(tag);

            let parent = el.parentElement;
            let lastNonRoot: HTMLElement | null = null;

            const children = Array.from(el.childNodes);
            if(!nodeSchema){
                const container = parent; 
                for (const child of children) {
                    container!.insertBefore(child, el); 
                }
                container!.removeChild(el);
            }
            /**
             * We will iterate up the chain of parent elements. 
             * If we cannot find an appropriate parent element for nesting,
             * We will create the first the default parent element and insert into DOM.
             * If default is a div, we will append it to the Scribby div(Divs are not allowed as children within Scribby doc)
             */
            else{
                while (parent){
                    if (parent === scribbyEl){
                        if (lastNonRoot && lastNonRoot.parentNode) {
                            const container = lastNonRoot.parentNode;
                            if (el.parentNode === container) {
                                container.insertBefore(el, lastNonRoot.nextSibling);
                            } else {
                                el.parentNode?.removeChild(el);
                                container.insertBefore(el, lastNonRoot.nextSibling);
                            }
                        }
                        break;
                    }
                    else if(parent.tagName.toLowerCase() === tag){
                        const container = parent; 
                        for (const child of children) {
                            container.insertBefore(child, el); 
                        }
                        container.removeChild(el);
                        break;
                    }
                    lastNonRoot = parent;
                    parent = parent.parentElement;
                }
            }
            
            for (const child of children){
                fixNode(child);
            }
        }
        fixNode(rootCopy);

        return rootCopy
    }
}
