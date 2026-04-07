const tpl = document.createElement("template");

tpl.innerHTML = `

`

export class AudioVisualizer extends HTMLElement{
    connectedCallback(){
        this.appendChild(tpl.content.cloneNode(true));
    }
}