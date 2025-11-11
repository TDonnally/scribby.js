import { Scribby } from "./Scribby.js";
import { ToolbarStyleButton } from "./StyleButton.js";
import { ToolbarInsertButton } from "./InsertButton";


export class ToolbarDropdownButton{
    scribby!: Scribby;
    el!: HTMLDivElement;
    innerContent: string;
    dropdownMenuButtons: (ToolbarStyleButton | ToolbarInsertButton)[];
    constructor(
        scribby: Scribby,
        innerContent: string,
        dropdownMenuButtons: (ToolbarStyleButton | ToolbarInsertButton)[],
    ){
        this.scribby = scribby;
        this.innerContent = innerContent;
        this.dropdownMenuButtons = dropdownMenuButtons;
        this.el;
    }
    mount(){
        this.el = document.createElement("div");
        this.el.classList.add("dropdown-menu-container");
        const openButton = document.createElement("button");
        
        const buttonsContainer = document.createElement("div");
        buttonsContainer.classList.add("dropdown-menu");
        this.dropdownMenuButtons.forEach(btn => {
            btn.mount();
            buttonsContainer.appendChild(btn.el);
        })
        openButton.innerText = this.dropdownMenuButtons[0].el.innerText;
        this.el.append(openButton, buttonsContainer)
    }
}