/**
 * This file is the normalization layer for Scribby.
 * It's purpose is to apply DOM hierarchy and layout rules on Scribby element changes
 * Rules are based on schema map
 */
import * as utils from "../utilities/utilities.js"
import { schema, nodeHierarchy } from "../schema/schema.js";
const textTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'];

export class Normalizer {
    scribbyEl: HTMLDivElement;
    constructor(
        scribbyEl: HTMLDivElement,
    ) {
        this.scribbyEl = scribbyEl;
    }
    removeNotSupportedNodes(root: Node): void {
        const rootEl = root as HTMLElement;
        const allowedTags = new Set(
            Array.from(schema.keys()).map(k => k.toLowerCase())
        );

        const allEls = rootEl.querySelectorAll<HTMLElement>("*");

        const notInSchema = Array.from(allEls).filter(el =>
            !allowedTags.has(el.tagName.toLowerCase())
        );
        for (const el of notInSchema) {
            utils.replaceElementWithChildren(el);
        }
    }

    flagNodeHierarchyViolations(root: Node): Record<nodeHierarchy, Array<Node>> {
        const outOfOrderNodes = Object.values(nodeHierarchy)
            .filter(value => typeof value === 'number')
            .reduce(
                (acc, value) => {
                    acc[value as nodeHierarchy] = [];
                    return acc;
                },
                {} as Record<nodeHierarchy, Node[]>
            );
        const startEl = root as HTMLElement;
        const children = Array.from(startEl.childNodes);

        while (children.length) {
            const child = children.pop();
            if (!child) {
                continue;
            }
            if (child.nodeType === Node.TEXT_NODE) {
                if (child.nodeValue?.includes("\n")) {
                    continue;
                }
                const parent = child.parentNode as HTMLElement;
                const parentTag = parent?.tagName.toLocaleLowerCase();
                if (parent && !schema.get("text")?.allowedParents.has(parentTag)) {
                    outOfOrderNodes[nodeHierarchy.inline].push(child)
                }
                continue;
            }
            else if (child.nodeType === Node.ELEMENT_NODE){
                const childEl = child as HTMLElement;
                const childTag = childEl.tagName.toLowerCase();
                const parent = childEl.parentElement;
                const parentTag = parent?.tagName.toLocaleLowerCase();
                const entry = schema.get(childTag);
                if (!entry) {
                    continue;
                }
                const { hierarchyLabel, allowedParents } = entry;

                if (parentTag && !allowedParents.has(parentTag)) {
                    outOfOrderNodes[hierarchyLabel].push(child)
                }
                const grandChildren = Array.from(childEl.childNodes);
                children.push(...grandChildren);
            }
            
        }
        return outOfOrderNodes;
    }
    /**
     * I split up these methods because I do not want the behavior of each type of node to be connected
     * The logic is slightly different for each so it feels cleaner this way even if it is more verbose
     */
    fixHierarchyViolations(outOfOrderNodes: Record<nodeHierarchy, Array<Node>>): void {
        const nodes = outOfOrderNodes;
        const nodeTypetoMethod: Record<nodeHierarchy, (node: Node) => void> = {
            [nodeHierarchy.inline]: organizeTextNode,
            [nodeHierarchy.textEl]: organizeTextElNode,
            [nodeHierarchy.listItem]: organizeListItemNode,
            [nodeHierarchy.lists]: organizeListNode,
            [nodeHierarchy.codeblock]: organizeCodeNode,
            /* 
            [nodeHierarchy.tableItem]: organizeTextNode, 
            [nodeHierarchy.tableRow]: organizeTextNode,
            [nodeHierarchy.table]: organizeTextNode,
            [nodeHierarchy.blockquote]: organizeTextNode,
            [nodeHierarchy.media]: organizeTextNode,
            */
        }

        for (const [k, array] of Object.entries(nodes)) {
            // walk backwards so that nodes deeper in hierarchy are fixed first
            for (let i = array.length - 1; i >= 0; i--) {
                const node = array[i];
                const method = nodeTypetoMethod[Number(k) as nodeHierarchy];
                if (method) {
                    const siblings = new Array();
                    siblings.push(node)
                    const parent = node.parentElement
                    const marker = document.createTextNode("");
                    parent?.insertBefore(marker, node)
                    // group adjacent bad nodes so that they can be wrapped together
                    while (i > 0) {
                        const next = array[i - 1];
                        const curr = array[i];

                        if (next.previousSibling === curr) {
                            siblings.push(next);
                            i--;
                        } else {
                            break;
                        }
                    }
                    const fragment = document.createDocumentFragment();
                    for (const node of siblings) {
                        fragment.appendChild(node);
                    }

                    const tempDiv = document.createElement("div");
                    tempDiv.appendChild(fragment);
                    marker.replaceWith(tempDiv)
                    method.call(this, tempDiv);
                }
            }
        }


        function organizeTextNode(textNode: Node): void {
            const parent = textNode.parentNode as HTMLElement;
            const parentTag = parent?.tagName.toLocaleLowerCase();
            if (parentTag === "ol" || parentTag === "ul") {
                const list = document.createElement("li");
                parent.insertBefore(list, textNode);
                list.appendChild(textNode);
            }
            else if (parentTag === "div") {
                const textEl = document.createElement("p");
                parent.insertBefore(textEl, textNode)
                textEl.appendChild(textNode);
            }
            else if (parentTag === "table" || parentTag === "tr") {
                parent.removeChild(textNode);
            }
            utils.replaceElementWithChildren(textNode as HTMLElement);
        }
        // text element nodes are defined as (h1-p)
        function organizeTextElNode(node: Node): void {
            const parent = node.parentNode as HTMLElement;
            const parentTag = parent?.tagName.toLocaleLowerCase();
            if (parentTag === "ol" || parentTag === "ul") {
                for (const child of node.childNodes) {
                    utils.changeElementTag(child as HTMLElement, "li");
                }
            }
            else if(parentTag === "li"){
                for (const child of node.childNodes) {
                    utils.replaceElementWithChildren(child as HTMLElement);
                }
            }
            else if(textTags.includes(parentTag)){
                utils.makeChildSiblingofParent(node as HTMLElement);
            }
            else if (parentTag === "a") {
                for (const child of node.childNodes) {
                    utils.replaceElementWithChildren(child as HTMLElement);
                }
            }
            else if (parentTag === "table" || parentTag === "tr") {
                parent.removeChild(node);
            }
            else if (parentTag === "code"){
                for (const child of node.childNodes) {
                    utils.replaceElementWithChildren(child as HTMLElement);
                }
            }
            utils.replaceElementWithChildren(node as HTMLElement);
        }
        function organizeListItemNode(node: Node): void {
            const parent = node.parentNode as HTMLElement;
            const parentTag = parent?.tagName.toLocaleLowerCase();
            if (parentTag === "div") {
                // move nested lists up
                const children = Array.from(node.childNodes);
                for (const child of children) {
                    const childEl = child as HTMLElement;
                    const nestedLists = childEl.querySelectorAll<HTMLElement>(":scope > ul, :scope > ol")
                    nestedLists.forEach((el) => {
                        utils.makeChildSiblingofParent(el as HTMLElement);
                    })
                }
                // convert lis to p
                for (const child of node.childNodes) {
                    const childEl = child as HTMLElement;
                    if(childEl.tagName.toLowerCase() == "li"){
                        utils.changeElementTag(childEl,"p");
                    }
                }
                
            }
            else if (textTags.includes(parentTag)) {
                for (const child of node.childNodes) {
                    utils.replaceElementWithChildren(child as HTMLElement);
                }
            }
            else if(parentTag === "li"){
                utils.makeChildSiblingofParent(node as HTMLElement);
            }
            else if (parentTag === "code"){
                for (const child of node.childNodes) {
                    utils.replaceElementWithChildren(child as HTMLElement);
                }
            }
            utils.replaceElementWithChildren(node as HTMLElement);
        }
        function organizeListNode(node: Node): void {
            const parent = node.parentNode as HTMLElement;
            let parentTag: string | undefined = parent?.tagName.toLowerCase();
            if (parentTag === "ol" || parentTag === "ul") {
                const listItem = document.createElement("li");
                parent.insertBefore(listItem, node);
                listItem.appendChild(node);
            }
            else if (textTags.includes(parentTag)) {
                while (parentTag && textTags.includes(parentTag)){
                    utils.makeChildSiblingofParent(node as HTMLElement);
                    parentTag = node.parentElement?.tagName.toLocaleLowerCase();
                }
                

            }
            else if (parentTag === "code") {
                while (parentTag && textTags.includes(parentTag)){
                    utils.makeChildSiblingofParent(node as HTMLElement);
                    parentTag = node.parentElement?.tagName.toLocaleLowerCase();
                }
                

            }
            utils.replaceElementWithChildren(node as HTMLElement);
        }
        function organizeCodeNode(node:Node): void{
            const parent = node.parentNode as HTMLElement;
            let parentTag: string | undefined = parent?.tagName.toLowerCase();
            if (parentTag === "ol" || parentTag === "ul") {
                const listItem = document.createElement("li");
                parent.insertBefore(listItem, node);
                listItem.appendChild(node);
            }
            else if (textTags.includes(parentTag)) {
                while (parentTag && textTags.includes(parentTag)){
                    utils.makeChildSiblingofParent(node as HTMLElement);
                    parentTag = node.parentElement?.tagName.toLocaleLowerCase();
                }
            }
            else if (parentTag === "a"){
                while (parentTag && textTags.includes(parentTag)){
                    utils.makeChildSiblingofParent(node as HTMLElement);
                    parentTag = node.parentElement?.tagName.toLocaleLowerCase();
                }
            }
            utils.replaceElementWithChildren(node as HTMLElement);
        }
    }
    removeEmptyNodes(root: Node): void {
        const rootEl = root as HTMLElement;
        const allNodes = rootEl.querySelectorAll<HTMLElement>(`${utils.BLOCK_SELECTOR}, ul, ol`);

        for (const node of allNodes) {
            const hasText = node.textContent?.trim().length! > 0;
            const hasBr   = node.querySelector("br") !== null;

            if (!hasText && !hasBr) {
                node.remove();
            }
        }
    }
}
