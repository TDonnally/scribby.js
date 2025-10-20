class Scribby{
    selector: string; 
    content: string;
    el!: HTMLDivElement;
    toolbar!: Toolbar;
    textElement: string;
    styleElements: Set<string>;

    constructor(
        selector = "",
        content = `
            <h1>Hi there!</h1>
            <p>Jot something down.</p>
        `,
    ){
        this.selector = selector;
        this.el;
        this.content = content;
        this.toolbar;
        this.textElement = "p";
        this.styleElements = new Set;
    }
    mount(){
        const container = document.querySelector<HTMLDivElement>(`${this.selector}`);
        if (!container){
            throw new Error(`No element with selector: ${this.selector}`);
        }

        this.el = document.createElement("div");
        this.el.contentEditable = 'true';
        this.el.classList.add("scribby");
        this.el.innerHTML = this.content;

        container.appendChild(this.el);

        // mount toolbar
        this.toolbar = new Toolbar(this).mount();
        this.el.insertAdjacentElement("beforebegin",this.toolbar.el);

        this.el.addEventListener("keydown",(e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                const range = sel.getRangeAt(0);
                range.deleteContents(); 

                if (e.shiftKey){
                    const br = document.createElement("br");
                    range.insertNode(br);

                    const spacer = document.createTextNode("\u200B"); 
                    br.after(spacer);

                    const newRange = document.createRange();
                    newRange.setStartAfter(spacer);
                    newRange.collapse(true);

                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
                else{
                    const newLineEl = document.createElement(this.textElement);
                    let cursorEl = newLineEl;
                    const spacer = document.createTextNode("\u200B");
                    for (const element of this.styleElements){
                        const el = document.createElement(element);
                        cursorEl.append(el);
                        cursorEl = el;
                    }

                    
                    cursorEl.appendChild(spacer);

                    this.el.appendChild(newLineEl)

                    const newRange = document.createRange();
                    newRange.setStart(spacer, spacer.length);
                    newRange.collapse(true);

                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
            }
        })
        
        return this
    }

}
class Toolbar{
    scribby!: Scribby;
    el!: HTMLDivElement;
    //textType: ToolbarButton;
    bold: ToolbarButton;
    italic: ToolbarButton;
    underline: ToolbarButton;
    code: ToolbarButton;
    codeBlock: ToolbarButton;
    //insert: ToolbarButton;

    constructor(
        scribby = new Scribby()
    ){
        this.scribby = scribby
        this.el = document.createElement("div");
        //this.insert = document.createElement("button");
        this.bold = new ToolbarButton(scribby, "B", "strong");
        this.italic = new ToolbarButton(scribby, "I", "i");
        this.underline = new ToolbarButton(scribby, "U", "u");
        this.code = new ToolbarButton(scribby, "<>", "code");
        this.codeBlock = new ToolbarButton(scribby, "[</>]", "chroma");
        //this.insert = document.createElement("button");
    }
    mount(){
        this.el.classList.add("toolbar");
        this.bold.mount();
        this.italic.mount();
        this.underline.mount();
        this.code.mount();
        this.codeBlock.mount();

        this.el.appendChild(this.bold.el)
        this.el.appendChild(this.italic.el)
        this.el.appendChild(this.underline.el)
        this.el.appendChild(this.code.el)
        this.el.appendChild(this.codeBlock.el)
        
        return this;
    }
}

class ToolbarButton{
    scribby: Scribby
    innerContent: string;
    wrapperElement: string;
    attributes: Map<string, any>;
    el!: HTMLButtonElement;
    constructor(
        scribby = new Scribby(),
        innerContent = "",
        wrapperElement = "",
        attributes = new Map(),
        el = document.createElement("button"),
    ){
        this.scribby = scribby;
        this.el = el;
        this.innerContent = innerContent;
        this.wrapperElement = wrapperElement;
        this.attributes = attributes;
    }
    mount(){
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        this.el.addEventListener("click", (e) => {
            if(this.scribby.styleElements.has(this.wrapperElement)){
                this.scribby.styleElements.delete(this.wrapperElement)
            }
            else{
                this.scribby.styleElements.add(this.wrapperElement)
            }
            console.log(this.scribby.styleElements)
        })
    }
}

function addElemet(){

}

/*
class ToolbarDropdownButton{
    innerContent: string;
    dropdownMenu: ToolbarButton[];
}
*/

/* text Hierarchy toggle */

/* lists */

/* make bold/italic/underlines/strikethrough */

/* links */

/* tables (this is going to suck) */

/* colors will be implemented like so:
This is [important text]{style = [color: #0000]}

Will need to:

parse html and create it afterwards and create the process back and forth. 
*/

/* convert between md and html */

(() => {
    let scribby = new Scribby('#scribby-editor').mount();
    let scribby2 = new Scribby('#scribby-editor2').mount();
    console.log(scribby)
    console.log("scribby!")
})();