import { Scribby } from "./Scribby.js";

export class InsertModal{
    scribby!: Scribby;
    innerContent: string;
    modalForm: HTMLFormElement;
    submitButton: HTMLButtonElement;
    rangeRect: DOMRect;
    resolveFn!: (value: Record<string, string> | null) => void;
    constructor(
        scribby: Scribby,
        innerContent: string,
        rangeRect: DOMRect
    ){
        this.scribby = scribby;
        this.innerContent = innerContent;
        this.rangeRect = rangeRect;
        this.modalForm = document.createElement("form");
        this.submitButton = document.createElement("button");
        this.submitButton.type = "submit"
        this.submitButton.innerText = "Create";
        
        this.modalForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const formData = new FormData(this.modalForm);
            const values: Record<string, string> = {};
            
            for (const [key, value] of formData.entries()) {
                values[key] = value.toString();
            }
            
            this.resolveFn(values);
            this.unmount();
        });
    }
    mount(){
        this.modalForm.classList.add("modal");
        this.modalForm.innerHTML = this.innerContent;
        this.modalForm.append(this.submitButton);
        this.scribby.el.parentElement!.append(this.modalForm);
        // positioning
        const modalRect = this.modalForm.getBoundingClientRect();
        const left = this.rangeRect.left + (this.rangeRect.width / 2) - (modalRect.width / 2);
        const top = this.rangeRect.top - modalRect.height - 10;
        const adjustedLeft = Math.max(10, Math.min(left, window.innerWidth - modalRect.width - 10));
        const adjustedTop = Math.max(10, top);
        
        this.modalForm.style.left = `${adjustedLeft}px`;
        this.modalForm.style.top = `${adjustedTop}px`;
        
        const firstInput = this.modalForm.querySelector("input");
        firstInput!.focus();
    }
    unmount() {
        this.modalForm.remove();
    }
    submission(): Promise<Record<string, string> | null> {
        return new Promise((resolve) => {
            this.resolveFn = resolve;
            this.mount();
        });

    }
}