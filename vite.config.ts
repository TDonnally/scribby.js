import { cpSync, copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function copyKatexAssets(): Plugin {
    return {
        name: "copy-katex-assets",

        closeBundle() {
            const source = resolve("node_modules/katex/dist");
            const output = resolve("dist/katex");

            mkdirSync(output, { recursive: true });

            copyFileSync(
                resolve(source, "katex.min.css"),
                resolve(output, "katex.min.css")
            );

            cpSync(
                resolve(source, "fonts"),
                resolve(output, "fonts"),
                { recursive: true }
            );
        },
    };
}

export default defineConfig({
    plugins: [copyKatexAssets()],

    build: {
        lib: {
            entry: "src/index.ts",
            formats: ["es"],
            fileName: () => "index.js",
        },
    },
});