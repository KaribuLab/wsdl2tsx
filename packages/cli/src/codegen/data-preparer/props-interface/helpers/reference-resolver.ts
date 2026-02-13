import { extractLocalName, getFilteredKeys } from "../../../utils.js";
import { debugContext } from "../../../../logger.js";

/**
 * Resuelve una referencia de tipo buscando en schemaObject y allComplexTypes
 * Retorna el elemento referenciado o null si no se encuentra
 */
export function resolveTypeReference(
    typeValue: string,
    schemaObject?: any,
    allComplexTypes?: any
): any {
    debugContext("preparePropsInterfaceData", `Resolviendo referencia de tipo: "${typeValue}"`);
    
    // Buscar el elemento/tipo referenciado primero en schemaObject, luego en allComplexTypes
    let referencedElement = schemaObject?.[typeValue];
    if (referencedElement) {
        const refType = typeof referencedElement;
        const hasType = typeof referencedElement === 'object' && referencedElement !== null && 'type' in referencedElement;
        const typeValueInRef = hasType ? (referencedElement as any).type : null;
        const typeOfTypeValue = typeof typeValueInRef;
        debugContext("preparePropsInterfaceData", `Tipo encontrado directamente en schemaObject[${typeValue}]: tipo=${refType}, tiene 'type'=${hasType}, typeValue=${typeValueInRef} (${typeOfTypeValue})`);
    }
    
    // Si no se encuentra en schemaObject, buscar en allComplexTypes
    if (!referencedElement && allComplexTypes) {
        referencedElement = allComplexTypes[typeValue];
        if (referencedElement) {
            debugContext("preparePropsInterfaceData", `Tipo encontrado en allComplexTypes[${typeValue}]`);
        }
    }
    
    // Si no se encuentra exactamente, buscar por nombre local en schemaObject
    if (!referencedElement && schemaObject) {
        const typeLocalName = typeValue.split(':').pop() || typeValue;
        debugContext("preparePropsInterfaceData", `Buscando por nombre local "${typeLocalName}" en schemaObject`);
        const schemaKeys = Object.keys(schemaObject).filter(k => k !== '$namespace' && k !== '$qualified');
        debugContext("preparePropsInterfaceData", `Total de claves en schemaObject: ${schemaKeys.length}`);
        const matchingKey = schemaKeys.find(key => {
            const keyLocalName = key.split(':').pop() || key;
            return keyLocalName === typeLocalName || 
                   key === typeValue ||
                   key.endsWith(`:${typeLocalName}`) ||
                   typeValue.endsWith(keyLocalName);
        });
        if (matchingKey) {
            referencedElement = schemaObject[matchingKey];
            debugContext("preparePropsInterfaceData", `✓ Encontrado en schemaObject: "${matchingKey}"`);
        }
    }
    
    // Si todavía no se encuentra, buscar por nombre local en allComplexTypes
    if (!referencedElement && allComplexTypes) {
        const typeLocalName = typeValue.split(':').pop() || typeValue;
        debugContext("preparePropsInterfaceData", `Buscando por nombre local "${typeLocalName}" en allComplexTypes`);
        const complexTypeKeys = Object.keys(allComplexTypes);
        debugContext("preparePropsInterfaceData", `Total de claves en allComplexTypes: ${complexTypeKeys.length}`);
        const matchingKey = complexTypeKeys.find(key => {
            const keyLocalName = key.split(':').pop() || key;
            return keyLocalName === typeLocalName || 
                   key === typeValue ||
                   key.endsWith(`:${typeLocalName}`) ||
                   typeValue.endsWith(keyLocalName);
        });
        if (matchingKey) {
            referencedElement = allComplexTypes[matchingKey];
            debugContext("preparePropsInterfaceData", `✓ Encontrado en allComplexTypes: "${matchingKey}"`);
        }
    }
    
    if (!referencedElement) {
        debugContext("preparePropsInterfaceData", `✗ No se encontró la referencia "${typeValue}"`);
    } else {
        const refKeys = typeof referencedElement === 'object' ? getFilteredKeys(referencedElement) : [];
        const refLocalNames = refKeys.map(k => extractLocalName(k));
        debugContext("preparePropsInterfaceData", `✓ Referencia resuelta (${refKeys.length} propiedades): ${refKeys.join(', ')}`);
        debugContext("preparePropsInterfaceData", `  Propiedades del tipo referenciado (nombres locales): ${refLocalNames.join(' -> ')}`);
    }
    
    return referencedElement;
}
