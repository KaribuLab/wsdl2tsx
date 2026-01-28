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
 * Extrae el prefijo de namespace de una URI
 * Optimizado: usa memoización para evitar recalcular el mismo namespace
 * Genera prefijos válidos de JavaScript (solo letras, números, guiones bajos)
 */
export function extractNamespacePrefix(namespace: string): string {
    if (namespacePrefixCache.has(namespace)) {
        return namespacePrefixCache.get(namespace)!;
    }
    
    const hasSlash = namespace.indexOf('/') !== -1;
    let namespaceLastPart: string;
    
    if (hasSlash) {
        const parts = cachedSplit(namespace, '/');
        namespaceLastPart = parts[parts.length - 1]!;
    } else {
        namespaceLastPart = namespace;
    }
    
    // Remover puntos y otros caracteres inválidos, tomar primeros caracteres válidos
    const cleanPart = namespaceLastPart.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    // Usar al menos 2 caracteres, máximo 10 para evitar colisiones
    let prefix = cleanPart.slice(0, Math.max(2, Math.min(10, cleanPart.length)));
    
    // Si no hay suficientes caracteres, usar un prefijo genérico basado en hash
    if (prefix.length < 2) {
        // Generar un hash simple del namespace
        let hash = 0;
        for (let i = 0; i < namespace.length; i++) {
            hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
            hash = hash & hash;
        }
        prefix = 'ns' + Math.abs(hash).toString(36).slice(0, 3);
    }
    
    namespacePrefixCache.set(namespace, prefix);
    return prefix;
}
