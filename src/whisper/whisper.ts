type WhisperOpts = {
    language?: string;
    threads?: number;   // 8 is default
};

type ProgressCb = (p01: number) => void;

declare global {
    interface Window {
        Module: any;
    }
}

const DB_NAME = "whisper-cache";
const DB_VERSION = 1;
const STORE = "models";

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbGet(key: string): Promise<Uint8Array | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const os = tx.objectStore(STORE);
        const req = os.get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
}

async function idbPut(key: string, value: Uint8Array): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const os = tx.objectStore(STORE);
        const req = os.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function fetchWithProgress(url: string, onProgress?: ProgressCb): Promise<Uint8Array> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);

    const lenHdr = res.headers.get("content-length");
    const total = lenHdr ? parseInt(lenHdr, 10) : 0;

    if (!res.body) {
        const buf = new Uint8Array(await res.arrayBuffer());
        onProgress?.(1);
        return buf;
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (total) onProgress?.(received / total);
    }

    const out = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.byteLength;
    }
    onProgress?.(1);
    return out;
}

function ensureWasmModelInFS(modelBytes: Uint8Array, fsName: string) {
    const Module = window.Module;
    if (!Module) throw new Error("Module not loaded yet");

    try { Module.FS_unlink(fsName); } catch { }
    Module.FS_createDataFile("/", fsName, modelBytes, true, true);
}

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`failed to load script: ${src}`));
        document.head.appendChild(s);
    });
}

export async function loadWhisperRuntime(mainJsUrl: string): Promise<any> {
    if (window.Module?.init && window.Module?.full_default) return window.Module;

    window.Module = window.Module ?? {};
    window.Module.print = window.Module.print ?? ((...args: any[]) => console.log("[whisper]", ...args));

    /**
     * Some log messages are printing like errors and I can't figure out why.
     * Commenting out Error logs for the time being.
     */

    //window.Module.printErr = window.Module.printErr ?? ((...args: any[]) => console.error("[whisper]", ...args));

    const ready = new Promise<any>((resolve) => {
        const prev = window.Module.onRuntimeInitialized;
        window.Module.onRuntimeInitialized = () => {
            prev?.();
            resolve(window.Module);
        };
    });

    await loadScript(mainJsUrl);
    return ready;
}


async function decodeToMono16kFloat(blob: Blob): Promise<Float32Array> {
    const kSampleRate = 16000;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const OfflineCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AudioCtx || !OfflineCtx) throw new Error("WebAudio not supported");


    const ctx = new AudioCtx({ sampleRate: kSampleRate });
    const buf = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf.slice(0) as ArrayBuffer);

    const offline = new OfflineCtx(1, decoded.length, kSampleRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);

    const rendered = await offline.startRendering();
    const audio = rendered.getChannelData(0);

    try { await ctx.close(); } catch { }
    return audio;
}

export class WhisperClient {
    private module!: any;
    private instance: any = null;
    private modelFsName = "whisper.bin";

    async initRuntime(mainJsUrl: string) {
        this.module = await loadWhisperRuntime(mainJsUrl);
    }

    async loadModel(modelUrl: string, onProgress?: ProgressCb) {
        if (!this.module) throw new Error("Call initRuntime() first");

        let bytes = await idbGet(modelUrl);

        if (!bytes) {
            bytes = await fetchWithProgress(modelUrl, onProgress);
            await idbPut(modelUrl, bytes);
        } else {
            onProgress?.(1);
        }

        ensureWasmModelInFS(bytes, this.modelFsName);

        if (!this.instance) {
            this.instance = this.module.init(this.modelFsName);
            if (!this.instance) throw new Error("Module.init() failed");
        }
    }

    async transcribeBlob(blob: Blob, opts: WhisperOpts = {}) {
        return this.runBlob(blob, { ...opts, translate: false });
    }

    async translateBlob(blob: Blob, opts: WhisperOpts = {}) {
        return this.runBlob(blob, { ...opts, translate: true });
    }

    private async runBlob(blob: Blob, args: WhisperOpts & { translate: boolean }): Promise<string> {
        if (!this.instance) throw new Error("Call loadModel() first");

        const audio = await decodeToMono16kFloat(blob);
        const lang = args.language ?? "en";
        const threads = args.threads ?? 8

        const result = this.module.full_default(this.instance, audio, lang, threads, args.translate);

        if (result !== 0) {
            throw new Error(`Whisper error: ${result}`);
        }

        while (this.module.is_running()) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.module.wait();

        const text: string = this.module.get_text(this.instance);
        return text ?? "";
    }
}
