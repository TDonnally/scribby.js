# Scribby.js

A lightweight rich text editor built with TypeScript on top of native DOM APIs and `contenteditable`.

---

## Features

- **Speeech to Text**: captures voice input and converts to text
- **Contenteditable-based**: uses native browser behavior as much as possible  
- **Framework agnostic**: use it with React, Vue, Svelte, plain HTML, etc.
- **Unopinionated Styles**: choose your own theming
- **Code formatting**: built in code editor powered by CodeMirror that supports most popular languages
- **LaTeX blocks**: add inline and block level formatted LaTeX
- **LLM Summary blocks**: Hook up your own LLM to have it write sections for you
- **Responsive Styles**: Applies classes on viewport changes so responsive styles can be added
---

## Installation
> [!WARNING]
> npm installation is currently outdated. It is recommneded that you clone the repository and build locally.
From npm:

```bash
npm install scribby
```
From cloned repo:

```bash
git clone https://github.com/TDonnally/scribby.js.git

npm run build
```

## Init

```javascript
import { Scribby } from "scribby";

const scribby = new Scribby(
    "<your-selector>", 
    "<your-initial-content>"
);
```