import { Scribby } from "./Scribby.js";

import { ToolbarDropdownButton } from "./DropdownButton.js";
import { ToolbarStyleButton, affectedElementType } from "./StyleButton.js";
import { ToolbarInsertButton, insertElementType } from "./InsertButton.js";
import { SpeechToText } from "./SpeechtoText.js";
import { LLMOutput } from "./LLMOutput.js";

export class Toolbar {
    scribby!: Scribby;
    el!: HTMLDivElement;
    textType: ToolbarDropdownButton;
    bold: ToolbarStyleButton;
    italic: ToolbarStyleButton;
    underline: ToolbarStyleButton;
    strikethrough: ToolbarStyleButton;
    alignLeft: ToolbarStyleButton;
    alignCenter: ToolbarStyleButton;
    alignRight: ToolbarStyleButton;
    codeBlock: ToolbarInsertButton;
    inlineCode: ToolbarStyleButton;
    anchor: ToolbarInsertButton;
    orderedList: ToolbarInsertButton;
    unorderedList: ToolbarInsertButton;
    speechToText: SpeechToText;
    LLMOutput: LLMOutput;

    constructor(
        scribby: Scribby,
    ) {
        this.scribby = scribby
        this.el = document.createElement("div");
        this.textType = new ToolbarDropdownButton(scribby, "Choose Font", [
            new ToolbarStyleButton(scribby, "Header 1", null, affectedElementType.Block, null, "h1"),
            new ToolbarStyleButton(scribby, "Header 2", null, affectedElementType.Block, null, "h2"),
            new ToolbarStyleButton(scribby, "Header 3", null, affectedElementType.Block, null, "h3"),
            new ToolbarStyleButton(scribby, "Header 4", null, affectedElementType.Block, null, "h4"),
            new ToolbarStyleButton(scribby, "Header 5", null, affectedElementType.Block, null, "h5"),
            new ToolbarStyleButton(scribby, "Header 6", null, affectedElementType.Block, null, "h6"),
            new ToolbarStyleButton(scribby, "Body", null, affectedElementType.Block, null, "p"),
        ]);
        this.bold = new ToolbarStyleButton(scribby, `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                <path stroke-linejoin="round" d="M6.75 3.744h-.753v8.25h7.125a4.125 4.125 0 0 0 0-8.25H6.75Zm0 0v.38m0 16.122h6.747a4.5 4.5 0 0 0 0-9.001h-7.5v9h.753Zm0 0v-.37m0-15.751h6a3.75 3.75 0 1 1 0 7.5h-6m0-7.5v7.5m0 0v8.25m0-8.25h6.375a4.125 4.125 0 0 1 0 8.25H6.75m.747-15.38h4.875a3.375 3.375 0 0 1 0 6.75H7.497v-6.75Zm0 7.5h5.25a3.75 3.75 0 0 1 0 7.5h-5.25v-7.5Z" />
            </svg>
            `, new Map([["font-weight", "bold"]]), affectedElementType.Span, "bold");
        this.italic = new ToolbarStyleButton(scribby, 
            `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5.248 20.246H9.05m0 0h3.696m-3.696 0 5.893-16.502m0 0h-3.697m3.697 0h3.803" />
            </svg>
            `, new Map([["font-style", "italic"]]), affectedElementType.Span, "italic");
        this.underline = new ToolbarStyleButton(scribby, 
            `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.995 3.744v7.5a6 6 0 1 1-12 0v-7.5m-2.25 16.502h16.5" />
            </svg>
            `, new Map([["text-decoration", "underline"]]), affectedElementType.Span, "underline");
        this.strikethrough = new ToolbarStyleButton(scribby, 
            `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 12a8.912 8.912 0 0 1-.318-.079c-1.585-.424-2.904-1.247-3.76-2.236-.873-1.009-1.265-2.19-.968-3.301.59-2.2 3.663-3.29 6.863-2.432A8.186 8.186 0 0 1 16.5 5.21M6.42 17.81c.857.99 2.176 1.812 3.761 2.237 3.2.858 6.274-.23 6.863-2.431.233-.868.044-1.779-.465-2.617M3.75 12h16.5" />
            </svg>

            `, new Map([["text-decoration", "line-through"]]), affectedElementType.Span, "strikethrough");
        this.alignLeft = new ToolbarStyleButton(scribby,   
            `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>format-align-left</title><path d="M3,3H21V5H3V3M3,7H15V9H3V7M3,11H21V13H3V11M3,15H15V17H3V15M3,19H21V21H3V19Z" /></svg>
            `, new Map([["text-align", "left"]]), affectedElementType.Block, "align-left");
        this.alignCenter = new ToolbarStyleButton(scribby, 
            `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>format-align-center</title><path d="M3,3H21V5H3V3M7,7H17V9H7V7M3,11H21V13H3V11M7,15H17V17H7V15M3,19H21V21H3V19Z" /></svg>
            `, new Map([["text-align", "center"]]), affectedElementType.Block, "align-center");
        this.alignRight = new ToolbarStyleButton(scribby,  
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>format-align-right</title><path d="M3,3H21V5H3V3M9,7H21V9H9V7M3,11H21V13H3V11M9,15H21V17H9V15M3,19H21V21H3V19Z" /></svg>`
            , new Map([["text-align", "right"]]), affectedElementType.Block, "align-right");
        this.codeBlock = new ToolbarInsertButton(scribby, 
            `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>code-braces</title><path d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z" /></svg>
            `, null, insertElementType.CodeBlock, "create-code-block");
        this.inlineCode = new ToolbarStyleButton(scribby,  
            `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>code-tags</title><path d="M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z" /></svg>
            `,
            new Map([
                ["background-color", "#f4f4f4"],
                ["padding", "2px 4px"],
                ["font-family", "Courier New', monospace;"],
                ["color", "#c7254e"]
            ]), affectedElementType.Span)
        this.anchor = new ToolbarInsertButton(scribby, 
            `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>link</title><path d="M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z" /></svg>
            `, null, insertElementType.Anchor, "create-anchor");
        this.orderedList = new ToolbarInsertButton(scribby, 
            `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>format-list-bulleted</title><path d="M7,5H21V7H7V5M7,13V11H21V13H7M4,4.5A1.5,1.5 0 0,1 5.5,6A1.5,1.5 0 0,1 4,7.5A1.5,1.5 0 0,1 2.5,6A1.5,1.5 0 0,1 4,4.5M4,10.5A1.5,1.5 0 0,1 5.5,12A1.5,1.5 0 0,1 4,13.5A1.5,1.5 0 0,1 2.5,12A1.5,1.5 0 0,1 4,10.5M7,19V17H21V19H7M4,16.5A1.5,1.5 0 0,1 5.5,18A1.5,1.5 0 0,1 4,19.5A1.5,1.5 0 0,1 2.5,18A1.5,1.5 0 0,1 4,16.5Z" /></svg>
            `, null, insertElementType.OrderedList, "create-ordered-list");
        this.unorderedList = new ToolbarInsertButton(scribby, 
            `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>format-list-numbered</title><path d="M7,13V11H21V13H7M7,19V17H21V19H7M7,7V5H21V7H7M3,8V5H2V4H4V8H3M2,17V16H5V20H2V19H4V18.5H3V17.5H4V17H2M4.25,10A0.75,0.75 0 0,1 5,10.75C5,10.95 4.92,11.14 4.79,11.27L3.12,13H5V14H2V13.08L4,11H2V10H4.25Z" /></svg>
            `, null, insertElementType.UnorderedList, "create-unordered-list");
        this.speechToText = new SpeechToText(scribby, 
            `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>microphone</title><path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z" /></svg>
            `);
        this.LLMOutput = new LLMOutput(scribby, 
            `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>robot-happy-outline</title><path d="M10.5 15.5C10.5 15.87 10.4 16.2 10.22 16.5C9.88 15.91 9.24 15.5 8.5 15.5S7.12 15.91 6.78 16.5C6.61 16.2 6.5 15.87 6.5 15.5C6.5 14.4 7.4 13.5 8.5 13.5S10.5 14.4 10.5 15.5M23 15V18C23 18.55 22.55 19 22 19H21V20C21 21.11 20.11 22 19 22H5C3.9 22 3 21.11 3 20V19H2C1.45 19 1 18.55 1 18V15C1 14.45 1.45 14 2 14H3C3 10.13 6.13 7 10 7H11V5.73C10.4 5.39 10 4.74 10 4C10 2.9 10.9 2 12 2S14 2.9 14 4C14 4.74 13.6 5.39 13 5.73V7H14C17.87 7 21 10.13 21 14H22C22.55 14 23 14.45 23 15M21 16H19V14C19 11.24 16.76 9 14 9H10C7.24 9 5 11.24 5 14V16H3V17H5V20H19V17H21V16M15.5 13.5C14.4 13.5 13.5 14.4 13.5 15.5C13.5 15.87 13.61 16.2 13.78 16.5C14.12 15.91 14.76 15.5 15.5 15.5S16.88 15.91 17.22 16.5C17.4 16.2 17.5 15.87 17.5 15.5C17.5 14.4 16.61 13.5 15.5 13.5Z" /></svg>
            `);
    }
    mount() {
        this.el.classList.add("toolbar");
        this.textType.mount();
        this.bold.mount();
        this.italic.mount();
        this.underline.mount();
        this.strikethrough.mount();
        this.alignLeft.mount();
        this.alignCenter.mount();
        this.alignRight.mount();
        this.codeBlock.mount();
        this.inlineCode.mount();
        this.anchor.mount();
        this.orderedList.mount();
        this.unorderedList.mount();
        this.speechToText.mount();
        this.LLMOutput.mount();

        this.el.appendChild(this.textType.el);
        this.el.appendChild(this.bold.el);
        this.el.appendChild(this.italic.el);
        this.el.appendChild(this.underline.el);
        this.el.appendChild(this.strikethrough.el);
        this.el.appendChild(this.alignLeft.el);
        this.el.appendChild(this.alignCenter.el);
        this.el.appendChild(this.alignRight.el);
        this.el.appendChild(this.codeBlock.el);
        this.el.appendChild(this.inlineCode.el);
        this.el.appendChild(this.anchor.el);
        this.el.appendChild(this.orderedList.el);
        this.el.appendChild(this.unorderedList.el);
        this.el.appendChild(this.speechToText.el);
        this.el.appendChild(this.LLMOutput.el);

        return this;
    }
}