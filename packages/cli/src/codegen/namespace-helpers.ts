import { extractLocalName, getFilteredKeys, extractNamespacePrefix } from "./utils.js";
import { NAMESPACE_KEY } from "./constants.js";
import { debugContext } from "../logger.js";
import type { TypeObject, NamespaceTagsMapping, NamespaceTypesMapping } from "./types.js";

/**
 * Extrae tags anidados recursivamente (solo si son qualified)
 */
export function extractNestedTags(typeObject: TypeObject): string[] {
    const result: string[] = [];
    const nestedKeys = getFilteredKeys(typeObject);
    const isQualified = typeObject.$qualified === true;
    
    for (const nestedKey of nestedKeys) {
        const nestedElement = typeObject[nestedKey]!;
        // Solo agregar el tag si es qualified
        if (isQualified) {
            const tagLocalName = extractLocalName(nestedKey);
            result.push(tagLocalName);
        }
        
        if (typeof nestedElement === 'object' && nestedElement !== null && typeof nestedElement.type === 'object') {
            // También agregar tags anidados recursivamente
            const nestedTags = extractNestedTags(nestedElement.type as TypeObject);
            result.push(...nestedTags);
        }
    }
    
    return result;
}

/**
 * Extrae todos los tags que se usarán en el XML body (incluyendo no qualified)
 * Esto es necesario para registrar todos los tags en el namespace, incluso si no son qualified
 */
