// Punto de entrada del CLI wsdl2tsx
// Este archivo será el ejecutable cuando se use `npx wsdl2tsx`

import { generateTsxFromWsdl } from "./generate-tsx";
import { setDebugMode, info, error } from "./logger.js";

info('wsdl2tsx CLI - Generador de código TSX desde WSDL');

// Parsear argumentos y flags
function parseArgs(): { wsdlPath: string; outDir: string; operationName?: string; debug: boolean } {
    const args = process.argv.slice(2);
    let wsdlPath: string | undefined;
    let outDir: string | undefined;
    let operationName: string | undefined;
    let debug = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        // Manejar flags --operation=X o --operation X
        if (arg === '--operation' || arg === '-o') {
            if (i + 1 < args.length && !args[i + 1]!.startsWith('-')) {
                const value = args[i + 1];
                if (!value || value.trim() === '') {
                    throw new Error(`El flag ${arg} requiere un valor no vacío`);
                }
                operationName = value;
                i++; // Saltar el siguiente argumento
            } else {
                throw new Error(`El flag ${arg} requiere un valor`);
            }
        } else if (arg.startsWith('--operation=')) {
            const value = arg.split('=')[1];
            if (!value || value.trim() === '') {
                throw new Error('El flag --operation requiere un valor no vacío');
            }
            operationName = value;
        } else if (arg.startsWith('-o=')) {
            const value = arg.split('=')[1];
            if (!value || value.trim() === '') {
                throw new Error('El flag -o requiere un valor no vacío');
            }
            operationName = value;
        } else if (arg === '--debug' || arg === '-d') {
            debug = true;
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

    return { wsdlPath: wsdlPath!, outDir: outDir!, operationName, debug };
}

try {
    const { wsdlPath, outDir, operationName, debug } = parseArgs();

    // Activar modo debug si se especificó el flag
    if (debug) {
        setDebugMode(true);
    }

    if (!wsdlPath || !outDir) {
        error('Uso: wsdl2tsx <ruta-wsdl> <directorio-salida> [--operation=<nombre>] [--debug]');
        error('  --operation, -o: Especifica el nombre de la operación a generar');
        error('  --debug, -d: Activa el modo debug para mostrar información detallada');
        error('  Si no se especifica --operation, se generan todas las operaciones');
        error('');
        error('Ejemplos:');
        error('  wsdl2tsx wsdl.xml output/');
        error('  wsdl2tsx wsdl.xml output/ --operation=Add');
        error('  wsdl2tsx wsdl.xml output/ -o Add');
        error('  wsdl2tsx wsdl.xml output/ --debug');
        process.exit(1);
    }

    generateTsxFromWsdl(wsdlPath, outDir, operationName)
        .catch(err => {
            error(`Error al generar TSX: ${err}`);
            process.exit(1);
        });
} catch (err: any) {
    error(`Error al parsear argumentos: ${err.message}`);
    process.exit(1);
}
