

class Scribby{
    selector: string; 
    content: string;
    el!: HTMLDivElement;
    toolbar: Toolbar;

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
        this.toolbar = new Toolbar().init();
    }
    init(){
        const el = document.querySelector<HTMLDivElement>(`${this.selector}`);
        if (!el){
            throw new Error(`No element with selector: ${this.selector}`);
        }
        this.el = el
        this.el.classList.add("scribby");
        this.el.innerHTML = this.content;
        
        this.toolbar = new Toolbar().init();
        this.el.appendChild(this.toolbar.el);
        
        return this
    }
}
class Toolbar{
    el!: HTMLDivElement;
    constructor(){
        this.el = document.createElement("div");
    }
    init(){
        this.el.classList.add("toolbar");

        const toolbarHTML = `
            <input name = "test" placeholder = "test"/>
        `
        this.el.innerHTML = toolbarHTML
        
        return this;
    }
}
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
    let scribby = new Scribby('#scribby-editor').init();
    let scribby2 = new Scribby('#scribby-editor2').init();
    console.log(scribby)
    console.log("scribby!")
})();