export function extractAllTagsForXmlBody(
    typeObject: TypeObject,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    currentNamespace: string,
    visited: Set<string> = new Set(),
    schemaObject?: any,
    allComplexTypes?: any
): string[] {
    const result: string[] = [];
    const keys = getFilteredKeys(typeObject);
    
    debugContext("extractAllTagsForXmlBody", `Extrayendo tags de tipo con ${keys.length} propiedad(es) en namespace "${currentNamespace}"`);
    
    for (const key of keys) {
        // Evitar procesar el mismo tipo dos veces
        const typeKey = `${currentNamespace}:${key}`;
        if (visited.has(typeKey)) {
            debugContext("extractAllTagsForXmlBody", `Omitiendo tag ya procesado: "${key}"`);
            continue;
        }
        visited.add(typeKey);
        
        const element = typeObject[key]!;
        const tagLocalName = extractLocalName(key);
        
        // Obtener el namespace del elemento
        let elementNamespace: string | undefined;
        let elementTypeValue: any = null;
        
        if (typeof element === 'object' && element !== null) {
            elementNamespace = (element as any).$namespace;
            
            // Si el elemento tiene un type que es string (referencia), intentar resolverlo
            if ('type' in element && typeof element.type === 'string') {
                const referencedType = element.type;
                debugContext("extractAllTagsForXmlBody", `Resolviendo tipo referenciado: "${referencedType}" para tag "${tagLocalName}"`);
                
                // Buscar el tipo referenciado en schemaObject o allComplexTypes
                let referencedTypeObject = schemaObject?.[referencedType] || allComplexTypes?.[referencedType];
                
                // Si no se encuentra exactamente, buscar por nombre local
                if (!referencedTypeObject) {
                    const referencedLocalName = referencedType.split(':').pop() || referencedType;
                    const matchingKey = Object.keys(schemaObject || {}).find(k => {
                        const kLocalName = k.split(':').pop();
                        return kLocalName === referencedLocalName;
                    }) || Object.keys(allComplexTypes || {}).find(k => {
                        const kLocalName = k.split(':').pop();
                        return kLocalName === referencedLocalName;
                    });
                    
                    if (matchingKey) {
                        referencedTypeObject = schemaObject?.[matchingKey] || allComplexTypes?.[matchingKey];
                        debugContext("extractAllTagsForXmlBody", `Tipo referenciado encontrado por nombre local: "${matchingKey}"`);
                    }
                }
                
                if (referencedTypeObject) {
                    elementTypeValue = referencedTypeObject;
                    // Si el tipo referenciado tiene su propio namespace, usarlo
                    if (typeof referencedTypeObject === 'object' && referencedTypeObject !== null) {
                        const refNamespace = referencedTypeObject[NAMESPACE_KEY];
                        if (refNamespace) {
                            elementNamespace = refNamespace;
                        }
                        // Si el tipo referenciado tiene un wrapper 'type', extraer el contenido
                        if ('type' in referencedTypeObject && typeof referencedTypeObject.type === 'object') {
                            elementTypeValue = referencedTypeObject.type;
                        }
                    }
                    debugContext("extractAllTagsForXmlBody", `✓ Tipo referenciado resuelto para "${tagLocalName}"`);
                } else {
                    debugContext("extractAllTagsForXmlBody", `✗ Tipo referenciado no encontrado: "${referencedType}"`);
                }
            } else if ('type' in element && typeof element.type === 'object') {
                elementTypeValue = element.type;
            }
        }
        
        const namespace = elementNamespace || currentNamespace;
        const namespacePrefix = extractNamespacePrefix(namespace);
        
        // Si el elemento tiene el mismo namespace que el base, agregar el tag
        // Esto incluye tanto elementos qualified como no qualified que se usarán en el XML
        if (namespacePrefix === baseNamespacePrefix || namespace === currentNamespace) {
            debugContext("extractAllTagsForXmlBody", `Agregando tag "${tagLocalName}" al namespace "${namespacePrefix}"`);
            result.push(tagLocalName);
        }
        
        // Si el elemento tiene un tipo complejo (ya sea inline o referenciado), extraer sus tags también
        if (elementTypeValue && typeof elementTypeValue === 'object' && elementTypeValue !== null) {
            const nestedTypeObject = elementTypeValue as TypeObject;
            const nestedNamespace = nestedTypeObject[NAMESPACE_KEY] || namespace;
            debugContext("extractAllTagsForXmlBody", `Extrayendo tags anidados de "${tagLocalName}" en namespace "${nestedNamespace}"`);
            const nestedTags = extractAllTagsForXmlBody(
                nestedTypeObject,
                namespacesTypeMapping,
                baseNamespacePrefix,
                nestedNamespace,
                visited,
                schemaObject,
                allComplexTypes
            );
            if (nestedTags.length > 0) {
                debugContext("extractAllTagsForXmlBody", `  → Encontrados ${nestedTags.length} tag(s) anidado(s) en "${tagLocalName}"`);
            }
            result.push(...nestedTags);
        }
    }
    
    debugContext("extractAllTagsForXmlBody", `Total de tags extraídos: ${result.length}`);
    return result;
}

/**
 * Aplana claves con información de namespace recursivamente
 */
export function flattenKeysWithNamespace(
    typeObject: TypeObject,
    currentNamespace: string,
    currentNamespacePrefix: string
): Array<{ name: string; uri: string; prefix: string }> {
    const result: Array<{ name: string; uri: string; prefix: string }> = [];
    const objKeys = getFilteredKeys(typeObject);
    
    for (const objKey of objKeys) {
        const objElement = typeObject[objKey]!;
        
        if (typeof objElement === 'object' && objElement !== null && typeof objElement.type === 'object') {
            const objNamespace = (objElement.type as TypeObject)[NAMESPACE_KEY];
            if (!objNamespace) {
                // Si no tiene namespace, usar el namespace actual
                result.push({
                    name: objKey,
                    uri: currentNamespace,
                    prefix: currentNamespacePrefix,
                });
                continue;
            }
            const objNamespacePrefix = extractNamespacePrefix(objNamespace);
            
            const nested = flattenKeysWithNamespace(objElement.type as TypeObject, objNamespace, objNamespacePrefix);
            result.push(...nested);
            
            result.push({
                name: objKey,
                uri: objNamespace,
                prefix: objNamespacePrefix,
            });
        } else {
            result.push({
                name: objKey,
                uri: currentNamespace,
                prefix: currentNamespacePrefix,
            });
        }
    }
    
    return result;
}
