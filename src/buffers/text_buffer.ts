export class TextBuffer {
    content: string;
    outputEl: HTMLElement;
    private textNode: Text;

    constructor(content = "", outputEl: HTMLElement) {
        this.content = content;
        this.outputEl = outputEl;

        this.textNode = document.createTextNode("");
        this.outputEl.appendChild(this.textNode);
    }

    add(text: string) {
        this.content += (this.content ? " " : "") + text;
    }

    remove(): void {
        if (this.content.length === 0) return;

        const char = this.content[0];
        this.content = this.content.slice(1);

        this.textNode.data += char;
    }

    removeAll(): void {
        if (!this.content) return;
        this.textNode.data += this.content;
        this.content = "";
    }
}
