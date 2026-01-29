import { toPascalCase, toCamelCase } from "../util.js";
import { NAMESPACE_KEY, XML_SCHEMA_TYPES, XML_SCHEMA_URI } from "./constants.js";
import type { InterfaceData, NamespacePrefixesMapping, NamespaceTagsMapping, NamespaceTypesMapping, PropsInterfaceData, SimpleTypeData, TemplateData, TypeDefinition, TypeObject, HeaderData } from "./types.js";
import { extractLocalName, extractXmlSchemaType, getFilteredKeys, getTypeModifier, isValidInterfaceProperty } from "./utils.js";
import { generateXmlBodyCode } from "./xml-generator.js";
import { extractAllNamespaceMappings } from "./namespaces.js";

/**
 * Prepara datos de tipos simples para el template
 */
export function prepareSimpleTypesData(typeObject: TypeObject, xmlSchemaUri: string): SimpleTypeData[] {
    return Object.keys(typeObject)
        .filter(key => {
            if (key === NAMESPACE_KEY) return false;
            const typeDef = typeObject[key]!;
            if (typeof typeDef === 'boolean') return false;
            return typeof typeDef === 'string' || (typeof typeDef === 'object' && typeDef !== null && typeof typeDef.type === 'string' && typeDef.type.includes(xmlSchemaUri));
        })
        .map(key => {
            const typeDef = typeObject[key]!;
            if (typeof typeDef === 'boolean') {
                return { name: key, tsType: 'boolean' };
            }
            const typeValue = typeof typeDef === 'string' ? typeDef : ((typeDef as TypeDefinition).type as string);
            return {
                name: key,
                tsType: 'string',
            };
        });
}

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

/**
 * Prepara datos de una interfaz TypeScript para el template
 */
export function prepareInterfaceData(interfaceName: string, interfaceDefinition: { type: TypeObject } & Record<string, any>, allTypesForInterfaces?: TypeObject): InterfaceData {
    const keys = Object.keys(interfaceDefinition.type);
    const properties = keys
        .filter(prop => isValidInterfaceProperty(prop, interfaceDefinition))
        .map(prop => {
            const childrenField = interfaceDefinition.type[prop]!;
            
            let propertyType: string;
            let modifier: string;

            if (typeof childrenField === 'string') {
                // Direct string type (e.g., "xsd:string")
                const xmlSchemaType = extractXmlSchemaType(childrenField);
                propertyType = XML_SCHEMA_TYPES[xmlSchemaType] ?? 'string';
                modifier = '';
            } else if (typeof childrenField === 'object' && childrenField !== null) {
                // Nested complex type
                if ('type' in childrenField && typeof childrenField.type === 'string') {
                    // Tipo referenciado por string (ej: "tns2:CodigoPlanListTO" o "xsd:string")
                    // Usar resolveTypeName que maneja tanto tipos simples como complejos
                    propertyType = resolveTypeName(childrenField.type, prop, allTypesForInterfaces);
                } else {
                    // It's a nested object, so it's an inline complex type definition
                    // Intentar buscar el tipo correcto en allTypesForInterfaces basándose en el nombre de la propiedad
                    const propPascalCase = toPascalCase(prop);
                    if (allTypesForInterfaces) {
                        // Buscar un tipo que coincida con el nombre de la propiedad o que contenga el nombre
                        const matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => {
                            const kLocalName = extractLocalName(k);
                            // Buscar coincidencia exacta o parcial (ej: "CodigoPlanList" -> "CodigoPlanListTO")
                            return kLocalName === propPascalCase || 
                                   kLocalName.startsWith(propPascalCase) || 
                                   propPascalCase.startsWith(kLocalName);
                        });
                        
                        if (matchingTypeKey) {
                            propertyType = toPascalCase(extractLocalName(matchingTypeKey));
                        } else {
                            propertyType = propPascalCase; // Fallback al nombre de la propiedad
                        }
                    } else {
                        propertyType = propPascalCase; // Fallback al nombre de la propiedad
                    }
                }
                const propConfig = interfaceDefinition[prop] || childrenField;
                modifier = getTypeModifier(propConfig);
            } else {
                propertyType = 'any';
                modifier = '';
            }
            
            return {
                name: prop,
                type: propertyType,
                modifier,
            };
        });
    
    return {
        name: interfaceName,
        properties,
    };
}

