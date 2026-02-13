import { toCamelCase } from "../../../../util.js";
import { extractLocalName, getFilteredKeys } from "../../../utils.js";
import { getNamespacePrefix } from "../../../namespaces/index.js";
import type { TypeObject, TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../../../types.js";
import { resolveReferencedType, resolveNestedType } from "../../type-resolution.js";
import { generateXmlPropertyCode } from "../index.js";
import { buildPropertyPath } from "./property-path-builder.js";

/**
 * Genera wrappers para referencias resueltas
 */
export function generateReferenceWrapper(
    referencedType: string,
    elementObject: TypeDefinition,
    key: string,
    tagLocalName: string,
    tagCamelCase: string,
    namespacePrefix: string,
    isQualified: boolean,
    propertyPath: string,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    parentKey: string | null,
    prefixesMapping?: NamespacePrefixesMapping,
    schemaObject?: any,
    allComplexTypes?: any,
    tagUsageCollector?: TagUsageCollector
): string | null {
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
            : `<xml.${tagLocalName}>`;
        const wrapperCloseTag = wrapperIsQualified 
            ? `</${wrapperNamespacePrefix}.${tagLocalName}>` 
            : `</xml.${tagLocalName}>`;
        
        // Registrar el tag wrapper usado con su prefijo si hay collector
        if (tagUsageCollector && wrapperIsQualified) {
            tagUsageCollector.tagToPrefix.set(tagLocalName, wrapperNamespacePrefix);
            // También registrar el namespace URI si tenemos prefixesMapping
            if (prefixesMapping && prefixesMapping[wrapperNamespacePrefix]) {
                tagUsageCollector.prefixToNamespace.set(wrapperNamespacePrefix, prefixesMapping[wrapperNamespacePrefix]);
            }
        }
        
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
                                allComplexTypes,
                                tagUsageCollector
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
                            allComplexTypes,
                            tagUsageCollector
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
    
    return null;
}
