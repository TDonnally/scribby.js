import { SpeechToText, Input } from "../SpeechtoText";

type PlaybackSegment = {
    segment_id: string;
    sequence_number: number;
    url: string;
    mime_type?: string;
    duration_ms: number;
};
type TranscriptChunk = {
    id: string;
    text: string;
    start_sec: number;
    end_sec: number;
    segment_id: string | null;
};

const tpl = document.createElement("template");
tpl.innerHTML = `
    <div contenteditable="false">
        <div class="output-header">
            <div class="playback-controls">
                <play-button></play-button>
                <audio-scrubber></audio-scrubber>
            </div>
            <div class="record-controls"></div>
        </div>

        

        <div class="output-container">
            <button class="output-expand-toggle" type="button" aria-label="Expand transcript">
                <svg class="expand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <title>arrow-expand</title>
                    <path d="M10,21V19H6.41L10.91,14.5L9.5,13.09L5,17.59V14H3V21H10M14.5,10.91L19,6.41V10H21V3H14V5H17.59L13.09,9.5L14.5,10.91Z" />
                </svg>
            </button>

            <div class="output"></div>
        </div>
    </div>
`;

const recordingBtnsState = document.createElement("template");
recordingBtnsState.innerHTML = `
    <stop-button></stop-button>
`;

const nonRecordingBtnsState = document.createElement("template");
nonRecordingBtnsState.innerHTML = `
    <record-button></record-button>
`;

export class SpeechOutput extends HTMLElement {
    controller: SpeechToText | null = null;
    recording: Boolean = false;

    private recordControlsEl!: HTMLDivElement;
    private outputEl!: HTMLElement;
    private audioEl = new Audio();

    private playbackSegments: PlaybackSegment[] = [];
    private playbackDurations: number[] = [];
    private playbackOffsets: number[] = [];
    private playbackSegmentIndex = 0;
    private playing = false;
    private endingPlayback = false;

    private transcriptChunks: TranscriptChunk[] = [];
    private activeTranscriptId: string | null = null;

    private typingWorker: Worker | null = null;
    private visibleTextByChunkId = new Map<string, string>();

    private outputContainerEl!: HTMLElement;
    private outputExpandToggleEl!: HTMLButtonElement;
    private outputExpanded = false;

    connectedCallback() {
        if (!this.firstChild) {
            this.appendChild(tpl.content.cloneNode(true));
        }

        this.outputEl = this.querySelector(".output") as HTMLElement;
        this.recordControlsEl = this.querySelector(".record-controls") as HTMLDivElement;
        this.outputContainerEl = this.querySelector(".output-container") as HTMLElement;
        this.outputExpandToggleEl = this.querySelector(".output-expand-toggle") as HTMLButtonElement;

        this.outputExpandToggleEl.addEventListener("click", () => {
            this.toggleOutputExpanded();
        });

        if (!this.typingWorker) {
            this.typingWorker = new Worker("/scripts/text_buffer_loop.js");

            this.typingWorker.onmessage = (e: MessageEvent<{
                id: string;
                text: string;
                done?: boolean;
            }>) => {
                const { id, text, done } = e.data;

                const textEl = this.outputEl.querySelector<HTMLElement>(
                    `.transcript-chunk[data-transcript-id="${id}"] .transcript-text`
                );

                if (!textEl) {
                    return;
                }

                textEl.textContent = done ? text + " " : text;

                if (done) {
                    this.visibleTextByChunkId.delete(id);
                } else {
                    this.visibleTextByChunkId.set(id, text);
                }
            };
        }

        this.outputEl.addEventListener("click", async (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const chunkEl = target.closest<HTMLElement>(".transcript-chunk");

            if (!chunkEl) {
                return;
            }

            const startSec = Number(chunkEl.dataset.startSec);
            if (!Number.isFinite(startSec)) {
                return;
            }

            await this.seekPlayback(startSec);
        });

        this.loadTranscriptFromDataset();
        this.renderTranscript();

        this.refreshButtons();
        this.setupPlayback();

        const recordingId = this.dataset.audioId;
        if (recordingId) {
            this.loadPlaybackManifest(recordingId).catch(console.error);
        }

        this.addEventListener("start-recording", (e: Event) => {
            const custom = e as CustomEvent<{ input?: Input }>;
            if (!custom.detail?.input) {
                return;
            }

            this.dataset.input = custom.detail.input;

            document.dispatchEvent(new CustomEvent("request-speech-controller", {
                detail: {
                    input: custom.detail.input,
                    target: this,
                }
            }));
        });

        this.addEventListener("play-audio", async () => {
            if (this.recording) {
                return;
            }

            await this.togglePlayback();
        });

        this.addEventListener("seek-audio", async (e: Event) => {
            if (this.recording) {
                return;
            }

            const custom = e as CustomEvent<{ time: number }>;
            await this.seekPlayback(custom.detail.time);
        });

        document.addEventListener("stop-recording", async () => {
            this.recording = false;
            this.refreshButtons();
            await this.controller?.stopRecording();
        });

        document.addEventListener("pause-all-audio", (e: Event) => {
            const custom = e as CustomEvent<{ source?: SpeechOutput }>;
            if (custom.detail?.source === this) {
                return;
            }
            this.pausePlayback();
        });
    }

