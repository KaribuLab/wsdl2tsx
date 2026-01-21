import { build } from "esbuild";
import { cpSync, mkdirSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  outdir: "dist",
  platform: "node",
  format: "esm",
  logLevel: "info",
  jsx: "automatic",
  jsxImportSource: "@karibulab/wsdl2tsx-runtime/jsx-runtime",
  banner: {
    js: '#!/usr/bin/env node'
  },
  external: [
    "@karibulab/wsdl2tsx-runtime",
    "axios",
    "fast-xml-parser",
    "handlebars"
  ]
});

// Copy templates to dist
mkdirSync("dist/templates", { recursive: true });
cpSync("src/templates", "dist/templates", { recursive: true });
