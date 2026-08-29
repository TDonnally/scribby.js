type WorkerRequest = {
    id: string;
    type: "init-runtime" | "load-model" | "transcribe";
    mainJsUrl?: string;
    modelUrl?: string;
    audio?: Float32Array;
    language?: string;
    threads?: number;
    translate?: boolean;
};

type WorkerResponse = {
    id: string;
    type: "result" | "error" | "progress";
    result?: unknown;
    error?: string;
    progress?: number;
};

type ProgressCb = (p01: number) => void;

const scope = globalThis as any;

const DB_NAME = "whisper-cache";
const DB_VERSION = 1;
const STORE = "models";
const MODEL_FS_NAME = "whisper.bin";

let moduleInstance: any = null;
let whisperInstance: any = null;
let runtimePromise: Promise<void> | null = null;
let modelPromise: Promise<void> | null = null;
let transcriptionQueue: Promise<void> = Promise.resolve();

function post(message: WorkerResponse) {
    scope.postMessage(message);
}

function errorMessage(err: unknown): string {
    if (err instanceof Error) {
        return err.message;
    }

    return String(err);
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = () => {
            const db = req.result;

            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE);
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbGet(key: string): Promise<Uint8Array | null> {
    const db = await openDb();

    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const os = tx.objectStore(STORE);
            const req = os.get(key);

            req.onsuccess = () => {
                const result = req.result;

                if (!result) {
                    resolve(null);
                    return;
                }

                if (result instanceof Uint8Array) {
                    resolve(result);
                    return;
                }

                if (result instanceof ArrayBuffer) {
                    resolve(new Uint8Array(result));
                    return;
                }

                resolve(new Uint8Array(result));
            };

            req.onerror = () => reject(req.error);
        });
    } finally {
        db.close();
    }
}

async function idbPut(key: string, value: Uint8Array): Promise<void> {
    const db = await openDb();

    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            const os = tx.objectStore(STORE);
            const req = os.put(value, key);

            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } finally {
        db.close();
    }
}

async function fetchWithProgress(
    url: string,
    onProgress?: ProgressCb,
): Promise<Uint8Array> {
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`fetch failed ${res.status}: ${url}`);
    }

    const lenHdr = res.headers.get("content-length");
    const total = lenHdr ? parseInt(lenHdr, 10) : 0;

    if (!res.body) {
        const buf = new Uint8Array(await res.arrayBuffer());
        onProgress?.(1);
        return buf;
    }

    const reader = res.body.getReader();

    if (total > 0) {
        const out = new Uint8Array(total);
        let received = 0;

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            out.set(value, received);
            received += value.byteLength;
            onProgress?.(Math.min(1, received / total));
        }

        onProgress?.(1);

        if (received === out.byteLength) {
            return out;
        }

        return out.slice(0, received);
    }

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        chunks.push(value);
        received += value.byteLength;
    }

    const out = new Uint8Array(received);
    let offset = 0;

    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }

    onProgress?.(1);
    return out;
}

function ensureWasmModelInFS(modelBytes: Uint8Array, fsName: string) {
    if (!moduleInstance) {
        throw new Error("Whisper runtime not loaded");
    }

    try {
        moduleInstance.FS_unlink(`/${fsName}`);
    } catch { }

    moduleInstance.FS_createDataFile(
        "/",
        fsName,
        modelBytes,
        true,
        true,
    );
}

function removeWasmModelFromFS(fsName: string) {
    if (!moduleInstance) {
        return;
    }

    try {
        moduleInstance.FS_unlink(`/${fsName}`);
    } catch { }
}

async function initRuntime(mainJsUrl: string): Promise<void> {
    if (moduleInstance?.init && moduleInstance?.full_default) {
        return;
    }

    if (runtimePromise) {
        return runtimePromise;
    }

    const resolvedMainJsUrl = new URL(
        mainJsUrl,
        scope.location.href,
    ).toString();

    console.log("[whisper-worker] resolved runtime URL", resolvedMainJsUrl);

    runtimePromise = new Promise<void>((resolve, reject) => {
        const runtimeModule: any = {
            print: (...args: any[]) => {
                console.log("[whisper-wasm]", ...args);
            },

            printErr: (...args: any[]) => {
                console.error("[whisper-wasm]", ...args);
            },

            /*
             * Critical for Emscripten pthreads when the generated runtime
             * itself is loaded via importScripts() from another Worker.
             */
            mainScriptUrlOrBlob: resolvedMainJsUrl,

            locateFile: (path: string) => {
                return new URL(
                    path,
                    resolvedMainJsUrl,
                ).toString();
            },
        };

        runtimeModule.onRuntimeInitialized = () => {
            moduleInstance = scope.Module || runtimeModule;

            console.log("[whisper-worker] runtime initialized", {
                fullDefault: !!moduleInstance?.full_default,
                getText: !!moduleInstance?.get_text,
            });

            resolve();
        };

        scope.Module = runtimeModule;

        try {
            scope.importScripts(resolvedMainJsUrl);
        } catch (err) {
            runtimePromise = null;
            reject(err);
        }
    });

    try {
        await runtimePromise;
    } catch (err) {
        runtimePromise = null;
        throw err;
    }
}

