class Scribby{
    selector: string; 
    content: string;
    el!: HTMLDivElement;
    toolbar!: Toolbar;

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
    }
    mount(){
        const el = document.querySelector<HTMLDivElement>(`${this.selector}`);
        if (!el){
            throw new Error(`No element with selector: ${this.selector}`);
        }
        this.el = el
        this.el.classList.add("scribby");
        this.el.innerHTML = this.content;

        // mount toolbar
        this.toolbar = new Toolbar(this).mount();
        this.el.appendChild(this.toolbar.el);
        
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
            this.scribby.selector = this.wrapperElement;
            console.log(this.scribby);
        })
    }
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