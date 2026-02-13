import { extractLocalName, getFilteredKeys } from "../../utils.js";
import type { PropsInterfaceData, TypeObject } from "../../types.js";
import { debugContext } from "../../../logger.js";
import { handleCircularReference } from "./circular-reference.js";
import { handleSingleKey } from "./helpers/single-key-handler.js";
import { resolveTypeReference } from "./helpers/reference-resolver.js";
import { resolveWrapperType } from "./helpers/wrapper-resolver.js";
import { handleNestedReference } from "./helpers/nested-reference-handler.js";
import { buildProperties } from "./helpers/property-builder.js";

/**
 * Prepara datos de la interfaz de props para el template
 * Extrae recursivamente todas las propiedades de tipos complejos anidados
 */
export function preparePropsInterfaceData(typeName: string, typeObject: TypeObject, allTypesForInterfaces?: TypeObject, schemaObject?: any, allComplexTypes?: any, visitedTypes: Set<string> = new Set()): PropsInterfaceData {
    // IMPORTANTE: No marcar como visitado inmediatamente porque necesitamos expandir las propiedades primero
    // Solo marcar como visitado cuando vamos a hacer una llamada recursiva para evitar ciclos infinitos
    const keys = getFilteredKeys(typeObject);
    const localNames = keys.map(key => extractLocalName(key));
    debugContext("preparePropsInterfaceData", `Procesando tipo "${typeName}" con ${keys.length} propiedades: ${keys.join(', ')}`);
    debugContext("preparePropsInterfaceData", `Orden de propiedades (nombres locales): ${localNames.join(' -> ')}`);
    
    // Si solo hay una clave y es un tipo complejo con type como objeto, extraer propiedades del type
    if (keys.length === 1) {
        const singleKey = keys[0]!;
        const element = typeObject[singleKey]!;
        
        // Manejar caso especial de propiedad única con referencia circular
        const singleKeyResult = handleSingleKey(
            typeName,
            typeObject,
            singleKey,
            element,
            schemaObject,
            allComplexTypes,
            allTypesForInterfaces,
            visitedTypes
        );
        if (singleKeyResult !== null) {
            return singleKeyResult;
        }
        
        if (typeof element === 'object' && element !== null && 'type' in element) {
            const typeValue = (element as any).type;
            debugContext("preparePropsInterfaceData", `Tipo de propiedad: ${typeof typeValue === 'string' ? `referencia "${typeValue}"` : `objeto complejo`}`);
            
            // Si type es un string (referencia a elemento o tipo), intentar resolverla desde schemaObject y allComplexTypes
            if (typeof typeValue === 'string' && (schemaObject || allComplexTypes)) {
                // Resolver la referencia
                let referencedElement = resolveTypeReference(typeValue, schemaObject, allComplexTypes);
                
                // Si el elemento encontrado es un wrapper con 'type' como string u objeto, intentar resolver el tipo completo
                if (referencedElement && typeof referencedElement === 'object' && 'type' in referencedElement) {
                    referencedElement = resolveWrapperType(
                        referencedElement,
                        referencedElement.type,
                        schemaObject,
                        allComplexTypes
                    );
                }
                
                if (referencedElement && typeof referencedElement === 'object') {
                    const refKeys = getFilteredKeys(referencedElement);
                    debugContext("preparePropsInterfaceData", `Tipo referenciado tiene ${refKeys.length} propiedades además de 'type'`);
                    
                    // Si el elemento referenciado tiene un type que es string, seguir resolviendo
                    if ('type' in referencedElement && typeof referencedElement.type === 'string') {
                        const nestedTypeValue = referencedElement.type;
                        const nestedResult = handleNestedReference(
                            referencedElement,
                            nestedTypeValue,
                            typeName,
                            allTypesForInterfaces,
                            schemaObject,
                            allComplexTypes,
                            visitedTypes
                        );
                        if (nestedResult !== null) {
                            return nestedResult;
                        }
                    }
                    
                    // Si encontramos el elemento referenciado, expandir su contenido
                    // Limpiar propiedades internas antes de expandir
                    const cleanedReferencedElement = { ...referencedElement };
                    Object.keys(cleanedReferencedElement).forEach(key => {
                        if (key.startsWith('_')) {
                            delete (cleanedReferencedElement as any)[key];
                        }
                    });
                    debugContext("preparePropsInterfaceData", `Expandiendo tipo referenciado directamente (sin type anidado)`);
                    // Crear un identificador único para el tipo referenciado basado en sus propiedades o typeName
                    const referencedTypeId = typeValue || typeName;
                    
                    // IMPORTANTE: Verificar si hay una referencia circular
                    // Una referencia circular ocurre cuando el tipo referenciado tiene 'type' que apunta a un tipo con el mismo nombre local
                    const typeLocalName = typeName.split(':').pop() || typeName;
                    const referencedTypeLocalName = typeValue ? typeValue.split(':').pop() || typeValue : null;
                    const isCircularReference = referencedTypeLocalName === typeLocalName && 
                                                'type' in cleanedReferencedElement && 
                                                typeof cleanedReferencedElement.type === 'string' &&
                                                (cleanedReferencedElement.type === typeValue || 
                                                 cleanedReferencedElement.type.split(':').pop() === typeLocalName);
                    
                    if (isCircularReference) {
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
                    
                    // Evitar procesar el mismo tipo múltiples veces (previene ciclos infinitos)
                    if (visitedTypes.has(referencedTypeId)) {
                        debugContext("preparePropsInterfaceData", `⚠ Tipo referenciado "${referencedTypeId}" ya fue procesado, evitando recursión infinita`);
                        // Retornar estructura básica para evitar recursión infinita
                        return {
                            properties: [],
                            interfaces: []
                        };
                    }
                    // Marcar el tipo referenciado como visitado antes de procesarlo recursivamente
                    visitedTypes.add(referencedTypeId);
                    return preparePropsInterfaceData(referencedTypeId, cleanedReferencedElement, allTypesForInterfaces, schemaObject, allComplexTypes, visitedTypes);
                }
            }
            
            // Si type es un objeto (tipo complejo anidado), extraer propiedades de ese objeto
            if (typeof typeValue === 'object' && typeValue !== null) {
                // Limpiar propiedades internas antes de procesar
                const cleanedTypeValue = { ...typeValue };
                Object.keys(cleanedTypeValue).forEach(key => {
                    if (key.startsWith('_')) {
                        delete (cleanedTypeValue as any)[key];
                    }
                });
                const typeKeys = getFilteredKeys(cleanedTypeValue as TypeObject);
                // Si tiene propiedades, procesar recursivamente el objeto type
                if (typeKeys.length > 0) {
                    // Evitar procesar el mismo tipo múltiples veces (previene ciclos infinitos)
                    if (visitedTypes.has(typeName)) {
                        debugContext("preparePropsInterfaceData", `⚠ Tipo "${typeName}" ya fue procesado, evitando recursión infinita`);
                        // Retornar estructura básica para evitar recursión infinita
                        return {
                            properties: [],
                            interfaces: []
                        };
                    }
                    // Marcar el tipo como visitado antes de procesarlo recursivamente
                    visitedTypes.add(typeName);
                    return preparePropsInterfaceData(typeName, cleanedTypeValue as TypeObject, allTypesForInterfaces, schemaObject, allComplexTypes, visitedTypes);
                }
            }
        }
    }
    
    // Construir propiedades finales usando el helper
    const properties = buildProperties(keys, typeObject, allTypesForInterfaces);
    
    // Usar nombre local para el tipo
    return {
        name: extractLocalName(typeName),
        properties,
    };
}
