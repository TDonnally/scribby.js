const playSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <title>play</title>
    <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
</svg>
`;

const pauseSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <title>pause</title>
    <path d="M14,19H18V5H14M6,19H10V5H6V19Z" />
</svg>
`;

const tpl = document.createElement("template");
tpl.innerHTML = `
<button type="button">${playSvg}</button>
`;

export class PlayButton extends HTMLElement {
    btn!: HTMLButtonElement;

    connectedCallback() {
        if (!this.firstChild) {
            this.appendChild(tpl.content.cloneNode(true));
        }

        this.btn = this.querySelector("button")!;

        this.syncDisabled();

        this.btn.addEventListener("click", () => {
            if (this.hasAttribute("disabled")) {
                return;
            }

            const playRecording = new CustomEvent("play-audio", {
                bubbles: true,
            });

            this.dispatchEvent(playRecording);
        });
    }

    static get observedAttributes() {
        return ["disabled"];
    }

    attributeChangedCallback() {
        this.syncDisabled();
    }

    setPlaying(playing: boolean) {
        if (!this.btn) return;

        this.btn.innerHTML = playing ? pauseSvg : playSvg;
        this.setAttribute("aria-label", playing ? "Pause audio" : "Play audio");
    }

    private syncDisabled() {
        if (!this.btn) return;

        this.btn.disabled = this.hasAttribute("disabled");
        this.btn.toggleAttribute("disabled", this.hasAttribute("disabled"));
    }
}