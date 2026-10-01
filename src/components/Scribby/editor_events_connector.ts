import type { Scribby } from "../Scribby.js"
import * as handlers from "./event_handlers/index.js"

export function connectEditorEventHandlers(scribby: Scribby) {
    if (scribby.abortController){
        scribby.abortController.abort();
    }
    scribby.abortController = new AbortController();
    const editorEl = scribby.el;
    const signal = scribby.abortController.signal;
    editorEl.addEventListener("keydown", async (e) => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase()
            if (e.shiftKey) {
                if (key === "x") {
                    e.preventDefault();
                    handlers.strikethroughSelection(scribby);
                }
                else if (key === "l") {
                    e.preventDefault();
                    handlers.alignLeftSelection(scribby);
                }
                else if (key === "e") {
                    e.preventDefault();
                    handlers.alignCenterSelection(scribby);
                }
                else if (key === "c") {
                    e.preventDefault();
                    handlers.alignRightSelection(scribby);
                }
                else if (key === "&") {
                    e.preventDefault();
                    handlers.insertOrderedList(scribby);
                }
                else if (key === "*") {
                    e.preventDefault();
                    handlers.insertUnorderedList(scribby);
                }
            }
            // undo
            if (key === "z" && !e.shiftKey) {
                e.preventDefault();

                /*
                 * Preserve the latest debounced edit as the current state
                 * before moving backward through history.
                 */
                scribby.flushPendingHistorySnapshot();

                const snapshot = scribby.historyManager.undo();
                if (!snapshot) return;

                scribby.restoreHistorySnapshot(snapshot);
            }
            // redo
            else if (key === "y" || (key === "z" && e.shiftKey)) {
                e.preventDefault();

                /*
                 * A pending edit represents a new branch. Flushing it
                 * correctly invalidates any older redo branch.
                 */
                scribby.flushPendingHistorySnapshot();

                const snapshot = scribby.historyManager.redo();
                if (!snapshot) return;

                scribby.restoreHistorySnapshot(snapshot);
            }
            else if (key === "b") {
                e.preventDefault();
                handlers.boldSelection(scribby);
            }
            else if (key === "i") {
                e.preventDefault();
                handlers.italicizeSelection(scribby);
            }
            else if (key === "u") {
                e.preventDefault();
                handlers.underlineSelection(scribby);
            }
            else if (key === "k") {
                e.preventDefault();
                handlers.insertAnchor(scribby);
            }
            else if (key === "e") {
                e.preventDefault();
                handlers.insertCodeBlock(scribby);
            }


        }
        if (e.key === "Tab") {
            handlers.handleTab(scribby, e);
        }
        if (e.key === "Enter") {
            handlers.handleEnter(scribby, e);
        }
        if (e.key === "ArrowDown") {
            handlers.handleArrowDown(scribby, e);
        }
        if (e.key === "Delete" || e.key === "Backspace") {
            await handlers.handleBackSpace(scribby, e);
        }
    }, { signal } )
    editorEl.addEventListener("copy", (e) => {
        handlers.handleCopy(scribby, e);
    }, { signal });

    editorEl.addEventListener("cut", (e) => {
        handlers.handleCut(scribby, e);
    }, { signal });

    editorEl.addEventListener("paste", (e) => {
        handlers.handlePaste(scribby, e);
    }, { signal });

    editorEl.addEventListener("focusin", (e) => {
        handlers.handleFocusIn(scribby, e);
    }, { signal })

    editorEl.addEventListener("input", (e) => {
        handlers.handleInput(scribby, e);
    }, { signal });
    editorEl.addEventListener("scribby:block-change", () => {
        handlers.handleCustomBlockChange(scribby)        
    }, { signal });
    editorEl.addEventListener("activate-style-buttons", () => {
        handlers.activateToolbarStyleButtons(scribby)
    }, { signal })

    document.addEventListener("selectionchange", () => {
        handlers.handleChangeSelection(scribby)
    }, { signal })
}