    disconnectedCallback() {
        this.typingWorker?.terminate();
        this.typingWorker = null;

        this.audioEl.pause();
        this.audioEl.removeAttribute("src");
        this.audioEl.load();
    }

    public refreshButtons() {
        if (!this.recordControlsEl) return;

        if (this.recording) {
            this.recordControlsEl.replaceChildren(recordingBtnsState.content.cloneNode(true));
        } else {
            this.recordControlsEl.replaceChildren(nonRecordingBtnsState.content.cloneNode(true));
        }

        this.updatePlaybackDisabledState();
        this.updatePlayButton(this.playing);
    }
    public async refreshPlayback(): Promise<void> {
        const recordingId = this.dataset.audioId;
        if (!recordingId) {
            return;
        }

        await this.loadPlaybackManifest(recordingId);
    }

    private setupPlayback() {
        this.audioEl.preload = "metadata";

        this.audioEl.addEventListener("timeupdate", () => {
            this.syncScrubber();
            this.syncTranscriptHighlight();
        });

        this.audioEl.addEventListener("pause", () => {
            if (this.endingPlayback) {
                return;
            }

            this.playing = false;
            this.updatePlayButton(false);
            this.syncScrubber();
        });

        this.audioEl.addEventListener("play", () => {
            this.playing = true;
            this.updatePlayButton(true);
            this.syncScrubber();
        });

        this.audioEl.addEventListener("ended", async () => {
            const nextIndex = this.playbackSegmentIndex + 1;

            if (nextIndex < this.playbackSegments.length) {
                await this.playSegmentAt(nextIndex, 0);
                return;
            }

            this.endingPlayback = true;
            this.playing = false;
            this.updatePlayButton(false);

            this.playbackSegmentIndex = 0;
            this.audioEl.removeAttribute("src");
            this.audioEl.load();

            this.syncScrubber(0);

            queueMicrotask(() => {
                this.endingPlayback = false;
            });
        });
    }

    public addTranscriptChunk(chunk: TranscriptChunk) {
        this.transcriptChunks.push(chunk);
        this.saveTranscriptToDataset();

        this.visibleTextByChunkId.set(chunk.id, "");
        this.renderTranscript();

        this.typingWorker?.postMessage({
            id: chunk.id,
            text: chunk.text,
            delayMs: 20,
        });
    }

    private loadTranscriptFromDataset() {
        const raw = this.dataset.transcriptJson;

        if (!raw) {
            this.transcriptChunks = [];
            return;
        }

        try {
            const parsed = JSON.parse(raw);
            this.transcriptChunks = Array.isArray(parsed) ? parsed : [];
        } catch {
            this.transcriptChunks = [];
        }
    }

    private saveTranscriptToDataset() {
        this.dataset.transcriptJson = JSON.stringify(this.transcriptChunks);

        this.dataset.transcription = this.transcriptChunks
            .map((chunk) => chunk.text)
            .join(" ");
    }

