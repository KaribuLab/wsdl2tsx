// Punto de entrada del CLI wsdl2tsx
// Este archivo será el ejecutable cuando se use `npx wsdl2tsx`

import { generateTsxFromWsdl } from "./generate-tsx";

console.log('wsdl2tsx CLI - Generador de código TSX desde WSDL');

// Parsear argumentos y flags
function parseArgs(): { wsdlPath: string; outDir: string; operationName?: string } {
    const args = process.argv.slice(2);
    let wsdlPath: string | undefined;
    let outDir: string | undefined;
    let operationName: string | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        // Manejar flags --operation=X o --operation X
        if (arg === '--operation' || arg === '-o') {
            if (i + 1 < args.length && !args[i + 1]!.startsWith('-')) {
                operationName = args[i + 1];
                i++; // Saltar el siguiente argumento
            } else {
                throw new Error(`El flag ${arg} requiere un valor`);
            }
        } else if (arg.startsWith('--operation=')) {
            operationName = arg.split('=')[1];
        } else if (arg.startsWith('-o=')) {
            operationName = arg.split('=')[1];
        } else if (!wsdlPath) {
            wsdlPath = arg;
        } else if (!outDir) {
            outDir = arg;
        } else {
            // Si hay más argumentos después de outDir, podría ser el nombre de operación (compatibilidad hacia atrás)
            if (!operationName) {
                operationName = arg;
            }
        }
    }

    return { wsdlPath: wsdlPath!, outDir: outDir!, operationName };
}

try {
    const { wsdlPath, outDir, operationName } = parseArgs();

    if (!wsdlPath || !outDir) {
        console.error('Uso: wsdl2tsx <ruta-wsdl> <directorio-salida> [--operation=<nombre>]');
        console.error('  --operation, -o: Especifica el nombre de la operación a generar');
        console.error('  Si no se especifica --operation, se generan todas las operaciones');
        console.error('');
        console.error('Ejemplos:');
        console.error('  wsdl2tsx wsdl.xml output/');
        console.error('  wsdl2tsx wsdl.xml output/ --operation=Add');
        console.error('  wsdl2tsx wsdl.xml output/ -o Add');
        process.exit(1);
    }

    generateTsxFromWsdl(wsdlPath, outDir, operationName)
        .catch(error => {
            console.error('Error al generar TSX:', error);
            process.exit(1);
        });
} catch (error: any) {
    console.error('Error al parsear argumentos:', error.message);
    process.exit(1);
}
