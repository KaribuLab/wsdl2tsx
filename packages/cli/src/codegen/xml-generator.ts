import { toCamelCase } from "../util.js";
import { extractLocalName, getFilteredKeys, extractNamespacePrefix } from "./utils.js";
import { getNamespacePrefix, shouldHavePrefix } from "./namespaces.js";
import { DEFAULT_OCCURS } from "./constants.js";
import type { TypeObject, TypeDefinition, NamespaceTypesMapping } from "./types.js";

/**
 * Genera el código del template de una propiedad del cuerpo XML
 */
export function generateXmlPropertyCode(
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    key: string,
    elementObject: TypeDefinition,
    parentKey: string | null = null,
    propertyPath: string = '',
    parentIsQualified: boolean = true // El padre (root element) siempre es qualified
): string {
    const namespacePrefix = getNamespacePrefix(
        namespacesTypeMapping,
        baseNamespacePrefix,
        key,
        parentKey,
        elementObject
    );
    
    // Extraer nombre local del tag
    const tagLocalName = extractLocalName(key);
    const tagCamelCase = toCamelCase(tagLocalName);
    
    // Determinar si este elemento debe tener prefijo
    const isQualified = shouldHavePrefix(elementObject);
    
    // Generar el tag con o sin prefijo según $qualified
    const openTag = isQualified ? `<${namespacePrefix}.${tagLocalName}>` : `<${tagLocalName}>`;
    const closeTag = isQualified ? `</${namespacePrefix}.${tagLocalName}>` : `</${tagLocalName}>`;
    
    // Detectar si es un array basándose en maxOccurs
    const isArray = typeof elementObject === 'object' && elementObject !== null && 
                    'maxOccurs' in elementObject && 
                    elementObject.maxOccurs !== undefined && 
                    elementObject.maxOccurs !== '1' && 
                    elementObject.maxOccurs !== DEFAULT_OCCURS;
    
    // Construir la ruta de propiedad completa
    // Si propertyPath ya termina con el nombre del tag actual, no agregarlo de nuevo
    const currentPropertyPath = propertyPath 
        ? (propertyPath.endsWith(`.${tagCamelCase}`) || propertyPath === tagCamelCase
            ? propertyPath
            : `${propertyPath}.${tagCamelCase}`)
        : tagCamelCase;
    
    if (typeof elementObject === 'object' && elementObject !== null && typeof elementObject.type === 'object') {
        const keys = getFilteredKeys(elementObject.type as TypeObject);
        
        // Si es un array, generar código que itere sobre el array
        if (isArray) {
            const nestedProperties = keys
                .map(elementKey => {
                    const nestedElement = (elementObject.type as TypeObject)[elementKey]!;
                    if (typeof nestedElement === 'object' && nestedElement !== null) {
                        // Para arrays, usar 'item' como ruta base en lugar de acceder al array con índice
                        // Verificar si el elemento anidado también es un array
                        const nestedIsArray = typeof nestedElement === 'object' && nestedElement !== null &&
                                             'maxOccurs' in nestedElement &&
                                             nestedElement.maxOccurs !== undefined &&
                                             nestedElement.maxOccurs !== '1' &&
                                             nestedElement.maxOccurs !== DEFAULT_OCCURS;
                        
                        if (nestedIsArray || (typeof nestedElement === 'object' && nestedElement !== null && typeof nestedElement.type === 'object')) {
                            // Tipo complejo anidado dentro del array - usar 'item' como ruta base
                            return generateXmlPropertyCode(
                                namespacesTypeMapping,
                                baseNamespacePrefix,
                                elementKey,
                                nestedElement as TypeDefinition,
                                key,
                                'item', // Usar 'item' directamente en lugar de la ruta completa con índice
                                isQualified
                            );
                        } else {
                            // Tipo simple dentro del array - usar 'item' directamente
                            const nestedTagLocalName = extractLocalName(elementKey);
                            const nestedTagCamelCase = toCamelCase(nestedTagLocalName);
                            const nestedIsQualified = shouldHavePrefix(nestedElement as TypeDefinition);
                            
                            if (nestedIsQualified) {
                                const nestedNamespacePrefix = getNamespacePrefix(
                                    namespacesTypeMapping,
                                    baseNamespacePrefix,
                                    elementKey,
                                    key,
                                    nestedElement as TypeDefinition
                                );
                                return `<${nestedNamespacePrefix}.${nestedTagLocalName}>{item.${nestedTagCamelCase}}</${nestedNamespacePrefix}.${nestedTagLocalName}>`;
                            } else {
                                return `<${nestedTagLocalName}>{item.${nestedTagCamelCase}}</${nestedTagLocalName}>`;
                            }
                        }
                    }
                    return '';
                })
                .filter(Boolean)
                .join('\n');
            
            // Si propertyPath tiene un prefijo (propsInterfaceName), usarlo en el map
            const mapPath = propertyPath || currentPropertyPath;
            return `{props.${mapPath}.map((item, i) => (
    ${openTag}
    ${nestedProperties}
    ${closeTag}
))}`;
        } else {
            // No es un array, generar código normal
            const nestedProperties = keys
                .map(elementKey => {
                    const nestedElement = (elementObject.type as TypeObject)[elementKey]!;
                    if (typeof nestedElement === 'object' && nestedElement !== null) {
                        return generateXmlPropertyCode(
                            namespacesTypeMapping,
                            baseNamespacePrefix,
                            elementKey,
                            nestedElement as TypeDefinition,
                            key,
                            currentPropertyPath, // Mantener el propertyPath completo (incluye propsInterfaceName si existe)
                            isQualified
                        );
                    }
                    return '';
                })
                .filter(Boolean)
                .join('\n');
            
            return `${openTag}
    ${nestedProperties}
    ${closeTag}`;
        }
    }
    
    // Para tipos simples, usar la ruta completa de la propiedad
    return `${openTag}{props.${currentPropertyPath}}${closeTag}`;
}

