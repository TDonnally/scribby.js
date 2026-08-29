type WhisperOpts = {
    language?: string;
    threads?: number;
};

type ProgressCb = (p01: number) => void;

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

type PendingRequest = {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    onProgress?: ProgressCb;
};

async function decodeToMono16kFloat(blob: Blob): Promise<Float32Array> {
    const kSampleRate = 16000;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const OfflineCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;

    if (!AudioCtx || !OfflineCtx) {
        throw new Error("WebAudio not supported");
    }

    const ctx = new AudioCtx({ sampleRate: kSampleRate });

    try {
        const buf = await blob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf.slice(0) as ArrayBuffer);
        const outputLength = Math.max(1, Math.ceil(decoded.duration * kSampleRate));

        const offline = new OfflineCtx(1, outputLength, kSampleRate);
        const src = offline.createBufferSource();
        src.buffer = decoded;
        src.connect(offline.destination);
        src.start(0);

        const rendered = await offline.startRendering();
        const renderedAudio = rendered.getChannelData(0);

        return new Float32Array(renderedAudio);
    } finally {
        try {
            await ctx.close();
        } catch { }
    }
}

export class WhisperClient {
    private worker: Worker | null = null;
    private pending = new Map<string, PendingRequest>();
    private runtimeReady = false;
    private modelReady = false;

    constructor(
        private workerUrl = "/scripts/whisper_worker.js",
    ) { }

    private ensureWorker(): Worker {
        if (this.worker) {
            return this.worker;
        }

        const worker = new Worker(this.workerUrl);

        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const message = e.data;
            const pending = this.pending.get(message.id);

            if (!pending) {
                return;
            }

            if (message.type === "progress") {
                pending.onProgress?.(message.progress ?? 0);
                return;
            }

            this.pending.delete(message.id);

            if (message.type === "error") {
                pending.reject(new Error(message.error || "Whisper worker failed"));
                return;
            }

            pending.resolve(message.result);
        };

        worker.onerror = (e: ErrorEvent) => {
            const error = new Error(e.message || "Whisper worker crashed");
            this.rejectAllPending(error);
            this.destroyWorker();
        };

        worker.onmessageerror = () => {
            const error = new Error("Whisper worker message could not be decoded");
            this.rejectAllPending(error);
            this.destroyWorker();
        };

        this.worker = worker;
        return worker;
    }

    private sendRequest<T>(
        request: Omit<WorkerRequest, "id">,
        transfer: Transferable[] = [],
        onProgress?: ProgressCb,
    ): Promise<T> {
        const worker = this.ensureWorker();
        const id = crypto.randomUUID();

        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, {
                resolve,
                reject,
                onProgress,
            });

            try {
                worker.postMessage({
                    ...request,
                    id,
                } satisfies WorkerRequest, transfer);
            } catch (err) {
                this.pending.delete(id);
                reject(err);
            }
        });
    }

    private rejectAllPending(error: Error) {
        for (const pending of this.pending.values()) {
            pending.reject(error);
        }

        this.pending.clear();
    }

    private destroyWorker() {
        this.worker?.terminate();
        this.worker = null;
        this.runtimeReady = false;
        this.modelReady = false;
    }

    async initRuntime(mainJsUrl: string) {
        if (this.runtimeReady) {
            return;
        }

        await this.sendRequest<void>({
            type: "init-runtime",
            mainJsUrl,
        });

        this.runtimeReady = true;
    }

    async loadModel(modelUrl: string, onProgress?: ProgressCb) {
        if (!this.runtimeReady) {
            throw new Error("Call initRuntime() first");
        }

        if (this.modelReady) {
            onProgress?.(1);
            return;
        }

        await this.sendRequest<void>({
            type: "load-model",
            modelUrl,
        }, [], onProgress);

        this.modelReady = true;
    }

    async transcribeBlob(blob: Blob, opts: WhisperOpts = {}) {
        return this.runBlob(blob, { ...opts, translate: false });
    }

    async translateBlob(blob: Blob, opts: WhisperOpts = {}) {
        return this.runBlob(blob, { ...opts, translate: true });
    }

    private async runBlob(
        blob: Blob,
        args: WhisperOpts & { translate: boolean },
    ): Promise<string> {
        if (!this.modelReady) {
            throw new Error("Call loadModel() first");
        }

        const audio = await decodeToMono16kFloat(blob);
        const lang = args.language ?? "en";
        const threads = args.threads ?? 8;

        const text = await this.sendRequest<string>({
            type: "transcribe",
            audio,
            language: lang,
            threads,
            translate: args.translate,
        }, [audio.buffer]);

        return text ?? "";
    }

    async transcribeSamples(
        audio: Float32Array,
        opts: WhisperOpts = {},
    ): Promise<string> {
        if (!this.modelReady) {
            throw new Error("Call loadModel() first");
        }

        console.log("[whisper-client] sending audio to worker", {
            samples: audio.length,
            bytes: audio.byteLength,
            language: opts.language ?? "en",
            threads: opts.threads ?? 8,
        });

        const text = await this.sendRequest<string>({
            type: "transcribe",
            audio,
            language: opts.language ?? "en",
            threads: opts.threads ?? 8,
            translate: false,
        }, [audio.buffer]);

        console.log("[whisper-client] worker returned", {
            text,
        });

        return text ?? "";
    }

    terminate() {
        if (!this.worker) {
            return;
        }

        this.rejectAllPending(new Error("Whisper worker terminated"));
        this.destroyWorker();
    }
}