import { Scribby } from "./Scribby.js";
import { schema } from "../schema/schema.js";
import * as utils from "../utilities/utilities.js"
import { PromptModal } from "./LLMOutput/PromptModal.js";
import { SummaryOutput } from "./LLMOutput/SummaryOutput.js";

export class LLMSummaryController {
    scribby: Scribby;
    innerContent: string;
    el!: HTMLButtonElement;
    menu: PromptModal | null = null;
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

    private initStreaming(): void {
        this.streamingBuffer = "";
        this.boundaryRegex = this.buildBoundaryRegexFromSchema();
    }

    private flushCompleteElements(outputEl: HTMLElement): boolean {
        if (!this.boundaryRegex) return false;

        let lastSafeIdx = -1;
        this.boundaryRegex.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = this.boundaryRegex.exec(this.streamingBuffer)) !== null) {
            lastSafeIdx = this.boundaryRegex.lastIndex;
        }

        if (lastSafeIdx === -1) return false;

        const htmlToAppend = this.streamingBuffer.slice(0, lastSafeIdx);
        this.streamingBuffer = this.streamingBuffer.slice(lastSafeIdx);

        const tpl = document.createElement("template");
        tpl.innerHTML = htmlToAppend;

        if (!tpl.content.childNodes.length) {
            return false;
        }

        outputEl.append(tpl.content);
        return true;
    }

    private pushStreamingChunk(outputEl: HTMLElement, chunk: string): boolean {
        this.streamingBuffer += chunk;
        return this.flushCompleteElements(outputEl);
    }

    mount() {
        this.el.classList.add("toolbar-button");
        this.el.innerHTML = this.innerContent;

        this.el.addEventListener("click", async (e) => {
            if (!this.isGenerating) {

                const range = this.scribby.selection;
                if (!range) return;
                const input = range.toString();

                const rangeMarker = document.createElement("range-marker");
                const endRange = range.cloneRange();
                endRange.collapse(false);
                endRange.insertNode(rangeMarker);

                this.menu = document.createElement("prompt-modal") as PromptModal;

                const submission = this.menu.submission(
                    this.scribby,
                    rangeMarker.getBoundingClientRect()
                );

                setTimeout(() => {
                    document.addEventListener("click", this.handleOutsideClick);
                }, 0);

                const values = await submission;

                document.removeEventListener("click", this.handleOutsideClick);
                rangeMarker.remove();
                this.menu = null;

                if (!values) return;
                const additionalContext = values.additional_context;

                console.log("summarizing");
                this.isGenerating = true;

                const summaryOutput = document.createElement("summary-output") as SummaryOutput;

                const controller = new AbortController();

                /** TODO: Store contents so that we can undo the summary */
                range.deleteContents();
                range.insertNode(summaryOutput);
                const outputEl = summaryOutput.querySelector(".output")! as HTMLElement;

                this.initStreaming();
                summaryOutput.setState("summarizing");

                let receivedFirstBlock = false;

                try {
                    await this.generateOutput(
                        input,
                        (chunk) => {
                            const flushedBlock = this.pushStreamingChunk(outputEl, chunk);

                            if (flushedBlock && !receivedFirstBlock) {
                                receivedFirstBlock = true;
                                summaryOutput.setState("generating");
                            }

                            summaryOutput.dataset.value = outputEl.innerHTML;
                        },
                        controller.signal
                    );

                    this.streamingBuffer = "";
                } catch (err) {
                    console.error("summary generation failed", err);
                    outputEl.remove();
                } finally {
                    this.streamingBuffer = "";
                    this.isGenerating = false;
                }
                this.streamingBuffer = "";

                summaryOutput.dataset.value = outputEl.innerHTML;

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
            const msg = await response.text().catch(() => "");

            let errorBody: any = {};

            try {
                errorBody = msg ? JSON.parse(msg) : {};
            } catch {
                errorBody = {
                    error: msg || `Response status: ${response.status}`,
                };
            }

            if (response.status === 402) {
                window.dispatchEvent(
                    new CustomEvent("usage-limit", {
                        detail: errorBody,
                    })
                );
            }

            throw new Error(errorBody.error || `Response status: ${response.status}`);
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
    private closeMenu() {
        this.menu?.close();
        this.menu = null;
    }

    private handleOutsideClick = (e: MouseEvent) => {
        const target = e.target as Node | null;

        if (target && this.menu && this.menu.contains(target)) {
            return;
        }

        document.removeEventListener("click", this.handleOutsideClick);
        this.closeMenu();
    };
}
