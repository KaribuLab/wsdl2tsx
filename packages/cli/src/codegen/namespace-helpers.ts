import { extractLocalName, getFilteredKeys, extractNamespacePrefix } from "./utils.js";
import { NAMESPACE_KEY } from "./constants.js";
import type { TypeObject } from "./types.js";

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

