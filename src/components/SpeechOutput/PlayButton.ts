const tpl = document.createElement("template");
tpl.innerHTML = `
<button><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>play</title><path d="M8,5.14V19.14L19,12.14L8,5.14Z" /></svg></button>
`
export class PlayButton extends HTMLElement{
    btn!: HTMLButtonElement;

    connectedCallback(){
        this.appendChild(tpl.content.cloneNode(true));
        this.btn = this.querySelector("button")!;

        this.btn.addEventListener("click", (e) => {
            const playRecording = new CustomEvent("play-audio");
            document.dispatchEvent(playRecording);
        })
    }
}