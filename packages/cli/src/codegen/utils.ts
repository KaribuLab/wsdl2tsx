import { toCamelCase } from "../util.js";
import { NAMESPACE_KEY, XML_SCHEMA_URI, DEFAULT_OCCURS, XML_SCHEMA_TYPES } from "./constants.js";
import type { TypeObject, TypeDefinition } from "./types.js";

// Cache para memoización de extractNamespacePrefix
const namespacePrefixCache = new Map<string, string>();

// Cache para operaciones de split en strings
const stringSplitCache = new Map<string, string[]>();

// Cache para claves filtradas usando WeakMap (permite garbage collection automática)
const filteredKeysCache = new WeakMap<TypeObject, string[]>();

/**
 * Obtiene las claves de un objeto filtradas (sin NAMESPACE_KEY, $qualified, etc)
 * Cachea el resultado para evitar múltiples Object.keys() y filtros
 */
export function getFilteredKeys(obj: TypeObject | null | undefined): string[] {
    if (!obj || typeof obj !== 'object') return [];
    
    if (filteredKeysCache.has(obj)) {
        return filteredKeysCache.get(obj)!;
    }
    
    const keys = Object.keys(obj).filter(key => key !== NAMESPACE_KEY && key !== '$qualified' && key !== '$base');
    filteredKeysCache.set(obj, keys);
    return keys;
}

/**
 * Cachea el resultado de split para strings que se usan frecuentemente
 */
export function cachedSplit(str: string, separator: string): string[] {
    // Validar que str sea un string
    if (typeof str !== 'string') {
        return [String(str)];
    }
    const cacheKey = `${str}${separator}`;
    if (stringSplitCache.has(cacheKey)) {
        return stringSplitCache.get(cacheKey)!;
    }
    const result = str.split(separator);
    stringSplitCache.set(cacheKey, result);
    return result;
}

/**
 * Extrae el tipo de esquema XML de una cadena con formato "prefix:type"
 */
export function extractXmlSchemaType(type: string | any): string {
    if (typeof type !== 'string') {
        // Si no es un string, intentar extraer el tipo de otra forma
        if (typeof type === 'object' && type !== null) {
            // Si es un objeto, puede ser un tipo complejo
            return 'any';
        }
        return 'string'; // Fallback por defecto
    }
    const parts = cachedSplit(type, ':');
    return parts.length > 1 ? parts[1]! : parts[0]!;
}

/**
 * Determina si una propiedad es opcional o un array basado en minOccurs y maxOccurs
 */
export function getTypeModifier(propConfig?: TypeDefinition): string {
    const maxOccurs = propConfig?.maxOccurs ?? DEFAULT_OCCURS;
    const minOccurs = propConfig?.minOccurs ?? DEFAULT_OCCURS;
    
    if (maxOccurs !== DEFAULT_OCCURS) {
        return '[]';
    }
    if (minOccurs !== DEFAULT_OCCURS) {
        return '?';
    }
    return '';
}

/**
 * Crea una propiedad de interfaz TypeScript
 */
export function createInterfacePropertyCode(prop: string, props: { type: TypeObject } & Record<string, any>): string {
    const childrenField = props.type[prop]!;
    if (typeof childrenField === 'string' || typeof childrenField === 'boolean') {
        return `\t${toCamelCase(prop)}: string`;
    }
    const xmlSchemaType = extractXmlSchemaType(childrenField.type as string);
    const childrenType = XML_SCHEMA_TYPES[xmlSchemaType] ?? 'string';
    // props[prop] puede tener maxOccurs/minOccurs si existe directamente en props
    const propConfig = props[prop] || childrenField;
    const modifier = getTypeModifier(propConfig);
    
    return `\t${toCamelCase(prop)}: ${childrenType}${modifier}`;
}

/**
 * Filtra propiedades válidas para una interfaz TypeScript
 */
