import { getFilteredKeys } from "../../../utils.js";
import { debugContext } from "../../../../logger.js";

/**
 * Resuelve un wrapper (tipo con 'type' que es string u objeto)
 * Retorna el tipo completo resuelto o el elemento original si no se puede resolver
 */
export function resolveWrapperType(
    referencedElement: any,
    typeValueInElement: string | object,
    schemaObject?: any,
    allComplexTypes?: any
): any {
    // Si type es un string (referencia), buscar el tipo completo
    if (typeof typeValueInElement === 'string') {
        debugContext("preparePropsInterfaceData", `Tipo encontrado es un wrapper con type="${typeValueInElement}", buscando tipo completo`);
        
        // Buscar el tipo completo en allComplexTypes primero (los tipos importados suelen estar ahí)
        let fullType = allComplexTypes?.[typeValueInElement];
        if (fullType) {
            const fullTypeKeys = getFilteredKeys(fullType);
            debugContext("preparePropsInterfaceData", `Tipo completo encontrado en allComplexTypes con ${fullTypeKeys.length} propiedades: ${fullTypeKeys.join(', ')}`);
        }
        
        if (!fullType && schemaObject) {
            fullType = schemaObject[typeValueInElement];
            if (fullType && typeof fullType === 'object') {
                const fullTypeKeys = getFilteredKeys(fullType);
                debugContext("preparePropsInterfaceData", `Tipo completo encontrado en schemaObject con ${fullTypeKeys.length} propiedades: ${fullTypeKeys.join(', ')}`);
            }
        }
        
        // Si todavía no se encuentra, buscar por nombre local
        if (!fullType) {
            const wrappedTypeLocalName = typeValueInElement.split(':').pop() || typeValueInElement;
            debugContext("preparePropsInterfaceData", `Buscando tipo completo por nombre local "${wrappedTypeLocalName}"`);
            
            if (allComplexTypes) {
                const matchingKey = Object.keys(allComplexTypes).find(key => {
                    const keyLocalName = key.split(':').pop() || key;
                    return keyLocalName === wrappedTypeLocalName;
                });
                if (matchingKey) {
                    fullType = allComplexTypes[matchingKey];
                    const fullTypeKeys = getFilteredKeys(fullType);
                    debugContext("preparePropsInterfaceData", `✓ Tipo completo encontrado en allComplexTypes por nombre local "${matchingKey}" con ${fullTypeKeys.length} propiedades`);
                }
            }
            
            if (!fullType && schemaObject) {
                const matchingKey = Object.keys(schemaObject).find(key => {
                    if (key === '$namespace' || key === '$qualified') return false;
                    const keyLocalName = key.split(':').pop() || key;
                    return keyLocalName === wrappedTypeLocalName;
                });
                if (matchingKey) {
                    fullType = schemaObject[matchingKey];
                    if (fullType && typeof fullType === 'object') {
                        const fullTypeKeys = getFilteredKeys(fullType);
                        debugContext("preparePropsInterfaceData", `✓ Tipo completo encontrado en schemaObject por nombre local "${matchingKey}" con ${fullTypeKeys.length} propiedades`);
                    }
                }
            }
        }
        
        if (fullType && typeof fullType === 'object') {
            // Usar el tipo completo en lugar del wrapper
            const fullTypeKeys = getFilteredKeys(fullType);
            debugContext("preparePropsInterfaceData", `✓ Usando tipo completo con ${fullTypeKeys.length} propiedades en lugar del wrapper`);
            return fullType;
        } else {
            debugContext("preparePropsInterfaceData", `⚠ Tipo completo no encontrado para "${typeValueInElement}", usando wrapper`);
            return referencedElement;
        }
    } else if (typeof typeValueInElement === 'object' && typeValueInElement !== null) {
        // Si type es un objeto, usar ese objeto directamente (es el tipo completo)
        debugContext("preparePropsInterfaceData", `Tipo encontrado tiene type como objeto, usando directamente`);
        return typeValueInElement;
    }
    
    return referencedElement;
}
