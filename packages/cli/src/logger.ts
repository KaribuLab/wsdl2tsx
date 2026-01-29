/**
 * Sistema de logging básico para wsdl2tsx
 * 
 * Los logs de info, warn y error siempre se muestran.
 * Los logs de debug solo se muestran cuando se activa el modo debug con --debug o -d
 */

let debugMode = false;

/**
 * Activa el modo debug
 */
export function setDebugMode(enabled: boolean): void {
    debugMode = enabled;
}

/**
 * Verifica si el modo debug está activo
 */
export function isDebugMode(): boolean {
    return debugMode;
}

/**
 * Log de información (siempre visible)
 */
export function info(message: string): void {
    console.log(message);
}

/**
 * Log de advertencia (siempre visible)
 */
export function warn(message: string): void {
    console.warn(message);
}

/**
 * Log de error (siempre visible)
 */
export function error(message: string): void {
    console.error(message);
}

/**
 * Log de debug (solo visible si el modo debug está activo)
 */
export function debug(message: string): void {
    if (debugMode) {
        console.log(`[DEBUG] ${message}`);
    }
}

/**
 * Log de debug con contexto específico (solo visible si el modo debug está activo)
 */
export function debugContext(context: string, message: string): void {
    if (debugMode) {
        console.log(`[DEBUG ${context}] ${message}`);
    }
}
