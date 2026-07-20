import { EditorState, Compartment, EditorSelection, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { indentWithTab, defaultKeymap } from "@codemirror/commands";
import {
    HighlightStyle,
    LanguageDescription,
    StreamLanguage,
    syntaxHighlighting,
    type StreamParser,
    type StringStream,
} from "@codemirror/language";
import { languages as codeMirrorLanguages } from "@codemirror/language-data";
import { tags } from "@lezer/highlight";

import { ConfirmOverlay } from "../ConfirmOverlay.js";
import * as utils from "../../utilities/utilities.js";

const LANGUAGES = [
    { id: "awk", label: "AWK" },
    { id: "bash", label: "Bash" },
    { id: "basic", label: "BASIC" },
    { id: "basic.net", label: "BASIC (.NET)" },
    { id: "befunge93", label: "Befunge-93" },
    { id: "brachylog", label: "Brachylog" },
    { id: "bqn", label: "BQN" },
    { id: "c", label: "C" },
    { id: "c++", label: "C++" },
    { id: "cjam", label: "CJam" },
    { id: "clojure", label: "Clojure" },
    { id: "cobol", label: "COBOL" },
    { id: "coffeescript", label: "CoffeeScript" },
    { id: "cow", label: "COW" },
    { id: "crystal", label: "Crystal" },
    { id: "csharp", label: "C#" },
    { id: "csharp.net", label: "C# (.NET)" },
    { id: "d", label: "D" },
    { id: "dart", label: "Dart" },
    { id: "dash", label: "Dash" },
    { id: "dragon", label: "Dragon" },
    { id: "elixir", label: "Elixir" },
    { id: "emacs", label: "Emacs Lisp" },
    { id: "emojicode", label: "Emojicode" },
    { id: "erlang", label: "Erlang" },
    { id: "file", label: "File" },
    { id: "forte", label: "Forte" },
    { id: "forth", label: "Forth" },
    { id: "fortran", label: "Fortran" },
    { id: "freebasic", label: "FreeBASIC" },
    { id: "fsharp.net", label: "F# (.NET)" },
    { id: "fsi", label: "FSI" },
    { id: "go", label: "Go" },
    { id: "golfscript", label: "GolfScript" },
    { id: "groovy", label: "Groovy" },
    { id: "haskell", label: "Haskell" },
    { id: "husk", label: "Husk" },
    { id: "iverilog", label: "Icarus Verilog" },
    { id: "japt", label: "Japt" },
    { id: "java", label: "Java" },
    { id: "javascript", label: "JavaScript" },
    { id: "jelly", label: "Jelly" },
    { id: "julia", label: "Julia" },
    { id: "kotlin", label: "Kotlin" },
    { id: "lisp", label: "Lisp" },
    { id: "llvm_ir", label: "LLVM IR" },
    { id: "lolcode", label: "LOLCODE" },
    { id: "lua", label: "Lua" },
    { id: "matl", label: "MATL" },
    { id: "nasm", label: "NASM" },
    { id: "nasm64", label: "NASM 64-bit" },
    { id: "nim", label: "Nim" },
    { id: "ocaml", label: "OCaml" },
    { id: "octave", label: "Octave" },
    { id: "osabie", label: "05AB1E" },
    { id: "paradoc", label: "Paradoc" },
    { id: "pascal", label: "Pascal" },
    { id: "perl", label: "Perl" },
    { id: "php", label: "PHP" },
    { id: "ponylang", label: "Pony" },
    { id: "powershell", label: "PowerShell" },
    { id: "prolog", label: "Prolog" },
    { id: "pure", label: "Pure" },
    { id: "pyth", label: "Pyth" },
    { id: "python", label: "Python" },
    { id: "racket", label: "Racket" },
    { id: "raku", label: "Raku" },
    { id: "retina", label: "Retina" },
    { id: "rockstar", label: "Rockstar" },
    { id: "rscript", label: "R" },
    { id: "ruby", label: "Ruby" },
    { id: "rust", label: "Rust" },
    { id: "samarium", label: "Samarium" },
    { id: "scala", label: "Scala" },
    { id: "smalltalk", label: "Smalltalk" },
    { id: "swift", label: "Swift" },
    { id: "typescript", label: "TypeScript" },
    { id: "vlang", label: "V" },
    { id: "vyxal", label: "Vyxal" },
    { id: "yeethon", label: "Yeethon" },
    { id: "zig", label: "Zig" },
] as const;

type LangId = (typeof LANGUAGES)[number]["id"];
type TokenStyle = string | null;

interface ExecuteCodeResponse {
    success: boolean;
    stdout: string;
    stderr: string;
    compileOutput?: string;
    exitCode: number | null;
    timedOut?: boolean;
}

interface ExecuteCodeErrorResponse {
    error?: string;
    stderr?: string;
}

interface DelimiterPair {
    start: string;
    end: string;
}

interface SymbolRule {
    pattern: RegExp;
    style: string;
}

interface SyntaxProfile {
    lineComments?: readonly string[];
    blockComments?: readonly DelimiterPair[];
    strings?: readonly DelimiterPair[];
    keywords?: readonly string[];
    atoms?: readonly string[];
    types?: readonly string[];
    caseInsensitive?: boolean;
    identifier?: RegExp;
    number?: RegExp;
    symbolRules?: readonly SymbolRule[];
}

interface LanguageModeSpec {
    codeMirrorName?: string;
    fallback: SyntaxProfile;
}

interface GenericParserState {
    blockEnd: string | null;
    stringEnd: string | null;
}

const LANGUAGE_IDS = new Set<string>(LANGUAGES.map((language) => language.id));

const LANGUAGE_ALIASES: Record<string, LangId> = {
    "c#": "csharp",
    "cs": "csharp",
    "cpp": "c++",
    "cxx": "c++",
    "golang": "go",
    "js": "javascript",
    "py": "python",
    "rb": "ruby",
    "sh": "bash",
    "ts": "typescript",
    "verilog": "iverilog",
};

const COMMON_ATOMS = [
    "true", "false", "null", "nil", "none", "undefined", "nan", "infinity",
];

const C_LIKE_KEYWORDS = [
    "alignas", "alignof", "asm", "auto", "bool", "break", "case", "catch",
    "char", "class", "const", "constexpr", "continue", "default", "defer",
    "delete", "do", "double", "else", "enum", "export", "extern", "false",
    "final", "float", "for", "foreach", "goto", "if", "implements", "import",
    "in", "inline", "int", "interface", "let", "long", "match", "module",
    "mutable", "namespace", "new", "null", "override", "package", "private",
    "protected", "public", "register", "return", "short", "signed", "sizeof",
    "static", "struct", "switch", "template", "this", "throw", "trait", "true",
    "try", "typedef", "typeid", "typename", "union", "unsigned", "using", "var",
    "virtual", "void", "volatile", "while", "with", "yield",
];

const PYTHON_LIKE_KEYWORDS = [
    "and", "as", "assert", "async", "await", "break", "case", "class", "continue",
    "def", "defer", "del", "discard", "elif", "else", "enum", "except", "export",
    "finally", "for", "from", "func", "global", "if", "import", "in", "include",
    "interface", "is", "lambda", "let", "macro", "match", "not", "of", "or",
    "pass", "proc", "raise", "return", "static", "template", "try", "type", "var",
    "when", "while", "with", "yield",
];

const FUNCTIONAL_KEYWORDS = [
    "case", "class", "data", "def", "do", "else", "end", "exception", "fun",
    "function", "if", "import", "in", "include", "let", "module", "of", "open",
    "rec", "receive", "then", "try", "type", "when", "where", "with",
];

const SHELL_KEYWORDS = [
    "alias", "break", "case", "cd", "continue", "do", "done", "echo", "elif",
    "else", "esac", "eval", "exec", "exit", "export", "fi", "for", "function",
    "getopts", "if", "in", "local", "printf", "read", "readonly", "return", "select",
    "set", "shift", "source", "then", "time", "trap", "typeset", "ulimit", "umask",
    "unalias", "unset", "until", "while",
];

const BASIC_KEYWORDS = [
    "and", "as", "byref", "byval", "call", "case", "class", "const", "continue",
    "declare", "dim", "do", "each", "else", "elseif", "end", "enum", "exit", "for",
    "function", "get", "global", "gosub", "goto", "if", "implements", "imports", "in",
    "inherits", "interface", "let", "loop", "me", "module", "namespace", "new", "next",
    "not", "of", "on", "option", "or", "private", "property", "protected", "public",
    "redim", "return", "select", "set", "shared", "static", "step", "sub", "then",
    "to", "try", "until", "wend", "while", "with", "xor",
];

const PROLOG_KEYWORDS = [
    "assert", "asserta", "assertz", "catch", "dynamic", "fail", "false", "findall",
    "forall", "halt", "is", "listing", "module", "not", "once", "repeat", "retract",
    "retractall", "throw", "true", "use_module",
];

const ASSEMBLY_KEYWORDS = [
    "align", "bits", "byte", "call", "cmp", "db", "dd", "dq", "dw", "equ", "extern",
    "global", "jmp", "jne", "je", "jg", "jge", "jl", "jle", "lea", "mov", "nop",
    "pop", "push", "qword", "resb", "resd", "resq", "resw", "ret", "section", "test",
    "times", "word", "xor",
];

const STACK_KEYWORDS = [
    "dup", "drop", "swap", "over", "rot", "if", "else", "then", "while", "do",
    "loop", "map", "filter", "reduce", "print", "input", "eval",
];

const UNIVERSAL_PROFILE: SyntaxProfile = {
    lineComments: ["//", "#", ";"],
    blockComments: [
        { start: "/*", end: "*/" },
        { start: "(*", end: "*)" },
    ],
    strings: [
        { start: "\"\"\"", end: "\"\"\"" },
        { start: "'''", end: "'''" },
        { start: "\"", end: "\"" },
        { start: "'", end: "'" },
        { start: "`", end: "`" },
    ],
    keywords: C_LIKE_KEYWORDS,
    atoms: COMMON_ATOMS,
};

const C_LIKE_PROFILE: SyntaxProfile = {
    lineComments: ["//"],
    blockComments: [{ start: "/*", end: "*/" }],
    strings: UNIVERSAL_PROFILE.strings,
    keywords: C_LIKE_KEYWORDS,
    atoms: COMMON_ATOMS,
};

const PYTHON_LIKE_PROFILE: SyntaxProfile = {
    lineComments: ["#"],
    strings: UNIVERSAL_PROFILE.strings,
    keywords: PYTHON_LIKE_KEYWORDS,
    atoms: COMMON_ATOMS,
};

const FUNCTIONAL_PROFILE: SyntaxProfile = {
    lineComments: ["--", "%"],
    blockComments: [
        { start: "{-", end: "-}" },
        { start: "(*", end: "*)" },
    ],
    strings: UNIVERSAL_PROFILE.strings,
    keywords: FUNCTIONAL_KEYWORDS,
    atoms: COMMON_ATOMS,
};

const SHELL_PROFILE: SyntaxProfile = {
    lineComments: ["#"],
    strings: UNIVERSAL_PROFILE.strings,
    keywords: SHELL_KEYWORDS,
    atoms: COMMON_ATOMS,
    symbolRules: [
        { pattern: /^\$\{[^}]*\}/, style: "variableName" },
        { pattern: /^\$[A-Za-z_][\w]*/, style: "variableName" },
        { pattern: /^\$[0-9@*#?$!_-]/, style: "variableName" },
    ],
};

const BASIC_PROFILE: SyntaxProfile = {
    lineComments: ["'", "REM "],
    strings: [{ start: "\"", end: "\"" }],
    keywords: BASIC_KEYWORDS,
    atoms: ["true", "false", "nothing"],
    caseInsensitive: true,
};

const PROLOG_PROFILE: SyntaxProfile = {
    lineComments: ["%"],
    blockComments: [{ start: "/*", end: "*/" }],
    strings: [
        { start: "\"", end: "\"" },
        { start: "'", end: "'" },
    ],
    keywords: PROLOG_KEYWORDS,
    atoms: ["true", "false", "fail"],
    symbolRules: [
        { pattern: /^[A-Z_][A-Za-z0-9_]*/, style: "variableName" },
        { pattern: /^:-|^\?-|^-->|^\\\+/, style: "operator" },
    ],
};

const ASSEMBLY_PROFILE: SyntaxProfile = {
    lineComments: [";", "#"],
    strings: UNIVERSAL_PROFILE.strings,
    keywords: ASSEMBLY_KEYWORDS,
    atoms: COMMON_ATOMS,
    caseInsensitive: true,
    symbolRules: [
        { pattern: /^[A-Za-z_.$][\w.$]*:/, style: "labelName" },
        { pattern: /^(?:r(?:1[0-5]|[0-9])|e?(?:ax|bx|cx|dx|si|di|sp|bp)|[abcd][lh]|xmm\d+|ymm\d+|zmm\d+)\b/i, style: "variableName" },
        { pattern: /^%[-A-Za-z$._0-9]+/, style: "variableName" },
        { pattern: /^@[-A-Za-z$._0-9]+/, style: "propertyName" },
    ],
};

const STACK_PROFILE: SyntaxProfile = {
    lineComments: ["#", ";"],
    strings: UNIVERSAL_PROFILE.strings,
    keywords: STACK_KEYWORDS,
    atoms: COMMON_ATOMS,
    symbolRules: [
        { pattern: /^[+\-*/%<>=!&|^~?:\\]+/, style: "operator" },
        { pattern: /^[↔↕↖↗↘↙←→↑↓⌈⌊⍳⍴⍉⌽⍋⍒¨¯×÷]/u, style: "operator" },
    ],
};

const ELIXIR_PROFILE: SyntaxProfile = {
    lineComments: ["#"],
    strings: UNIVERSAL_PROFILE.strings,
    keywords: [
        "after", "alias", "and", "case", "catch", "cond", "def", "defdelegate",
        "defexception", "defimpl", "defmacro", "defmodule", "defp", "defprotocol",
        "defstruct", "do", "else", "end", "fn", "for", "if", "import", "in", "not",
        "or", "quote", "raise", "receive", "require", "rescue", "super", "throw", "try",
        "unless", "unquote", "use", "when", "with",
    ],
    atoms: ["true", "false", "nil"],
    symbolRules: [
        { pattern: /^:[A-Za-z_][\w!?@]*/, style: "atom" },
        { pattern: /^[A-Z][A-Za-z0-9_.]*/, style: "typeName" },
        { pattern: /^@[A-Za-z_][\w]*/, style: "propertyName" },
    ],
};

const EMOJI_PROFILE: SyntaxProfile = {
    lineComments: ["💭"],
    strings: [
        { start: "🔤", end: "🔤" },
        { start: "\"", end: "\"" },
    ],
    keywords: [],
    atoms: [],
    symbolRules: [
        { pattern: /^\p{Extended_Pictographic}/u, style: "keyword" },
        { pattern: /^[A-Za-z_][\w]*/, style: "variableName" },
    ],
};

const LOLCODE_PROFILE: SyntaxProfile = {
    lineComments: ["BTW"],
    blockComments: [{ start: "OBTW", end: "TLDR" }],
    strings: [{ start: "\"", end: "\"" }],
    keywords: [
        "CAN", "FOUND", "GIMMEH", "GTFO", "HAI", "HAS", "IM", "IN", "ITZ", "KTHXBYE",
        "MEBBE", "MKAY", "NO", "NOT", "OIC", "OMG", "OMGWTF", "R", "VISIBLE", "WAI",
        "WTF", "YA", "YR",
    ],
    atoms: ["WIN", "FAIL", "NOOB"],
    caseInsensitive: true,
};

const ROCKSTAR_PROFILE: SyntaxProfile = {
    lineComments: ["#"],
    strings: [{ start: "\"", end: "\"" }],
    keywords: [
        "ain't", "and", "as", "back", "break", "build", "cast", "continue", "down",
        "else", "give", "if", "into", "is", "knock", "listen", "not", "or", "output",
        "put", "return", "say", "shout", "take", "taking", "than", "turn", "up", "while",
    ],
    atoms: ["true", "false", "null", "mysterious", "nothing", "nobody", "nowhere"],
    caseInsensitive: true,
};

const REGEX_PROFILE: SyntaxProfile = {
    lineComments: ["#"],
    strings: UNIVERSAL_PROFILE.strings,
    keywords: ["match", "replace", "split", "grep", "count", "sort", "deduplicate"],
    atoms: COMMON_ATOMS,
    symbolRules: [
        { pattern: /^\\[AbBdDfnrstvwWZ0-9]/, style: "string2" },
        { pattern: /^\(\?[=!<:>#imsx-]*/, style: "keyword" },
        { pattern: /^\[[^\]]*\]/, style: "string2" },
        { pattern: /^[*+?{}|^$]/, style: "operator" },
    ],
};

const BEFUNGE_PROFILE: SyntaxProfile = {
    strings: [{ start: "\"", end: "\"" }],
    keywords: [],
    atoms: [],
    symbolRules: [
        { pattern: /^[><^v?_|#@]/, style: "keyword" },
        { pattern: /^[+\-*/%!`]/, style: "operator" },
        { pattern: /^[.:,\\$]/, style: "propertyName" },
        { pattern: /^[pg&~]/, style: "variableName" },
    ],
};

const PISTON_LANGUAGE_MODES = {
    awk: { fallback: { ...C_LIKE_PROFILE, lineComments: ["#"], keywords: [...C_LIKE_KEYWORDS, "BEGIN", "END", "next", "nextfile", "print", "printf"] } },
    bash: { codeMirrorName: "Shell", fallback: SHELL_PROFILE },
    basic: { codeMirrorName: "VB.NET", fallback: BASIC_PROFILE },
    "basic.net": { codeMirrorName: "VB.NET", fallback: BASIC_PROFILE },
    befunge93: { fallback: BEFUNGE_PROFILE },
    brachylog: { fallback: PROLOG_PROFILE },
    bqn: { codeMirrorName: "APL", fallback: STACK_PROFILE },
    c: { codeMirrorName: "C", fallback: C_LIKE_PROFILE },
    "c++": { codeMirrorName: "C++", fallback: C_LIKE_PROFILE },
    cjam: { fallback: STACK_PROFILE },
    clojure: { codeMirrorName: "Clojure", fallback: FUNCTIONAL_PROFILE },
    cobol: { codeMirrorName: "Cobol", fallback: BASIC_PROFILE },
    coffeescript: { codeMirrorName: "CoffeeScript", fallback: PYTHON_LIKE_PROFILE },
    cow: { fallback: STACK_PROFILE },
    crystal: { codeMirrorName: "Crystal", fallback: C_LIKE_PROFILE },
    csharp: { codeMirrorName: "C#", fallback: C_LIKE_PROFILE },
    "csharp.net": { codeMirrorName: "C#", fallback: C_LIKE_PROFILE },
    d: { codeMirrorName: "D", fallback: C_LIKE_PROFILE },
    dart: { codeMirrorName: "Dart", fallback: C_LIKE_PROFILE },
    dash: { codeMirrorName: "Shell", fallback: SHELL_PROFILE },
    dragon: { fallback: PYTHON_LIKE_PROFILE },
    elixir: { fallback: ELIXIR_PROFILE },
    emacs: { codeMirrorName: "Common Lisp", fallback: FUNCTIONAL_PROFILE },
    emojicode: { fallback: EMOJI_PROFILE },
    erlang: { codeMirrorName: "Erlang", fallback: FUNCTIONAL_PROFILE },
    file: { fallback: SHELL_PROFILE },
    forte: { fallback: C_LIKE_PROFILE },
    forth: { codeMirrorName: "Forth", fallback: STACK_PROFILE },
    fortran: { codeMirrorName: "Fortran", fallback: FUNCTIONAL_PROFILE },
    freebasic: { codeMirrorName: "VB.NET", fallback: BASIC_PROFILE },
    "fsharp.net": { codeMirrorName: "F#", fallback: FUNCTIONAL_PROFILE },
    fsi: { codeMirrorName: "F#", fallback: FUNCTIONAL_PROFILE },
    go: { codeMirrorName: "Go", fallback: C_LIKE_PROFILE },
    golfscript: { fallback: STACK_PROFILE },
    groovy: { codeMirrorName: "Groovy", fallback: C_LIKE_PROFILE },
    haskell: { codeMirrorName: "Haskell", fallback: FUNCTIONAL_PROFILE },
    husk: { codeMirrorName: "Haskell", fallback: FUNCTIONAL_PROFILE },
    iverilog: { codeMirrorName: "Verilog", fallback: C_LIKE_PROFILE },
    japt: { codeMirrorName: "JavaScript", fallback: C_LIKE_PROFILE },
    java: { codeMirrorName: "Java", fallback: C_LIKE_PROFILE },
    javascript: { codeMirrorName: "JavaScript", fallback: C_LIKE_PROFILE },
    jelly: { fallback: STACK_PROFILE },
    julia: { codeMirrorName: "Julia", fallback: PYTHON_LIKE_PROFILE },
    kotlin: { codeMirrorName: "Kotlin", fallback: C_LIKE_PROFILE },
    lisp: { codeMirrorName: "Common Lisp", fallback: FUNCTIONAL_PROFILE },
    llvm_ir: { fallback: ASSEMBLY_PROFILE },
    lolcode: { fallback: LOLCODE_PROFILE },
    lua: { codeMirrorName: "Lua", fallback: C_LIKE_PROFILE },
    matl: { codeMirrorName: "Octave", fallback: STACK_PROFILE },
    nasm: { fallback: ASSEMBLY_PROFILE },
    nasm64: { fallback: ASSEMBLY_PROFILE },
    nim: { fallback: { ...PYTHON_LIKE_PROFILE, keywords: [...PYTHON_LIKE_KEYWORDS, "concept", "converter", "iterator", "mixin", "object", "out", "ptr", "ref", "sink", "using"] } },
    ocaml: { codeMirrorName: "OCaml", fallback: FUNCTIONAL_PROFILE },
    octave: { codeMirrorName: "Octave", fallback: FUNCTIONAL_PROFILE },
    osabie: { fallback: STACK_PROFILE },
    paradoc: { fallback: STACK_PROFILE },
    pascal: { codeMirrorName: "Pascal", fallback: BASIC_PROFILE },
    perl: { codeMirrorName: "Perl", fallback: UNIVERSAL_PROFILE },
    php: { codeMirrorName: "PHP", fallback: C_LIKE_PROFILE },
    ponylang: { fallback: { ...C_LIKE_PROFILE, keywords: [...C_LIKE_KEYWORDS, "actor", "be", "box", "consume", "embed", "iso", "recover", "tag", "trn", "val"] } },
    powershell: { codeMirrorName: "PowerShell", fallback: SHELL_PROFILE },
    prolog: { fallback: PROLOG_PROFILE },
    pure: { fallback: FUNCTIONAL_PROFILE },
    pyth: { fallback: STACK_PROFILE },
    python: { codeMirrorName: "Python", fallback: PYTHON_LIKE_PROFILE },
    racket: { codeMirrorName: "Scheme", fallback: FUNCTIONAL_PROFILE },
    raku: { codeMirrorName: "Perl", fallback: UNIVERSAL_PROFILE },
    retina: { fallback: REGEX_PROFILE },
    rockstar: { fallback: ROCKSTAR_PROFILE },
    rscript: { codeMirrorName: "R", fallback: FUNCTIONAL_PROFILE },
    ruby: { codeMirrorName: "Ruby", fallback: PYTHON_LIKE_PROFILE },
    rust: { codeMirrorName: "Rust", fallback: C_LIKE_PROFILE },
    samarium: { fallback: UNIVERSAL_PROFILE },
    scala: { codeMirrorName: "Scala", fallback: C_LIKE_PROFILE },
    smalltalk: { codeMirrorName: "Smalltalk", fallback: FUNCTIONAL_PROFILE },
    swift: { codeMirrorName: "Swift", fallback: C_LIKE_PROFILE },
    typescript: { codeMirrorName: "TypeScript", fallback: C_LIKE_PROFILE },
    vlang: { fallback: { ...C_LIKE_PROFILE, keywords: [...C_LIKE_KEYWORDS, "chan", "fn", "go", "lock", "mut", "none", "pub", "rlock", "select", "spawn", "unsafe"] } },
    vyxal: { fallback: STACK_PROFILE },
    yeethon: { codeMirrorName: "Python", fallback: PYTHON_LIKE_PROFILE },
    zig: { fallback: { ...C_LIKE_PROFILE, keywords: [...C_LIKE_KEYWORDS, "allowzero", "anyframe", "anytype", "comptime", "error", "noalias", "nosuspend", "opaque", "orelse", "packed", "resume", "suspend", "unreachable"] } },
} satisfies Record<LangId, LanguageModeSpec>;

const LANGUAGE_EXTENSION_CACHE = new Map<LangId, Promise<Extension>>();

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
    { tag: [tags.invalid], color: "#f44747" },
]);

function normalizeLang(value: string | null): LangId {
    const normalized = (value ?? "").trim().toLowerCase();
    const canonical = LANGUAGE_ALIASES[normalized] ?? normalized;

    if (LANGUAGE_IDS.has(canonical)) {
        return canonical as LangId;
    }

    return "javascript";
}

function sortedByLength(values: readonly string[]): string[] {
    return [...values].sort((a, b) => b.length - a.length);
}

function normalizeToken(value: string, caseInsensitive: boolean): string {
    return caseInsensitive ? value.toLowerCase() : value;
}

function consumeDelimited(stream: StringStream, end: string, caseInsensitive = false): boolean {
    let escaped = false;

    while (!stream.eol()) {
        if (!escaped && stream.match(end, true, caseInsensitive)) {
            return true;
        }

        const character = stream.next();
        if (character === null) break;

        if (character === "\\" && !escaped) {
            escaped = true;
        } else {
            escaped = false;
        }
    }

    return false;
}

function createFallbackParser(profile: SyntaxProfile): StreamParser<GenericParserState> {
    const lineComments = sortedByLength(profile.lineComments ?? []);
    const blockComments = [...(profile.blockComments ?? [])]
        .sort((a, b) => b.start.length - a.start.length);
    const strings = [...(profile.strings ?? UNIVERSAL_PROFILE.strings ?? [])]
        .sort((a, b) => b.start.length - a.start.length);
    const caseInsensitive = profile.caseInsensitive ?? false;
    const keywords = new Set(
        (profile.keywords ?? []).map((keyword) => normalizeToken(keyword, caseInsensitive)),
    );
    const atoms = new Set(
        (profile.atoms ?? []).map((atom) => normalizeToken(atom, caseInsensitive)),
    );
    const types = new Set(
        (profile.types ?? []).map((type) => normalizeToken(type, caseInsensitive)),
    );
    const identifierPattern = profile.identifier ?? /^[A-Za-z_$][A-Za-z0-9_$!?-]*/;
    const numberPattern = profile.number ?? /^(?:0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|(?:\d(?:_?\d)*)?\.\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?|\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?)/;

    return {
        startState(): GenericParserState {
            return {
                blockEnd: null,
                stringEnd: null,
            };
        },

        copyState(state: GenericParserState): GenericParserState {
            return { ...state };
        },

        token(stream: StringStream, state: GenericParserState): TokenStyle {
            if (state.blockEnd !== null) {
                if (consumeDelimited(stream, state.blockEnd, caseInsensitive)) {
                    state.blockEnd = null;
                } else {
                    stream.skipToEnd();
                }
                return "comment";
            }

            if (state.stringEnd !== null) {
                if (consumeDelimited(stream, state.stringEnd)) {
                    state.stringEnd = null;
                } else {
                    stream.skipToEnd();
                }
                return "string";
            }

            if (stream.eatSpace()) {
                return null;
            }

            for (const comment of lineComments) {
                if (stream.match(comment, false, caseInsensitive)) {
                    stream.skipToEnd();
                    return "comment";
                }
            }

            for (const comment of blockComments) {
                if (!stream.match(comment.start, true, caseInsensitive)) continue;

                if (!consumeDelimited(stream, comment.end, caseInsensitive)) {
                    state.blockEnd = comment.end;
                }

                return "comment";
            }

            for (const string of strings) {
                if (!stream.match(string.start)) continue;

                if (!consumeDelimited(stream, string.end)) {
                    state.stringEnd = string.end;
                }

                return "string";
            }

            for (const rule of profile.symbolRules ?? []) {
                if (stream.match(rule.pattern)) {
                    return rule.style;
                }
            }

            if (stream.match(numberPattern)) {
                return "number";
            }

            const identifier = stream.match(identifierPattern);
            if (identifier && identifier !== true) {
                const token = normalizeToken(identifier[0], caseInsensitive);

                if (keywords.has(token)) return "keyword";
                if (atoms.has(token)) return "atom";
                if (types.has(token)) return "typeName";
                if (/^[A-Z]/.test(identifier[0])) return "typeName";

                return "variableName";
            }

            if (stream.match(/^[+\-*/%=<>!&|^~?:]+/)) {
                return "operator";
            }

            if (stream.match(/^[()[\]{}.,;]/)) {
                return "punctuation";
            }

            stream.next();
            return null;
        },
    };
}

async function loadLanguageExtension(lang: LangId): Promise<Extension> {
    const cached = LANGUAGE_EXTENSION_CACHE.get(lang);
    if (cached) return cached;

    const promise = (async (): Promise<Extension> => {
        const spec: LanguageModeSpec = PISTON_LANGUAGE_MODES[lang];

        if (spec.codeMirrorName) {
            const description = LanguageDescription.matchLanguageName(
                codeMirrorLanguages,
                spec.codeMirrorName,
                false,
            );

            if (description) {
                try {
                    return await description.load();
                } catch (error) {
                    console.warn(
                        `Unable to load CodeMirror highlighting for ${lang}; using Scribby's fallback highlighter.`,
                        error,
                    );
                }
            }
        }

        return StreamLanguage.define(createFallbackParser(spec.fallback));
    })();

    LANGUAGE_EXTENSION_CACHE.set(lang, promise);
    return promise;
}

export class ScribbyCodeBlock extends HTMLElement {
    private view?: EditorView;
    private language = new Compartment();
    private selectEl?: HTMLSelectElement;
    private playButton?: HTMLButtonElement;
    private outputEl?: HTMLPreElement;
    private runAbortController?: AbortController;
    private languageLoadVersion = 0;

    get value(): string {
        return this.getAttribute("data-value") ?? "";
    }

    set value(value: string) {
        this.setAttribute("data-value", value);
        if (!this.view) return;

        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: value,
            },
        });
    }

    get lang(): LangId {
        return normalizeLang(this.getAttribute("data-lang"));
    }

    set lang(value: LangId) {
        this.setAttribute("data-lang", value);

        if (this.selectEl) {
            this.selectEl.value = value;
        }

        void this.applyLanguage(value);
    }

    connectedCallback(): void {
        this.setAttribute("contenteditable", "false");
        this.classList.add("code-block");

        const toolbar = document.createElement("div");
        toolbar.classList.add("code-block-toolbar");

        const toolbarLeft = document.createElement("div");
        toolbarLeft.classList.add("code-block-toolbar-left");

        const label = document.createElement("label");
        label.textContent = "Language:";
        label.classList.add("code-block-label");

        const select = document.createElement("select");
        select.classList.add("code-block-select");
        select.setAttribute("aria-label", "Code language");

        for (const language of LANGUAGES) {
            const option = document.createElement("option");
            option.value = language.id;
            option.textContent = language.label;
            select.appendChild(option);
        }

        const playButton = document.createElement("button");
        playButton.type = "button";
        playButton.classList.add("code-block-play-button");
        playButton.title = "Run code";
        playButton.setAttribute("aria-label", "Run code");
        playButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                <title>play</title>
                <path d="M8,5.14V19.14L19,12.14L8,5.14Z"></path>
            </svg>
        `;

        const editorHost = document.createElement("div");
        editorHost.classList.add("code-block-editor-host");

        const output = document.createElement("pre");
        output.classList.add("code-block-output");
        output.setAttribute("aria-live", "polite");
        output.hidden = true;

        this.selectEl = select;
        this.playButton = playButton;
        this.outputEl = output;

        const startDoc = this.value;
        const initialLang = this.lang;
        select.value = initialLang;

        select.addEventListener("change", (event) => {
            event.stopPropagation();

            const next = normalizeLang((event.currentTarget as HTMLSelectElement).value);
            this.lang = next;

            this.dispatchEvent(
                new CustomEvent("scribby:block-change", { bubbles: true }),
            );
        });

        playButton.addEventListener("click", (event) => {
            event.stopPropagation();
            void this.runCode();
        });

        toolbarLeft.appendChild(label);
        toolbarLeft.appendChild(select);
        toolbar.appendChild(toolbarLeft);
        toolbar.appendChild(playButton);

        this.innerHTML = "";
        this.appendChild(toolbar);
        this.appendChild(editorHost);
        this.appendChild(output);

        const state = EditorState.create({
            doc: startDoc,
            extensions: [
                lineNumbers(),
                keymap.of([indentWithTab, ...defaultKeymap]),
                syntaxHighlighting(vsCodeHighlightStyle),
                this.language.of([]),
                EditorView.updateListener.of((update) => {
                    if (!update.docChanged) return;

                    const text = update.state.doc.toString();
                    this.setAttribute("data-value", text);

                    this.dispatchEvent(
                        new CustomEvent("scribby:block-change", { bubbles: true }),
                    );
                }),
            ],
        });

        this.view = new EditorView({
            state,
            parent: editorHost,
        });

        void this.applyLanguage(initialLang);

        editorHost.addEventListener("keydown", async (event) => {
            if (event.key !== "Backspace" && event.key !== "Delete") return;
            if (!this.isEmpty()) return;

            event.stopPropagation();
            event.preventDefault();

            const confirmed = await ConfirmOverlay.open({
                message: "This action will delete this code block. Are you sure?",
                continueBtnTxt: "Continue",
                cancelBtnTxt: "Cancel",
            });

            if (!confirmed) return;

            let target = this.nextElementSibling as HTMLElement | null;

            if (!target || target.matches(utils.PROTECTED_BLOCK_SELECTOR)) {
                target = utils.makePlaceholderP();
                this.after(target);
            }

            const parent = this.parentElement;

            this.remove();
            utils.placeCaretAtStart(target);
            parent?.dispatchEvent(new Event("input"));
        }, true);
    }

    disconnectedCallback(): void {
        this.languageLoadVersion++;

        this.runAbortController?.abort();
        this.runAbortController = undefined;

        this.view?.destroy();
        this.view = undefined;
    }

    public getValue(): string {
        return this.view?.state.doc.toString() ?? this.getAttribute("data-value") ?? "";
    }

    public isEmpty(): boolean {
        if (!this.view) {
            return (this.getAttribute("data-value") ?? "").length === 0;
        }

        const doc = this.view.state.doc;
        return doc.length === 0 && doc.lines === 1;
    }

    public focusStart(): void {
        if (!this.view) return;

        this.view.focus();
        this.view.dispatch({
            selection: EditorSelection.cursor(0),
            scrollIntoView: true,
        });
    }

    public focusEnd(): void {
        if (!this.view) return;

        this.view.focus();
        this.view.dispatch({
            selection: EditorSelection.cursor(this.view.state.doc.length),
            scrollIntoView: true,
        });
    }

    private async applyLanguage(lang: LangId): Promise<void> {
        if (!this.view) return;

        const loadVersion = ++this.languageLoadVersion;
        const extension = await loadLanguageExtension(lang);

        if (!this.view) return;
        if (loadVersion !== this.languageLoadVersion) return;
        if (this.lang !== lang) return;

        this.view.dispatch({
            effects: this.language.reconfigure(extension),
        });
    }

    private async runCode(): Promise<void> {
        const code = this.getValue();

        if (code.trim() === "") {
            this.showOutput("Add some code before running this block.", true);
            return;
        }

        this.runAbortController?.abort();
        this.runAbortController = new AbortController();
        this.setRunning(true);

        try {
            const response = await fetch("/code/execute", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    language: this.lang,
                    code,
                }),
                signal: this.runAbortController.signal,
            });

            const payload = await response.json().catch(() => null) as
                | ExecuteCodeResponse
                | ExecuteCodeErrorResponse
                | null;

            if (!response.ok) {
                const errorPayload = payload as ExecuteCodeErrorResponse | null;
                throw new Error(
                    errorPayload?.error ??
                    errorPayload?.stderr ??
                    "Unable to execute code.",
                );
            }

            this.renderExecutionResult(payload as ExecuteCodeResponse);
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }

            const message = error instanceof Error
                ? error.message
                : "Unable to execute code.";

            this.showOutput(message, true);
        } finally {
            this.runAbortController = undefined;
            this.setRunning(false);
        }
    }

    private renderExecutionResult(result: ExecuteCodeResponse): void {
        const sections: string[] = [];

        if (result.timedOut) {
            sections.push("Execution timed out.");
        }

        if (result.compileOutput?.trim()) {
            sections.push(`Compile output:\n${result.compileOutput.trimEnd()}`);
        }

        if (result.stdout.trim()) {
            sections.push(`Output:\n${result.stdout.trimEnd()}`);
        }

        if (result.stderr.trim()) {
            sections.push(`Errors:\n${result.stderr.trimEnd()}`);
        }

        if (result.exitCode !== null) {
            sections.push(`Exit code: ${result.exitCode}`);
        }

        if (sections.length === 0) {
            sections.push(
                result.success
                    ? "Execution completed successfully with no output."
                    : "Execution failed with no output.",
            );
        }

        this.showOutput(sections.join("\n\n"), !result.success);
    }

    private showOutput(message: string, isError: boolean): void {
        if (!this.outputEl) return;

        this.outputEl.hidden = false;
        this.outputEl.textContent = message;
        this.outputEl.classList.toggle("is-error", isError);
        this.outputEl.classList.toggle("is-success", !isError);
    }

    private setRunning(isRunning: boolean): void {
        if (!this.playButton) return;

        this.playButton.disabled = isRunning;
        this.playButton.classList.toggle("is-running", isRunning);
        this.playButton.setAttribute("aria-busy", String(isRunning));
        this.playButton.title = isRunning ? "Running code" : "Run code";
    }
}