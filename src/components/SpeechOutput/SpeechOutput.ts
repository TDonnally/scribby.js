import { SpeechToText, Input } from "../SpeechtoText";

type PlaybackSegment = {
    segment_id: string;
    sequence_number: number;
    url: string;
    mime_type?: string;
};

const tpl = document.createElement("template");
tpl.innerHTML = `
    <div contenteditable="false">
        <div class="output-header">
            <audio-visualizer></audio-visualizer>
            <div class="buttons"></div>
        </div>
        <audio-scrubber></audio-scrubber>
        <div class="output-container">
            <span class="output"></span>
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
    <play-button></play-button>
`;

export class SpeechOutput extends HTMLElement {
    controller: SpeechToText | null = null;
    recording: Boolean = false;

    private buttonsEl!: HTMLDivElement;
    private outputEl!: HTMLElement;
    private audioEl = new Audio();

    private playbackSegments: PlaybackSegment[] = [];
    private playbackDurations: number[] = [];
    private playbackOffsets: number[] = [];
    private playbackSegmentIndex = 0;
    private playing = false;

    connectedCallback() {
        if (!this.firstChild) {
            this.appendChild(tpl.content.cloneNode(true));
        }

        this.outputEl = this.querySelector(".output") as HTMLElement;
        this.buttonsEl = this.querySelector(".buttons") as HTMLDivElement;

        if (this.dataset.transcription) {
            this.outputEl.innerText = this.dataset.transcription;
        } else {
            this.dataset.transcription = "";
        }

        this.refreshButtons();
        this.setupPlayback();

        this.addEventListener("start-recording", async (e: Event) => {
            const custom = e as CustomEvent<{ input?: Input }>;
            if (!this.controller || !custom.detail?.input) {
                return;
            }

            await this.controller.startRecording(this, custom.detail.input);
            this.recording = true;
            this.refreshButtons();
        });

        this.addEventListener("play-audio", async () => {
            await this.togglePlayback();
        });

        this.addEventListener("seek-audio", async (e: Event) => {
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
        this.audioEl.pause();
        this.audioEl.removeAttribute("src");
        this.audioEl.load();
    }

    public refreshButtons() {
        if (!this.buttonsEl) return;

        if (this.recording) {
            this.buttonsEl.replaceChildren(recordingBtnsState.content.cloneNode(true));
        } else {
            this.buttonsEl.replaceChildren(nonRecordingBtnsState.content.cloneNode(true));
            this.updatePlayButton(this.playing);
        }
    }

    private setupPlayback() {
        this.audioEl.preload = "metadata";

        this.audioEl.addEventListener("timeupdate", () => {
            this.syncScrubber();
        });

        this.audioEl.addEventListener("pause", () => {
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

            this.playing = false;
            this.updatePlayButton(false);
            this.syncScrubber(this.getTotalPlaybackDuration());
            this.audioEl.removeAttribute("src");
            this.audioEl.load();
        });
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

    private async getAudioDuration(url: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();

            const cleanup = () => {
                audio.removeEventListener("loadedmetadata", onLoaded);
                audio.removeEventListener("error", onError);
            };

            const onLoaded = () => {
                cleanup();
                resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
            };

            const onError = () => {
                cleanup();
                reject(new Error(`Failed to load metadata for ${url}`));
            };

            audio.preload = "metadata";
            audio.addEventListener("loadedmetadata", onLoaded);
            audio.addEventListener("error", onError);
            audio.src = url;
            audio.load();
        });
    }

    private async loadPlaybackManifest(recordingId: string): Promise<void> {
        this.playbackSegments = await this.fetchPlaybackSegments(recordingId);
        this.playbackDurations = await Promise.all(
            this.playbackSegments.map((segment) => this.getAudioDuration(segment.url))
        );

        this.playbackOffsets = [];
        let offset = 0;
        for (const duration of this.playbackDurations) {
            this.playbackOffsets.push(offset);
            offset += duration;
        }

        this.playbackSegmentIndex = 0;
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

    private syncScrubber(forcedTime?: number) {
        const scrubber = this.getScrubber();
        if (!scrubber) {
            return;
        }

        if (typeof scrubber.setDuration !== "function" || typeof scrubber.setCurrentTime !== "function") {
            return;
        }

        scrubber.setDuration(this.getTotalPlaybackDuration());
        scrubber.setCurrentTime(forcedTime ?? this.getAbsolutePlaybackTime());
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
}