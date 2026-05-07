const tpl = document.createElement("template");

tpl.innerHTML = `
<div class="record-input-menu modal">
    <button type="button" class="record-input-choice" data-input="mic">Microphone</button>
    <button type="button" class="record-input-choice" data-input="speaker">Tab / Speaker</button>
</div>
`;

export class RecordInputModal extends HTMLElement {
    connectedCallback() {
        if (!this.firstChild) {
            this.appendChild(tpl.content.cloneNode(true));
        }

        this.querySelectorAll(".record-input-choice").forEach((btn) => {
            btn.addEventListener("click", () => {
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