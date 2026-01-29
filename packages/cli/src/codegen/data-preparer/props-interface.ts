import { toPascalCase } from "../../util.js";
import { XML_SCHEMA_TYPES } from "../constants.js";
import { extractLocalName, extractXmlSchemaType, getFilteredKeys } from "../utils.js";
import { resolveTypeName } from "./type-resolver.js";
import type { PropsInterfaceData, TypeObject } from "../types.js";

/**
 * Prepara datos de la interfaz de props para el template
 * Extrae recursivamente todas las propiedades de tipos complejos anidados
 */
export function preparePropsInterfaceData(typeName: string, typeObject: TypeObject, allTypesForInterfaces?: TypeObject, schemaObject?: any, allComplexTypes?: any): PropsInterfaceData {
    const keys = getFilteredKeys(typeObject);
    console.log(`[DEBUG preparePropsInterfaceData] typeName: "${typeName}", keys encontradas: ${keys.join(', ')}`);
    
    // Si solo hay una clave y es un tipo complejo con type como objeto, extraer propiedades del type
    if (keys.length === 1) {
        const singleKey = keys[0]!;
        const element = typeObject[singleKey]!;
        console.log(`[DEBUG preparePropsInterfaceData] Procesando clave única: "${singleKey}", element type: ${typeof element}`);
        
        if (typeof element === 'object' && element !== null && 'type' in element) {
            const typeValue = (element as any).type;
            console.log(`[DEBUG preparePropsInterfaceData] typeValue: ${typeof typeValue === 'string' ? `"${typeValue}"` : typeof typeValue}`);
            
            // Si type es un string (referencia a elemento o tipo), intentar resolverla desde schemaObject y allComplexTypes
            if (typeof typeValue === 'string' && (schemaObject || allComplexTypes)) {
                console.log(`[DEBUG preparePropsInterfaceData] Buscando referencia: "${typeValue}"`);
                
                // Buscar el elemento/tipo referenciado primero en schemaObject, luego en allComplexTypes
                let referencedElement = schemaObject?.[typeValue];
                console.log(`[DEBUG preparePropsInterfaceData] Búsqueda exacta en schemaObject: ${referencedElement ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
                
                // Si no se encuentra en schemaObject, buscar en allComplexTypes
                if (!referencedElement && allComplexTypes) {
                    referencedElement = allComplexTypes[typeValue];
                    console.log(`[DEBUG preparePropsInterfaceData] Búsqueda exacta en allComplexTypes: ${referencedElement ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
                }
                
                // Si no se encuentra exactamente, buscar por nombre local en schemaObject
                if (!referencedElement && schemaObject) {
                    const typeLocalName = typeValue.split(':').pop() || typeValue;
                    console.log(`[DEBUG preparePropsInterfaceData] Buscando por nombre local "${typeLocalName}" en schemaObject`);
                    const schemaKeys = Object.keys(schemaObject).filter(k => k !== '$namespace' && k !== '$qualified');
                    console.log(`[DEBUG preparePropsInterfaceData] Claves disponibles en schemaObject: ${schemaKeys.slice(0, 10).join(', ')}${schemaKeys.length > 10 ? '...' : ''}`);
                    const matchingKey = schemaKeys.find(key => {
                        const keyLocalName = key.split(':').pop() || key;
                        return keyLocalName === typeLocalName || 
                               key === typeValue ||
                               key.endsWith(`:${typeLocalName}`) ||
                               typeValue.endsWith(keyLocalName);
                    });
                    if (matchingKey) {
                        referencedElement = schemaObject[matchingKey];
                        console.log(`[DEBUG preparePropsInterfaceData] Encontrado por nombre local en schemaObject: "${matchingKey}"`);
                    }
                }
                
                // Si todavía no se encuentra, buscar por nombre local en allComplexTypes
                if (!referencedElement && allComplexTypes) {
                    const typeLocalName = typeValue.split(':').pop() || typeValue;
                    console.log(`[DEBUG preparePropsInterfaceData] Buscando por nombre local "${typeLocalName}" en allComplexTypes`);
                    const complexTypeKeys = Object.keys(allComplexTypes);
                    console.log(`[DEBUG preparePropsInterfaceData] Claves disponibles en allComplexTypes: ${complexTypeKeys.slice(0, 10).join(', ')}${complexTypeKeys.length > 10 ? '...' : ''}`);
                    const matchingKey = complexTypeKeys.find(key => {
                        const keyLocalName = key.split(':').pop() || key;
                        return keyLocalName === typeLocalName || 
                               key === typeValue ||
                               key.endsWith(`:${typeLocalName}`) ||
                               typeValue.endsWith(keyLocalName);
                    });
                    if (matchingKey) {
                        referencedElement = allComplexTypes[matchingKey];
                        console.log(`[DEBUG preparePropsInterfaceData] Encontrado por nombre local en allComplexTypes: "${matchingKey}"`);
                    }
                }
                
                if (!referencedElement) {
                    console.log(`[DEBUG preparePropsInterfaceData] NO se encontró la referencia "${typeValue}"`);
                } else {
                    console.log(`[DEBUG preparePropsInterfaceData] Referencia encontrada, tipo: ${typeof referencedElement}`);
                    if (typeof referencedElement === 'object') {
                        console.log(`[DEBUG preparePropsInterfaceData] Claves del elemento: ${Object.keys(referencedElement).join(', ')}`);
                        if ('type' in referencedElement) {
                            console.log(`[DEBUG preparePropsInterfaceData] Elemento tiene type: ${typeof referencedElement.type}, valor: ${typeof referencedElement.type === 'string' ? `"${referencedElement.type}"` : JSON.stringify(referencedElement.type).substring(0, 100)}`);
                        }
                    }
                }
                
                if (referencedElement && typeof referencedElement === 'object') {
                    // Si el elemento referenciado tiene un type que es string, seguir resolviendo
                    if ('type' in referencedElement && typeof referencedElement.type === 'string') {
                        const nestedTypeValue = referencedElement.type;
                        console.log(`[DEBUG preparePropsInterfaceData] Elemento referenciado tiene type string: "${nestedTypeValue}", resolviendo recursivamente...`);
                        
                        // Continuar resolviendo recursivamente - buscar primero en schemaObject, luego en allComplexTypes
                        let nestedReferencedElement = schemaObject?.[nestedTypeValue];
                        console.log(`[DEBUG preparePropsInterfaceData] Búsqueda exacta de "${nestedTypeValue}" en schemaObject: ${nestedReferencedElement ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
                        
                        if (!nestedReferencedElement && allComplexTypes) {
                            nestedReferencedElement = allComplexTypes[nestedTypeValue];
                            console.log(`[DEBUG preparePropsInterfaceData] Búsqueda exacta de "${nestedTypeValue}" en allComplexTypes: ${nestedReferencedElement ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
                        }
                        
                        // Si no se encuentra exactamente, buscar por nombre local
                        if (!nestedReferencedElement) {
                            const nestedTypeLocalName = nestedTypeValue.split(':').pop() || nestedTypeValue;
                            console.log(`[DEBUG preparePropsInterfaceData] Buscando por nombre local "${nestedTypeLocalName}"...`);
                            
                            // Buscar primero en schemaObject
                            if (schemaObject) {
                                const schemaKeys = Object.keys(schemaObject).filter(k => k !== '$namespace' && k !== '$qualified');
                                const nestedMatchingKey = schemaKeys.find(key => {
                                    const keyLocalName = key.split(':').pop() || key;
                                    return keyLocalName === nestedTypeLocalName || 
                                           key === nestedTypeValue ||
                                           key.endsWith(`:${nestedTypeLocalName}`) ||
                                           nestedTypeValue.endsWith(keyLocalName);
                                });
                                if (nestedMatchingKey) {
                                    nestedReferencedElement = schemaObject[nestedMatchingKey];
                                    console.log(`[DEBUG preparePropsInterfaceData] Encontrado por nombre local en schemaObject: "${nestedMatchingKey}"`);
                                }
                            }
                            
                            // Si todavía no se encuentra, buscar en allComplexTypes
                            if (!nestedReferencedElement && allComplexTypes) {
                                const complexTypeKeys = Object.keys(allComplexTypes);
                                const nestedMatchingKey = complexTypeKeys.find(key => {
                                    const keyLocalName = key.split(':').pop() || key;
                                    return keyLocalName === nestedTypeLocalName || 
                                           key === nestedTypeValue ||
                                           key.endsWith(`:${nestedTypeLocalName}`) ||
                                           nestedTypeValue.endsWith(keyLocalName);
                                });
                                if (nestedMatchingKey) {
                                    nestedReferencedElement = allComplexTypes[nestedMatchingKey];
                                    console.log(`[DEBUG preparePropsInterfaceData] Encontrado por nombre local en allComplexTypes: "${nestedMatchingKey}"`);
                                } else {
                                    console.log(`[DEBUG preparePropsInterfaceData] NO encontrado por nombre local en allComplexTypes. Claves disponibles: ${complexTypeKeys.slice(0, 10).join(', ')}${complexTypeKeys.length > 10 ? '...' : ''}`);
                                }
                            }
                        }
                        
                        if (nestedReferencedElement && typeof nestedReferencedElement === 'object') {
                            console.log(`[DEBUG preparePropsInterfaceData] Tipo anidado encontrado, expandiendo contenido...`);
                            // Usar el tipo anidado directamente
                            return preparePropsInterfaceData(typeName, nestedReferencedElement, allTypesForInterfaces, schemaObject, allComplexTypes);
                        } else {
                            console.log(`[DEBUG preparePropsInterfaceData] NO se encontró el tipo anidado "${nestedTypeValue}"`);
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
