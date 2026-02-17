import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { indentWithTab, defaultKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { rust } from "@codemirror/lang-rust";

type LangId = "javascript" | "python" | "cpp" | "go" | "rust";

const LANG_LABELS: Record<LangId, string> = {
    javascript: "JavaScript",
    python: "Python",
    cpp: "C / C++",
    go: "Go",
    rust: "Rust",
};

function langExtension(lang: LangId) {
    switch (lang) {
        case "python":
            return python();
        case "cpp":
            return cpp();
        case "go":
            return go();
        case "rust":
            return rust();
        case "javascript":
        default:
            return javascript();
    }
}

function normalizeLang(v: string | null): LangId {
    const s = (v ?? "").toLowerCase();
    if (s === "python") return "python";
    if (s === "cpp" || s === "c" || s === "c++") return "cpp";
    if (s === "go" || s === "golang") return "go";
    if (s === "rust") return "rust";
    return "javascript";
}

export class ScribbyCodeBlock extends HTMLElement {
    private view?: EditorView;
    private language = new Compartment();
    private selectEl?: HTMLSelectElement;

    get value(): string {
        return this.getAttribute("data-value") ?? "";
    }

    set value(v: string) {
        this.setAttribute("data-value", v);
        if (!this.view) return;

        this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: v },
        });
    }

    get lang(): LangId {
        return normalizeLang(this.getAttribute("data-lang"));
    }

    set lang(v: LangId) {
        this.setAttribute("data-lang", v);

        if (this.selectEl) this.selectEl.value = v;

        if (!this.view) return;
        this.view.dispatch({
            effects: this.language.reconfigure(langExtension(v)),
        });
    }

    connectedCallback() {
        this.setAttribute("contenteditable", "false");

        // Base styling
        this.style.display = "block";
        this.style.borderRadius = "10px";
        this.style.border = "1px solid rgba(255,255,255,0.12)";
        this.style.overflow = "hidden"; // keeps rounded corners clean

        // Build toolbar
        const toolbar = document.createElement("div");
        toolbar.style.display = "flex";
        toolbar.style.alignItems = "center";
        toolbar.style.gap = "8px";
        toolbar.style.padding = "8px";
        toolbar.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
        toolbar.style.background = "rgba(255,255,255,0.02)";

        const label = document.createElement("span");
        label.textContent = "Language:";
        label.style.fontSize = "12px";
        label.style.opacity = "0.8";

        const select = document.createElement("select");
        select.style.fontSize = "12px";
        select.style.padding = "4px 6px";
        select.style.borderRadius = "6px";
        select.style.border = "1px solid rgba(255,255,255,0.12)";
        select.style.background = "transparent";
        select.style.color = "inherit";

        (Object.keys(LANG_LABELS) as LangId[]).forEach((k) => {
            const opt = document.createElement("option");
            opt.value = k;
            opt.textContent = LANG_LABELS[k];
            select.appendChild(opt);
        });

        // Host for CodeMirror
        const editorHost = document.createElement("div");
        editorHost.style.padding = "8px";

        // Keep refs
        this.selectEl = select;

        // Initial values
        const startDoc = this.value || "";
        const initialLang = this.lang;
        select.value = initialLang;

        // Stop the parent editor from stealing focus
        const stop = (e: Event) => e.stopPropagation();
        toolbar.addEventListener("mousedown", stop);
        toolbar.addEventListener("keydown", stop);
        editorHost.addEventListener("mousedown", stop);
        editorHost.addEventListener("keydown", stop);

        // Language dropdown handler
        select.addEventListener("change", (e) => {
            e.stopPropagation();
            const next = normalizeLang((e.currentTarget as HTMLSelectElement).value);
            this.lang = next;

            this.dispatchEvent(
                new CustomEvent("scribby:block-change", { bubbles: true })
            );
        });

        toolbar.appendChild(label);
        toolbar.appendChild(select);

        // Clear existing children
        this.innerHTML = "";
        this.appendChild(toolbar);
        this.appendChild(editorHost);

        // Create editor state
        const state = EditorState.create({
            doc: startDoc,
            extensions: [
                lineNumbers(),
                keymap.of([indentWithTab, ...defaultKeymap]),

                syntaxHighlighting(defaultHighlightStyle),

                // dynamic language config
                this.language.of(langExtension(initialLang)),

                EditorView.updateListener.of((update) => {
                    if (!update.docChanged) return;
                    const text = update.state.doc.toString();
                    this.setAttribute("data-value", text);
                    this.dispatchEvent(
                        new CustomEvent("scribby:block-change", { bubbles: true })
                    );
                }),
            ],
        });

        this.view = new EditorView({ state, parent: editorHost });
    }

    disconnectedCallback() {
        this.view?.destroy();
        this.view = undefined;
    }
}
