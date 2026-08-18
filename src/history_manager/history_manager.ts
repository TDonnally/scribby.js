/**
 * This is a basic implementation of history management that will work for a single tenant
 * When collaboration modes are introduced we will need to adjust this but it will work for now.
 */
import { normalizeLatexSelectionPoint } from "../components/LatexBlock/utilities.js";
import { PROTECTED_BLOCK_SELECTOR } from "../utilities/utilities.js";

export type SelectionSnapshot = {
    startPath: number[];
    startOffset: number;
    endPath: number[];
    endOffset: number;
    collapsed: boolean;
};

export type Snapshot = {
    timestamp: number;
    html: HTMLElement;
    selection: SelectionSnapshot | null;
};

export class HistoryManager {
    private history: Snapshot[] = [];
    private index = -1;
    private limit = 50;

    public createSnapshot(rootEl: HTMLElement): Snapshot {
        return {
            timestamp: Date.now(),
            html: rootEl.cloneNode(true) as HTMLElement,
            selection: this.captureSelection(rootEl),
        };
    }

    public push(snapshot: Snapshot): void {
        const current = this.history[this.index];

        if (current?.html.isEqualNode(snapshot.html)) {
            this.history[this.index] = snapshot;
            return;
        }

        if (this.index < this.history.length - 1) {
            this.history = this.history.slice(0, this.index + 1);
        }

        this.history.push(snapshot);

        if (this.history.length > this.limit) {
            this.history.shift();
        }

        this.index = this.history.length - 1;
    }

    public undo(): Snapshot | null {
        if (this.index <= 0) return null;

        this.index--;
        return this.history[this.index];
    }

    public redo(): Snapshot | null {
        if (this.index >= this.history.length - 1) return null;

        this.index++;
        return this.history[this.index];
    }

    public hasUndo(): boolean {
        return this.index > 0;
    }

    public hasRedo(): boolean {
        return this.index < this.history.length - 1;
    }

    /**
     * Utilities for recreating selections.
     */
    public nodeToPath(root: Node, node: Node): number[] {
        const path: number[] = [];
        let current: Node | null = node;

        while (current && current !== root) {
            const parent: Node | null = current.parentNode;
            if (!parent) break;

            path.push(
                Array.prototype.indexOf.call(
                    parent.childNodes,
                    current,
                ),
            );

            current = parent;
        }

        return path.reverse();
    }

    public pathToNode(root: Node, path: number[]): Node | null {
        let current: Node = root;

        for (const index of path) {
            const next = current.childNodes[index];
            if (!next) return null;

            current = next;
        }

        return current;
    }

    public captureSelection(
        rootEl: HTMLElement,
    ): SelectionSnapshot | null {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);

        if (!rootEl.contains(range.commonAncestorContainer)) {
            return null;
        }

        const start = normalizeLatexSelectionPoint(
            rootEl,
            range.startContainer,
            range.startOffset,
            range.collapsed ? "after" : "before",
        );

        const end = normalizeLatexSelectionPoint(
            rootEl,
            range.endContainer,
            range.endOffset,
            "after",
        );

        return {
            startPath: this.nodeToPath(rootEl, start.node),
            startOffset: start.offset,
            endPath: this.nodeToPath(rootEl, end.node),
            endOffset: end.offset,
            collapsed: range.collapsed,
        };
    }

    public restoreSelection(
        rootEl: HTMLElement,
        snapshot: SelectionSnapshot | null,
    ): Range | null {
        if (!snapshot) return null;

        const startNode = this.pathToNode(
            rootEl,
            snapshot.startPath,
        );

        const endNode = this.pathToNode(
            rootEl,
            snapshot.endPath,
        );

        if (!startNode || !endNode) return null;

        try {
            const range = document.createRange();

            range.setStart(
                startNode,
                this.clampOffset(startNode, snapshot.startOffset),
            );

            range.setEnd(
                endNode,
                this.clampOffset(endNode, snapshot.endOffset),
            );

            if (snapshot.collapsed) {
                range.collapse(true);
            }

            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);

            return range;
        } catch {
            return null;
        }
    }

    private clampOffset(node: Node, offset: number): number {
        const maximum =
            node.nodeType === Node.TEXT_NODE
                ? (node as Text).length
                : node.childNodes.length;

        return Math.min(Math.max(offset, 0), maximum);
    }
    /**
     * 1. check each node in DOM tree
     * 2. If no Diff skip
     * 3. If diff inside node replace
     * 4. If node removed in currRoot then remove
     * 5. If node added in currRoot insert node after previous sibling in old root
     * 6. If node exists but is in the wrong position, move it
     */
    public diffDom(currRoot: HTMLElement, staleRoot: HTMLElement) {
        const currNodes = Array.from(currRoot.children) as HTMLElement[];
        const staleNodes = Array.from(staleRoot.children) as HTMLElement[];

        // remove stale nodes that are not in incoming diff
        for (const node of staleNodes) {
            const uuid = node.dataset.uuid;
            if (!uuid) continue;

            const currNode = currRoot.querySelector<HTMLElement>(`:scope > [data-uuid="${uuid}"]`);

            if (!currNode) {
                node.remove();
            }
        }

        for (const node of currNodes) {
            const uuid = node.dataset.uuid;
            if (!uuid) continue;

            const prevSibling = node.previousElementSibling as HTMLElement | null;
            const staleNode = staleRoot.querySelector<HTMLElement>(`:scope > [data-uuid="${uuid}"]`);

            const targetUUID = prevSibling?.dataset.uuid;
            const target = targetUUID
                ? staleRoot.querySelector<HTMLElement>(`:scope > [data-uuid="${targetUUID}"]`)
                : null;

            const nodesAreEqual = node.isEqualNode(staleNode);

            if (staleNode && !nodesAreEqual) {
                if (node.matches(PROTECTED_BLOCK_SELECTOR)) {
                    const incomingAttributes = new Set(node.getAttributeNames());

                    staleNode.getAttributeNames().forEach(attr => {
                        if (!incomingAttributes.has(attr)) {
                            staleNode.removeAttribute(attr);
                        }
                    });

                    node.getAttributeNames().forEach(attr => {
                        const value = node.getAttribute(attr)!;

                        if (staleNode.getAttribute(attr) !== value) {
                            staleNode.setAttribute(attr, value);
                        }
                    });
                } else {
                    staleNode.replaceWith(node.cloneNode(true));
                }
            }
            // case where curr node has no twin stale node
            else if (!staleNode && target) {
                target.after(node.cloneNode(true));
            }
            // case where no target and no twin stale node
            // this may happen if editor is emptied or node is first
            else if (!staleNode && !target) {
                staleRoot.prepend(node.cloneNode(true));
            }
        }
    }
}