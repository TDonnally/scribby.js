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
import { ScribbyCodeBlock } from "./CodeBlock.js";
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


const parser = new DOMParser();


export class Scribby {
    selector: string;
    content: string | null;
    el!: HTMLDivElement;
    toolbar!: Toolbar;
    textElement: string;
    selection!: Range | null;
    allowedBlockStyles: Set<string>;
    allowedSpanStyles: Set<string>;
    normalizer!: Normalizer;
    historyManager: HistoryManager;

    timeoutId: number | null;
    historyUpdateDelayonInput: number;

    currentInsertModal: InsertModal | null = null;
    currentTextModal: LinkModal | null = null;

    constructor(
        selector = "",
        content: string | null = null
    ) {
        this.selector = selector;
        this.el;
        this.content = content;
        this.textElement = "p";
        this.selection;
        this.allowedBlockStyles = new Set;
        this.allowedSpanStyles = new Set;
        this.normalizer;
        this.historyManager = new HistoryManager();
        this.timeoutId = null;
        this.historyUpdateDelayonInput = 500;
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

        if (!this.content) this.content = container.innerHTML;

        this.el = document.createElement("div");
        this.el.contentEditable = 'true';
        this.el.classList.add("scribby");
        this.el.innerHTML = this.content

        const initSnapshot: Snapshot = {
            timestamp: Date.now(),
            html: this.content,
            selection: this.historyManager.captureSelection(this.el),
        }

        this.historyManager.push(initSnapshot);

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

        this.el.addEventListener("keydown", async (e) => {
            if (e.ctrlKey) {
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
                if (e.key === "z") {
                    e.preventDefault();
                    const snapshot = this.historyManager.undo();
                    if (!snapshot) return;
                    this.el.innerHTML = snapshot.html;
                    this.historyManager.restoreSelection(this.el, snapshot.selection);
                }
                else if (e.key === "y") {
                    e.preventDefault();
                    const snapshot = this.historyManager.redo();
                    if (!snapshot) return;
                    this.el.innerHTML = snapshot.html;
                    this.historyManager.restoreSelection(this.el, snapshot.selection);
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
                console.log(parent)
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

                if (startEl.closest(".cm-content")) {
                    return;
                }

                const currentLi = startEl.closest<HTMLElement>("li");
                const topLevelChild = utils.getTopLevelChild(range.startContainer, this.el);

                if (!range.collapsed) {
                    const protectedBlocks = utils.getProtectedBlocksInsideSelection(range);

                    if (protectedBlocks.length > 0) {
                        e.preventDefault();

                        const block = protectedBlocks[0];
                        const label =
                            block.matches("scribby-code-block")
                                ? "code block"
                                : block.matches("summary-output")
                                    ? "summary block"
                                    : "audio block";

                        const confirmed = await ConfirmOverlay.open({
                            message: `This action will delete this ${label}. Are you sure?`,
                            continueBtnTxt: "Continue",
                            cancelBtnTxt: "Cancel",
                        });

                        if (!confirmed) return;

                        range.deleteContents();

                        if (this.el.children.length === 0) {
                            const p = utils.makePlaceholderP();
                            this.el.appendChild(p);
                            const newRange = utils.placeCaretAtStart(p);
                            if (newRange) this.selection = newRange;
                        } else {
                            const newRange = utils.placeRange(range);
                            if (newRange) this.selection = newRange;
                        }

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }

                    if (currentLi && utils.selectionWouldEmpty(range, currentLi)) {
                        e.preventDefault();

                        const newRange = utils.resetPlaceholderBlock(currentLi);
                        if (newRange) this.selection = newRange;

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }

                    if (
                        topLevelChild &&
                        topLevelChild.matches(blockSelector) &&
                        utils.selectionWouldEmpty(range, topLevelChild) &&
                        (
                            topLevelChild.previousElementSibling?.matches(protectedSelector) ||
                            topLevelChild.nextElementSibling?.matches(protectedSelector)
                        )
                    ) {
                        e.preventDefault();

                        const newRange = utils.resetPlaceholderBlock(topLevelChild);
                        if (newRange) this.selection = newRange;

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }

                    return;
                }

                if (
                    currentLi &&
                    utils.collapsedDeleteWouldEmpty(range, currentLi, e.key)
                ) {
                    e.preventDefault();

                    const newRange = utils.resetPlaceholderBlock(currentLi);
                    if (newRange) this.selection = newRange;

                    this.el.dispatchEvent(new Event("input"));
                    return;
                }

                if (currentLi && utils.isPlaceholderOnlyBlock(currentLi)) {
                    const list = currentLi.parentElement as HTMLElement | null;
                    const prevLi = currentLi.previousElementSibling as HTMLElement | null;
                    const nextLi = currentLi.nextElementSibling as HTMLElement | null;

                    e.preventDefault();

                    if (e.key === "Backspace" && prevLi?.matches("li")) {
                        currentLi.remove();

                        const newRange = utils.placeCaretAtEnd(prevLi);
                        if (newRange) this.selection = newRange;

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }

                    if (e.key === "Delete" && nextLi?.matches("li")) {
                        currentLi.remove();

                        const newRange = utils.placeCaretAtStart(nextLi);
                        if (newRange) this.selection = newRange;

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }

                    if (e.key === "Backspace" && nextLi?.matches("li")) {
                        currentLi.remove();

                        const newRange = utils.placeCaretAtStart(nextLi);
                        if (newRange) this.selection = newRange;

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }

                    if (e.key === "Delete" && prevLi?.matches("li")) {
                        currentLi.remove();

                        const newRange = utils.placeCaretAtEnd(prevLi);
                        if (newRange) this.selection = newRange;

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }

                    if (list && (list.matches("ul") || list.matches("ol"))) {
                        const p = utils.makePlaceholderP();
                        list.replaceWith(p);

                        const newRange = utils.placeCaretAtStart(p);
                        if (newRange) this.selection = newRange;

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }

                    const newRange = utils.resetPlaceholderBlock(currentLi);
                    if (newRange) this.selection = newRange;

                    return;
                }

                if (
                    topLevelChild &&
                    topLevelChild.matches(blockSelector) &&
                    (
                        topLevelChild.previousElementSibling?.matches(protectedSelector) ||
                        topLevelChild.nextElementSibling?.matches(protectedSelector)
                    ) &&
                    utils.collapsedDeleteWouldEmpty(range, topLevelChild, e.key)
                ) {
                    e.preventDefault();

                    const newRange = utils.resetPlaceholderBlock(topLevelChild);
                    if (newRange) this.selection = newRange;

                    this.el.dispatchEvent(new Event("input"));
                    return;
                }

                const directProtectedBlock = startEl.closest<HTMLElement>(protectedSelector);

                if (directProtectedBlock) {
                    e.preventDefault();

                    if (directProtectedBlock.matches("scribby-code-block")) {
                        const newRange = utils.placeCaretInProtectedBlock(directProtectedBlock, "end");
                        if (newRange) this.selection = newRange;
                        return;
                    }

                    const label = directProtectedBlock.matches("summary-output")
                        ? "summary block"
                        : "audio block";

                    const confirmed = await ConfirmOverlay.open({
                        message: `This action will delete this ${label}. Are you sure?`,
                        continueBtnTxt: "Continue",
                        cancelBtnTxt: "Cancel",
                    });

                    if (!confirmed) return;

                    const after = directProtectedBlock.nextElementSibling as HTMLElement | null;
                    const before = directProtectedBlock.previousElementSibling as HTMLElement | null;
                    const caretTarget = after ?? before;
                    const edge = after ? "start" : "end";

                    directProtectedBlock.remove();

                    if (this.el.children.length === 0) {
                        const p = utils.makePlaceholderP();
                        this.el.appendChild(p);

                        const newRange = utils.placeCaretAtStart(p);
                        if (newRange) this.selection = newRange;
                    } else if (caretTarget && caretTarget.isConnected) {
                        const newRange =
                            edge === "start"
                                ? utils.placeCaretAtStart(caretTarget)
                                : utils.placeCaretAtEnd(caretTarget);

                        if (newRange) this.selection = newRange;
                    } else {
                        const first = this.el.firstElementChild as HTMLElement | null;

                        if (first) {
                            const newRange = utils.placeCaretAtStart(first);
                            if (newRange) this.selection = newRange;
                        }
                    }

                    this.el.dispatchEvent(new Event("input"));
                    return;
                }

                if (
                    topLevelChild &&
                    utils.isPlaceholderOnlyBlock(topLevelChild)
                ) {
                    const previous = topLevelChild.previousElementSibling as HTMLElement | null;
                    const next = topLevelChild.nextElementSibling as HTMLElement | null;

                    if (e.key === "Backspace" && previous?.matches("scribby-code-block")) {
                        e.preventDefault();

                        const newRange = utils.placeCaretInProtectedBlock(previous, "end");
                        if (newRange) this.selection = newRange;

                        return;
                    }

                    if (e.key === "Delete" && next?.matches("scribby-code-block")) {
                        e.preventDefault();

                        const newRange = utils.placeCaretInProtectedBlock(next, "start");
                        if (newRange) this.selection = newRange;

                        return;
                    }

                    if (e.key === "Backspace" && previous?.matches(protectedSelector)) {
                        e.preventDefault();

                        const label = previous.matches("summary-output") ? "summary block" : "audio block";

                        const confirmed = await ConfirmOverlay.open({
                            message: `This action will delete this ${label}. Are you sure?`,
                            continueBtnTxt: "Continue",
                            cancelBtnTxt: "Cancel",
                        });

                        if (!confirmed) return;

                        previous.remove();

                        if (this.el.children.length === 0) {
                            const p = utils.makePlaceholderP();
                            this.el.appendChild(p);

                            const newRange = utils.placeCaretAtStart(p);
                            if (newRange) this.selection = newRange;
                        } else {
                            const newRange = utils.placeCaretAtStart(topLevelChild);
                            if (newRange) this.selection = newRange;
                        }

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }

                    if (e.key === "Delete" && next?.matches(protectedSelector)) {
                        e.preventDefault();

                        const label = next.matches("summary-output") ? "summary block" : "audio block";

                        const confirmed = await ConfirmOverlay.open({
                            message: `This action will delete this ${label}. Are you sure?`,
                            continueBtnTxt: "Continue",
                            cancelBtnTxt: "Cancel",
                        });

                        if (!confirmed) return;

                        next.remove();

                        if (this.el.children.length === 0) {
                            const p = utils.makePlaceholderP();
                            this.el.appendChild(p);

                            const newRange = utils.placeCaretAtStart(p);
                            if (newRange) this.selection = newRange;
                        } else {
                            const newRange = utils.placeCaretAtStart(topLevelChild);
                            if (newRange) this.selection = newRange;
                        }

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }

                    if (e.key === "Backspace" && !previous && next?.matches(protectedSelector)) {
                        e.preventDefault();

                        const newRange = utils.resetPlaceholderBlock(topLevelChild);
                        if (newRange) this.selection = newRange;

                        return;
                    }

                    if (e.key === "Delete" && previous?.matches(protectedSelector) && !next) {
                        e.preventDefault();

                        const newRange = utils.resetPlaceholderBlock(topLevelChild);
                        if (newRange) this.selection = newRange;

                        return;
                    }

                    if (previous?.matches(protectedSelector) && next?.matches(protectedSelector)) {
                        e.preventDefault();

                        const newRange = utils.resetPlaceholderBlock(topLevelChild);
                        if (newRange) this.selection = newRange;

                        return;
                    }

                    e.preventDefault();

                    if (this.el.children.length === 1) {
                        const newRange = utils.resetPlaceholderBlock(topLevelChild);
                        if (newRange) this.selection = newRange;

                        return;
                    }

                    if (e.key === "Backspace") {
                        if (previous) {
                            topLevelChild.remove();

                            const newRange = utils.placeCaretAtEnd(previous);
                            if (newRange) this.selection = newRange;

                            this.el.dispatchEvent(new Event("input"));
                            return;
                        }

                        if (next) {
                            topLevelChild.remove();

                            const newRange = utils.placeCaretAtStart(next);
                            if (newRange) this.selection = newRange;

                            this.el.dispatchEvent(new Event("input"));
                            return;
                        }
                    }

                    if (e.key === "Delete") {
                        if (next) {
                            topLevelChild.remove();

                            const newRange = utils.placeCaretAtStart(next);
                            if (newRange) this.selection = newRange;

                            this.el.dispatchEvent(new Event("input"));
                            return;
                        }

                        if (previous) {
                            topLevelChild.remove();

                            const newRange = utils.placeCaretAtEnd(previous);
                            if (newRange) this.selection = newRange;

                            this.el.dispatchEvent(new Event("input"));
                            return;
                        }
                    }

                    const newRange = utils.resetPlaceholderBlock(topLevelChild);
                    if (newRange) this.selection = newRange;

                    return;
                }

                if (
                    topLevelChild &&
                    e.key === "Backspace" &&
                    utils.isAtStartOf(range, topLevelChild)
                ) {
                    const previous = topLevelChild.previousElementSibling as HTMLElement | null;

                    if (previous?.matches("scribby-code-block")) {
                        e.preventDefault();

                        const newRange = utils.placeCaretInProtectedBlock(previous, "end");
                        if (newRange) this.selection = newRange;

                        return;
                    }

                    if (previous?.matches(protectedSelector)) {
                        e.preventDefault();

                        const label = previous.matches("summary-output") ? "summary block" : "audio block";

                        const confirmed = await ConfirmOverlay.open({
                            message: `This action will delete this ${label}. Are you sure?`,
                            continueBtnTxt: "Continue",
                            cancelBtnTxt: "Cancel",
                        });

                        if (!confirmed) return;

                        previous.remove();

                        const newRange = utils.placeCaretAtStart(topLevelChild);
                        if (newRange) this.selection = newRange;

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }
                }

                if (
                    topLevelChild &&
                    e.key === "Delete" &&
                    utils.isAtEndOf(range, topLevelChild)
                ) {
                    const next = topLevelChild.nextElementSibling as HTMLElement | null;

                    if (next?.matches("scribby-code-block")) {
                        e.preventDefault();

                        const newRange = utils.placeCaretInProtectedBlock(next, "start");
                        if (newRange) this.selection = newRange;

                        return;
                    }

                    if (next?.matches(protectedSelector)) {
                        e.preventDefault();

                        const label = next.matches("summary-output") ? "summary block" : "audio block";

                        const confirmed = await ConfirmOverlay.open({
                            message: `This action will delete this ${label}. Are you sure?`,
                            continueBtnTxt: "Continue",
                            cancelBtnTxt: "Cancel",
                        });

                        if (!confirmed) return;

                        next.remove();

                        const newRange = utils.placeCaretAtEnd(topLevelChild);
                        if (newRange) this.selection = newRange;

                        this.el.dispatchEvent(new Event("input"));
                        return;
                    }
                }

                if (
                    this.el.children.length === 1 &&
                    this.el.children[0] instanceof HTMLElement &&
                    utils.isPlaceholderOnlyBlock(this.el.children[0])
                ) {
                    e.preventDefault();

                    const newRange = utils.resetPlaceholderBlock(this.el.children[0]);
                    if (newRange) this.selection = newRange;

                    return;
                }
            }
        })

        const mark = "<!--scribby-origin:1-->"
        const markRegex = /<!--\s*scribby-origin:1\s*-->/i;
        this.el.addEventListener("copy", (e) => {

            if (!e.clipboardData) return;
            e.preventDefault();

            const fragment = this.selection?.cloneContents();
            const div = document.createElement("div");
            if (fragment) {
                div.appendChild(fragment);
            }

            const html = div.innerHTML
            const markedHTML = mark + html;
            const text = div.innerText

            e.clipboardData.setData("text/html", markedHTML);
            if (text) {
                e.clipboardData.setData("text/plain", mark + text);
            }

        })
        this.el.addEventListener("cut", (e) => {
            if (!e.clipboardData) return;
            e.preventDefault();

            const fragment = this.selection?.cloneContents();
            const div = document.createElement("div");
            if (fragment) {
                div.appendChild(fragment);
            }

            const html = div.innerHTML
            const markedHTML = mark + html;
            const text = div.innerText

            e.clipboardData.setData("text/html", markedHTML);
            if (text) {
                e.clipboardData.setData("text/plain", mark + text);
            }

            this.selection?.deleteContents();
            if (this.selection?.commonAncestorContainer) {
                this.normalizer.removeEmptyNodes(this.selection?.commonAncestorContainer);
            }

        })
        this.el.addEventListener("paste", (e) => {
            /**
             * steps:
             * 1. Clean clipboard
             * 2. Insert into DOM
             * 3. Normalize
             * */
            e.preventDefault();
            const range = this.selection;
            if (!range) return;

            if (e.clipboardData == null) {
                return;
            }
            let html = e.clipboardData?.getData('text/html') || '';
            const plain = e.clipboardData?.getData('text/plain') || '';

            if (!html && plain) {
                console.log("no html")
                html = '<p>' + plain
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/\r\n/g, '\n')
                    .replace(/\n{2,}/g, '</p><p>')
                    .replace(/\n/g, '<br>') + '</p>';
            }

            const snippet = parser.parseFromString(html, 'text/html');
            const fragment = document.createDocumentFragment();

            while (snippet.body.firstChild) {
                fragment.appendChild(snippet.body.firstChild);
            }
            // normalize fragment
            this.normalizer.convertPastedCodeBlocks(fragment);
            this.normalizer.removeNotSupportedNodes(fragment);
            const fromScribby = !!html && markRegex.test(html);
            if (!fromScribby) {
                utils.stripAttributes(fragment);
                const spans = fragment.querySelectorAll("span");
                console.log(spans)
                spans.forEach((span) => {
                    utils.replaceElementWithChildren(span)
                })
            }
            // insert
            utils.removeAllComments(fragment)
            range.deleteContents();
            range.insertNode(fragment);

            // normalize after inserting
            const outOfOrderNodes = this.normalizer.flagNodeHierarchyViolations(range.commonAncestorContainer);
            console.log(outOfOrderNodes)
            this.normalizer.fixHierarchyViolations(outOfOrderNodes);
        })
        this.el.addEventListener("focusin", (e) => {
            if (this.currentInsertModal) {
                this.currentInsertModal.unmount();
                this.currentInsertModal = null;
            }
        })

        this.el.addEventListener("input", (e) => {

            if (this.timeoutId !== null) {
                clearTimeout(this.timeoutId);
            }
            this.timeoutId = window.setTimeout(() => {
                this.timeoutId = null;

                const snapshot: Snapshot = {
                    timestamp: Date.now(),
                    html: this.el.innerHTML,
                    selection: this.historyManager.captureSelection(this.el),
                };

                this.historyManager.push(snapshot);

                // send out auto save event
                this.content = this.el.innerHTML
                const saveEvent = new CustomEvent("save-document")
                document.dispatchEvent(saveEvent);
            }, this.historyUpdateDelayonInput);
            // normalize after input
            this.normalizer.removeNotSupportedNodes(this.el);
            const outOfOrderNodes = this.normalizer.flagNodeHierarchyViolations(this.el);
            console.log(outOfOrderNodes);
            this.normalizer.fixHierarchyViolations(outOfOrderNodes);
            this.normalizer.removeEmptyNodes(this.el);

        });
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
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                this.selection = null;
                return;
            }
            if (this.currentTextModal) this.currentTextModal.unmount();
            const range = sel.getRangeAt(0);
            if (this.el.contains(range.commonAncestorContainer)) {
                this.selection = range;
                this.el.dispatchEvent(events.activateStyleButtons);


                const parent = range.commonAncestorContainer.parentElement;
                const closestAnchor = parent?.closest("a");
                const closestCodeBlock = parent?.closest("scribby-code-block");
                const closestTextBox = parent?.closest("prompt-text-box");
                // check if we are inside an anchor and activate modal
                if (closestAnchor && this.currentInsertModal == null) {
                    const linkModal = new LinkModal(
                        this,
                        this.selection.getBoundingClientRect(),
                        closestAnchor,
                    );
                    this.currentTextModal = linkModal;
                    linkModal.mount();
                }

                // check if we are inside codemirror/closestTextBox code block

                else if (!closestCodeBlock && !closestTextBox) {
                    this.el.focus();
                }
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
