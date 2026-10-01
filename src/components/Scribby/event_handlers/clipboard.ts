import type { Scribby } from "../../Scribby.js"
import * as utils from "../../../utilities/utilities.js"
import {
    createLatexClipboardPayload,
    preserveLatexBlock,
} from "../../LatexBlock/utilities.js";

export function handleCopy(scribby: Scribby, e: ClipboardEvent) {
    if (!e.clipboardData || !scribby.selection) return;

    e.preventDefault();

    const payload = createLatexClipboardPayload(
        scribby.selection,
        scribby.el,
    );

    e.clipboardData.setData(
        "application/x-scribby",
        payload.html,
    );
    e.clipboardData.setData("text/html", payload.html);
    e.clipboardData.setData("text/plain", payload.text);
}
export function handleCut(scribby: Scribby, e: ClipboardEvent) {
    if (!e.clipboardData || !scribby.selection) return;

    e.preventDefault();

    const payload = createLatexClipboardPayload(
        scribby.selection,
        scribby.el,
    );

    e.clipboardData.setData(
        "application/x-scribby",
        payload.html,
    );
    e.clipboardData.setData("text/html", payload.html);
    e.clipboardData.setData("text/plain", payload.text);

    payload.range.deleteContents();
    scribby.selection = utils.placeRange(payload.range);

    if (scribby.el.children.length === 0) {
        const paragraph = utils.makePlaceholderP();
        scribby.el.appendChild(paragraph);
        scribby.selection = utils.placeCaretAtStart(paragraph);
    }

    scribby.el.dispatchEvent(new Event("input"));
}
export function handlePaste(scribby: Scribby, e: ClipboardEvent) {
    /**
                 * steps:
                 * 1. Clean clipboard
                 * 2. Insert into DOM
                 * 3. Normalize
                 */
    e.preventDefault();

    const range = scribby.selection;
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

    const snippet = scribby.parser.parseFromString(html, "text/html");
    const fragment = document.createDocumentFragment();

    while (snippet.body.firstChild) {
        fragment.appendChild(snippet.body.firstChild);
    }

    if (fromScribby) {
        preserveLatexBlock(fragment);
    }

    scribby.normalizer.convertPastedCodeBlocks(fragment);
    scribby.normalizer.removeNotSupportedNodes(fragment);

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
        scribby.normalizer.flagNodeHierarchyViolations(
            range.commonAncestorContainer,
        );

    scribby.normalizer.fixHierarchyViolations(outOfOrderNodes);
    scribby.el.dispatchEvent(new Event("input"));
}