const tpl = document.createElement("template");
tpl.innerHTML = `
<div class="audio-scrubber">
    <span class="time current">0:00</span>
    <input class="range" type="range" min="0" max="0" step="0.01" value="0">
    <span class="time total">0:00</span>
</div>
`;

export class AudioScrubber extends HTMLElement {
    range!: HTMLInputElement;
    currentEl!: HTMLSpanElement;
    totalEl!: HTMLSpanElement;

    connectedCallback() {
        if (!this.firstChild) {
            this.appendChild(tpl.content.cloneNode(true));
        }

        this.range = this.querySelector(".range") as HTMLInputElement;
        this.currentEl = this.querySelector(".current") as HTMLSpanElement;
        this.totalEl = this.querySelector(".total") as HTMLSpanElement;

        this.range.addEventListener("input", () => {
            const time = Number(this.range.value);
            const seekEvent = new CustomEvent("seek-audio", {
                bubbles: true,
                detail: { time }
            });
            this.dispatchEvent(seekEvent);
        });
    }

    setDuration(seconds: number) {
        const safe = Number.isFinite(seconds) ? seconds : 0;
        this.range.max = String(safe);
        this.totalEl.textContent = this.formatTime(safe);
    }

    setCurrentTime(seconds: number) {
        const safe = Number.isFinite(seconds) ? seconds : 0;
        this.range.value = String(safe);
        this.currentEl.textContent = this.formatTime(safe);
    }

    private formatTime(seconds: number): string {
        const whole = Math.max(0, Math.floor(seconds));
        const mins = Math.floor(whole / 60);
        const secs = whole % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
}