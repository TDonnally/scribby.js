import { Normalizer } from "../normalizer/normalizer.js";

import { Toolbar } from "./Toolbar.js";
import { InsertModal } from "./InsertModal.js";
import { LinkModal } from "./LinkModal.js";

import * as events from "../events/custom_events.js";
import { HistoryManager, Snapshot } from "../history_manager/history_manager.js";
import type { WhisperClient } from "../whisper/whisper.js";
import { getLocalWhisperSupport } from "../utilities/platform.js";

import * as utils from "../utilities/utilities.js";
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
import {
    containsInlineLatexBlock,
    createLatexClipboardPayload,
    getAdjacentInlineLatexBlock,
    isCaretAtLatexTextBoundary,
    mergeTextBlocksPreservingLatexBlock,
    preserveLatexBlock,
    removeInlineLatexBlock,
    splitTextBlockAtInlineLatexBoundary,
} from "./LatexBlock/utilities.js";
const parser = new DOMParser();


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

    private flushPendingHistorySnapshot(): void {
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

    constructor(
        selector = "",
        content: string | null = null
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
    }
    public whisper: WhisperClient | null = null;
    public modelReadyPromise: Promise<void> | null = null;
    public whisperEnabled = false;
    public whisperThreadCount = 0;
    async mount() {
        (globalThis as any).Module = {
            print: () => { },
            printErr: () => { },
        };
        this.initWhisperIfSupported();

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
        this.historyManager.push(
            this.historyManager.createSnapshot(this.el),
        );

        container.dataset.state = "rendered";
        container.replaceChildren(this.el);
        this.toolbar = new Toolbar(this).mount();
        this.normalizer = new Normalizer(this.el);

        this.el.insertAdjacentElement("beforebegin", this.toolbar.el);

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

        this.el.addEventListener("keydown", async (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.shiftKey) {
                    e.preventDefault();
                    const key = e.key.toLowerCase()
                    if (key === "x") {
                        this.el.dispatchEvent(events.strikethrough);
                    }
                    else if (key === "l") {
                        this.el.dispatchEvent(events.alignLeft);
                    }
                    else if (key === "e") {
                        this.el.dispatchEvent(events.alignCenter);
                    }
                    else if (key === "c") {
                        this.el.dispatchEvent(events.alignRight);
                    }
                    else if (key === "&") {
                        this.el.dispatchEvent(events.createOrderedList);
                    }
                    else if (key === "*") {
                        this.el.dispatchEvent(events.createUnorderedList);
                    }
                }
                const historyKey = e.key.toLowerCase();
                const wantsUndo =
                    historyKey === "z" &&
                    !e.shiftKey;

                const wantsRedo =
                    historyKey === "y" ||
                    (historyKey === "z" && e.shiftKey);

                if (wantsUndo) {
                    e.preventDefault();

                    /*
                     * Preserve the latest debounced edit as the current state
                     * before moving backward through history.
                     */
                    this.flushPendingHistorySnapshot();

                    const snapshot = this.historyManager.undo();
                    if (!snapshot) return;

                    this.restoreHistorySnapshot(snapshot);
                }
                else if (wantsRedo) {
                    e.preventDefault();

                    /*
                     * A pending edit represents a new branch. Flushing it
                     * correctly invalidates any older redo branch.
                     */
                    this.flushPendingHistorySnapshot();

                    const snapshot = this.historyManager.redo();
                    if (!snapshot) return;

                    this.restoreHistorySnapshot(snapshot);
                }
                else if (e.key === "b") {
                    e.preventDefault();
                    this.el.dispatchEvent(events.bold);
                }
                else if (e.key === "i") {
                    e.preventDefault();
                    this.el.dispatchEvent(events.italic);
                }
                else if (e.key === "u") {
                    e.preventDefault();
                    this.el.dispatchEvent(events.underline);
                }
                else if (e.key === "k") {
                    e.preventDefault();
                    this.el.dispatchEvent(events.createAnchor);
                }
                else if (e.key === "e") {
                    e.preventDefault();
                    this.el.dispatchEvent(events.createCodeBlock);
                }


            }
            if (e.key === "Tab") {


                e.preventDefault();
                const range = this.selection;
                if (!range) return;
                const parent = range.startContainer;
                const parentEl = parent as HTMLElement;
                let closestElement: HTMLElement | null;
                if (parent.nodeType != Node.ELEMENT_NODE) {
                    const nodeParent = parent.parentElement;
                    if (!nodeParent) return;
                    closestElement = nodeParent.closest("li, code");
                }
                else if (parentEl.tagName.toLowerCase() === "ol" || parentEl.tagName.toLowerCase() === "ul") {
                    parentEl.remove();
                    return
                }
                else {
                    closestElement = parentEl.closest("li, code");
                }
                /**
                 * Pausing nested lists for now. Is going to take more time.
                 *
                if (closestElement && closestElement.tagName.toLowerCase() === "li") {
                    const text = closestElement.textContent.replace(/[\s\u200B]+/g, "");

                    const hasOnlyBrChildren = Array.from(closestElement.children).every(
                        (child) => child.tagName === "BR"
                    );

                    if (!text && (!closestElement.children.length || hasOnlyBrChildren)) {
                        closestElement.remove();
                    }
                    else {
                        const parentContainer = closestElement.parentElement;
                        if (!parentContainer) return;
                        const parentTag = parentContainer.tagName.toLowerCase();
                        const listContainer = document.createElement(parentTag);
                        const content = range.extractContents();
                        const li = document.createElement("li");
                        if (!content.querySelector("li")) {
                            li.appendChild(content);
                            if (!li.childNodes.length) {
                                li.appendChild(document.createTextNode("\u200B"));
                            }
                            listContainer.appendChild(li);
                        }
                        else {
                            li.remove();
                            listContainer.appendChild(content);
                        }
                        range.insertNode(listContainer);
                        utils.placeCaretatEndofElement(listContainer);
                        this.el.normalize();
                    }
                        
                }*/
                if (closestElement && closestElement.tagName.toLowerCase() === "code") {
                    const fourSpaces = document.createTextNode("\t");
                    range.insertNode(fourSpaces);
                    const contents = range.extractContents();
                    const brTags = contents.querySelectorAll("br");

                    brTags.forEach((br) => {
                        const fourSpaces = document.createTextNode("\t");
                        br.after(fourSpaces);
                    })

                    range.insertNode(contents);
                    range.collapse(false);
                    closestElement.normalize();
                }
                this.el.dispatchEvent(new Event('input'));
            }
            if (e.key === "Enter") {
                const range = this.selection;
                if (!range || !range.collapsed) return;

                const parent =
                    range.startContainer.nodeType === Node.ELEMENT_NODE
                        ? range.startContainer as HTMLElement
                        : range.startContainer.parentElement;

                if (!parent) return;

                const codeBlock = parent.closest("scribby-code-block") as HTMLElement | null;

                /*
                 * Native contenteditable inserts a BR when splitting directly
                 * before a contenteditable=false inline component. Split the
                 * nodes ourselves so a leading formula remains:
                 *
                 * <p><scribby-latex-block>...</scribby-latex-block></p>
                 *
                 * rather than:
                 *
                 * <p><br><scribby-latex-block>...</scribby-latex-block></p>
                 */
                if (!codeBlock) {
                    const latexTextContainer = parent.closest<HTMLElement>(
                        "p, h1, h2, h3, h4, h5, h6, li",
                    );

                    if (latexTextContainer) {
                        const splitRange =
                            splitTextBlockAtInlineLatexBoundary(
                                range,
                                latexTextContainer,
                            );

                        if (splitRange) {
                            e.preventDefault();
                            this.selection = splitRange;
                            this.el.dispatchEvent(new Event("input"));
                            return;
                        }
                    }
                }

                // Normal editor text: h1/p/etc.
                if (!codeBlock) {
                    const block = parent.closest("h1, h2, h3, h4, h5, h6, p") as HTMLElement | null;
                    if (!block) return;

                    const afterRange = document.createRange();
                    afterRange.selectNodeContents(block);
                    afterRange.setStart(range.startContainer, range.startOffset);

                    const isAtEnd = !(afterRange.toString() ?? "").replace(/[\s\u200B]+/g, "");

                    if (!isAtEnd) return;

                    e.preventDefault();

                    const nextP = document.createElement("p");
                    const textNode = document.createTextNode("\u200B");

                    nextP.appendChild(textNode);
                    block.after(nextP);

                    const newRange = document.createRange();
                    newRange.setStart(textNode, 1);
                    newRange.collapse(true);

                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                    selection?.addRange(newRange);

                    this.selection = newRange;
                    this.el.dispatchEvent(new Event("input"));

                    return;
                }

                // CodeMirror / scribby-code-block exit behavior.
                const closestLine = parent.closest(".cm-line") as HTMLElement | null;
                if (!closestLine) return;

                const prev = closestLine.previousElementSibling as HTMLElement | null;
                const next = closestLine.nextElementSibling?.nextElementSibling as HTMLElement | null;

                const prevHasNoText = !!prev && !(prev.textContent ?? "").replace(/[\s\u200B]+/g, "");

                if (next === null && prevHasNoText) {
                    e.preventDefault();

                    let target = codeBlock.nextElementSibling as HTMLElement | null;

                    if (!target) {
                        target = document.createElement("p");

                        const textNode = document.createTextNode("\u200B");
                        target.appendChild(textNode);

                        codeBlock.after(target);
                    }

                    let caretNode = Array.from(target.childNodes).find(
                        node => node.nodeType === Node.TEXT_NODE
                    ) as Text | undefined;

                    if (!caretNode) {
                        target.innerHTML = "";
                        caretNode = document.createTextNode("\u200B");
                        target.appendChild(caretNode);
                    }

                    const newRange = document.createRange();
                    newRange.setStart(caretNode, caretNode.nodeValue?.length ?? 0);
                    newRange.collapse(true);

                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                    selection?.addRange(newRange);

                    this.selection = newRange;
                    this.el.dispatchEvent(new Event("input"));
                }
            }
            if (e.key === "ArrowDown") {
                const range = this.selection;
                if (!range) return;
                const parent = range.startContainer;
                const parentEl = parent as HTMLElement;

                let closestLine: HTMLElement | null;
                let codeBlock: HTMLElement | null;
                if (parent.nodeType != Node.ELEMENT_NODE) {
                    const nodeParent = parent.parentElement;
                    if (!nodeParent) return;
                    closestLine = nodeParent.closest(".cm-line");
                    codeBlock = nodeParent.closest("scribby-code-block");
                }
                else {
                    closestLine = parentEl.closest(".cm-line");
                    codeBlock = parentEl.closest("scribby-code-block");
                }

                if (closestLine?.nextElementSibling === null) {
                    e.preventDefault();
                    let target = codeBlock?.nextElementSibling as HTMLElement;
                    if (target === null) {
                        const entryP = document.createElement("p");
                        const br = document.createElement("br");
                        entryP.appendChild(br);
                        codeBlock?.after(entryP);
                        target = entryP;
                    }
                    const newRange = document.createRange();
                    newRange.selectNodeContents(target);
                    newRange.collapse(false);
                    const selection = window.getSelection();
                    if (selection) {
                        selection.removeAllRanges();
                    }
                    selection?.addRange(newRange);
                }
            }
            if (e.key === "Delete" || e.key === "Backspace") {
                const range = this.selection;
                if (!range) return;

                const protectedSelector = utils.PROTECTED_BLOCK_SELECTOR;
                const blockSelector = utils.BLOCK_SELECTOR;

                const startEl =
                    range.startContainer.nodeType === Node.ELEMENT_NODE
                        ? range.startContainer as HTMLElement
                        : range.startContainer.parentElement;

                if (!startEl) return;
                if (startEl.closest(".cm-content")) return;

                const currentLi = startEl.closest<HTMLElement>("li");
                const topLevelChild = utils.getTopLevelChild(range.startContainer, this.el);
                const isBackspace = e.key === "Backspace";

                const place = (r: Range | null): void => {
                    if (r) this.selection = r;
                };

                const emitInput = (): void => {
                    this.el.dispatchEvent(new Event("input"));
                };

                // After removing a node, guarantee the editor is never empty
                const finishRemoval = (fallback: () => Range | null): void => {
                    if (this.el.children.length === 0) {
                        const p = utils.makePlaceholderP();
                        this.el.appendChild(p);
                        place(utils.placeCaretAtStart(p));
                    } else {
                        place(fallback());
                    }
                    emitInput();
                };

                const textContainer = startEl.closest<HTMLElement>(
                    "p, h1, h2, h3, h4, h5, h6, li",
                );

                if (!range.collapsed) {
                    const protectedBlocks = utils.getProtectedBlocksInsideSelection(range);

                    if (protectedBlocks.length > 0) {
                        e.preventDefault();

                        const confirmed = await utils.confirmProtectedBlockDelete(protectedBlocks[0]);
                        if (!confirmed) return;

                        range.deleteContents();
                        finishRemoval(() => utils.placeRange(range));
                        return;
                    }

                    if (currentLi && utils.selectionWouldEmpty(range, currentLi)) {
                        e.preventDefault();
                        place(utils.resetPlaceholderBlock(currentLi));
                        emitInput();
                        return;
                    }

                    if (
                        topLevelChild &&
                        topLevelChild.matches(blockSelector) &&
                        utils.selectionWouldEmpty(range, topLevelChild) &&
                        (topLevelChild.previousElementSibling?.matches(protectedSelector) ||
                            topLevelChild.nextElementSibling?.matches(protectedSelector))
                    ) {
                        e.preventDefault();
                        place(utils.resetPlaceholderBlock(topLevelChild));
                        emitInput();
                        return;
                    }

                    return;
                }

                if (textContainer) {
                    const adjacentLatex = getAdjacentInlineLatexBlock(
                        range,
                        textContainer,
                        isBackspace ? "before" : "after",
                    );

                    if (adjacentLatex) {
                        e.preventDefault();

                        const confirmed =
                            await utils.confirmProtectedBlockDelete(
                                adjacentLatex,
                            );

                        if (!confirmed) return;

                        place(
                            removeInlineLatexBlock(
                                adjacentLatex,
                                textContainer,
                            ),
                        );

                        emitInput();
                        return;
                    }

                    const mergeableTextSelector =
                        "p, h1, h2, h3, h4, h5, h6, li";

                    if (
                        isBackspace &&
                        isCaretAtLatexTextBoundary(
                            range,
                            textContainer,
                            "start",
                        )
                    ) {
                        const previous =
                            textContainer.previousElementSibling as HTMLElement | null;

                        if (
                            previous?.matches(mergeableTextSelector) &&
                            (
                                containsInlineLatexBlock(textContainer) ||
                                containsInlineLatexBlock(previous)
                            )
                        ) {
                            e.preventDefault();

                            place(
                                mergeTextBlocksPreservingLatexBlock(
                                    textContainer,
                                    previous,
                                ),
                            );

                            emitInput();
                            return;
                        }
                    }

                    if (
                        !isBackspace &&
                        isCaretAtLatexTextBoundary(
                            range,
                            textContainer,
                            "end",
                        )
                    ) {
                        const next =
                            textContainer.nextElementSibling as HTMLElement | null;

                        if (
                            next?.matches(mergeableTextSelector) &&
                            (
                                containsInlineLatexBlock(textContainer) ||
                                containsInlineLatexBlock(next)
                            )
                        ) {
                            e.preventDefault();

                            place(
                                mergeTextBlocksPreservingLatexBlock(
                                    next,
                                    textContainer,
                                ),
                            );

                            emitInput();
                            return;
                        }
                    }
                }

                // One remaining char in a list item
                if (currentLi && utils.collapsedDeleteWouldEmpty(range, currentLi, e.key)) {
                    e.preventDefault();
                    place(utils.resetPlaceholderBlock(currentLi));
                    emitInput();
                    return;
                }

                // Empty list item
                if (currentLi && utils.isPlaceholderOnlyBlock(currentLi)) {
                    const list = currentLi.parentElement as HTMLElement | null;
                    const prevLi = currentLi.previousElementSibling as HTMLElement | null;
                    const nextLi = currentLi.nextElementSibling as HTMLElement | null;
                    const prevIsLi = !!prevLi?.matches("li");
                    const nextIsLi = !!nextLi?.matches("li");

                    e.preventDefault();

                    let target: HTMLElement | null = null;
                    let caretAtEnd = false;

                    if (isBackspace) {
                        if (prevIsLi) { target = prevLi; caretAtEnd = true; }
                        else if (nextIsLi) { target = nextLi; caretAtEnd = false; }
                    } else {
                        if (nextIsLi) { target = nextLi; caretAtEnd = false; }
                        else if (prevIsLi) { target = prevLi; caretAtEnd = true; }
                    }

                    if (target) {
                        currentLi.remove();
                        place(caretAtEnd ? utils.placeCaretAtEnd(target) : utils.placeCaretAtStart(target));
                        emitInput();
                        return;
                    }

                    if (list && (list.matches("ul") || list.matches("ol"))) {
                        const p = utils.makePlaceholderP();
                        list.replaceWith(p);
                        place(utils.placeCaretAtStart(p));
                        emitInput();
                        return;
                    }

                    place(utils.resetPlaceholderBlock(currentLi));
                    return;
                }

                // One remaining char in a protected adjacent block
                if (
                    topLevelChild &&
                    topLevelChild.matches(blockSelector) &&
                    (topLevelChild.previousElementSibling?.matches(protectedSelector) ||
                        topLevelChild.nextElementSibling?.matches(protectedSelector)) &&
                    utils.collapsedDeleteWouldEmpty(range, topLevelChild, e.key)
                ) {
                    e.preventDefault();
                    place(utils.resetPlaceholderBlock(topLevelChild));
                    emitInput();
                    return;
                }

                // Caret sitting directly inside a protected block.
                const directProtectedBlock = startEl.closest<HTMLElement>(protectedSelector);

                if (directProtectedBlock) {
                    e.preventDefault();

                    if (directProtectedBlock.matches("scribby-code-block")) {
                        place(utils.placeCaretInProtectedBlock(directProtectedBlock, "end"));
                        return;
                    }

                    const confirmed = await utils.confirmProtectedBlockDelete(directProtectedBlock);
                    if (!confirmed) return;

                    const after = directProtectedBlock.nextElementSibling as HTMLElement | null;
                    const before = directProtectedBlock.previousElementSibling as HTMLElement | null;
                    const caretTarget = after ?? before;

                    directProtectedBlock.remove();

                    finishRemoval(() => {
                        if (caretTarget && caretTarget.isConnected) {
                            return after
                                ? utils.placeCaretAtStart(caretTarget)
                                : utils.placeCaretAtEnd(caretTarget);
                        }
                        const first = this.el.firstElementChild as HTMLElement | null;
                        return first ? utils.placeCaretAtStart(first) : null;
                    });
                    return;
                }

                // Empty top level block next to a protected block.
                if (topLevelChild && utils.isPlaceholderOnlyBlock(topLevelChild)) {
                    const previous = topLevelChild.previousElementSibling as HTMLElement | null;
                    const next = topLevelChild.nextElementSibling as HTMLElement | null;
                    const neighbor = isBackspace ? previous : next;   // block in the key's direction
                    const opposite = isBackspace ? next : previous;

                    e.preventDefault();

                    if (neighbor?.matches("scribby-code-block")) {
                        place(utils.placeCaretInProtectedBlock(neighbor, isBackspace ? "end" : "start"));
                        return;
                    }

                    if (neighbor?.matches(protectedSelector)) {
                        const confirmed = await utils.confirmProtectedBlockDelete(neighbor);
                        if (!confirmed) return;

                        neighbor.remove();
                        finishRemoval(() => utils.placeCaretAtStart(topLevelChild));
                        return;
                    }

                    if (this.el.children.length === 1 || (!neighbor && opposite?.matches(protectedSelector))) {
                        place(utils.resetPlaceholderBlock(topLevelChild));
                        return;
                    }

                    const mergeTarget = neighbor ?? opposite;

                    if (mergeTarget) {
                        topLevelChild.remove();
                        place(
                            mergeTarget === previous
                                ? utils.placeCaretAtEnd(mergeTarget)
                                : utils.placeCaretAtStart(mergeTarget)
                        );
                        emitInput();
                        return;
                    }

                    place(utils.resetPlaceholderBlock(topLevelChild));
                    return;
                }

                if (topLevelChild && isBackspace && utils.isAtStartOf(range, topLevelChild)) {
                    const previous = topLevelChild.previousElementSibling as HTMLElement | null;

                    if (previous?.matches("scribby-code-block")) {
                        e.preventDefault();
                        place(utils.placeCaretInProtectedBlock(previous, "end"));
                        return;
                    }

                    if (previous?.matches(protectedSelector)) {
                        e.preventDefault();

                        const confirmed = await utils.confirmProtectedBlockDelete(previous);
                        if (!confirmed) return;

                        previous.remove();
                        place(utils.placeCaretAtStart(topLevelChild));
                        emitInput();
                        return;
                    }
                }

                if (topLevelChild && !isBackspace && utils.isAtEndOf(range, topLevelChild)) {
                    const next = topLevelChild.nextElementSibling as HTMLElement | null;

                    if (next?.matches("scribby-code-block")) {
                        e.preventDefault();
                        place(utils.placeCaretInProtectedBlock(next, "start"));
                        return;
                    }

                    if (next?.matches(protectedSelector)) {
                        e.preventDefault();

                        const confirmed = await utils.confirmProtectedBlockDelete(next);
                        if (!confirmed) return;

                        next.remove();
                        place(utils.placeCaretAtEnd(topLevelChild));
                        emitInput();
                        return;
                    }
                }

                if (
                    this.el.children.length === 1 &&
                    this.el.children[0] instanceof HTMLElement &&
                    utils.isPlaceholderOnlyBlock(this.el.children[0])
                ) {
                    e.preventDefault();
                    place(utils.resetPlaceholderBlock(this.el.children[0]));
                    return;
                }
            }
        })

        this.el.addEventListener("copy", (e) => {
            if (!e.clipboardData || !this.selection) return;

            e.preventDefault();

            const payload = createLatexClipboardPayload(
                this.selection,
                this.el,
            );

            e.clipboardData.setData(
                "application/x-scribby",
                payload.html,
            );
            e.clipboardData.setData("text/html", payload.html);
            e.clipboardData.setData("text/plain", payload.text);
        });

        this.el.addEventListener("cut", (e) => {
            if (!e.clipboardData || !this.selection) return;

            e.preventDefault();

            const payload = createLatexClipboardPayload(
                this.selection,
                this.el,
            );

            e.clipboardData.setData(
                "application/x-scribby",
                payload.html,
            );
            e.clipboardData.setData("text/html", payload.html);
            e.clipboardData.setData("text/plain", payload.text);

            payload.range.deleteContents();
            this.selection = utils.placeRange(payload.range);

            if (this.el.children.length === 0) {
                const paragraph = utils.makePlaceholderP();
                this.el.appendChild(paragraph);
                this.selection = utils.placeCaretAtStart(paragraph);
            }

            this.el.dispatchEvent(new Event("input"));
        });

        this.el.addEventListener("paste", (e) => {
            /**
             * steps:
             * 1. Clean clipboard
             * 2. Insert into DOM
             * 3. Normalize
             */
            e.preventDefault();

            const range = this.selection;
            if (!range || !e.clipboardData) return;

            const scribbyHtml = e.clipboardData.getData(
                "application/x-scribby",
            );

            const regularHtml = e.clipboardData.getData("text/html");
            const plain = e.clipboardData.getData("text/plain");

            let html =
                scribbyHtml && scribbyHtml !== "1"
                    ? scribbyHtml
                    : regularHtml;

            const fromScribby =
                scribbyHtml.length > 0 ||
                html.includes("<scribby-latex-block");

            if (!html && plain) {
                html = '<p>' + plain
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\r\n/g, '\n')
                    .replace(/\n{2,}/g, '</p><p>')
                    .replace(/\n/g, '<br>') + '</p>';
            }

            const snippet = parser.parseFromString(html, "text/html");
            const fragment = document.createDocumentFragment();

            while (snippet.body.firstChild) {
                fragment.appendChild(snippet.body.firstChild);
            }

            if (fromScribby) {
                preserveLatexBlock(fragment);
            }

            this.normalizer.convertPastedCodeBlocks(fragment);
            this.normalizer.removeNotSupportedNodes(fragment);

            if (!fromScribby) {
                utils.stripAttributes(fragment);

                const spans = fragment.querySelectorAll("span");
                spans.forEach((span) => {
                    utils.replaceElementWithChildren(span);
                });
            }

            utils.removeAllComments(fragment);
            const pastedBlocks = fragment.querySelectorAll<HTMLElement>(
                utils.UUID_BLOCKS
            );

            for (const block of pastedBlocks) {
                block.removeAttribute("data-uuid");
            }

            range.deleteContents();
            range.insertNode(fragment);

            const outOfOrderNodes =
                this.normalizer.flagNodeHierarchyViolations(
                    range.commonAncestorContainer,
                );

            this.normalizer.fixHierarchyViolations(outOfOrderNodes);
            this.el.dispatchEvent(new Event("input"));
        });

        this.el.addEventListener("focusin", (e) => {
            if (this.currentInsertModal) {
                this.currentInsertModal.unmount();
                this.currentInsertModal = null;
            }
        })

        this.el.addEventListener("input", (e) => {

            if (this.historyUpdateTimeoutId !== null) {
                clearTimeout(this.historyUpdateTimeoutId);
            }
            if (this.saveTimeoutId) {
                clearTimeout(this.saveTimeoutId);
            }
            this.historyUpdateTimeoutId = window.setTimeout(() => {
                this.historyUpdateTimeoutId = null;

                this.historyManager.push(
                    this.historyManager.createSnapshot(this.el),
                );
            }, this.historyUpdateDelayonInput);
            this.saveTimeoutId = window.setTimeout(() => {
                this.saveTimeoutId = null;

                // send out auto save event
                const saveEvent = new CustomEvent("save-document")
                document.dispatchEvent(saveEvent);
            }, this.saveDelayonInput);
            // normalize after input
            this.normalizer.removeNotSupportedNodes(this.el);
            const outOfOrderNodes = this.normalizer.flagNodeHierarchyViolations(this.el);
            this.normalizer.fixHierarchyViolations(outOfOrderNodes);
            this.normalizer.removeEmptyNodes(this.el);
            utils.applyUUIDs(this.el);

        });
        this.el.addEventListener(
            "scribby:block-change",
            () => {
                /*
                 * The input listener normalizes the inline/display hierarchy
                 * synchronously, then this immediately commits the component
                 * operation as one undo step.
                 */
                this.el.dispatchEvent(
                    new Event("input"),
                );

                this.flushPendingHistorySnapshot();
            },
        );
        this.el.addEventListener("activate-style-buttons", (e) => {
            const range = this.selection;
            if (!range) return;
            /**
             * steps: 
             * 1) check all blocks. 
             * 2) If no blocks, get closest block 
             * 3) Activate Block buttons
             * 4) check if contents would be one contiguous span 
             * 5) If not return 
             * 6) else we grab all styles and classes 
             * 7) Activate those buttons
             * 8) Change state of dropdown based on what blocks are selected
             */

            // handle blocks
            let blocks = utils.getBlockRanges(range.cloneRange(), this.el);
            const blockTags: Array<string> = [];

            for (const block of blocks) {
                const el = block.block as HTMLElement;
                if (!blockTags.includes(el.tagName.toLowerCase())) {
                    blockTags.push(el.tagName.toLowerCase());
                }
                if (blockTags.length > 1) break;
            }

            const dropDownOpen = document.querySelector(".dropdown-open");

            dropDownOpen!.textContent = blockTags.length > 1 ? "Body" : document.querySelector(`${this.selector} [data-tag="${blockTags[0]}"]`)?.textContent ?? "Body";

            let attributes: Record<string, string> = {}
            for (var i = 0; i < blocks.length; i++) {
                const el = blocks[i].block as HTMLElement;
                let newAttributes: Record<string, string> = {}
                if (i === 0) {
                    for (let j = 0; j < el.style.length; j++) {
                        const prop = el.style[j];
                        const value = el.style.getPropertyValue(prop);
                        attributes[prop] = value;
                    }
                }
                for (let j = 0; j < el.style.length; j++) {
                    const prop = el.style[j];
                    const value = el.style.getPropertyValue(prop);
                    if (attributes[prop] == value) {
                        newAttributes[prop] = value;
                    }
                }
                attributes = newAttributes;
            }
            const blockStyleButtons = document.querySelectorAll<HTMLElement>(`${this.selector} [data-button-type="block"]`);
            blockStyleButtons.forEach((el) => {
                const key = el.dataset.key;
                if (key && el.dataset.attribute == attributes[key]) {
                    el.classList.add("active");
                }
                else {
                    el.classList.remove("active");
                }
            })

            // handle spans
            const container = range.endContainer as HTMLElement
            const commonAncestorParent = range.commonAncestorContainer.parentElement;
            const classes: Record<string, Array<string>> = { "class": [] }
            attributes = {}
            if (commonAncestorParent?.tagName.toLowerCase() == "span") {
                const classList = Array.from(commonAncestorParent.classList);
                classes["class"] = classList
                const style = commonAncestorParent.getAttribute("style");
                if (style) {
                    style.split(";").forEach(rule => {
                        const [prop, value] = rule.split(":").map(s => s.trim());
                        if (prop && value) attributes[prop] = value;
                    });
                }

            }
            else if (range.collapsed && container.nodeType === Node.ELEMENT_NODE && container.tagName.toLowerCase() === "span") {
                const classList = Array.from(container.classList);
                classes["class"] = classList
                const style = container.getAttribute("style");
                if (style) {
                    style.split(";").forEach(rule => {
                        const [prop, value] = rule.split(":").map(s => s.trim());
                        if (prop && value) attributes[prop] = value;
                    });
                }
            }
            else {
                for (var i = 0; i < blocks.length; i++) {
                    const blockContent = blocks[i].blockRange.cloneContents();
                    const nodes = blockContent.childNodes;
                    for (let i = 0; i < nodes.length; i++) {
                        const node = nodes[i];
                        if (node.nodeType === Node.TEXT_NODE) {
                            const spanStyleButtons = document.querySelectorAll<HTMLElement>(`${this.selector} [data-button-type="span"]`);
                            spanStyleButtons.forEach((el) => {
                                el.classList.remove("active");
                            })
                            return;
                        }
                        const el = node as HTMLElement;
                        const classList = Array.from((node as HTMLElement).classList);
                        if (i === 0) {
                            classes["class"] = classList
                            const style = el.getAttribute("style");
                            if (style) {
                                style.split(";").forEach(rule => {
                                    const [prop, value] = rule.split(":").map(s => s.trim());
                                    if (prop && value) attributes[prop] = value;
                                });
                            }
                        }
                        else {
                            const newClassList = [];
                            const newAttributes: Record<string, string> = {}

                            // keep consistent classes
                            for (const nodeClass of classList) {
                                if (classes["class"].includes(nodeClass)) {
                                    newClassList.push(nodeClass);
                                }
                            }
                            classes["class"] = newClassList;
                            // keep consisten attributes
                            const style = el.getAttribute("style");
                            if (style) {
                                style.split(";").forEach(rule => {
                                    const [prop, value] = rule.split(":").map(s => s.trim());
                                    if (attributes[prop] == value) newAttributes[prop] = value;
                                });
                            }
                            attributes = newAttributes;
                        }
                    }
                }
            }

            const spanStyleButtons = document.querySelectorAll<HTMLElement>(`${this.selector} [data-button-type="span"]`);
            spanStyleButtons.forEach((el) => {
                const key = el.dataset.key;
                const attr = el.dataset.attribute;

                const matchesAttr =
                    !!key && typeof attr === "string" && attr === attributes[key];

                const matchesClass =
                    typeof attr === "string" && classes["class"].includes(attr);

                if (matchesAttr || matchesClass) {
                    el.classList.add("active");
                }
                else {
                    el.classList.remove("active");
                }
            })


        })

        document.addEventListener("selectionchange", () => {
            const activeElement =
                document.activeElement as HTMLElement | null;

            /*
             * Preserve the editor selection while typing inside either
             * editor modal.
             */
            if (
                activeElement?.closest(
                    ".insert-modal, .latex-modal",
                )
            ) {
                return;
            }

            const selection = window.getSelection();

            if (!selection || selection.rangeCount === 0) {
                this.selection = null;
                return;
            }

            const range = selection.getRangeAt(0);

            if (!this.el.contains(range.commonAncestorContainer)) {
                return;
            }

            const parent =
                range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                    ? range.commonAncestorContainer as HTMLElement
                    : range.commonAncestorContainer.parentElement;

            const closestLatexBlock =
                parent?.closest<HTMLElement>(
                    "scribby-latex-block",
                );

            if (closestLatexBlock) {
                if (this.currentInsertModal) {
                    this.currentInsertModal.close();
                    this.currentInsertModal = null;
                }

                if (this.currentTextModal) {
                    this.currentTextModal.unmount();
                    this.currentTextModal = null;
                }

                return;
            }

            if (this.currentInsertModal) {
                this.currentInsertModal.close();
                this.currentInsertModal = null;
            }

            if (this.currentTextModal) {
                this.currentTextModal.unmount();
                this.currentTextModal = null;
            }

            this.selection = range;
            this.el.dispatchEvent(events.activateStyleButtons);

            const closestAnchor = parent?.closest("a");
            const closestCodeBlock =
                parent?.closest("scribby-code-block");
            const closestSummary =
                parent?.closest("summary-output");
            const closestAudioBlock =
                parent?.closest("speech-output");
            const closestCanvas =
                parent?.closest("inline-canvas");

            if (
                closestAnchor &&
                this.currentInsertModal === null
            ) {
                const linkModal = new LinkModal(
                    this,
                    this.selection.getBoundingClientRect(),
                    closestAnchor,
                );

                this.currentTextModal = linkModal;
                linkModal.mount();

                return;
            }

            if (
                !closestCodeBlock &&
                !closestSummary &&
                !closestAudioBlock &&
                !closestCanvas
            ) {
                this.el.focus();
            }
        });

        return this
    }
    private initWhisperIfSupported() {
        const support = getLocalWhisperSupport();

        this.whisperEnabled = support.enabled;
        this.whisperThreadCount = support.transcriptionThreads;

        if (!support.enabled) {
            this.modelReadyPromise = null;

            console.info("[whisper] disabled", {
                reason: support.reason,
                availableThreads: support.availableThreads,
                crossOriginIsolated: window.crossOriginIsolated,
                sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
            });

            return;
        }

        this.modelReadyPromise = (async () => {
            const { WhisperClient } = await import("../whisper/whisper.js");

            (globalThis as any).Module = {
                print: () => { },
                printErr: () => { },
            };

            const whisper = new WhisperClient();
            this.whisper = whisper;

            await whisper.initRuntime("/whisper/main.js");

            console.log("[whisper] runtime ready");

            await whisper.loadModel("/whisper/ggml-tiny.bin", (p) => {
                console.log("[whisper] model", Math.round(p * 100), "%");
            });

            console.log("[whisper] model ready");
        })().catch((err) => {
            this.whisperEnabled = false;
            this.whisperThreadCount = 0;
            this.whisper = null;

            console.error("[whisper] init/load failed", err);
        });
    }
}