/**
 * Extrae recursivamente todos los tipos complejos anidados de un TypeObject
 */
function extractNestedComplexTypes(
    typeObject: TypeObject,
    namespaceKey: string,
    xmlSchemaUri: string,
    visited: Set<string> = new Set()
): Array<{ interfaceName: string; typeObject: TypeObject }> {
    const result: Array<{ interfaceName: string; typeObject: TypeObject }> = [];
    const keys = getFilteredKeys(typeObject);
    
    for (const key of keys) {
        const typeDef = typeObject[key]!;
        
        // Si es un objeto con estructura { type: ..., maxOccurs: ..., minOccurs: ... }
        if (typeof typeDef === 'object' && typeDef !== null && 'type' in typeDef) {
            const typeValue = (typeDef as any).type;
            
            // Verificar si type es un objeto (tipo complejo anidado)
            if (typeof typeValue === 'object' && typeValue !== null) {
                // Verificar que no sea un tipo simple de XML Schema
                const isSimpleType = typeof typeValue === 'string' && typeValue.includes(xmlSchemaUri);
                
                if (!isSimpleType) {
                    // Verificar que el objeto type tenga propiedades (no solo $namespace)
                    const typeKeys = Object.keys(typeValue).filter(k => k !== '$namespace' && k !== '$base');
                    if (typeKeys.length > 0) {
                        // Usar el nombre de la propiedad en PascalCase como nombre de interfaz
                        const interfaceName = toPascalCase(extractLocalName(key));
                        
                        // Evitar procesar el mismo tipo dos veces usando el nombre de la interfaz
                        if (visited.has(interfaceName)) continue;
                        visited.add(interfaceName);
                        
                        result.push({ interfaceName, typeObject: typeValue as TypeObject });
                        
                        // Recursivamente extraer tipos complejos anidados dentro de este tipo
                        const nestedTypes = extractNestedComplexTypes(
                            typeValue as TypeObject,
                            namespaceKey,
                            xmlSchemaUri,
                            visited
                        );
                        result.push(...nestedTypes);
                    }
                }
            }
        }
    }
    
    return result;
}

/**
 * Prepara datos de todas las interfaces para el template
 */