/**
 * Genera el código del cuerpo XML principal
 */
export function generateXmlBodyCode(baseNamespacePrefix: string, namespacesTypeMapping: NamespaceTypesMapping, baseTypeName: string, baseTypeObject: TypeObject, propsInterfaceName?: string, schemaObject?: any, allComplexTypes?: any): string {
    const keys = getFilteredKeys(baseTypeObject);
    // Extraer nombre local del tipo base
    const baseTypeLocalName = extractLocalName(baseTypeName);
    
    // El elemento raíz siempre debe tener prefijo (es un elemento global)
    // Los elementos hijos dependen de $qualified
    
    // Si solo hay una clave y es un tipo complejo con type como objeto, procesar el type directamente
    if (keys.length === 1) {
        const singleKey = keys[0]!;
        const element = baseTypeObject[singleKey]!;
        
        if (typeof element === 'object' && element !== null && 'type' in element) {
            const typeValue = (element as any).type;
            
            // Si type es un string (referencia a elemento o tipo), intentar resolverla desde schemaObject y allComplexTypes
            if (typeof typeValue === 'string' && (schemaObject || allComplexTypes)) {
                // Buscar el elemento/tipo referenciado primero en schemaObject, luego en allComplexTypes
                let referencedElement = schemaObject?.[typeValue];
                
                // Si no se encuentra en schemaObject, buscar en allComplexTypes
                if (!referencedElement && allComplexTypes) {
                    referencedElement = allComplexTypes[typeValue];
                }
                
                // Si no se encuentra exactamente, buscar por nombre local en schemaObject
                if (!referencedElement && schemaObject) {
                    const typeLocalName = typeValue.split(':').pop() || typeValue;
                    const matchingKey = Object.keys(schemaObject).find(key => {
                        if (key === '$namespace' || key === '$qualified') return false;
                        const keyLocalName = key.split(':').pop() || key;
                        return keyLocalName === typeLocalName || 
                               key === typeValue ||
                               key.endsWith(`:${typeLocalName}`) ||
                               typeValue.endsWith(keyLocalName);
                    });
                    if (matchingKey) {
                        referencedElement = schemaObject[matchingKey];
                    }
                }
                
                // Si todavía no se encuentra, buscar por nombre local en allComplexTypes
                if (!referencedElement && allComplexTypes) {
                    const typeLocalName = typeValue.split(':').pop() || typeValue;
                    const matchingKey = Object.keys(allComplexTypes).find(key => {
                        const keyLocalName = key.split(':').pop() || key;
                        return keyLocalName === typeLocalName || 
                               key === typeValue ||
                               key.endsWith(`:${typeLocalName}`) ||
                               typeValue.endsWith(keyLocalName);
                    });
                    if (matchingKey) {
                        referencedElement = allComplexTypes[matchingKey];
                    }
                }
                
                if (referencedElement && typeof referencedElement === 'object') {
                    // Si el elemento referenciado tiene un type que es string, seguir resolviendo
                    if ('type' in referencedElement && typeof referencedElement.type === 'string') {
                        // Continuar resolviendo recursivamente - buscar primero en schemaObject, luego en allComplexTypes
                        const nestedTypeValue = referencedElement.type;
                        let nestedReferencedElement = schemaObject?.[nestedTypeValue];
                        
                        if (!nestedReferencedElement && allComplexTypes) {
                            nestedReferencedElement = allComplexTypes[nestedTypeValue];
                        }
                        
                        // Si no se encuentra exactamente, buscar por nombre local
                        if (!nestedReferencedElement) {
                            const nestedTypeLocalName = nestedTypeValue.split(':').pop() || nestedTypeValue;
                            
                            // Buscar primero en schemaObject
                            if (schemaObject) {
                                const nestedMatchingKey = Object.keys(schemaObject).find(key => {
                                    if (key === '$namespace' || key === '$qualified') return false;
                                    const keyLocalName = key.split(':').pop() || key;
                                    return keyLocalName === nestedTypeLocalName || 
                                           key === nestedTypeValue ||
                                           key.endsWith(`:${nestedTypeLocalName}`) ||
                                           nestedTypeValue.endsWith(keyLocalName);
                                });
                                if (nestedMatchingKey) {
                                    nestedReferencedElement = schemaObject[nestedMatchingKey];
                                }
                            }
                            
                            // Si todavía no se encuentra, buscar en allComplexTypes
                            if (!nestedReferencedElement && allComplexTypes) {
                                const nestedMatchingKey = Object.keys(allComplexTypes).find(key => {
                                    const keyLocalName = key.split(':').pop() || key;
                                    return keyLocalName === nestedTypeLocalName || 
                                           key === nestedTypeValue ||
                                           key.endsWith(`:${nestedTypeLocalName}`) ||
                                           nestedTypeValue.endsWith(keyLocalName);
                                });
                                if (nestedMatchingKey) {
                                    nestedReferencedElement = allComplexTypes[nestedMatchingKey];
                                }
                            }
                        }
                        
                        if (nestedReferencedElement && typeof nestedReferencedElement === 'object') {
                            // Usar el tipo anidado directamente
                            return generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, baseTypeName, nestedReferencedElement, propsInterfaceName, schemaObject, allComplexTypes);
                        }
                    }
                    // Si encontramos el elemento referenciado, expandir su contenido
                    return generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, baseTypeName, referencedElement, propsInterfaceName, schemaObject, allComplexTypes);
                }
            }
            
            // Si type es un objeto (tipo complejo anidado), procesar ese objeto directamente
            if (typeof typeValue === 'object' && typeValue !== null) {
                const typeKeys = getFilteredKeys(typeValue as TypeObject);
                // Si tiene propiedades, procesar recursivamente el objeto type
                if (typeKeys.length > 0) {
                    return generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, baseTypeName, typeValue as TypeObject, propsInterfaceName, schemaObject, allComplexTypes);
                }
            }
        }
    }
    
    // Para elementos raíz, las propiedades son directas (props.intA, props.intB)
    // No necesitamos usar propsInterfaceName aquí porque estamos en el nivel raíz
    // propsInterfaceName solo sería útil si hubiera un wrapper, pero en este caso
    // las propiedades son directas del root element
    
    const properties = keys
        .map(key => {
            const element = baseTypeObject[key]!;
            if (typeof element === 'object' && element !== null) {
                const keyLocalName = extractLocalName(key);
                const keyCamelCase = toCamelCase(keyLocalName);
                
                // Para propiedades del root element, usar directamente el nombre de la propiedad
                // Si propsInterfaceName está definido, usarlo como prefijo (para headers)
                const propertyPath = propsInterfaceName 
                    ? `${propsInterfaceName}.${keyCamelCase}`
                    : keyCamelCase;
                
                return generateXmlPropertyCode(
                    namespacesTypeMapping,
                    baseNamespacePrefix,
                    key,
                    element as TypeDefinition,
                    null,
                    propertyPath,
                    true // El padre (root element) siempre es qualified
                );
            }
            return '';
        })
        .filter(Boolean)
        .join('\n');
    
    // El elemento raíz siempre tiene prefijo (es un elemento global, no local)
    return `<${baseNamespacePrefix}.${baseTypeLocalName}>
    ${properties}
</${baseNamespacePrefix}.${baseTypeLocalName}>`;
}
