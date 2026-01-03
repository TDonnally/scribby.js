/**
 * This is a basic implementation of history management that will work for a single tenant
 * When collaboration modes are introduced we will need to adjust this but it will work for now. 
 */
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

    push(snapshot: Snapshot) {
        if (this.index < this.history.length - 1) {
            this.history = this.history.slice(0, this.index + 1);
        }

        this.history.push(snapshot);

        if (this.history.length > this.limit) {
            this.history.shift();
            this.index = this.history.length - 1;
        } else {
            this.index = this.history.length - 1;
        }
    }
    undo(): Snapshot | null {
        if (this.index <= 0) return null;
        this.index--;
        return this.history[this.index];
    }
    redo(): Snapshot | null {
        if (this.index >= this.history.length - 1) return null;
        this.index++;
        return this.history[this.index];
    }
    hasUndo() {
        return this.index > 0;
    }
    hasRedo() {
        return this.index < this.history.length - 1;
    }

    /**
     * Utilities for recreating selections
     */
    nodeToPath(root: Node, node: Node): number[] {
        const path: number[] = [];
        let cur: Node | null = node;

        while (cur && cur !== root) {
            const p: Node | null = cur.parentNode;
            if (!p) break;

            path.push(Array.prototype.indexOf.call(p.childNodes, cur));
            cur = p;
        }

        return path.reverse();
    }

    pathToNode(root: Node, path: number[]): Node | null {
        let cur: Node = root;
        for (const idx of path) {
            const next = cur.childNodes[idx];
            if (!next) return null;
            cur = next;
        }
        return cur;
    }

    captureSelection(rootEl: HTMLElement): SelectionSnapshot | null {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;

        const r = sel.getRangeAt(0);
        if (!rootEl.contains(r.commonAncestorContainer)) return null;

        return {
            startPath: this.nodeToPath(rootEl, r.startContainer),
            startOffset: r.startOffset,
            endPath: this.nodeToPath(rootEl, r.endContainer),
            endOffset: r.endOffset,
            collapsed: r.collapsed,
        };
    }

    restoreSelection(rootEl: HTMLElement, snap: SelectionSnapshot | null) {
        if (!snap) return;

        const startNode = this.pathToNode(rootEl, snap.startPath);
        const endNode = this.pathToNode(rootEl, snap.endPath);
        if (!startNode || !endNode) return;

        const r = document.createRange();
        r.setStart(startNode, Math.min(snap.startOffset, startNode.nodeType === 3 ? (startNode as Text).length : startNode.childNodes.length));
        r.setEnd(endNode, Math.min(snap.endOffset, endNode.nodeType === 3 ? (endNode as Text).length : endNode.childNodes.length));

        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
    }
}