export function prepareInterfacesData(requestTypeObject: TypeObject, namespaceKey: string, xmlSchemaUri: string, allTypesForInterfaces?: TypeObject, simpleTypeNames?: Set<string>): InterfaceData[] {
    const visited = new Set<string>();
    const interfaces: InterfaceData[] = [];
    
    const allKeys = Object.keys(requestTypeObject).filter(k => k !== namespaceKey);
    
    // Extraer todos los tipos complejos anidados recursivamente
    // Usar un Set separado para evitar duplicados durante la extracción, pero no afectar visited aún
    const extractionVisited = new Set<string>();
    const allComplexTypes = extractNestedComplexTypes(requestTypeObject, namespaceKey, xmlSchemaUri, extractionVisited);
    
    // También incluir los tipos del nivel superior que son tipos complejos
    const topLevelKeys = Object.keys(requestTypeObject)
        .filter(key => {
            if (key === namespaceKey) return false;
            const typeDef = requestTypeObject[key]!;
            // Incluir si es un objeto con type que es objeto (tipo complejo)
            if (typeof typeDef === 'object' && typeDef !== null && 'type' in typeDef) {
                const typeValue = (typeDef as any).type;
                if (typeof typeValue === 'object' && typeValue !== null) {
                    // Verificar que tenga propiedades además de $namespace
                    const typeKeys = Object.keys(typeValue).filter(k => k !== '$namespace' && k !== '$base');
                    return typeKeys.length > 0;
                }
            }
            return false;
        });
    
    // Procesar tipos del nivel superior
    for (const key of topLevelKeys) {
        const localName = extractLocalName(key);
        // Convertir a PascalCase para comparación consistente
        const interfaceName = toPascalCase(localName);
        // Excluir tipos simples que ya se generan como export type
        if (simpleTypeNames && simpleTypeNames.has(interfaceName)) {
            continue;
        }
        if (!visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName)) {
            visited.add(interfaceName);
            interfaces.push(prepareInterfaceData(interfaceName, requestTypeObject[key] as any, allTypesForInterfaces));
        }
    }
    
    // Procesar tipos complejos anidados encontrados recursivamente
    for (const { interfaceName, typeObject } of allComplexTypes) {
        // Excluir tipos simples que ya se generan como export type
        if (simpleTypeNames && simpleTypeNames.has(interfaceName)) {
            continue;
        }
        if (!visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName)) {
            visited.add(interfaceName);
            interfaces.push(prepareInterfaceData(interfaceName, { type: typeObject } as any, allTypesForInterfaces));
        }
    }
    
    // IMPORTANTE: También procesar todos los tipos complejos que están directamente en requestTypeObject
    // pero que no fueron procesados como tipos del nivel superior (porque tienen nombres completos con namespace)
    const remainingKeys = Object.keys(requestTypeObject)
        .filter(key => {
            if (key === namespaceKey || key === '$qualified') return false;
            // Solo procesar si es un complexType (tiene estructura de tipo complejo)
            const typeDef = requestTypeObject[key]!;
            if (typeof typeDef === 'object' && typeDef !== null) {
                // Si es un objeto con type que es objeto, es un tipo complejo
                if ('type' in typeDef && typeof (typeDef as any).type === 'object') {
                    const localName = extractLocalName(key);
                    const interfaceName = toPascalCase(localName);
                    // Verificar usando PascalCase y también si ya existe la interfaz
                    return !visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName);
                }
                // Si es directamente un tipo complejo (sin wrapper type), también procesarlo
                const keys = Object.keys(typeDef).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
                if (keys.length > 0) {
                    const localName = extractLocalName(key);
                    const interfaceName = toPascalCase(localName);
                    return !visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName);
                }
            }
            return false;
        });
    
    for (const key of remainingKeys) {
        const localName = extractLocalName(key);
        const interfaceName = toPascalCase(localName);
        // Excluir tipos simples que ya se generan como export type
        if (simpleTypeNames && simpleTypeNames.has(interfaceName)) {
            continue;
        }
        if (!visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName)) {
            visited.add(interfaceName);
            const typeDef = requestTypeObject[key]!;
            
            // Preparar la estructura correcta para prepareInterfaceData
            if (typeof typeDef === 'object' && typeDef !== null && 'type' in typeDef && typeof (typeDef as any).type === 'object') {
                interfaces.push(prepareInterfaceData(localName, typeDef as any, allTypesForInterfaces));
            } else if (typeof typeDef === 'object' && typeDef !== null) {
                // Es un tipo complejo directo
                interfaces.push(prepareInterfaceData(localName, { type: typeDef } as any, allTypesForInterfaces));
            }
        }
    }
    
    // IMPORTANTE: También procesar tipos en allTypesForInterfaces que no están en requestTypeObject
    // Esto asegura que se generen interfaces para tipos como PlanTO que están referenciados pero no directamente en requestTypeObject
    if (allTypesForInterfaces) {
        const allTypesKeys = Object.keys(allTypesForInterfaces).filter(k => 
            k !== namespaceKey && k !== '$namespace' && k !== '$qualified' && k !== '$base'
        );
        const missingKeys = allTypesKeys.filter(key => {
            const localName = extractLocalName(key);
            const interfaceName = toPascalCase(localName);
            return !visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName);
        });
        
        for (const key of missingKeys) {
            const localName = extractLocalName(key);
            const interfaceName = toPascalCase(localName);
            // Excluir tipos simples que ya se generan como export type
            if (simpleTypeNames && simpleTypeNames.has(interfaceName)) {
                continue;
            }
            if (!visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName)) {
                visited.add(interfaceName);
                const typeDef = allTypesForInterfaces[key]!;
                
                // Verificar que sea un tipo complejo antes de procesarlo
                if (typeof typeDef === 'object' && typeDef !== null) {
                    // Si es un objeto con type que es objeto, es un tipo complejo
                    if ('type' in typeDef && typeof (typeDef as any).type === 'object') {
                        const typeValue = (typeDef as any).type;
                        const typeKeys = Object.keys(typeValue).filter(k => k !== '$namespace' && k !== '$base');
                        if (typeKeys.length > 0) {
                            interfaces.push(prepareInterfaceData(localName, typeDef as any, allTypesForInterfaces));
                        }
                    } else {
                        // Es directamente un tipo complejo (sin wrapper type)
                        const keys = Object.keys(typeDef).filter(k => k !== '$namespace' && k !== '$base');
                        if (keys.length > 0) {
                            interfaces.push(prepareInterfaceData(localName, { type: typeDef } as any, allTypesForInterfaces));
                        }
                    }
                }
            }
        }
    }
    
    return interfaces;
}

