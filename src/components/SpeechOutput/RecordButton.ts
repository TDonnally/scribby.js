const tpl = document.createElement("template");

tpl.innerHTML = `
<button>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>record</title><path d="M19,12C19,15.86 15.86,19 12,19C8.14,19 5,15.86 5,12C5,8.14 8.14,5 12,5C15.86,5 19,8.14 19,12Z" /></svg>
</button>
`

export class RecordButton extends HTMLElement{
    btn!: HTMLButtonElement;

    connectedCallback(){
        this.appendChild(tpl.content.cloneNode(true));
        this.btn = this.querySelector("button")!;

        this.btn.addEventListener("click", (e) => {
            const startRecording = new CustomEvent("start-recording", {
                bubbles: true
            });
            this.dispatchEvent(startRecording);
        })
    }
}