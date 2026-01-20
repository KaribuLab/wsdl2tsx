import { build } from "esbuild";

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
  external: ["@karibulab/wsdl2tsx-runtime"]
});
