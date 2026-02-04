import { toPascalCase } from "../../util.js";
import { XML_SCHEMA_TYPES } from "../constants.js";
import { extractLocalName, extractXmlSchemaType, getFilteredKeys } from "../utils.js";
import { resolveTypeName } from "./type-resolver.js";
import type { PropsInterfaceData, TypeObject } from "../types.js";
import { debugContext } from "../../logger.js";

/**
 * Prepara datos de la interfaz de props para el template
 * Extrae recursivamente todas las propiedades de tipos complejos anidados
 */
export function preparePropsInterfaceData(typeName: string, typeObject: TypeObject, allTypesForInterfaces?: TypeObject, schemaObject?: any, allComplexTypes?: any): PropsInterfaceData {
    const keys = getFilteredKeys(typeObject);
    const localNames = keys.map(key => extractLocalName(key));
    debugContext("preparePropsInterfaceData", `Procesando tipo "${typeName}" con ${keys.length} propiedades: ${keys.join(', ')}`);
    debugContext("preparePropsInterfaceData", `Orden de propiedades (nombres locales): ${localNames.join(' -> ')}`);
    
    // Si solo hay una clave y es un tipo complejo con type como objeto, extraer propiedades del type
    if (keys.length === 1) {
        const singleKey = keys[0]!;
        const element = typeObject[singleKey]!;
        debugContext("preparePropsInterfaceData", `Procesando propiedad única "${singleKey}" (tipo: ${typeof element})`);
        
        if (typeof element === 'object' && element !== null && 'type' in element) {
            const typeValue = (element as any).type;
            debugContext("preparePropsInterfaceData", `Tipo de propiedad: ${typeof typeValue === 'string' ? `referencia "${typeValue}"` : `objeto complejo`}`);
            
            // Si type es un string (referencia a elemento o tipo), intentar resolverla desde schemaObject y allComplexTypes
            if (typeof typeValue === 'string' && (schemaObject || allComplexTypes)) {
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
                
                // Si el elemento encontrado es un wrapper con 'type' como string u objeto, intentar resolver el tipo completo
                if (referencedElement && typeof referencedElement === 'object' && 'type' in referencedElement) {
                    const typeValueInElement = referencedElement.type;
                    
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
                            referencedElement = fullType;
                        } else {
                            debugContext("preparePropsInterfaceData", `⚠ Tipo completo no encontrado para "${typeValueInElement}", usando wrapper`);
                        }
                    } else if (typeof typeValueInElement === 'object' && typeValueInElement !== null) {
                        // Si type es un objeto, usar ese objeto directamente (es el tipo completo)
                        debugContext("preparePropsInterfaceData", `Tipo encontrado tiene type como objeto, usando directamente`);
                        referencedElement = typeValueInElement;
                    }
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
                
                if (referencedElement && typeof referencedElement === 'object') {
                    // IMPORTANTE: Cuando un tipo referenciado tiene un 'type' que es string, significa que es un wrapper
                    // que referencia a otro tipo. En este caso, debemos expandir las propiedades del tipo referenciado,
                    // pero también debemos incluir las propiedades del wrapper si las hay.
                    // Sin embargo, si el wrapper solo tiene 'type' y propiedades internas, debemos expandir el tipo referenciado.
                    
                    const refKeys = getFilteredKeys(referencedElement);
                    const hasOnlyTypeProperty = refKeys.length === 0 && 'type' in referencedElement;
                    const hasTypeAndOtherProperties = refKeys.length > 0 && 'type' in referencedElement;
                    
                    debugContext("preparePropsInterfaceData", `Tipo referenciado tiene ${refKeys.length} propiedades además de 'type'`);
                    
                    // Si el elemento referenciado tiene un type que es string, seguir resolviendo
                    if ('type' in referencedElement && typeof referencedElement.type === 'string') {
                        const nestedTypeValue = referencedElement.type;
                        debugContext("preparePropsInterfaceData", `Resolviendo tipo anidado recursivamente: "${nestedTypeValue}"`);
                        
                        // Continuar resolviendo recursivamente - buscar primero en schemaObject, luego en allComplexTypes
                        let nestedReferencedElement = schemaObject?.[nestedTypeValue];
                        
                        if (!nestedReferencedElement && allComplexTypes) {
                            nestedReferencedElement = allComplexTypes[nestedTypeValue];
                        }
                        
                        // Si no se encuentra exactamente, buscar por nombre local
                        if (!nestedReferencedElement) {
                            const nestedTypeLocalName = nestedTypeValue.split(':').pop() || nestedTypeValue;
                            debugContext("preparePropsInterfaceData", `Buscando tipo anidado por nombre local "${nestedTypeLocalName}"`);
                            
                            // Buscar primero en schemaObject
                            let nestedMatchingKey = Object.keys(schemaObject || {}).find(key => {
                                if (key === '$namespace' || key === '$qualified') return false;
                                const keyLocalName = key.split(':').pop() || key;
                                return keyLocalName === nestedTypeLocalName || 
                                       key === nestedTypeValue ||
                                       key.endsWith(`:${nestedTypeLocalName}`) ||
                                       nestedTypeValue.endsWith(keyLocalName);
                            });
                            if (nestedMatchingKey) {
                                nestedReferencedElement = schemaObject[nestedMatchingKey];
                                debugContext("preparePropsInterfaceData", `✓ Tipo anidado encontrado en schemaObject: "${nestedMatchingKey}"`);
                            } else {
                                // Buscar en allComplexTypes
                                const complexTypeKeys = Object.keys(allComplexTypes || {});
                                nestedMatchingKey = complexTypeKeys.find(key => {
                                    const keyLocalName = key.split(':').pop() || key;
                                    return keyLocalName === nestedTypeLocalName || 
                                           key === nestedTypeValue ||
                                           key.endsWith(`:${nestedTypeLocalName}`) ||
                                           nestedTypeValue.endsWith(keyLocalName);
                                });
                                if (nestedMatchingKey) {
                                    nestedReferencedElement = allComplexTypes[nestedMatchingKey];
                                    debugContext("preparePropsInterfaceData", `✓ Tipo anidado encontrado en allComplexTypes: "${nestedMatchingKey}"`);
                                } else {
                                    debugContext("preparePropsInterfaceData", `✗ Tipo anidado no encontrado: "${nestedTypeValue}"`);
                                }
                            }
                        }
                        
                        if (nestedReferencedElement && typeof nestedReferencedElement === 'object') {
                            const nestedKeys = getFilteredKeys(nestedReferencedElement);
                            const nestedLocalNames = nestedKeys.map(k => extractLocalName(k));
                            debugContext("preparePropsInterfaceData", `Tipo anidado resuelto tiene ${nestedKeys.length} propiedades: ${nestedKeys.join(', ')}`);
                            debugContext("preparePropsInterfaceData", `  Propiedades del tipo anidado (nombres locales): ${nestedLocalNames.join(' -> ')}`);
                            
                            // Si el tipo referenciado solo tiene 'type' (es un wrapper), expandir el tipo anidado directamente
                            // Si tiene otras propiedades además de 'type', debemos combinarlas
                            if (hasOnlyTypeProperty || (!hasTypeAndOtherProperties && refKeys.length === 0)) {
                                debugContext("preparePropsInterfaceData", `Expandiendo contenido del tipo anidado (wrapper sin otras propiedades)`);
                                // Limpiar propiedades internas antes de expandir
                                const cleanedNestedElement = { ...nestedReferencedElement };
                                Object.keys(cleanedNestedElement).forEach(key => {
                                    if (key.startsWith('_')) {
                                        delete (cleanedNestedElement as any)[key];
                                    }
                                });
                                // Usar el tipo anidado directamente
                                return preparePropsInterfaceData(typeName, cleanedNestedElement, allTypesForInterfaces, schemaObject, allComplexTypes);
                            } else {
                                // El tipo referenciado tiene propiedades además de 'type', debemos combinarlas
                                debugContext("preparePropsInterfaceData", `Combinando propiedades del wrapper con el tipo anidado`);
                                // TODO: Implementar combinación de propiedades si es necesario
                                // Por ahora, expandir el tipo anidado
                                const cleanedNestedElement = { ...nestedReferencedElement };
                                Object.keys(cleanedNestedElement).forEach(key => {
                                    if (key.startsWith('_')) {
                                        delete (cleanedNestedElement as any)[key];
                                    }
                                });
                                return preparePropsInterfaceData(typeName, cleanedNestedElement, allTypesForInterfaces, schemaObject, allComplexTypes);
                            }
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
                    return preparePropsInterfaceData(typeName, cleanedReferencedElement, allTypesForInterfaces, schemaObject, allComplexTypes);
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
                    return preparePropsInterfaceData(typeName, cleanedTypeValue as TypeObject, allTypesForInterfaces, schemaObject, allComplexTypes);
                }
            }
        }
    }
    
    // Usar nombres locales para las propiedades y determinar el tipo correcto
    // Filtrar propiedades internas que empiezan con _ (como _referencedElementNamespace)
    const properties = keys
        .filter(key => {
            const localName = extractLocalName(key);
            // Filtrar propiedades internas que empiezan con _
            return !localName.startsWith('_');
        })
        .map(key => {
            const localName = extractLocalName(key);
            const element = typeObject[key]!;
            
            let propertyType: string;
            
            if (typeof element === 'string') {
                // Tipo simple (xsd:string, etc.)
                const xmlSchemaType = extractXmlSchemaType(element);
                propertyType = XML_SCHEMA_TYPES[xmlSchemaType] ?? 'string';
            } else if (typeof element === 'object' && element !== null) {
                // Tipo complejo
                if ('type' in element && typeof (element as any).type === 'string') {
                    // Tipo referenciado por string (ej: "tns2:CodigoPlanListTO")
                    propertyType = resolveTypeName((element as any).type, localName, allTypesForInterfaces);
                } else if ('type' in element && typeof (element as any).type === 'object') {
                    // Tipo complejo inline con type como objeto - usar el nombre local en PascalCase como tipo de interfaz
                    propertyType = toPascalCase(localName);
                } else {
                    // Tipo complejo inline sin type - usar el nombre local en PascalCase como tipo de interfaz
                    propertyType = toPascalCase(localName);
                }
            } else {
                propertyType = 'any';
            }
            
            return {
                name: localName,
                type: propertyType,
            };
        });
    
    // Usar nombre local para el tipo
    return {
        name: extractLocalName(typeName),
        properties,
    };
}
