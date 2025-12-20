class VolumeProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.maxN = 40;
        this.buf = new Array(this.maxN).fill(0);
        this.sum = 0;
        this.idx = 0;
        this.count = 0;
    }

    pushVolume(v) {
        if (this.count < this.maxN) {
            this.buf[this.idx] = v;
            this.sum += v;
            this.count++;
            this.idx = (this.idx + 1) % this.maxN;
            return this.sum / this.count;
        }

        const old = this.buf[this.idx];
        this.buf[this.idx] = v;
        this.sum += v - old;
        this.idx = (this.idx + 1) % this.maxN;

        return this.sum / this.maxN;
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const channel = input[0];
        let sumSq = 0;

        for (let i = 0; i < channel.length; i++) {
            const s = channel[i];
            sumSq += s * s;
        }

        const rms = Math.sqrt(sumSq / channel.length);
        const volumePercent = Math.min(100, Math.floor(rms * 100));

        const avg = this.pushVolume(volumePercent);
        const avgVol = Math.round(avg);

        this.port.postMessage({ vol: volumePercent, avgVol: avgVol });

        return true;
    }
}

registerProcessor("volume-processor", VolumeProcessor);