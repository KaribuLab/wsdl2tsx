// Barrel export para wsdl
export * from "./types.js";
export * from "./loader.js";
export * from "./node-extractors.js";
export * from "./processors/index.js";
export * from "./complex-types.js";
export * from "./operations/index.js";

// Re-export getOutputNode para facilitar acceso
export { getOutputNode } from "./node-extractors.js";