export function isValidInterfaceProperty(prop: string, props: Record<string, any>): boolean {
    if (prop.includes('$')) return false;
    if (prop === 'minOccurs' || prop === 'maxOccurs') return false;
    if (prop === NAMESPACE_KEY) return false;
    if (/^[0-9]*$/.test(prop)) return false;
    // En el código original se accede a props[prop]
    // Esta condición filtra propiedades cuyo tipo es un string simple de XML Schema
    // Solo aplica cuando la propiedad está directamente en el nivel superior (no dentro de type)
    // Dentro de interfaces complejas (cuando accedemos a props.type[prop]), estas propiedades SÍ deben incluirse
    const propDef = props[prop];
    if (propDef && typeof propDef.type === 'string' && propDef.type.includes(XML_SCHEMA_URI) && !props.type) {
        return false;
    }
    
    return true;
}

/**
 * Extrae el nombre local de un tipo (después del último ':')
 */
export function extractLocalName(fullName: string): string {
    if (fullName.includes(':')) {
        return fullName.split(':').pop()!;
    }
    return fullName;
}

/**
 * Valida que el orden de las propiedades coincida entre props y XML
 * Retorna true si el orden es idéntico, false si hay diferencias
 */
export function validatePropertyOrder(
    propsOrder: string[],
    xmlOrder: string[],
    context: string = 'unknown'
): { isValid: boolean; differences?: Array<{ index: number; props: string; xml: string }> } {
    if (propsOrder.length !== xmlOrder.length) {
        return {
            isValid: false,
            differences: [{
                index: -1,
                props: `Length: ${propsOrder.length}`,
                xml: `Length: ${xmlOrder.length}`
            }]
        };
    }
    
    const differences: Array<{ index: number; props: string; xml: string }> = [];
    
    for (let i = 0; i < propsOrder.length; i++) {
        if (propsOrder[i] !== xmlOrder[i]) {
            differences.push({
                index: i,
                props: propsOrder[i] || '(missing)',
                xml: xmlOrder[i] || '(missing)'
            });
        }
    }
    
    return {
        isValid: differences.length === 0,
        differences: differences.length > 0 ? differences : undefined
    };
}

/**
 * Genera un hash simple de un string
 */
function generateHash(str: string, seed: number = 0): number {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * Extrae el prefijo de namespace de una URI
 * Formato: ns_<6caracteresURI>_<hash3>
 * Optimizado: usa memoización para evitar recalcular el mismo namespace
 * Genera prefijos válidos de JavaScript (solo letras, números, guiones bajos)
 */
export function extractNamespacePrefix(namespace: string, existingPrefixes?: Set<string>, retryCount: number = 0): string {
    const cacheKey = `${namespace}_${retryCount}`;
    if (namespacePrefixCache.has(cacheKey)) {
        return namespacePrefixCache.get(cacheKey)!;
    }
    
    // Generar hash de 3 caracteres
    const hash = generateHash(namespace, retryCount);
    const hashStr = hash.toString(36).slice(0, 3);
    
    // Extraer 6 caracteres alfanuméricos de la URI (preferir última parte, luego toda la URI)
    const hasSlash = namespace.indexOf('/') !== -1;
    let sourceForChars: string;
    
    if (hasSlash) {
        const parts = cachedSplit(namespace, '/');
        sourceForChars = parts[parts.length - 1] || namespace;
    } else {
        sourceForChars = namespace;
    }
    
    // Limpiar y tomar 6 caracteres alfanuméricos
    const cleanPart = sourceForChars.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const uriChars = cleanPart.slice(0, 6);
    
    // Si no hay suficientes caracteres de la URI, usar más del hash
    let finalUriChars = uriChars;
    if (finalUriChars.length < 6) {
        // Completar con más caracteres del hash si es necesario
        const additionalHash = hash.toString(36).slice(3, 3 + (6 - finalUriChars.length));
        finalUriChars = uriChars + additionalHash;
    }
    
    // Construir prefijo: ns_<6caracteres>_<hash3>
    let prefix = `ns_${finalUriChars.slice(0, 6)}_${hashStr}`;
    
    // Si hay colisión y se puede reintentar, generar nuevo hash
    if (existingPrefixes && existingPrefixes.has(prefix) && retryCount < 10) {
        return extractNamespacePrefix(namespace, existingPrefixes, retryCount + 1);
    }
    
    namespacePrefixCache.set(cacheKey, prefix);
    return prefix;
}
