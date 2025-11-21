import { Scribby } from "./Scribby.js";

export class SpeechToText {
    scribby: Scribby;
    innerContent: string;
    el!: HTMLButtonElement;
    recognition!: any;
    outputEl!: HTMLParagraphElement;
    constructor(
        scribby: Scribby,
        innerContent: string,
    ) {
        this.scribby = scribby;
        this.innerContent = innerContent;
        this.el = document.createElement("button");
    }
    private isListening = false;
    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;
        
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            const recognition = this.recognition;
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            let interimSpan: HTMLSpanElement | null = null;

            recognition.onresult = (event: SpeechRecognitionEvent) => {
                const current = event.resultIndex;
                const transcript = event.results[current][0].transcript;

                if (event.results[current].isFinal) {
                    if (interimSpan) {
                        interimSpan.remove();
                        interimSpan = null;
                    }
                    if (this.outputEl.querySelector('span[style*="color"]')) {
                        this.outputEl.innerHTML = '';
                    }
                    this.outputEl.appendChild(document.createTextNode(transcript + ' '));

                } else {
                    if (!interimSpan) {
                        interimSpan = document.createElement('span');
                        interimSpan.style.color = '#999';
                        this.outputEl.appendChild(interimSpan);
                    }
                    interimSpan.textContent = transcript;
                }
            };

            recognition.onstart = () => {
                console.log('Voice recognition started');
                this.el.classList.add("active");
            };

            recognition.onend = () => {
                this.isListening = false;
                this.el.classList.remove("active");
            };
            recognition.onerror = () => {
                this.isListening = false;
            };
        }
        this.el.addEventListener("click", (e) => {
            const sel = this.scribby.selection;
            const output = document.createElement("p");
            this.outputEl = output;
            if (!sel || sel.rangeCount === 0) {
                this.scribby.el.appendChild(output);
            } else {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(output);
                range.selectNodeContents(output);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            if (this.isListening) {
                this.recognition.stop();
                this.isListening = false;
                
            } else {
                this.recognition.start();
                this.isListening = true;
                
            }
        });
    }
}