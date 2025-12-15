export class TextBuffer{
    content: string;
    outputEl: HTMLElement;
    constructor(
        content = "",
        outputEl:HTMLElement,
    ){
        this.content = content;
        this.outputEl = outputEl;
    }
    add(text: string){
        this.content += ` ${text}`;
    }
    remove(): string{
        if (!this.content){
            return "";
        }
        const char = this.content[0];
        this.content = this.content.slice(1);

        return char;
    }
}