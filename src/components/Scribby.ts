import { Normalizer } from "../normalizer/normalizer.js";

import { HistoryManager, Snapshot } from "../history_manager/history_manager.js";
import type { WhisperClient } from "../whisper/whisper.js";
import { getLocalWhisperSupport } from "../utilities/platform.js";

import * as utils from "../utilities/utilities.js";

import { connectEditorEventHandlers } from "./Scribby/editor_events_connector.js";

import { Toolbar } from "./Toolbar.js";
import { InsertModal } from "./InsertModal.js";
import { LinkModal } from "./LinkModal.js";
import { RangeMarker } from "./RangeMarker.js";
import { ScribbyCodeBlock } from "./CodeBlock/CodeBlock.js";
import { SpeechOutput } from "./SpeechOutput/SpeechOutput.js";
import { PlayButton } from "./SpeechOutput/PlayButton.js";
import { StopButton } from "./SpeechOutput/StopButton.js";
import { RecordButton } from "./SpeechOutput/RecordButton.js";
import { AudioScrubber } from "./SpeechOutput/AudioScrubber.js";
import { RecordInputModal } from "./SpeechOutput/RecordInputModal.js";
import { ConfirmOverlay } from "./ConfirmOverlay.js";
import { PromptModal } from "./LLMOutput/PromptModal.js";
import { SummaryOutput } from "./LLMOutput/SummaryOutput.js";
import { PromptTextBox } from "./LLMOutput/PromptTextBox.js";
import { LatexBlock } from "./LatexBlock/LatexBlock.js";


export class Scribby {
    selector: string;
    el!: HTMLDivElement;
    toolbar!: Toolbar;
    textElement: string;
    selection!: Range | null;
    allowedBlockStyles: Set<string>;
    allowedSpanStyles: Set<string>;
    normalizer!: Normalizer;
    historyManager: HistoryManager;

    historyUpdateTimeoutId: number | null;
    historyUpdateDelayonInput: number;

    saveTimeoutId: number | null;
    saveDelayonInput: number;

    currentInsertModal: InsertModal | null = null;
    currentTextModal: LinkModal | null = null;

    parser: DOMParser = new DOMParser();

    abortController: AbortController | null;

    constructor(
        selector = "",
    ) {
        this.selector = selector;
        this.el;
        this.textElement = "p";
        this.selection;
        this.allowedBlockStyles = new Set;
        this.allowedSpanStyles = new Set;
        this.normalizer;
        this.historyManager = new HistoryManager();
        this.historyUpdateTimeoutId = null;
        this.historyUpdateDelayonInput = 500;
        this.saveTimeoutId = null;
        this.saveDelayonInput = 5000;
        this.abortController = null;
        // initialize web components
        customElements.define("range-marker", RangeMarker);
        customElements.define("scribby-code-block", ScribbyCodeBlock);
        customElements.define("speech-output", SpeechOutput);
        customElements.define("play-button", PlayButton);
        customElements.define("stop-button", StopButton);
        customElements.define("record-button", RecordButton);
        customElements.define("audio-scrubber", AudioScrubber);
        customElements.define("record-input-modal", RecordInputModal);
        customElements.define("confirm-overlay", ConfirmOverlay);
        customElements.define("prompt-modal", PromptModal);
        customElements.define("summary-output", SummaryOutput);
        customElements.define("prompt-text-box", PromptTextBox);
        customElements.define("scribby-latex-block", LatexBlock);
    }
    public whisper: WhisperClient | null = null;
    public modelReadyPromise: Promise<void> | null = null;
    public whisperEnabled = false;
    public whisperThreadCount = 0;

    private whisperLeaseCount = 0;

    async mount() {
        this.initWhisperSupport();

        const container = document.querySelector<HTMLDivElement>(`${this.selector}`);
        if (!container) {
            throw new Error(`No element with selector: ${this.selector}`);
        }
        const initialContent = container.innerHTML;
        this.el = document.createElement("div");
        this.el.contentEditable = 'true';
        this.el.classList.add("scribby");
        this.el.innerHTML = initialContent;

        // Apply UUID
        utils.applyUUIDs(this.el);

        container.dataset.state = "rendered";
        container.replaceChildren(this.el);
        this.toolbar = new Toolbar(this).mount();
        this.normalizer = new Normalizer(this.el);

        this.el.insertAdjacentElement("beforebegin", this.toolbar.el);

        connectEditorEventHandlers(this);

        return this
    }
    // history methods
    public flushPendingHistorySnapshot(): void {
        if (this.historyUpdateTimeoutId === null) return;

        clearTimeout(this.historyUpdateTimeoutId);
        this.historyUpdateTimeoutId = null;

        this.historyManager.push(
            this.historyManager.createSnapshot(this.el),
        );
    }

    public restoreHistorySnapshot(snapshot: Snapshot): void {
        this.historyManager.diffDom(snapshot.html, this.el);

        this.selection = this.historyManager.restoreSelection(
            this.el,
            snapshot.selection,
        );
    }
    // whisper methods
    private initWhisperSupport() {
        const support = getLocalWhisperSupport();

        this.whisperEnabled = support.enabled;
        this.whisperThreadCount = support.transcriptionThreads;
        this.modelReadyPromise = null;

        if (!support.enabled) {
            console.info("[whisper] disabled", {
                reason: support.reason,
                availableThreads: support.availableThreads,
                crossOriginIsolated: window.crossOriginIsolated,
                sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
            });
        }
    }

    private async ensureWhisperReady(): Promise<WhisperClient | null> {
        if (!this.whisperEnabled) {
            return null;
        }

        if (this.whisper && this.modelReadyPromise) {
            await this.modelReadyPromise;
            return this.whisper;
        }

        const { WhisperClient } = await import("../whisper/whisper.js");
        const whisper = new WhisperClient();

        this.whisper = whisper;

        const readyPromise = (async () => {
            await whisper.initRuntime("/whisper/main.js");

            console.log("[whisper] worker runtime ready");

            await whisper.loadModel("/whisper/ggml-tiny.bin", (p) => {
                console.log("[whisper] model", Math.round(p * 100), "%");
            });

            console.log("[whisper] worker model ready");
        })();

        this.modelReadyPromise = readyPromise;

        try {
            await readyPromise;
            return whisper;
        } catch (err) {
            if (this.whisper === whisper) {
                whisper.terminate();
                this.whisper = null;
                this.modelReadyPromise = null;
            }

            throw err;
        }
    }

    public async acquireWhisper(): Promise<{
        client: WhisperClient;
        release: () => void;
    } | null> {
        if (!this.whisperEnabled) {
            return null;
        }

        /*
         * Reserve the lease before awaiting initialization. This prevents an
         * older recording from terminating the shared worker while a new
         * recording is in the middle of acquiring it.
         */
        this.whisperLeaseCount += 1;

        try {
            const client = await this.ensureWhisperReady();

            if (!client) {
                this.whisperLeaseCount = Math.max(0, this.whisperLeaseCount - 1);
                return null;
            }

            let released = false;

            return {
                client,
                release: () => {
                    if (released) {
                        return;
                    }

                    released = true;
                    this.whisperLeaseCount = Math.max(0, this.whisperLeaseCount - 1);

                    if (this.whisperLeaseCount !== 0 || this.whisper !== client) {
                        return;
                    }

                    client.terminate();
                    this.whisper = null;
                    this.modelReadyPromise = null;

                    console.log("[whisper] worker terminated");
                },
            };
        } catch (err) {
            this.whisperLeaseCount = Math.max(0, this.whisperLeaseCount - 1);
            console.error("[whisper] init/load failed", err);
            return null;
        }
    }
}