async function loadModel(
    modelUrl: string,
    onProgress?: ProgressCb,
): Promise<void> {
    if (!moduleInstance) {
        throw new Error("Call initRuntime() first");
    }

    if (whisperInstance) {
        onProgress?.(1);
        return;
    }

    if (modelPromise) {
        return modelPromise;
    }

    modelPromise = (async () => {
        let bytes = await idbGet(modelUrl);

        if (!bytes) {
            bytes = await fetchWithProgress(modelUrl, onProgress);
            await idbPut(modelUrl, bytes);
        } else {
            onProgress?.(1);
        }

        ensureWasmModelInFS(bytes, MODEL_FS_NAME);

        try {
            whisperInstance = moduleInstance.init(MODEL_FS_NAME);

            if (!whisperInstance) {
                throw new Error("Module.init() failed");
            }
        } finally {
            removeWasmModelFromFS(MODEL_FS_NAME);
        }
    })();

    try {
        await modelPromise;
    } catch (err) {
        modelPromise = null;
        throw err;
    }
}

async function transcribe(
    audio: Float32Array,
    language: string,
    threads: number,
    translate: boolean,
): Promise<string> {
    if (!moduleInstance || !whisperInstance) {
        throw new Error("Call loadModel() first");
    }

    console.log("[whisper-worker] calling full_default", {
        samples: audio.length,
        whisperInstance: !!whisperInstance,
        language,
        threads,
        translate,
    });

    const result = moduleInstance.full_default(
        whisperInstance,
        audio,
        language,
        threads,
        translate,
    );

    console.log("[whisper-worker] full_default finished", {
        result,
    });

    if (result !== 0) {
        throw new Error(`Whisper error: ${result}`);
    }

    const text: string =
        moduleInstance.get_text(whisperInstance);

    console.log("[whisper-worker] get_text returned", {
        text,
    });

    return text ?? "";
}

async function handleRequest(message: WorkerRequest) {
    if (message.type === "init-runtime") {
        if (!message.mainJsUrl) {
            throw new Error("Missing mainJsUrl");
        }

        await initRuntime(message.mainJsUrl);
        post({ id: message.id, type: "result" });
        return;
    }

    if (message.type === "load-model") {
        if (!message.modelUrl) {
            throw new Error("Missing modelUrl");
        }

        await loadModel(message.modelUrl, (progress) => {
            post({
                id: message.id,
                type: "progress",
                progress,
            });
        });

        post({ id: message.id, type: "result" });
        return;
    }

    if (message.type === "transcribe") {
        if (!message.audio) {
            throw new Error("Missing audio");
        }

        console.log("[whisper-worker] received audio", {
            samples: message.audio.length,
            bytes: message.audio.byteLength,
            language: message.language,
            threads: message.threads,
            translate: message.translate,
        });

        const text = await transcribe(
            message.audio,
            message.language ?? "en",
            message.threads ?? 8,
            message.translate ?? false,
        );

        console.log("[whisper-worker] transcribed", {
            text,
        });

        post({
            id: message.id,
            type: "result",
            result: text,
        });
    }
}

scope.onmessage = (e: MessageEvent<WorkerRequest>) => {
    const message = e.data;

    if (message.type === "transcribe") {
        transcriptionQueue = transcriptionQueue
            .then(() => handleRequest(message))
            .catch((err) => {
                post({
                    id: message.id,
                    type: "error",
                    error: errorMessage(err),
                });
            });

        return;
    }

    handleRequest(message).catch((err) => {
        post({
            id: message.id,
            type: "error",
            error: errorMessage(err),
        });
    });
};