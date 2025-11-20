import { Scribby } from "./Scribby.js";

export class LLMOutput {
    scribby: Scribby;
    innerContent: string;
    el!: HTMLButtonElement;
    constructor(
        scribby: Scribby,
        innerContent: string,
    ) {
        this.scribby = scribby;
        this.innerContent = innerContent;
        this.el = document.createElement("button");
    }
    private isGenerating = false;
    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;

        this.el.addEventListener("click", async (e) => {
            if (!this.isGenerating){
                this.isGenerating = true;

                const parser = new DOMParser();

                const sel = this.scribby.selection;
                if (!sel || sel.rangeCount === 0) return;
                const range = sel.getRangeAt(0);
                const input = range.toString();

                this.scribby.el.classList.add("disabled");
                this.scribby.el.contentEditable = "false";
                this.el.classList.add("active");

                const output = await this.generateOutput(input)
                const parsedOutput = parser.parseFromString(output, 'text/html');

                const fragment = document.createDocumentFragment();
                for (const node of Array.from(parsedOutput.body.childNodes)) {
                    fragment.appendChild(node); 
                }

                this.scribby.el.classList.remove("disabled");
                this.scribby.el.contentEditable = "true"
                this.el.classList.remove("active");

                range.deleteContents();
                range.insertNode(fragment);
                this.isGenerating = false;
                
            }
            
        });
    }
    async generateOutput(input: string): Promise<any> {
        const url = "http://localhost:8080/doc/summarize"
        const options = {
            method: "POST",
            body: JSON.stringify({
                content: input
            })
        }
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`);
            }
            const output = await response.text()
            console.log(output);
            return output;
        }
        catch (error: unknown) {
            if (error instanceof Error) {
                console.log(error.message);
            } else {
                console.log('An unknown error occurred:', error);
            }
        }

    }
}