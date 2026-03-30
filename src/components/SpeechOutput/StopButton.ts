const tpl = document.createElement("template");

tpl.innerHTML = `
<button>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>stop</title><path d="M18,18H6V6H18V18Z" /></svg>
</button>
`

export class StopButton extends HTMLElement{
    btn!: HTMLButtonElement;

    connectedCallback(){
        this.appendChild(tpl.content.cloneNode(true));
        this.btn = this.querySelector("button")!;

        this.btn.addEventListener("click", (e) => {
            const stopRecording = new CustomEvent("stop-recording");
            document.dispatchEvent(stopRecording);
        })
    }
}