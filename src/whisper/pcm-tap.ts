interface AudioWorkletProcessor {
    readonly port: MessagePort;
}

declare const AudioWorkletProcessor: {
    prototype: AudioWorkletProcessor;
    new(options?: any): AudioWorkletProcessor;
};

declare function registerProcessor(
    name: string,
    processorCtor: new (options?: any) => AudioWorkletProcessor,
): void;

class PCMTap extends AudioWorkletProcessor {
    process(inputs: Float32Array[][]): boolean {
        const channel = inputs[0]?.[0];

        if (channel && channel.length) {
            this.port.postMessage(new Float32Array(channel));
        }

        return true;
    }
}

registerProcessor("pcm-tap", PCMTap);