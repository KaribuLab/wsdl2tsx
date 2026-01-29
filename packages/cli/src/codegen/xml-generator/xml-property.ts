import { toCamelCase } from "../../util.js";
import { extractLocalName, getFilteredKeys } from "../utils.js";
import { getNamespacePrefix, shouldHavePrefix } from "../namespaces.js";
import { DEFAULT_OCCURS } from "../constants.js";
import type { TypeObject, TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping } from "../types.js";
import { resolveReferencedType, resolveNestedType } from "./type-resolution.js";

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
    parentIsQualified: boolean = true, // El padre (root element) siempre es qualified
    prefixesMapping?: NamespacePrefixesMapping,
    schemaObject?: any,
    allComplexTypes?: any
): string {
    const namespacePrefix = getNamespacePrefix(
        namespacesTypeMapping,
        baseNamespacePrefix,
        key,
        parentKey,
        elementObject,
        prefixesMapping
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
    
    // Si el elemento tiene un type que es string (referencia), resolverlo y generar el tag intermedio
    if (typeof elementObject === 'object' && elementObject !== null && typeof elementObject.type === 'string' && (schemaObject || allComplexTypes)) {
        const referencedType = elementObject.type;
        const referencedElement = resolveReferencedType(referencedType, schemaObject, allComplexTypes);
        
        if (referencedElement && typeof referencedElement === 'object') {
            // Obtener el namespace del elemento referenciado para el tag wrapper
            // El elemento referenciado puede tener su propio $namespace (del schema donde está definido)
            let referencedElementNamespace = (referencedElement as any).$namespace;
            
            // Si el elemento referenciado no tiene $namespace, intentar obtenerlo de la clave
            // donde está almacenado en schemaObject o allComplexTypes
            if (typeof referencedElementNamespace !== 'string') {
                // Buscar la clave completa del elemento referenciado en schemaObject o allComplexTypes
                const typeLocalName = referencedType.split(':').pop() || referencedType;
                let foundKey: string | undefined;
                
                if (schemaObject) {
                    foundKey = Object.keys(schemaObject).find(k => {
                        if (k === '$namespace' || k === '$qualified') return false;
                        const kLocalName = k.split(':').pop() || k;
                        return kLocalName === typeLocalName;
                    });
                    if (foundKey && foundKey.includes(':')) {
                        const [nsUri] = foundKey.split(':');
                        referencedElementNamespace = nsUri;
                    }
                }
                
                if (!foundKey && allComplexTypes) {
                    foundKey = Object.keys(allComplexTypes).find(k => {
                        const kLocalName = k.split(':').pop() || k;
                        return kLocalName === typeLocalName;
                    });
                    if (foundKey && foundKey.includes(':')) {
                        const [nsUri] = foundKey.split(':');
                        referencedElementNamespace = nsUri;
                    }
                }
            }
            
            let wrapperNamespacePrefix = namespacePrefix; // Por defecto usar el del elemento actual
            
            if (typeof referencedElementNamespace === 'string') {
                // Buscar el prefijo correcto para el namespace del elemento referenciado
                if (prefixesMapping) {
                    for (const [prefix, uri] of Object.entries(prefixesMapping)) {
                        if (uri === referencedElementNamespace) {
                            wrapperNamespacePrefix = prefix;
                            break;
                        }
                    }
                } else {
                    // Si no hay prefixesMapping, usar extractNamespacePrefix
                    wrapperNamespacePrefix = getNamespacePrefix(
                        namespacesTypeMapping,
                        baseNamespacePrefix,
                        key,
                        parentKey,
                        { $namespace: referencedElementNamespace } as any,
                        prefixesMapping
                    );
                }
            }
            
            // Determinar si el tag wrapper debe tener prefijo (usar el $qualified del elemento referenciado si existe)
            const wrapperIsQualified = (referencedElement as any).$qualified !== false;
            const wrapperOpenTag = wrapperIsQualified 
                ? `<${wrapperNamespacePrefix}.${tagLocalName}>` 
                : `<${tagLocalName}>`;
            const wrapperCloseTag = wrapperIsQualified 
                ? `</${wrapperNamespacePrefix}.${tagLocalName}>` 
                : `</${tagLocalName}>`;
            
            // Si el elemento referenciado tiene un type que es string, seguir resolviendo
            let finalReferencedElement = referencedElement;
            if ('type' in referencedElement && typeof referencedElement.type === 'string') {
                const nestedReferencedElement = resolveNestedType(referencedElement.type, schemaObject, allComplexTypes);
                if (nestedReferencedElement && typeof nestedReferencedElement === 'object') {
                    finalReferencedElement = nestedReferencedElement;
                }
            }
            
            // Si el elemento referenciado tiene un type que es objeto, generar el XML con ese tipo
            // IMPORTANTE: Cuando se expanden propiedades de un tipo referenciado, usar propertyPath del nivel superior
            // (sin incluir el nombre del elemento referenciado) porque preparePropsInterfaceData expande las propiedades
            if ('type' in finalReferencedElement && typeof finalReferencedElement.type === 'object' && finalReferencedElement.type !== null) {
                const keys = getFilteredKeys(finalReferencedElement.type as TypeObject);
                if (keys.length > 0) {
                    // Cuando preparePropsInterfaceData expande propiedades de un tipo referenciado,
                    // las propiedades aparecen directamente en el nivel superior de la interfaz de props
                    // Por lo tanto, debemos usar el propertyPath del padre (antes de agregar el nombre del elemento actual)
                    // Si propertyPath es el nombre del elemento actual, usar string vacío
                    let parentPropertyPath = '';
                    if (propertyPath === tagCamelCase) {
                        // El propertyPath es exactamente el nombre del elemento actual, usar string vacío
                        parentPropertyPath = '';
                    } else if (propertyPath.endsWith(`.${tagCamelCase}`)) {
                        // El propertyPath termina con el nombre del elemento actual, removerlo
                        parentPropertyPath = propertyPath.slice(0, -(tagCamelCase.length + 1));
                    } else {
                        // El propertyPath no incluye el nombre del elemento actual, mantenerlo
                        parentPropertyPath = propertyPath;
                    }
                    
                    const nestedProperties = keys
                        .map(elementKey => {
                            const nestedElement = (finalReferencedElement.type as TypeObject)[elementKey]!;
                            if (typeof nestedElement === 'object' && nestedElement !== null) {
                                const nestedKeyLocalName = extractLocalName(elementKey);
                                const nestedKeyCamelCase = toCamelCase(nestedKeyLocalName);
                                // Usar el propertyPath del nivel superior directamente (propiedades expandidas)
                                const nestedPropertyPath = parentPropertyPath 
                                    ? `${parentPropertyPath}.${nestedKeyCamelCase}`
                                    : nestedKeyCamelCase;
                                
                                return generateXmlPropertyCode(
                                    namespacesTypeMapping,
                                    baseNamespacePrefix,
                                    elementKey,
                                    nestedElement as TypeDefinition,
                                    key,
                                    nestedPropertyPath,
                                    isQualified,
                                    prefixesMapping,
                                    schemaObject,
                                    allComplexTypes
                                );
                            }
                            return '';
                        })
                        .filter(Boolean)
                        .join('\n');
                    
                    return `${wrapperOpenTag}
    ${nestedProperties}
    ${wrapperCloseTag}`;
                }
            }
            
            // Si el elemento referenciado es directamente un objeto con propiedades, generar el XML
            const referencedKeys = getFilteredKeys(finalReferencedElement);
            if (referencedKeys.length > 0) {
                // Cuando preparePropsInterfaceData expande propiedades de un tipo referenciado,
                // las propiedades aparecen directamente en el nivel superior de la interfaz de props
                let parentPropertyPath = '';
                if (propertyPath === tagCamelCase) {
                    // El propertyPath es exactamente el nombre del elemento actual, usar string vacío
                    parentPropertyPath = '';
                } else if (propertyPath.endsWith(`.${tagCamelCase}`)) {
                    // El propertyPath termina con el nombre del elemento actual, removerlo
                    parentPropertyPath = propertyPath.slice(0, -(tagCamelCase.length + 1));
                } else {
                    // El propertyPath no incluye el nombre del elemento actual, mantenerlo
                    parentPropertyPath = propertyPath;
                }
                
                const nestedProperties = referencedKeys
                    .map(elementKey => {
                        const nestedElement = finalReferencedElement[elementKey]!;
                        if (typeof nestedElement === 'object' && nestedElement !== null) {
                            const nestedKeyLocalName = extractLocalName(elementKey);
                            const nestedKeyCamelCase = toCamelCase(nestedKeyLocalName);
                            // Usar el propertyPath del nivel superior directamente (propiedades expandidas)
                            const nestedPropertyPath = parentPropertyPath 
                                ? `${parentPropertyPath}.${nestedKeyCamelCase}`
                                : nestedKeyCamelCase;
                            
                            return generateXmlPropertyCode(
                                namespacesTypeMapping,
                                baseNamespacePrefix,
                                elementKey,
                                nestedElement as TypeDefinition,
                                key,
                                nestedPropertyPath,
                                isQualified,
                                prefixesMapping,
                                schemaObject,
                                allComplexTypes
                            );
                        }
                        return '';
                    })
                    .filter(Boolean)
                    .join('\n');
                
                return `${wrapperOpenTag}
    ${nestedProperties}
    ${wrapperCloseTag}`;
            }
        }
        // Si no se pudo resolver o no tiene propiedades, usar la propiedad directamente
        // Esto puede pasar si la referencia no se encuentra o es un tipo simple
    }
    
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
                                isQualified,
                                prefixesMapping,
                                schemaObject,
                                allComplexTypes
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
                                    nestedElement as TypeDefinition,
                                    prefixesMapping
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
                            isQualified,
                            prefixesMapping,
                            schemaObject,
                            allComplexTypes
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
