import { extractLocalName, getFilteredKeys } from "../../../utils.js";
import { debugContext } from "../../../../logger.js";
import type { TypeObject } from "../../../types.js";
import { handleCircularReference } from "../circular-reference.js";
import { preparePropsInterfaceData } from "../index.js";
import { resolveTypeReference } from "./reference-resolver.js";

/**
 * Maneja referencias anidadas (cuando un tipo referenciado tiene 'type' que es string)
 * Retorna el resultado de la resolución recursiva o null si no se puede resolver
 */
export function handleNestedReference(
    referencedElement: any,
    nestedTypeValue: string,
    typeName: string,
    allTypesForInterfaces: TypeObject | undefined,
    schemaObject: any,
    allComplexTypes: any,
    visitedTypes: Set<string>
): { properties: any[]; interfaces: any[] } | null {
    debugContext("preparePropsInterfaceData", `Resolviendo tipo anidado recursivamente: "${nestedTypeValue}"`);
    
    // Continuar resolviendo recursivamente - buscar primero en schemaObject, luego en allComplexTypes
    let nestedReferencedElement = resolveTypeReference(nestedTypeValue, schemaObject, allComplexTypes);
    
    if (nestedReferencedElement && typeof nestedReferencedElement === 'object') {
        const nestedKeys = getFilteredKeys(nestedReferencedElement);
        const nestedLocalNames = nestedKeys.map(k => extractLocalName(k));
        debugContext("preparePropsInterfaceData", `Tipo anidado resuelto tiene ${nestedKeys.length} propiedades: ${nestedKeys.join(', ')}`);
        debugContext("preparePropsInterfaceData", `  Propiedades del tipo anidado (nombres locales): ${nestedLocalNames.join(' -> ')}`);
        
        // IMPORTANTE: Verificar si hay una referencia circular (el tipo anidado tiene el mismo nombre local que el tipo original)
        const typeLocalName = typeName.split(':').pop() || typeName;
        const nestedTypeLocalName = nestedTypeValue.split(':').pop() || nestedTypeValue;
        const isCircularNestedReference = nestedTypeLocalName === typeLocalName;
        
        if (isCircularNestedReference) {
            const circularResult = handleCircularReference(
                typeName,
                typeLocalName,
                allComplexTypes,
                allTypesForInterfaces,
                schemaObject,
                visitedTypes
            );
            if (circularResult !== null) {
                return circularResult;
            }
        }
        
        // Verificar propiedades del wrapper original
        const refKeys = getFilteredKeys(referencedElement);
        const hasOnlyTypeProperty = refKeys.length === 0 && 'type' in referencedElement;
        const hasTypeAndOtherProperties = refKeys.length > 0 && 'type' in referencedElement;
        
        // Si el tipo referenciado solo tiene 'type' (es un wrapper), expandir el tipo anidado directamente
        // Si tiene otras propiedades además de 'type', debemos combinarlas
        if (hasOnlyTypeProperty || (!hasTypeAndOtherProperties && refKeys.length === 0)) {
            debugContext("preparePropsInterfaceData", `Expandiendo contenido del tipo anidado (wrapper sin otras propiedades)`);
            // Evitar procesar el mismo tipo múltiples veces (previene ciclos infinitos)
            if (visitedTypes.has(nestedTypeValue)) {
                debugContext("preparePropsInterfaceData", `⚠ Tipo anidado "${nestedTypeValue}" ya fue procesado, evitando recursión infinita`);
                // Retornar estructura básica para evitar recursión infinita
                return {
                    properties: [],
                    interfaces: []
                };
            }
            // Marcar el tipo anidado como visitado antes de procesarlo recursivamente
            visitedTypes.add(nestedTypeValue);
            // Limpiar propiedades internas antes de expandir
            const cleanedNestedElement = { ...nestedReferencedElement };
            Object.keys(cleanedNestedElement).forEach(key => {
                if (key.startsWith('_')) {
                    delete (cleanedNestedElement as any)[key];
                }
            });
            // Usar el tipo anidado directamente
            return preparePropsInterfaceData(nestedTypeValue, cleanedNestedElement, allTypesForInterfaces, schemaObject, allComplexTypes, visitedTypes);
        } else {
            // El tipo referenciado tiene propiedades además de 'type', debemos combinarlas
            debugContext("preparePropsInterfaceData", `Combinando propiedades del wrapper con el tipo anidado`);
            // Evitar procesar el mismo tipo múltiples veces (previene ciclos infinitos)
            if (visitedTypes.has(nestedTypeValue)) {
                debugContext("preparePropsInterfaceData", `⚠ Tipo anidado "${nestedTypeValue}" ya fue procesado, evitando recursión infinita`);
                // Retornar estructura básica para evitar recursión infinita
                return {
                    properties: [],
                    interfaces: []
                };
            }
            // Marcar el tipo anidado como visitado antes de procesarlo recursivamente
            visitedTypes.add(nestedTypeValue);
            // Por ahora, expandir el tipo anidado
            const cleanedNestedElement = { ...nestedReferencedElement };
            Object.keys(cleanedNestedElement).forEach(key => {
                if (key.startsWith('_')) {
                    delete (cleanedNestedElement as any)[key];
                }
            });
            return preparePropsInterfaceData(nestedTypeValue, cleanedNestedElement, allTypesForInterfaces, schemaObject, allComplexTypes, visitedTypes);
        }
    }
    
    return null;
}
