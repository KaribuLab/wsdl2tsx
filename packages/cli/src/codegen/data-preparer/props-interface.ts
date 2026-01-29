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
    debugContext("preparePropsInterfaceData", `Procesando tipo "${typeName}" con ${keys.length} propiedades: ${keys.join(', ')}`);
    
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
                
                // Si no se encuentra en schemaObject, buscar en allComplexTypes
                if (!referencedElement && allComplexTypes) {
                    referencedElement = allComplexTypes[typeValue];
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
                    debugContext("preparePropsInterfaceData", `✓ Referencia resuelta (${typeof referencedElement === 'object' ? Object.keys(referencedElement).length + ' propiedades' : 'tipo simple'})`);
                }
                
                if (referencedElement && typeof referencedElement === 'object') {
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
                            debugContext("preparePropsInterfaceData", `Expandiendo contenido del tipo anidado`);
                            // Usar el tipo anidado directamente
                            return preparePropsInterfaceData(typeName, nestedReferencedElement, allTypesForInterfaces, schemaObject, allComplexTypes);
                        }
                    }
                    // Si encontramos el elemento referenciado, expandir su contenido
                    return preparePropsInterfaceData(typeName, referencedElement, allTypesForInterfaces, schemaObject, allComplexTypes);
                }
            }
            
            // Si type es un objeto (tipo complejo anidado), extraer propiedades de ese objeto
            if (typeof typeValue === 'object' && typeValue !== null) {
                const typeKeys = getFilteredKeys(typeValue as TypeObject);
                // Si tiene propiedades, procesar recursivamente el objeto type
                if (typeKeys.length > 0) {
                    return preparePropsInterfaceData(typeName, typeValue as TypeObject, allTypesForInterfaces, schemaObject, allComplexTypes);
                }
            }
        }
    }
    
    // Usar nombres locales para las propiedades y determinar el tipo correcto
    const properties = keys.map(key => {
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