/**
 * Resuelve el nombre de interfaz correcto para un tipo referenciado
 * Busca en allTypesForInterfaces el tipo que corresponde al tipo referenciado
 */
function resolveTypeName(
    referencedType: string,
    propName: string,
    allTypesForInterfaces?: TypeObject
): string {
    
    // Extraer el nombre local del tipo (después del último ":")
    const localTypeName = referencedType.split(':').pop() || referencedType;
    
    // Verificar primero si es un tipo simple de XML Schema
    // Puede venir como "xsd:string", "http://www.w3.org/2001/XMLSchema:string", 
    // o "http://cualquier-namespace:string" (donde el nombre local es un tipo simple)
    const isXsdType = referencedType.includes('xsd:');
    const isXmlSchemaType = referencedType.includes('http://www.w3.org/2001/XMLSchema');
    const isSimpleTypeByName = localTypeName in XML_SCHEMA_TYPES;
    
    if (isXsdType || isXmlSchemaType || isSimpleTypeByName) {
        // Extraer el nombre del tipo correctamente
        let xmlSchemaType: string;
        if (referencedType.includes('xsd:')) {
            // Formato: "xsd:string"
            xmlSchemaType = referencedType.split('xsd:')[1] || localTypeName;
        } else if (referencedType.includes('http://www.w3.org/2001/XMLSchema')) {
            // Formato: "http://www.w3.org/2001/XMLSchema:string"
            xmlSchemaType = localTypeName;
        } else {
            // Formato: "http://cualquier-namespace:string" - usar el nombre local
            xmlSchemaType = localTypeName;
        }
        
        if (XML_SCHEMA_TYPES[xmlSchemaType]) {
            return XML_SCHEMA_TYPES[xmlSchemaType];
        } else {
            return 'string'; // Fallback para tipos XML Schema no mapeados
        }
    }
    
    // Si referencedType es un string que referencia un tipo complejo, buscar su nombre real
    if (allTypesForInterfaces && typeof referencedType === 'string') {
        // Buscar el tipo completo en allTypesForInterfaces
        // Primero buscar coincidencia exacta
        let matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => k === referencedType);
        
        // Si no hay coincidencia exacta, buscar por nombre local
        if (!matchingTypeKey) {
            const referencedLocalName = referencedType.split(':').pop()!;
            matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => {
                const kLocalName = k.split(':').pop();
                return kLocalName === referencedLocalName;
            });
        }
        
        // También buscar por coincidencia parcial (endsWith)
        if (!matchingTypeKey) {
            matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => 
                k.endsWith(':' + referencedType.split(':').pop())
            );
        }
        
        // Buscar por coincidencia parcial en el nombre local (ej: "CodigoPlanList" -> "CodigoPlanListTO")
        if (!matchingTypeKey) {
            const referencedLocalName = referencedType.split(':').pop()!;
            matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => {
                const kLocalName = k.split(':').pop();
                // Buscar si el nombre local referenciado es un prefijo del nombre local encontrado
                // o viceversa (ej: "CodigoPlanList" debería encontrar "CodigoPlanListTO")
                return kLocalName && (
                    kLocalName.startsWith(referencedLocalName) || 
                    referencedLocalName.startsWith(kLocalName)
                );
            });
        }
        
        if (matchingTypeKey) {
            // Usar el nombre local del tipo encontrado en PascalCase
            const resolvedName = toPascalCase(extractLocalName(matchingTypeKey));
            return resolvedName;
        }
    }
    
    // Si no se encuentra, usar el nombre de la propiedad en PascalCase como fallback
    const fallbackName = toPascalCase(propName);
    return fallbackName;
}