    private renderTranscript() {
        this.outputEl.replaceChildren();

        for (const chunk of this.transcriptChunks) {
            const span = document.createElement("span");
            span.classList.add("transcript-chunk");
            span.dataset.transcriptId = chunk.id;
            span.dataset.startSec = String(chunk.start_sec);
            span.dataset.endSec = String(chunk.end_sec);

            if (chunk.id === this.activeTranscriptId) {
                span.classList.add("active");
            }

            const timestamp = document.createElement("button");
            timestamp.type = "button";
            timestamp.classList.add("transcript-time");
            timestamp.textContent = this.formatTime(chunk.start_sec);

            const text = document.createElement("span");
            text.classList.add("transcript-text");

            const visibleText = this.visibleTextByChunkId.get(chunk.id);

            if (visibleText !== undefined) {
                text.textContent = visibleText;
            } else {
                text.textContent = chunk.text + " ";
            }

            span.append(timestamp, text);
            this.outputEl.append(span);
        }
    }

    private syncTranscriptHighlight(forcedTime?: number) {
        const currentTime = forcedTime ?? this.getAbsolutePlaybackTime();

        const active = this.transcriptChunks.find((chunk) => {
            return currentTime >= chunk.start_sec && currentTime < chunk.end_sec;
        });

        const nextActiveId = active?.id ?? null;

        if (nextActiveId === this.activeTranscriptId) {
            return;
        }

        this.activeTranscriptId = nextActiveId;

        const chunks = this.outputEl.querySelectorAll<HTMLElement>(".transcript-chunk");

        for (const chunkEl of chunks) {
            chunkEl.classList.toggle(
                "active",
                chunkEl.dataset.transcriptId === this.activeTranscriptId
            );
        }
    }

