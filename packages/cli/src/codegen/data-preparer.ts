import { toPascalCase } from "../util.js";
import { NAMESPACE_KEY, XML_SCHEMA_TYPES, XML_SCHEMA_URI } from "./constants.js";
import type { InterfaceData, NamespacePrefixesMapping, NamespaceTagsMapping, NamespaceTypesMapping, PropsInterfaceData, SimpleTypeData, TemplateData, TypeDefinition, TypeObject } from "./types.js";
import { extractLocalName, extractXmlSchemaType, getFilteredKeys, getTypeModifier, isValidInterfaceProperty } from "./utils.js";
import { generateXmlBodyCode } from "./xml-generator.js";

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
 */
export function preparePropsInterfaceData(typeName: string, typeObject: TypeObject, allTypesForInterfaces?: TypeObject): PropsInterfaceData {
    const keys = getFilteredKeys(typeObject);
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
            } else {
                // Tipo complejo inline - usar el nombre local en PascalCase como tipo de interfaz
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
    
    // Verificar primero si es un tipo simple de XML Schema
    // Si referencedType contiene "xsd:" o "http://www.w3.org/2001/XMLSchema", es un tipo simple
    const isXsdType = referencedType.includes('xsd:');
    const isXmlSchemaType = referencedType.includes('http://www.w3.org/2001/XMLSchema');
    
    if (isXsdType || isXmlSchemaType) {
        // Extraer el nombre del tipo correctamente
        let xmlSchemaType: string;
        if (referencedType.includes('xsd:')) {
            // Formato: "xsd:string"
            xmlSchemaType = referencedType.split('xsd:')[1] || referencedType.split(':').pop() || 'string';
        } else {
            // Formato: "http://www.w3.org/2001/XMLSchema:string"
            // Tomar la parte después del último ":"
            xmlSchemaType = referencedType.split(':').pop() || 'string';
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
    allTypesForInterfaces?: TypeObject // Opcional: tipos adicionales para generar interfaces
): TemplateData {
    const simpleTypes = prepareSimpleTypesData(requestTypeObject, XML_SCHEMA_URI);
    const propsInterface = preparePropsInterfaceData(requestType, requestTypeObject, allTypesForInterfaces);
    
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
    
    const interfaces = prepareInterfacesData(typesForInterfaces, NAMESPACE_KEY, XML_SCHEMA_URI, allTypesForInterfaces, simpleTypeNames);
    
    // Obtener el nombre de la propiedad principal de la interfaz de props para usarlo como punto de partida en las rutas XML
    const mainPropName = propsInterface.properties.length > 0 ? propsInterface.properties[0].name : undefined;
    const xmlBody = generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, requestType, requestTypeObject, mainPropName);
    
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
    };
}
