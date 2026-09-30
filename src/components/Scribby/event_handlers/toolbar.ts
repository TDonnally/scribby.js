import type { Scribby } from "../../Scribby.js"

export function boldSelection(scribby: Scribby, e: Event){
    const event = new CustomEvent('bold', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);

}
export function italicizeSelection(scribby: Scribby, e: Event){
    const event = new CustomEvent('italic', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function underlineSelection(scribby: Scribby, e: Event){
    const event = new CustomEvent('underline', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function strikethroughSelection(scribby: Scribby, e: Event){
    const event = new CustomEvent('strikethrough', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function alignLeftSelection(scribby: Scribby, e: Event){
    const event = new CustomEvent('align-left', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}   
export function alignCenterSelection(scribby: Scribby, e: Event){
    const event = new CustomEvent('align-center', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function alignRightSelection(scribby: Scribby, e: Event){
    const event = new CustomEvent('align-right', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function insertCanvas(scribby: Scribby, e: Event){
    const event = new CustomEvent('create-canvas', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function insertCodeBlock(scribby: Scribby, e: Event){
    const event = new CustomEvent('create-code-block', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function insertInlineCode(scribby: Scribby, e: Event){
    const event = new CustomEvent('create-inline-code', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}

export function insertLatex(scribby: Scribby, e: Event){
    const event = new CustomEvent('create-latex', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function insertOrderedList(scribby: Scribby, e: Event){
    const event = new CustomEvent('create-ordered-list', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function insertUnorderedList(scribby: Scribby, e: Event){
    const event = new CustomEvent('create-unordered-list', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function startMicrophoneRecording(scribby: Scribby, e: Event){
    const event = new CustomEvent('start-microphone-recording', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function startTabRecording(scribby: Scribby, e: Event){
    const event = new CustomEvent('start-tab-recording', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}
export function insertGenerationBlock(scribby: Scribby, e: Event){
    const event = new CustomEvent('create-generation-block', {
        bubbles: true, 
        cancelable: true 
    });
    scribby.el.dispatchEvent(event);
}