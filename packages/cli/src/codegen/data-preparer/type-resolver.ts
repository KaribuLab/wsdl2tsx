import { toPascalCase } from "../../util.js";
import { XML_SCHEMA_TYPES } from "../constants.js";
import { extractLocalName, getFilteredKeys } from "../utils.js";
import type { TypeObject } from "../types.js";

/**
 * Resuelve el nombre de interfaz correcto para un tipo referenciado
 * Busca en allTypesForInterfaces el tipo que corresponde al tipo referenciado
 */
export function resolveTypeName(
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
    
    // También verificar si el nombre local es un tipo simple conocido de XML Schema
    // incluso si viene con un namespace personalizado (ej: "http://cualquier-namespace:decimal")
    const xmlSchemaSimpleTypes = ['string', 'int', 'float', 'double', 'boolean', 'date', 'time', 'dateTime', 
                                  'decimal', 'integer', 'long', 'short', 'byte', 'unsignedInt', 'unsignedLong',
                                  'unsignedShort', 'unsignedByte', 'duration', 'gYearMonth', 'gYear', 'gMonthDay',
                                  'gDay', 'gMonth', 'token', 'normalizedString', 'NMTOKEN', 'NMTOKENS', 'Name',
                                  'NCName', 'QName', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'language',
                                  'anyURI', 'base64Binary', 'hexBinary'];
    const isSimpleTypeByLocalName = xmlSchemaSimpleTypes.includes(localTypeName.toLowerCase());
    
    if (isXsdType || isXmlSchemaType || isSimpleTypeByName || isSimpleTypeByLocalName) {
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
            xmlSchemaType = localTypeName.toLowerCase();
        }
        
        // Mapear tipos simples comunes
        if (XML_SCHEMA_TYPES[xmlSchemaType]) {
            return XML_SCHEMA_TYPES[xmlSchemaType];
        } else if (['decimal', 'integer', 'long', 'short', 'byte', 'unsignedint', 'unsignedlong', 
                     'unsignedshort', 'unsignedbyte', 'int'].includes(xmlSchemaType)) {
            return 'number';
        } else if (xmlSchemaType === 'boolean') {
            return 'boolean';
        } else if (['date', 'time', 'datetime'].includes(xmlSchemaType)) {
            return 'Date';
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
    
    // Si no se encuentra, verificar si el tipo referenciado parece ser un tipo simple
    // Tipos simples comunes que no están en XML_SCHEMA_TYPES pero deberían ser string o number
    const localTypeNameLower = localTypeName.toLowerCase();
    const simpleTypePatterns = [
        /^(decimal|double|float|int|integer|long|short|byte)$/i,
        /^(string|token|normalizedString|NMTOKEN|NMTOKENS|Name|NCName|QName|ID|IDREF|IDREFS|ENTITY|ENTITIES|language|anyURI|base64Binary|hexBinary|duration|dateTime|date|time|gYearMonth|gYear|gMonthDay|gDay|gMonth)$/i,
        /^(boolean)$/i
    ];
    
    // Si el nombre local coincide con un patrón de tipo simple, resolverlo como tal
    for (const pattern of simpleTypePatterns) {
        if (pattern.test(localTypeName)) {
            if (/^(decimal|double|float|int|integer|long|short|byte)$/i.test(localTypeName)) {
                return 'number';
            }
            if (/^(boolean)$/i.test(localTypeName)) {
                return 'boolean';
            }
            // Por defecto, tipos simples son string
            return 'string';
        }
    }
    
    // Si no se encuentra y no es un tipo simple conocido, usar el nombre de la propiedad en PascalCase como fallback
    // Esto puede generar errores de tipo, pero es mejor que fallar completamente
    const fallbackName = toPascalCase(propName);
    return fallbackName;
}

/**
 * Extrae recursivamente todos los tipos complejos anidados de un TypeObject
 */
export function extractNestedComplexTypes(
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
                } else if (typeof typeValue === 'string') {
                    // Si type es un string (referencia a tipo), también intentar extraer el tipo referenciado
                    // Esto es necesario para tipos como consultarPerfilClienteResponseType que pueden estar
                    // referenciados como strings dentro de propiedades
                    const referencedType = typeValue;
                    // Buscar el tipo referenciado en allTypesForInterfaces si está disponible
                    // Nota: Necesitamos pasar allTypesForInterfaces como parámetro para esto
                    // Por ahora, solo extraemos tipos inline (con type como objeto)
                }
            }
        }
    }
    
    return result;
}