    private formatTime(seconds: number): string {
        const whole = Math.max(0, Math.floor(seconds));
        const mins = Math.floor(whole / 60);
        const secs = whole % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    private async fetchPlaybackSegments(recordingId: string): Promise<PlaybackSegment[]> {
        const res = await fetch(`/audio/${recordingId}/segments`, {
            method: "GET",
            credentials: "include",
            headers: {
                Accept: "application/json",
            },
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Failed to fetch playback segments: ${res.status} ${text}`);
        }

        const data = await res.json();
        return data.segments ?? [];
    }

    private getScrubber(): any {
        return this.querySelector("audio-scrubber") as any;
    }

    private updatePlayButton(playing: boolean) {
        const playButton = this.querySelector("play-button") as any;
        if (playButton && typeof playButton.setPlaying === "function") {
            playButton.setPlaying(playing);
        }
    }
    private updatePlaybackDisabledState() {
        const playButton = this.querySelector("play-button");
        const scrubber = this.querySelector("audio-scrubber");

        if (this.recording) {
            playButton?.setAttribute("disabled", "");
            scrubber?.setAttribute("disabled", "");
        } else {
            playButton?.removeAttribute("disabled");
            scrubber?.removeAttribute("disabled");
        }
    }

    private async loadPlaybackManifest(recordingId: string): Promise<void> {
        this.playbackSegments = await this.fetchPlaybackSegments(recordingId);
        this.playbackDurations = this.playbackSegments.map(
            (segment) => (segment.duration_ms || 0) / 1000
        );

        this.playbackOffsets = [];
        let offset = 0;

        for (const duration of this.playbackDurations) {
            this.playbackOffsets.push(offset);
            offset += duration;
        }

        this.playbackSegmentIndex = 0;
        this.syncScrubber(0);
    }

    private getTotalPlaybackDuration(): number {
        return this.playbackDurations.reduce((sum, x) => sum + x, 0);
    }

    private getAbsolutePlaybackTime(): number {
        if (!this.playbackSegments.length) {
            return 0;
        }

        const offset = this.playbackOffsets[this.playbackSegmentIndex] ?? 0;
        return offset + (this.audioEl.currentTime || 0);
    }
    public getTimelineDurationMs(): number {
        const audioDurationMs = this.getTotalPlaybackDuration() * 1000;

        const transcriptDurationMs = this.transcriptChunks.reduce((max, chunk) => {
            return Math.max(max, chunk.end_sec * 1000);
        }, 0);

        return Math.max(audioDurationMs, transcriptDurationMs);
    }

    private syncScrubber(forcedTime?: number) {
        const scrubber = this.getScrubber();
        if (!scrubber) {
            return;
        }

        if (typeof scrubber.setDuration !== "function" || typeof scrubber.setCurrentTime !== "function") {
            return;
        }

        const currentTime = forcedTime ?? this.getAbsolutePlaybackTime();

        scrubber.setDuration(this.getTotalPlaybackDuration());
        scrubber.setCurrentTime(currentTime);
        this.syncTranscriptHighlight(currentTime);
    }

    private async loadPlaybackSource(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                this.audioEl.removeEventListener("loadedmetadata", onLoaded);
                this.audioEl.removeEventListener("error", onError);
            };

            const onLoaded = () => {
                cleanup();
                resolve();
            };

            const onError = () => {
                cleanup();
                reject(new Error(`Failed to load playback source: ${url}`));
            };

            this.audioEl.addEventListener("loadedmetadata", onLoaded);
            this.audioEl.addEventListener("error", onError);
            this.audioEl.src = url;
            this.audioEl.load();
        });
    }

    private async playSegmentAt(index: number, localTime: number): Promise<void> {
        const segment = this.playbackSegments[index];
        if (!segment) {
            return;
        }

        this.playbackSegmentIndex = index;
        await this.loadPlaybackSource(segment.url);

        this.audioEl.currentTime = Math.max(0, localTime);
        await this.audioEl.play();
        this.syncScrubber();
    }

    private pausePlayback() {
        if (!this.audioEl.paused) {
            this.audioEl.pause();
        }
        this.playing = false;
        this.updatePlayButton(false);
    }

    private async togglePlayback() {
        const recordingId = this.dataset.audioId;
        if (!recordingId) {
            return;
        }

        if (this.playing && this.audioEl.src) {
            this.pausePlayback();
            return;
        }

        document.dispatchEvent(new CustomEvent("pause-all-audio", {
            detail: { source: this }
        }));

        if (!this.audioEl.src || !this.playbackSegments.length) {
            await this.loadPlaybackManifest(recordingId);

            if (!this.playbackSegments.length) {
                this.syncScrubber(0);
                return;
            }

            await this.playSegmentAt(0, 0);
            return;
        }

        await this.audioEl.play();
        this.playing = true;
        this.updatePlayButton(true);
        this.syncScrubber();
    }

    private async seekPlayback(absoluteTime: number): Promise<void> {
        const recordingId = this.dataset.audioId;
        if (!recordingId) {
            return;
        }

        if (!this.playbackSegments.length) {
            await this.loadPlaybackManifest(recordingId);
        }

        if (!this.playbackSegments.length) {
            return;
        }

        const total = this.getTotalPlaybackDuration();
        const clamped = Math.max(0, Math.min(absoluteTime, total));

        let index = 0;
        for (let i = 0; i < this.playbackOffsets.length; i++) {
            const start = this.playbackOffsets[i];
            const end = start + (this.playbackDurations[i] ?? 0);

            if (clamped >= start && clamped <= end) {
                index = i;
                break;
            }

            if (clamped > end) {
                index = i;
            }
        }

        const localTime = clamped - (this.playbackOffsets[index] ?? 0);

        document.dispatchEvent(new CustomEvent("pause-all-audio", {
            detail: { source: this }
        }));

        await this.playSegmentAt(index, localTime);
    }
    private toggleOutputExpanded() {
        this.outputExpanded = !this.outputExpanded;

        this.outputContainerEl.classList.toggle("expanded", this.outputExpanded);

        this.outputExpandToggleEl.innerHTML = this.outputExpanded
            ? `
            <svg class="collapse-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <title>window-minimize</title>
                <path d="M20,14H4V10H20" />
            </svg>
        `
            : `
            <svg class="expand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <title>arrow-expand</title>
                <path d="M10,21V19H6.41L10.91,14.5L9.5,13.09L5,17.59V14H3V21H10M14.5,10.91L19,6.41V10H21V3H14V5H17.59L13.09,9.5L14.5,10.91Z" />
            </svg>
        `;

        this.outputExpandToggleEl.setAttribute(
            "aria-label",
            this.outputExpanded ? "Collapse transcript" : "Expand transcript"
        );
    }
}