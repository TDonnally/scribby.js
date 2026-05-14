type TypingJob = {
    id: string;
    text: string;
    delayMs?: number;
};

const queues = new Map<string, string>();
const intervals = new Map<string, number>();

onmessage = (e: MessageEvent<TypingJob>) => {
    const { id, text, delayMs = 20 } = e.data;

    queues.set(id, (queues.get(id) || "") + text);

    if (intervals.has(id)) {
        return;
    }

    let visible = "";

    const interval = setInterval(() => {
        const remaining = queues.get(id) || "";

        if (!remaining) {
            clearInterval(interval);
            intervals.delete(id);

            postMessage({
                id,
                text: visible,
                done: true,
            });

            return;
        }

        visible += remaining[0];
        queues.set(id, remaining.slice(1));

        postMessage({
            id,
            text: visible,
            done: false,
        });
    }, delayMs);

    intervals.set(id, interval);
};