interface AudioRecord {
    id: string;
    blob: Blob;
    timestamp: number;
    size: number;
    type: string;
}

export class AudioStorage {
    constructor(private dbName = 'AudioRecordings', private version = 1) { }

    private async open(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('audio')) {
                    const store = db.createObjectStore('audio', { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    async addBlob(blob: Blob): Promise<string> {
        const db = await this.open();
        const transaction = db.transaction(['audio'], 'readwrite');
        const store = transaction.objectStore('audio');

        const record: AudioRecord = {
            id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            blob: blob,
            timestamp: Date.now(),
            size: blob.size,
            type: blob.type
        };

        return new Promise((resolve, reject) => {
            const request = store.add(record);
            request.onsuccess = () => resolve(record.id);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllByTimestamp(): Promise<AudioRecord[]> {
        const db = await this.open();
        const transaction = db.transaction(['audio'], 'readonly');
        const store = transaction.objectStore('audio');
        const index = store.index('timestamp');

        return new Promise((resolve, reject) => {
            const request = index.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteAll(): Promise<void> {
        const db = await this.open();
        const transaction = db.transaction(['audio'], 'readwrite');
        const store = transaction.objectStore('audio');

        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}