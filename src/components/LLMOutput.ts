import { Scribby } from "./Scribby.js";
import { schema } from "../schema/schema.js";
import * as utils from "../utilities/utilities.js"

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

    private streamingBuffer = "";
    private boundaryRegex: RegExp | null = null;

    private escapeRegex(s: string): string {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    private buildBoundaryRegexFromSchema(): RegExp {
        const skip = new Set<string>([
            "text",
        ]);

        const voidTags = new Set<string>([
            "br",
            "img",
            "hr",
            "input",
            "meta",
            "link",
        ]);

        const closeableTags = Array.from(schema.keys())
            .map((k) => k.toLowerCase())
            .filter((k) => !skip.has(k) && !voidTags.has(k));

        if (closeableTags.length === 0) return /$^/g;

        closeableTags.sort((a, b) => b.length - a.length);

        const alternation = closeableTags.map((t) => this.escapeRegex(t)).join("|");

        return new RegExp(`</(?:${alternation})\\s*>`, "gi");
    }

    private initStreaming(outputEl: HTMLElement): void {
        this.streamingBuffer = "";
        this.boundaryRegex = this.buildBoundaryRegexFromSchema();
    }

    private flushCompleteElements(outputEl: HTMLElement): void {
        if (!this.boundaryRegex) return;

        let lastSafeIdx = -1;
        this.boundaryRegex.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = this.boundaryRegex.exec(this.streamingBuffer)) !== null) {
            lastSafeIdx = this.boundaryRegex.lastIndex;
        }

        if (lastSafeIdx === -1) return;

        const htmlToAppend = this.streamingBuffer.slice(0, lastSafeIdx);
        this.streamingBuffer = this.streamingBuffer.slice(lastSafeIdx);

        const tpl = document.createElement("template");
        tpl.innerHTML = htmlToAppend;

        outputEl.append(tpl.content);
    }

    private pushStreamingChunk(outputEl: HTMLElement, chunk: string): void {
        this.streamingBuffer += chunk;
        this.flushCompleteElements(outputEl);
    }

    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;

        this.el.addEventListener("click", async (e) => {
            if (!this.isGenerating) {
                console.log("generating")
                this.isGenerating = true;

                const parser = new DOMParser();

                const range = this.scribby.selection;
                if (!range) return;
                const input = range.toString();

                const outputEl = document.createElement("span");
                outputEl.classList.add("output");

                this.scribby.el.classList.add("disabled");
                this.scribby.el.contentEditable = "false";
                this.el.classList.add("active");

                const controller = new AbortController();
                range.deleteContents();
                range.insertNode(outputEl);

                this.initStreaming(outputEl);

                const full = await this.generateOutput(
                    input,
                    (chunk) => {
                        this.pushStreamingChunk(outputEl, chunk);
                    },
                    controller.signal
                );
                utils.replaceElementWithChildren(outputEl);
                this.streamingBuffer = "";

                this.scribby.el.classList.remove("disabled");
                this.scribby.el.contentEditable = "true"
                this.el.classList.remove("active");

                this.scribby.normalizer.removeNotSupportedNodes(this.scribby.el);
                const outOfOrderNodes = this.scribby.normalizer.flagNodeHierarchyViolations(this.scribby.el);
                this.scribby.normalizer.fixHierarchyViolations(outOfOrderNodes);
                this.scribby.normalizer.removeEmptyNodes(this.scribby.el);
                this.isGenerating = false;
            }

        });
    }
    async generateOutput(
        input: string,
        onChunk?: (chunk: string, full: string) => void,
        signal?: AbortSignal,
    ): Promise<string> {
        const url = "http://localhost:8080/doc/summarize";

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: input }),
            signal,
        });

        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        if (!response.body) {
            return await response.text();
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let full = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            full += chunk;
            onChunk?.(chunk, full);
        }

        full += decoder.decode();

        return full;
    }
}
