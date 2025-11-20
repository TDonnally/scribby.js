/**
 * This is a basic implementation of history management that will work for a single tenant
 * When collaboration modes are introduced we will need to adjust this but it will work for now. 
 */

export type Snapshot = {
    timestamp: number;
    html: string;
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
}