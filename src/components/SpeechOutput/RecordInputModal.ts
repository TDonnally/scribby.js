const tpl = document.createElement("template");

tpl.innerHTML = `
    <button type="button" class="record-input-choice" data-input="mic"><svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>microphone</title><path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"></path></svg></button>
    <button type="button" class="record-input-choice" data-input="speaker"><svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>headphones</title><path d="M12,1C7,1 3,5 3,10V17A3,3 0 0,0 6,20H9V12H5V10A7,7 0 0,1 12,3A7,7 0 0,1 19,10V12H15V20H18A3,3 0 0,0 21,17V10C21,5 16.97,1 12,1Z"></path></svg></button>
`;

export class RecordInputModal extends HTMLElement {
    connectedCallback() {
        if (!this.firstChild) {
            this.classList.add("record-input-menu", "modal");
            this.appendChild(tpl.content.cloneNode(true));
        }

        this.querySelectorAll(".record-input-choice").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                const input = (btn as HTMLElement).dataset.input;
                if (!input) return;

                this.dispatchEvent(new CustomEvent("choose-record-input", {
                    bubbles: true,
                    composed: true,
                    detail: { input }
                }));
            });
        });
    }
}