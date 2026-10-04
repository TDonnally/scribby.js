import type { Scribby } from "../../Scribby.js"
import * as utils from "../../../utilities/utilities.js"

export function boldSelection(scribby: Scribby) {
    const event = new CustomEvent('bold', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);

}
export function italicizeSelection(scribby: Scribby) {
    const event = new CustomEvent('italic', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function underlineSelection(scribby: Scribby) {
    const event = new CustomEvent('underline', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function strikethroughSelection(scribby: Scribby) {
    const event = new CustomEvent('strikethrough', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function alignLeftSelection(scribby: Scribby) {
    const event = new CustomEvent('align-left', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function alignCenterSelection(scribby: Scribby) {
    const event = new CustomEvent('align-center', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function alignRightSelection(scribby: Scribby) {
    const event = new CustomEvent('align-right', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function insertCanvas(scribby: Scribby) {
    const event = new CustomEvent('create-canvas', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function insertCodeBlock(scribby: Scribby) {
    const event = new CustomEvent('create-code-block', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function insertInlineCode(scribby: Scribby) {
    const event = new CustomEvent('create-inline-code', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}

export function insertLatex(scribby: Scribby) {
    const event = new CustomEvent('create-latex', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function insertAnchor(scribby: Scribby) {
    const event = new CustomEvent('create-anchor', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function insertOrderedList(scribby: Scribby) {
    const event = new CustomEvent('create-ordered-list', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function insertUnorderedList(scribby: Scribby) {
    const event = new CustomEvent('create-unordered-list', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function startMicrophoneRecording(scribby: Scribby) {
    const event = new CustomEvent('start-microphone-recording', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function startTabRecording(scribby: Scribby) {
    const event = new CustomEvent('start-tab-recording', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}
export function insertGenerationBlock(scribby: Scribby) {
    const event = new CustomEvent('create-generation-block', {
        bubbles: true,
        cancelable: true
    });
    scribby.el.dispatchEvent(event);
}

/**
 * TODO: refactor this function next time it is touched
 * very hard to read.
 */
export function activateToolbarStyleButtons(scribby: Scribby) {
    const range = scribby.selection;
    if (!range) return;
    /**
     * steps: 
     * 1) check all blocks. 
     * 2) If no blocks, get closest block 
     * 3) Activate Block buttons
     * 4) check if contents would be one contiguous span 
     * 5) If not return 
     * 6) else we grab all styles and classes 
     * 7) Activate those buttons
     * 8) Change state of dropdown based on what blocks are selected
     */

    // handle blocks
    let blocks = utils.getBlockRanges(range.cloneRange(), scribby.el);
    const blockTags: Array<string> = [];

    for (const block of blocks) {
        const el = block.block as HTMLElement;
        if (!blockTags.includes(el.tagName.toLowerCase())) {
            blockTags.push(el.tagName.toLowerCase());
        }
        if (blockTags.length > 1) break;
    }

    const dropDownOpen = document.querySelector(".dropdown-open");

    dropDownOpen!.textContent = blockTags.length > 1 ? "Body" : scribby.toolbar.el.querySelector(`[data-tag="${blockTags[0]}"]`)?.textContent ?? "Body";

    let attributes: Record<string, string> = {}
    for (var i = 0; i < blocks.length; i++) {
        const el = blocks[i].block as HTMLElement;
        let newAttributes: Record<string, string> = {}
        if (i === 0) {
            for (let j = 0; j < el.style.length; j++) {
                const prop = el.style[j];
                const value = el.style.getPropertyValue(prop);
                attributes[prop] = value;
            }
        }
        for (let j = 0; j < el.style.length; j++) {
            const prop = el.style[j];
            const value = el.style.getPropertyValue(prop);
            if (attributes[prop] == value) {
                newAttributes[prop] = value;
            }
        }
        attributes = newAttributes;
    }
    const blockStyleButtons = scribby.toolbar.el.querySelectorAll<HTMLElement>(`[data-button-type="block"]`);
    blockStyleButtons.forEach((el) => {
        const key = el.dataset.key;
        if (key && el.dataset.attribute == attributes[key]) {
            el.classList.add("active");
        }
        else {
            el.classList.remove("active");
        }
    })

    // handle spans
    const container = range.endContainer as HTMLElement
    const commonAncestorParent = range.commonAncestorContainer.parentElement;
    const classes: Record<string, Array<string>> = { "class": [] }
    attributes = {}
    if (commonAncestorParent?.tagName.toLowerCase() == "span") {
        const classList = Array.from(commonAncestorParent.classList);
        classes["class"] = classList
        const style = commonAncestorParent.getAttribute("style");
        if (style) {
            style.split(";").forEach(rule => {
                const [prop, value] = rule.split(":").map(s => s.trim());
                if (prop && value) attributes[prop] = value;
            });
        }

    }
    else if (range.collapsed && container.nodeType === Node.ELEMENT_NODE && container.tagName.toLowerCase() === "span") {
        const classList = Array.from(container.classList);
        classes["class"] = classList
        const style = container.getAttribute("style");
        if (style) {
            style.split(";").forEach(rule => {
                const [prop, value] = rule.split(":").map(s => s.trim());
                if (prop && value) attributes[prop] = value;
            });
        }
    }
    else {
        for (var i = 0; i < blocks.length; i++) {
            const blockContent = blocks[i].blockRange.cloneContents();
            const nodes = blockContent.childNodes;
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.nodeType === Node.TEXT_NODE) {
                    const spanStyleButtons = scribby.toolbar.el.querySelectorAll<HTMLElement>(`[data-button-type="span"]`);
                    spanStyleButtons.forEach((el) => {
                        el.classList.remove("active");
                    })
                    return;
                }
                const el = node as HTMLElement;
                const classList = Array.from((node as HTMLElement).classList);
                if (i === 0) {
                    classes["class"] = classList
                    const style = el.getAttribute("style");
                    if (style) {
                        style.split(";").forEach(rule => {
                            const [prop, value] = rule.split(":").map(s => s.trim());
                            if (prop && value) attributes[prop] = value;
                        });
                    }
                }
                else {
                    const newClassList = [];
                    const newAttributes: Record<string, string> = {}

                    // keep consistent classes
                    for (const nodeClass of classList) {
                        if (classes["class"].includes(nodeClass)) {
                            newClassList.push(nodeClass);
                        }
                    }
                    classes["class"] = newClassList;
                    // keep consisten attributes
                    const style = el.getAttribute("style");
                    if (style) {
                        style.split(";").forEach(rule => {
                            const [prop, value] = rule.split(":").map(s => s.trim());
                            if (attributes[prop] == value) newAttributes[prop] = value;
                        });
                    }
                    attributes = newAttributes;
                }
            }
        }
    }

    const spanStyleButtons = scribby.toolbar.el.querySelectorAll<HTMLElement>(`[data-button-type="span"]`);
    spanStyleButtons.forEach((el) => {
        const key = el.dataset.key;
        const attr = el.dataset.attribute;

        const matchesAttr =
            !!key && typeof attr === "string" && attr === attributes[key];

        const matchesClass =
            typeof attr === "string" && classes["class"].includes(attr);

        if (matchesAttr || matchesClass) {
            el.classList.add("active");
        }
        else {
            el.classList.remove("active");
        }
    })
}