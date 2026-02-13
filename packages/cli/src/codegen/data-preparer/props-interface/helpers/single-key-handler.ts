import { debugContext } from "../../../../logger.js";
import type { TypeObject } from "../../../types.js";
import type { PropsInterfaceData } from "../../../types.js";
import { handleCircularReference } from "../circular-reference.js";

/**
 * Maneja el caso especial cuando solo hay una clave y es un tipo complejo con type como objeto
 * Retorna el resultado de la resolución o null si no aplica este caso
 */
export function handleSingleKey(
    typeName: string,
    typeObject: TypeObject,
    singleKey: string,
    element: any,
    schemaObject?: any,
    allComplexTypes?: any,
    allTypesForInterfaces?: TypeObject,
    visitedTypes: Set<string> = new Set()
): PropsInterfaceData | null {
    debugContext("preparePropsInterfaceData", `Procesando propiedad única "${singleKey}" (tipo: ${typeof element})`);
    
    // IMPORTANTE: Si el elemento es un string que parece ser una referencia (contiene ':'), intentar resolverla
    if (typeof element === 'string' && element.includes(':') && !element.startsWith('xsd:') && (schemaObject || allComplexTypes)) {
        const typeLocalName = typeName.split(':').pop() || typeName;
        const elementLocalName = element.split(':').pop() || element;
        
        // Si parece ser una referencia circular (mismo nombre local), buscar el complexType directamente
        if (elementLocalName === typeLocalName && allComplexTypes) {
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
    }
    
    return null;
}
