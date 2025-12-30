export const activateStyleButtons = new CustomEvent('activate-style-buttons', {
    bubbles: true, 
    cancelable: true 
});
export const stopListening = new CustomEvent('stop-listening', {
    bubbles: true, 
    cancelable: true 
});

// styling
export const bold = new CustomEvent('bold', {
    bubbles: true, 
    cancelable: true 
});
export const italic = new CustomEvent('italic', {
    bubbles: true, 
    cancelable: true 
});
export const underline = new CustomEvent('underline', {
    bubbles: true, 
    cancelable: true 
});
export const strikethrough = new CustomEvent('strikethrough', {
    bubbles: true, 
    cancelable: true 
});
export const alignLeft = new CustomEvent('align-left', {
    bubbles: true, 
    cancelable: true 
});
export const alignCenter = new CustomEvent('align-center', {
    bubbles: true, 
    cancelable: true 
});
export const alignRight = new CustomEvent('align-right', {
    bubbles: true, 
    cancelable: true 
});

// Element insertion
export const createOrderedList = new CustomEvent('create-ordered-list', {
    bubbles: true, 
    cancelable: true 
});
export const createUnorderedList = new CustomEvent('create-unordered-list', {
    bubbles: true, 
    cancelable: true 
});
export const createAnchor = new CustomEvent('create-anchor', {
    bubbles: true, 
    cancelable: true 
});
export const createCodeBlock = new CustomEvent('create-code-block', {
    bubbles: true, 
    cancelable: true 
});