/**
 * Prepara todos los datos para el template Handlebars
 */
export function prepareTemplateData(
    requestType: string,
    requestTypeObject: TypeObject,
    namespacesTagsMapping: NamespaceTagsMapping,
    namespacesPrefixMapping: NamespacePrefixesMapping,
    namespacesTypeMapping: NamespaceTypesMapping,
    soapNamespaceURI: string,
    baseNamespacePrefix: string,
    allTypesForInterfaces?: TypeObject, // Opcional: tipos adicionales para generar interfaces
    schemaObject?: any, // Opcional: schemaObject completo para resolver referencias
    allComplexTypes?: any, // Opcional: allComplexTypes para resolver tipos complejos referenciados
    headersInfo?: Array<{ partName: string; elementName: string; headerType: string }> // Opcional: información de headers
): TemplateData {
    const simpleTypes = prepareSimpleTypesData(requestTypeObject, XML_SCHEMA_URI);
    const propsInterface = preparePropsInterfaceData(requestType, requestTypeObject, allTypesForInterfaces, schemaObject, allComplexTypes);
    
    // Para interfaces, usar allTypesForInterfaces si está disponible, sino usar requestTypeObject
    // IMPORTANTE: Usar requestTypeObject como base para evitar incluir interfaces de otras operaciones
    // allTypesForInterfaces solo debe contener tipos referenciados por la operación actual
    const typesForInterfaces = requestTypeObject; // Usar requestTypeObject como base, no allTypesForInterfaces completo
    
    // Crear un Set con los nombres de los tipos simples para filtrarlos de las interfaces
    // Usar el nombre local en PascalCase para comparación consistente
    const simpleTypeNames = new Set(simpleTypes.map(st => {
        const localName = extractLocalName(st.name);
        return toPascalCase(localName);
    }));
    
    // Procesar headers si existen ANTES de generar las interfaces
    // para que los tipos de header se incluyan en allTypesForInterfaces
    const headers: HeaderData[] = [];
    console.log(`[DEBUG prepareTemplateData] headersInfo: ${headersInfo ? JSON.stringify(headersInfo.map(h => ({ partName: h.partName, headerType: h.headerType }))) : 'undefined'}`);
    if (headersInfo && headersInfo.length > 0) {
        console.log(`[DEBUG prepareTemplateData] Procesando ${headersInfo.length} header(s)`);
        for (const headerInfo of headersInfo) {
            console.log(`[DEBUG prepareTemplateData] Buscando headerType: "${headerInfo.headerType}"`);
            const headerTypeObject = schemaObject[headerInfo.headerType] as any;
            if (!headerTypeObject) {
                console.warn(`⚠️  No se encontró el tipo de header ${headerInfo.headerType}, se omite`);
                continue;
            }
            console.log(`[DEBUG prepareTemplateData] Header encontrado, procesando...`);
            
            // Extraer mappings de namespace para el header
            const headerNamespaceMappings = extractAllNamespaceMappings(headerInfo.headerType, headerTypeObject);
            const headerNamespacePrefix = headerNamespaceMappings.typesMapping[headerInfo.headerType]?.prefix || baseNamespacePrefix;
            
            // Generar código XML para el header usando el nombre del part como prefijo para las props
            const headerPartNameCamelCase = toCamelCase(extractLocalName(headerInfo.partName));
            const headerXmlCode = generateXmlBodyCode(
                headerNamespacePrefix,
                namespacesTypeMapping,
                headerInfo.headerType,
                headerTypeObject,
                headerPartNameCamelCase, // Pasar el nombre del part para usar como prefijo en las props
                schemaObject,
                allComplexTypes
            );
            
            // Preparar interfaz de props para el header
            const headerPropsInterface = preparePropsInterfaceData(
                headerInfo.headerType,
                headerTypeObject,
                allTypesForInterfaces,
                schemaObject,
                allComplexTypes
            );
            
            // Agregar el tipo del header a allTypesForInterfaces para que se genere su interfaz
            if (!allTypesForInterfaces[headerInfo.headerType]) {
                allTypesForInterfaces[headerInfo.headerType] = headerTypeObject;
            }
            
            // Agregar los namespaces del header a los mappings si no existen
            for (const [prefix, uri] of Object.entries(headerNamespaceMappings.prefixesMapping)) {
                if (!namespacesPrefixMapping[prefix]) {
                    namespacesPrefixMapping[prefix] = uri;
                }
            }
            
            // Agregar los tags del header a los mappings si no existen
            for (const [prefix, tags] of Object.entries(headerNamespaceMappings.tagsMapping)) {
                if (!namespacesTagsMapping[prefix]) {
                    namespacesTagsMapping[prefix] = tags;
                } else {
                    // Agregar tags que no existan
                    const existingTags = new Set(namespacesTagsMapping[prefix]);
                    for (const tag of tags) {
                        if (!existingTags.has(tag)) {
                            namespacesTagsMapping[prefix].push(tag);
                        }
                    }
                }
            }
            
            headers.push({
                partName: headerInfo.partName,
                elementName: headerInfo.elementName,
                headerType: headerInfo.headerType,
                headerTypeObject,
                xmlCode: headerXmlCode
            });
            
            // Agregar propiedades del header a la interfaz de props principal
            const headerLocalName = extractLocalName(headerInfo.partName);
            const headerTypeLocalName = extractLocalName(headerInfo.headerType);
            propsInterface.properties.push({
                name: headerLocalName,
                type: toPascalCase(headerTypeLocalName)
            });
        }
    }
    
    // Generar las interfaces DESPUÉS de procesar los headers
    // para que los tipos de header se incluyan en allTypesForInterfaces
    // También incluir tipos de header en typesForInterfaces para que se generen sus interfaces
    const typesForInterfacesWithHeaders = { ...typesForInterfaces };
    if (headersInfo && headersInfo.length > 0 && allTypesForInterfaces) {
        for (const headerInfo of headersInfo) {
            if (allTypesForInterfaces[headerInfo.headerType] && !typesForInterfacesWithHeaders[headerInfo.headerType]) {
                typesForInterfacesWithHeaders[headerInfo.headerType] = allTypesForInterfaces[headerInfo.headerType];
            }
        }
    }
    const interfaces = prepareInterfacesData(typesForInterfacesWithHeaders, NAMESPACE_KEY, XML_SCHEMA_URI, allTypesForInterfaces, simpleTypeNames);
    
    // Para el body, no usar prefijo de propsInterfaceName (las propiedades son directas)
    // Solo usar propsInterfaceName para headers
    const xmlBody = generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, requestType, requestTypeObject, undefined, schemaObject, allComplexTypes);
    
    // Usar nombre local del requestType para el template
    const requestTypeLocalName = extractLocalName(requestType);
    
    return {
        requestType: requestTypeLocalName,
        namespaces: namespacesTagsMapping,
        simpleTypes,
        propsInterface,
        interfaces,
        soapNamespaceURI,
        xmlnsAttributes: namespacesPrefixMapping,
        xmlBody,
        headers: headers.length > 0 ? headers : undefined,
    };
}
