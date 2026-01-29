import { extractNamespacePrefix, extractLocalName, getFilteredKeys } from "./utils.js";
import { NAMESPACE_KEY } from "./constants.js";
import type { TypeObject, CombinedNamespaceMappings, NamespaceTagsMapping, NamespacePrefixesMapping, NamespaceTypesMapping, NamespaceInfo } from "./types.js";
import { extractNestedTags, flattenKeysWithNamespace } from "./namespace-helpers.js";

/**
 * Extrae todos los mappings de namespace en una sola pasada sobre los datos
 * Optimización: combina las tres extracciones (tags, prefixes, types) en una sola iteración
 * Solo incluye namespaces qualified en prefixesMapping (para xmlns declarations)
 */
export function extractAllNamespaceMappings(
    baseTypeName: string,
    baseTypeObject: TypeObject
): CombinedNamespaceMappings {
    const tagsMapping: NamespaceTagsMapping = {};
    const prefixesMapping: NamespacePrefixesMapping = {};
    const typesMapping: NamespaceTypesMapping = {};
    
    // Validar que baseTypeObject tenga $namespace
    if (!baseTypeObject || typeof baseTypeObject !== 'object') {
        throw new Error(`El objeto de tipo ${baseTypeName} es inválido o está vacío`);
    }
    
    const baseNamespace = baseTypeObject[NAMESPACE_KEY];
    if (!baseNamespace) {
        throw new Error(`El tipo ${baseTypeName} no tiene la propiedad $namespace definida`);
    }
    
    // Verificar si el tipo base es qualified
    const baseIsQualified = baseTypeObject.$qualified === true;
    
    const baseNamespacePrefix = extractNamespacePrefix(baseNamespace);
    
    // Extraer nombre local del tipo base
    const baseTypeLocalName = extractLocalName(baseTypeName);
    
    // Inicializar mappings base (usar nombres locales para los tags)
    // Solo agregar al tagsMapping si es qualified
    if (baseIsQualified) {
        tagsMapping[baseNamespacePrefix] = [baseTypeLocalName];
        prefixesMapping[baseNamespacePrefix] = baseNamespace;
    }
    
    typesMapping[baseTypeName] = {
        uri: baseNamespace,
        prefix: baseNamespacePrefix,
    };
    
    const keys = getFilteredKeys(baseTypeObject);
    
    // Una sola iteración sobre las claves principales
    for (const key of keys) {
        const element = baseTypeObject[key]!;
        // Extraer nombre local del tag
        const tagLocalName = extractLocalName(key);
        
        // Verificar si el elemento es qualified
        let elementIsQualified = false;
        // Obtener el namespace del elemento (no del tipo interno)
        let elementNamespace: string | undefined;
        
        if (typeof element === 'object' && element !== null) {
            elementIsQualified = (element as any).$qualified === true;
            // Usar el $namespace del propio elemento si existe
            elementNamespace = (element as any).$namespace;
        }
        
        // Usar el namespace del elemento, o el del baseType como fallback
        const namespace = elementNamespace || baseNamespace;
        
        const tagNames = elementIsQualified ? [tagLocalName] : [];
        
        if (typeof element === 'object' && element !== null && typeof element.type === 'object') {
            // Los tags anidados pueden tener un namespace diferente (del tipo interno)
            const nestedTags = extractNestedTags(element.type as TypeObject);
            tagNames.push(...nestedTags);
        }
        
        const namespacePrefix = extractNamespacePrefix(namespace);
        
        // Solo agregar al tagsMapping y prefixesMapping si hay tags qualified
        if (tagNames.length > 0) {
            // Actualizar tagsMapping (usar nombres locales)
            if (tagsMapping[namespacePrefix] === undefined) {
                tagsMapping[namespacePrefix] = tagNames;
            } else {
                tagsMapping[namespacePrefix]!.push(...tagNames);
            }
            
            // Actualizar prefixesMapping
            if (prefixesMapping[namespacePrefix] === undefined) {
                prefixesMapping[namespacePrefix] = namespace;
            }
        }
    }
    
    // Construir typesMapping usando flattenKeysWithNamespace
    const flatKeys = flattenKeysWithNamespace(baseTypeObject, baseNamespace, baseNamespacePrefix);
    for (const item of flatKeys) {
        typesMapping[item.name] = {
            uri: item.uri,
            prefix: item.prefix,
        };
    }
    
    return {
        tagsMapping,
        prefixesMapping,
        typesMapping,
    };
}

/**
 * Obtiene el prefijo de namespace para un elemento
 * Usa el namespace del propio elemento si tiene uno definido
 */
export function getNamespacePrefix(namespacesTypeMapping: NamespaceTypesMapping, baseNamespacePrefix: string, key: string, parentKey: string | null, elementObject?: any): string {
    // Si el elemento tiene su propio $namespace, usarlo para determinar el prefijo
    // IMPORTANTE: Usar solo el $namespace del elemento, no del tipo interno
    // El tipo interno puede tener un namespace diferente (del schema donde está definido el tipo)
    // pero el elemento usa el namespace del schema donde está definido el elemento
    if (elementObject && typeof elementObject === 'object') {
        const elemNs = (elementObject as any).$namespace;
        if (typeof elemNs === 'string') {
            return extractNamespacePrefix(elemNs);
        }
    }
    
    // Fallback al mapping existente
    if (parentKey !== null) {
        return namespacesTypeMapping[parentKey]?.prefix ?? baseNamespacePrefix;
    }
    return namespacesTypeMapping[key]?.prefix ?? baseNamespacePrefix;
}

/**
 * Determina si un elemento debe tener prefijo de namespace
 * Basado en el atributo elementFormDefault del schema
 */
export function shouldHavePrefix(elementObject: any): boolean {
    if (!elementObject || typeof elementObject !== 'object') return false;
    
    // Si el elemento tiene $qualified definido, usarlo
    if ('$qualified' in elementObject && typeof elementObject.$qualified === 'boolean') {
        return elementObject.$qualified;
    }
    
    // Si el elemento tiene un type que es objeto, verificar si tiene $qualified
    if ('type' in elementObject && typeof elementObject.type === 'object' && elementObject.type !== null) {
        const typeObj = elementObject.type;
        if ('$qualified' in typeObj && typeof typeObj.$qualified === 'boolean') {
            return typeObj.$qualified;
        }
    }
    
    // Por defecto, no agregar prefijo (unqualified)
    return false;
}
