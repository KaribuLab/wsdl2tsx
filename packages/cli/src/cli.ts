// Punto de entrada del CLI wsdl2tsx
// Este archivo será el ejecutable cuando se use `npx wsdl2tsx`

import { generateTsxFromWsdl } from "./generate-tsx";

console.log('wsdl2tsx CLI - Generador de código TSX desde WSDL');
// Ejecución principal
const WSDL_PATH = process.argv[2];
const OUT_DIR = process.argv[3];

if (!WSDL_PATH || !OUT_DIR) {
    console.error('Uso: tsx cli/generate-tsx.ts <ruta-wsdl> <directorio-salida>');
    process.exit(1);
}

generateTsxFromWsdl(WSDL_PATH, OUT_DIR)
    .catch(error => {
        console.error('Error al generar TSX:', error);
        process.exit(1);
    });
