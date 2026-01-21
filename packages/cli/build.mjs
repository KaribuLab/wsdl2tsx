import { build } from "esbuild";
import { cpSync, mkdirSync } from "fs";


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
    "@karibulab/wsdl2tsx-runtime"
  ],
  // Incluir todas las dependencias de npm en el bundle excepto las marcadas como external
  packages: "bundle",
  // Manejar mejor los módulos de Node.js que usan require() dinámico
  mainFields: ["module", "main"],
  conditions: ["import", "require", "node"]
});

// Copy templates to dist
mkdirSync("dist/templates", { recursive: true });
cpSync("src/templates", "dist/templates", { recursive: true });
