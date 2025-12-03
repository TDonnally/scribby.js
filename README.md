# Scribby.js

A lightweight rich text editor built with TypeScript on top of native DOM APIs and `contenteditable`.

---

## Features

- **Speeech to Text**: captures voice input and converts to text
- **Contenteditable-based**: uses native browser behavior as much as possible  
- **Schema-driven DOM** - enforce which elements are allowed and how they’re nested  
- **Inline + block formatting** - headings, paragraphs, spans, links, lists, etc.   
- **Framework-agnostic** - use it with React, Vue, Svelte, Go templates, plain HTML, etc.
- **Zero external runtime deps** - just a single JS file once built
- **Unopinionated Styles** - choose your own theming

---

## Installation

From npm:

```bash
npm install scribby
```

## Init

```javascript
import { Scribby } from "scribby";

const scribby = new Scribby(
    "<your-selector>", 
    "<your-initial-content>"
);
```