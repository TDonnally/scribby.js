export const MOBILE_TOOLBAR_BREAKPOINT = 1000;
export const LOCAL_WHISPER_MIN_AVAILABLE_THREADS = 8;
export const LOCAL_WHISPER_TRANSCRIPTION_THREADS = 4;

export function isMobileToolbarLayout(): boolean {
    return window.innerWidth <= MOBILE_TOOLBAR_BREAKPOINT;
}

export function isMobileDevice(): boolean {
    const ua = navigator.userAgent || "";

    return (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
        (
            window.matchMedia?.("(pointer: coarse)").matches &&
            window.matchMedia?.("(hover: none)").matches
        )
    );
}

export type LocalWhisperSupport = {
    enabled: boolean;
    reason: string | null;
    availableThreads: number;
    transcriptionThreads: number;
};

export function getLocalWhisperSupport(): LocalWhisperSupport {
    const availableThreads = navigator.hardwareConcurrency || 0;

    if (isMobileDevice()) {
        return {
            enabled: false,
            reason: "mobile-device",
            availableThreads,
            transcriptionThreads: 0,
        };
    }

    if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
        return {
            enabled: false,
            reason: "shared-array-buffer-unavailable",
            availableThreads,
            transcriptionThreads: 0,
        };
    }

    if (availableThreads < LOCAL_WHISPER_MIN_AVAILABLE_THREADS) {
        return {
            enabled: false,
            reason: "not-enough-threads",
            availableThreads,
            transcriptionThreads: 0,
        };
    }

    return {
        enabled: true,
        reason: null,
        availableThreads,
        transcriptionThreads: LOCAL_WHISPER_TRANSCRIPTION_THREADS,
    };
}