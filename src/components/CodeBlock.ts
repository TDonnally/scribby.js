import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { indentWithTab, defaultKeymap } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

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
const vsCodeHighlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: "#569cd6" },
    { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: "#9cdcfe" },
    { tag: [tags.function(tags.variableName), tags.labelName], color: "#dcdcaa" },
    { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "#4fc1ff" },
    { tag: [tags.definition(tags.name), tags.separator], color: "#d4d4d4" },
    { tag: [tags.className], color: "#4ec9b0" },
    { tag: [tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "#b5cea8" },
    { tag: [tags.typeName], color: "#4ec9b0" },
    { tag: [tags.operator, tags.operatorKeyword], color: "#d4d4d4" },
    { tag: [tags.string], color: "#ce9178" },
    { tag: [tags.meta, tags.comment], color: "#6a9955", fontStyle: "italic" },
    { tag: [tags.invalid], color: "#f44747" }
]);

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

        this.classList.add("code-block");

        const toolbar = document.createElement("div");
        toolbar.classList.add("code-block-toolbar");

        const label = document.createElement("span");
        label.textContent = "Language:";
        label.classList.add("code-block-label");

        const select = document.createElement("select");
        select.classList.add("code-block-select");

        (Object.keys(LANG_LABELS) as LangId[]).forEach((k) => {
            const opt = document.createElement("option");
            opt.value = k;
            opt.textContent = LANG_LABELS[k];
            select.appendChild(opt);
        });

        // Host for CodeMirror
        const editorHost = document.createElement("div");
        editorHost.classList.add("code-block-editor-host");

        // Keep refs
        this.selectEl = select;

        // Initial values
        const startDoc = this.value || "";
        const initialLang = this.lang;
        select.value = initialLang;

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

                syntaxHighlighting(vsCodeHighlightStyle),

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
