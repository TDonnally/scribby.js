import type { Scribby } from "../../Scribby.js"
import * as utils from "../../../utilities/utilities.js"

export function handleInput(scribby: Scribby, e: Event) {

    if (scribby.historyUpdateTimeoutId !== null) {
        clearTimeout(scribby.historyUpdateTimeoutId);
    }
    if (scribby.saveTimeoutId) {
        clearTimeout(scribby.saveTimeoutId);
    }
    scribby.historyUpdateTimeoutId = window.setTimeout(() => {
        scribby.historyUpdateTimeoutId = null;

        scribby.historyManager.push(
            scribby.historyManager.createSnapshot(scribby.el),
        );
    }, scribby.historyUpdateDelayonInput);
    scribby.saveTimeoutId = window.setTimeout(() => {
        scribby.saveTimeoutId = null;

        // send out auto save event
        const saveEvent = new CustomEvent("save-document")
        document.dispatchEvent(saveEvent);
    }, scribby.saveDelayonInput);
    // normalize after input
    scribby.normalizer.removeNotSupportedNodes(scribby.el);
    const outOfOrderNodes = scribby.normalizer.flagNodeHierarchyViolations(scribby.el);
    scribby.normalizer.fixHierarchyViolations(outOfOrderNodes);
    scribby.normalizer.removeEmptyNodes(scribby.el);
    utils.applyUUIDs(scribby.el);
}