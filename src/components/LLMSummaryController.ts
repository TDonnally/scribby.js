import { Scribby } from "./Scribby.js";
import { schema } from "../schema/schema.js";
import * as utils from "../utilities/utilities.js";
import { PromptModal } from "./LLMOutput/PromptModal.js";
import { SummaryOutput } from "./LLMOutput/SummaryOutput.js";

type SummaryGenerateEventDetail = {
    summaryOutput?: SummaryOutput;
    additionalContext?: string;
};

type RunGenerationOptions = {
    summaryOutput: SummaryOutput;
    input: string;
    replaceOutput?: boolean;
    source?: EventTarget | null;
};

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
        const skip = new Set<string>(["text"]);

        const voidTags = new Set<string>([
            "br",
            "img",
            "hr",
            "input",
            "meta",
            "link",
        ]);

        const closeableTags = new Set(
            Array.from(schema.keys())
                .map((k) => k.toLowerCase())
                .filter((k) => !skip.has(k) && !voidTags.has(k))
        );

        const tagRegex = /<\/?([a-zA-Z][\w:-]*)(?:\s+[^<>]*?)?\/?\s*>/g;

        const stack: string[] = [];
        let lastSafeIdx = -1;

        let match: RegExpExecArray | null;

        while ((match = tagRegex.exec(this.streamingBuffer)) !== null) {
            const rawTag = match[0];
            const tagName = match[1]?.toLowerCase();

            if (!tagName) {
                continue;
            }

            if (!closeableTags.has(tagName) || voidTags.has(tagName) || rawTag.endsWith("/>")) {
                continue;
            }

            const isClosingTag = rawTag.startsWith("</");

            if (!isClosingTag) {
                stack.push(tagName);
                continue;
            }

            if (stack[stack.length - 1] === tagName) {
                stack.pop();
            } else {
                const matchingIndex = stack.lastIndexOf(tagName);

                if (matchingIndex !== -1) {
                    stack.length = matchingIndex;
                }
            }

            if (stack.length === 0) {
                lastSafeIdx = tagRegex.lastIndex;
            }
        }

        if (lastSafeIdx === -1) {
            return false;
        }

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

        this.el.addEventListener("click", this.handleToolbarClick);

        document.addEventListener("summary-generate", this.handleDocumentSummaryGenerate);
    }

    public destroy() {
        this.el.removeEventListener("click", this.handleToolbarClick);
        document.removeEventListener("summary-generate", this.handleDocumentSummaryGenerate);
        document.removeEventListener("click", this.handleOutsideClick);
    }

    private handleToolbarClick = async () => {
        if (this.isGenerating) {
            this.dispatchBusyEvent(this.el);
            return;
        }

        const range = this.scribby.selection;
        if (!range) return;

        let input = range.toString();

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
        this.menu = null;

        if (!values) return;

        const additionalContext = values.additional_context?.trim();

        if (additionalContext) {
            input += `\n\nAdditional context:\n${additionalContext}`;
        }

        const summaryOutput = document.createElement("summary-output") as SummaryOutput;

        rangeMarker.replaceWith(summaryOutput);

        await this.runGeneration({
            summaryOutput,
            input,
            replaceOutput: true,
            source: this.el,
        });

        this.normalizeEditor();
    };

    private handleDocumentSummaryGenerate = async (e: Event) => {
        const custom = e as CustomEvent<SummaryGenerateEventDetail>;

        if (this.isGenerating) {
            this.dispatchBusyEvent(e.target);
            return;
        }

        const target = e.target as Element | null;

        const summaryOutput =
            custom.detail?.summaryOutput ??
            target?.closest("summary-output") as SummaryOutput | null;

        if (!summaryOutput) {
            console.warn("summary-generate event fired without a summary-output target");
            return;
        }

        const additionalContext = custom.detail?.additionalContext?.trim() ?? "";

        const input = this.buildInputFromSummaryOutput(
            summaryOutput,
            additionalContext
        );

        await this.runGeneration({
            summaryOutput,
            input,
            replaceOutput: true,
            source: e.target,
        });

        this.normalizeEditor();
    };

    private buildInputFromSummaryOutput(
        summaryOutput: SummaryOutput,
        additionalContext: string,
    ): string {
        const outputEl = summaryOutput.querySelector(".output") as HTMLElement | null;

        const existingSummary = outputEl?.innerText?.trim() ?? "";

        let input = "";

        if (existingSummary) {
            input += `Current summary:\n${existingSummary}`;
        }

        if (additionalContext) {
            input += `\n\nAdditional context / requested change:\n${additionalContext}`;
        }

        return input.trim();
    }

    private async runGeneration(options: RunGenerationOptions): Promise<void> {
        if (this.isGenerating) {
            this.dispatchBusyEvent(options.source);
            return;
        }

        const { summaryOutput, input, replaceOutput = false } = options;

        const outputEl = summaryOutput.querySelector(".output") as HTMLElement | null;

        if (!outputEl) {
            console.warn("summary-output is missing .output element");
            return;
        }

        this.setGeneratingUI(true);

        const controller = new AbortController();

        this.initStreaming();

        if (replaceOutput) {
            summaryOutput.prepareForGeneration();
        }

        summaryOutput.setState("summarizing");

        let receivedFirstChunk = false;
        let receivedFirstBlock = false;

        document.dispatchEvent(
            new CustomEvent("summary-generation-started", {
                detail: {
                    summaryOutput,
                    source: options.source,
                },
            })
        );

        try {
            await this.generateOutput(
                input,
                (chunk) => {
                    if (!receivedFirstChunk) {
                        receivedFirstChunk = true;

                        if (replaceOutput) {
                            outputEl.replaceChildren();
                            summaryOutput.dataset.value = "";
                        }
                    }

                    const flushedBlock = this.pushStreamingChunk(outputEl, chunk);

                    if (flushedBlock && !receivedFirstBlock) {
                        receivedFirstBlock = true;
                        summaryOutput.setState("generating");
                    }

                    summaryOutput.dataset.value = outputEl.innerHTML;
                },
                controller.signal
            );

            summaryOutput.dataset.value = outputEl.innerHTML;
            summaryOutput.commitCurrentOutputToHistory();

            document.dispatchEvent(
                new CustomEvent("summary-generation-finished", {
                    detail: {
                        summaryOutput,
                        source: options.source,
                    },
                })
            );
        } catch (err) {
            console.error("summary generation failed", err);

            document.dispatchEvent(
                new CustomEvent("summary-generation-failed", {
                    detail: {
                        summaryOutput,
                        source: options.source,
                        error: err,
                    },
                })
            );
        } finally {
            this.streamingBuffer = "";
            summaryOutput.setState("idle");
            this.setGeneratingUI(false);
        }
    }

    private setGeneratingUI(generating: boolean) {
        this.isGenerating = generating;

        this.el.classList.toggle("active", generating);
        this.el.classList.toggle("generating", generating);

        if (generating) {
            this.el.setAttribute("aria-busy", "true");
            this.el.setAttribute("aria-disabled", "true");
        } else {
            this.el.removeAttribute("aria-busy");
            this.el.removeAttribute("aria-disabled");
        }
    }

    private dispatchBusyEvent(source?: EventTarget | null) {
        document.dispatchEvent(
            new CustomEvent("summary-generation-busy", {
                detail: {
                    source,
                },
            })
        );
    }

    private normalizeEditor() {
        this.scribby.normalizer.removeNotSupportedNodes(this.scribby.el);

        const outOfOrderNodes = this.scribby.normalizer.flagNodeHierarchyViolations(
            this.scribby.el
        );

        this.scribby.normalizer.fixHierarchyViolations(outOfOrderNodes);
        this.scribby.normalizer.removeEmptyNodes(this.scribby.el);
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