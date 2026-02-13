import { getFilteredKeys, extractNamespacePrefix } from "../utils.js";
import { NAMESPACE_KEY } from "../constants.js";
import type { TypeObject } from "../types.js";

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
