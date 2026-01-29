import type { TypeObject } from "../types.js";
import { getFilteredKeys } from "../utils.js";

/**
 * Resuelve un tipo referenciado desde schemaObject o allComplexTypes
 */
export function resolveReferencedType(
    typeValue: string,
    schemaObject?: any,
    allComplexTypes?: any
): any {
    // Buscar el elemento/tipo referenciado primero en schemaObject, luego en allComplexTypes
    let referencedElement = schemaObject?.[typeValue];
    
    // Si no se encuentra en schemaObject, buscar en allComplexTypes
    if (!referencedElement && allComplexTypes) {
        referencedElement = allComplexTypes[typeValue];
    }
    
    // Si no se encuentra exactamente, buscar por nombre local en schemaObject
    if (!referencedElement && schemaObject) {
        const typeLocalName = typeValue.split(':').pop() || typeValue;
        const matchingKey = Object.keys(schemaObject).find(key => {
            if (key === '$namespace' || key === '$qualified') return false;
            const keyLocalName = key.split(':').pop() || key;
            return keyLocalName === typeLocalName || 
                   key === typeValue ||
                   key.endsWith(`:${typeLocalName}`) ||
                   typeValue.endsWith(keyLocalName);
        });
        if (matchingKey) {
            referencedElement = schemaObject[matchingKey];
        }
    }
    
    // Si todavía no se encuentra, buscar por nombre local en allComplexTypes
    if (!referencedElement && allComplexTypes) {
        const typeLocalName = typeValue.split(':').pop() || typeValue;
        const matchingKey = Object.keys(allComplexTypes).find(key => {
            const keyLocalName = key.split(':').pop() || key;
            return keyLocalName === typeLocalName || 
                   key === typeValue ||
                   key.endsWith(`:${typeLocalName}`) ||
                   typeValue.endsWith(keyLocalName);
        });
        if (matchingKey) {
            referencedElement = allComplexTypes[matchingKey];
        }
    }
    
    return referencedElement;
}

/**
 * Resuelve un tipo anidado recursivamente
 */
export function resolveNestedType(
    nestedTypeValue: string,
    schemaObject?: any,
    allComplexTypes?: any
): any {
    let nestedReferencedElement = schemaObject?.[nestedTypeValue];
    
    if (!nestedReferencedElement && allComplexTypes) {
        nestedReferencedElement = allComplexTypes[nestedTypeValue];
    }
    
    // Si no se encuentra exactamente, buscar por nombre local
    if (!nestedReferencedElement) {
        const nestedTypeLocalName = nestedTypeValue.split(':').pop() || nestedTypeValue;
        
        // Buscar primero en schemaObject
        if (schemaObject) {
            const nestedMatchingKey = Object.keys(schemaObject).find(key => {
                if (key === '$namespace' || key === '$qualified') return false;
                const keyLocalName = key.split(':').pop() || key;
                return keyLocalName === nestedTypeLocalName || 
                       key === nestedTypeValue ||
                       key.endsWith(`:${nestedTypeLocalName}`) ||
                       nestedTypeValue.endsWith(keyLocalName);
            });
            if (nestedMatchingKey) {
                nestedReferencedElement = schemaObject[nestedMatchingKey];
            }
        }
        
        // Si todavía no se encuentra, buscar en allComplexTypes
        if (!nestedReferencedElement && allComplexTypes) {
            const nestedMatchingKey = Object.keys(allComplexTypes).find(key => {
                const keyLocalName = key.split(':').pop() || key;
                return keyLocalName === nestedTypeLocalName || 
                       key === nestedTypeValue ||
                       key.endsWith(`:${nestedTypeLocalName}`) ||
                       nestedTypeValue.endsWith(keyLocalName);
            });
            if (nestedMatchingKey) {
                nestedReferencedElement = allComplexTypes[nestedMatchingKey];
            }
        }
    }
    
    return nestedReferencedElement;
}
