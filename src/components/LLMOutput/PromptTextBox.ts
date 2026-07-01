const tpl = document.createElement("template");
tpl.innerHTML = `
    <div class="text-box">
        <button data-action="send">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <title>send</title>
                <path d="M2,21L23,12L2,3V10L17,12L2,14V21Z" />
            </svg>
        </button>
        <textarea name="summary-message" rows="2" placeholder="Want to change anything else?"></textarea>
    </div>
`

export class PromptTextBox extends HTMLElement{
    sendButton!: HTMLButtonElement;
    textArea!: HTMLTextAreaElement;

    connectedCallback(){
        this.appendChild(tpl.content.cloneNode(true));

        this.sendButton = this.querySelector('[data-action="send"]')!;

        this.sendButton.addEventListener("click", (e) => {
            
        })

    }
    disconnectedCallback(){

    }
}