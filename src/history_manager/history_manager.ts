/**
 * This is a basic implementation of history management that will work for a single tenant
 * When collaboration modes are introduced we will need to adjust this but it will work for now.
 */
import {
    normalizeLatexSelectionPoint,
    preserveLatexBlock,
} from "../components/LatexBlock/utilities.js";

export type SelectionSnapshot = {
    startPath: number[];
    startOffset: number;
    endPath: number[];
    endOffset: number;
    collapsed: boolean;
};

export type Snapshot = {
    timestamp: number;
    html: string;
    selection: SelectionSnapshot | null;
};

export class HistoryManager {
    private history: Snapshot[] = [];
    private index = -1;
    private limit = 50;

    /**
     * Serializes a clean LaTeX host rather than generated KaTeX children.
     * Other component types keep their existing history behavior.
     */
    public serialize(rootEl: HTMLElement): string {
        const clone = rootEl.cloneNode(true) as HTMLElement;
        preserveLatexBlock(clone);

        return clone.innerHTML;
    }

    public createSnapshot(rootEl: HTMLElement): Snapshot {
        return {
            timestamp: Date.now(),
            html: this.serialize(rootEl),
            selection: this.captureSelection(rootEl),
        };
    }

    public push(snapshot: Snapshot): void {
        const current = this.history[this.index];

        if (current?.html === snapshot.html) {
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
}