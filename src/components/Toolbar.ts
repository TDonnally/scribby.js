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
    codeBlock: ToolbarStyleButton;
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
            new ToolbarStyleButton(scribby, "p", null, affectedElementType.Block, null, "p"),
        ]);
        this.bold = new ToolbarStyleButton(scribby, "B", new Map([["font-weight", "bold"]]), affectedElementType.Span, "bold");
        this.italic = new ToolbarStyleButton(scribby, "I", new Map([["font-style", "italic"]]), affectedElementType.Span, "italic");
        this.underline = new ToolbarStyleButton(scribby, "U", new Map([["text-decoration", "underline"]]), affectedElementType.Span, "underline");
        this.strikethrough = new ToolbarStyleButton(scribby, "S", new Map([["text-decoration", "line-through"]]), affectedElementType.Span, "strikethrough");
        this.alignLeft = new ToolbarStyleButton(scribby, "L", new Map([["text-align", "left"]]), affectedElementType.Block, "align-left");
        this.alignCenter = new ToolbarStyleButton(scribby, "=", new Map([["text-align", "center"]]), affectedElementType.Block, "align-center");
        this.alignRight = new ToolbarStyleButton(scribby, "R", new Map([["text-align", "right"]]), affectedElementType.Block, "align-right");
        this.codeBlock = new ToolbarStyleButton(scribby, "{}", null, affectedElementType.Block, null,"code");
        this.inlineCode = new ToolbarStyleButton(scribby, "<>",
            new Map([
                ["background-color", "#f4f4f4"],
                ["padding", "2px 4px"],
                ["font-family", "Courier New', monospace;"],
                ["color", "#c7254e"]
            ]), affectedElementType.Span)
        this.anchor = new ToolbarInsertButton(scribby, "a", null, insertElementType.Anchor, "create-anchor");
        this.orderedList = new ToolbarInsertButton(scribby, "ol", null, insertElementType.OrderedList, "create-ordered-list");
        this.unorderedList = new ToolbarInsertButton(scribby, "ul", null, insertElementType.UnorderedList, "create-unordered-list");
        this.speechToText = new SpeechToText(scribby, "listen!");
        this.LLMOutput = new LLMOutput(scribby, "AI")
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