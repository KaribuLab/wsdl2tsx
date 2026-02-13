import { extractLocalName, getFilteredKeys } from "../../utils.js";
import { debugContext } from "../../../logger.js";
import type { TypeObject } from "../../types.js";
import { preparePropsInterfaceData } from "./index.js";

/**
 * Maneja referencias circulares buscando el complexType directamente
 */
export function handleCircularReference(
    typeName: string,
    typeLocalName: string,
    allComplexTypes: any,
    allTypesForInterfaces: TypeObject | undefined,
    schemaObject: any,
    visitedTypes: Set<string>
): { properties: any[]; interfaces: any[] } | null {
    debugContext("preparePropsInterfaceData", `⚠ Referencia circular detectada, buscando complexType directamente`);
    
    if (!allComplexTypes) {
        return null;
    }
    
    const complexTypeKey = Object.keys(allComplexTypes).find(k => {
        const kLocalName = k.split(':').pop() || k;
        return kLocalName === typeLocalName;
    });
    
    if (complexTypeKey) {
        const complexType = allComplexTypes[complexTypeKey];
        if (complexType && typeof complexType === 'object') {
            // Verificar si tiene 'type' como objeto (complexType inline)
            let finalComplexType = complexType;
            if ('type' in complexType && typeof complexType.type === 'object' && complexType.type !== null) {
                finalComplexType = complexType.type as any;
            }
            
            const complexKeys = getFilteredKeys(finalComplexType);
            debugContext("preparePropsInterfaceData", `Usando complexType "${complexTypeKey}" con ${complexKeys.length} propiedades: ${complexKeys.join(', ')}`);
            
            // Limpiar propiedades internas
            const cleanedComplexType = { ...finalComplexType };
            Object.keys(cleanedComplexType).forEach(key => {
                if (key.startsWith('_')) {
                    delete (cleanedComplexType as any)[key];
                }
            });
            
            // Evitar procesar el mismo tipo múltiples veces
            if (visitedTypes.has(complexTypeKey)) {
                debugContext("preparePropsInterfaceData", `⚠ ComplexType "${complexTypeKey}" ya fue procesado, evitando recursión infinita`);
                return {
                    properties: [],
                    interfaces: []
                };
            }
            
            // Marcar el complexType como visitado antes de procesarlo recursivamente
            visitedTypes.add(complexTypeKey);
            return preparePropsInterfaceData(complexTypeKey, cleanedComplexType, allTypesForInterfaces, schemaObject, allComplexTypes, visitedTypes);
        }
    }
    
    return null;
}
