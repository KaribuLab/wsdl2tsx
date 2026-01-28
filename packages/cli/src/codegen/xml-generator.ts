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
            
            return `{props.${currentPropertyPath}.map((item, i) => (
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
                            currentPropertyPath,
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
export function generateXmlBodyCode(baseNamespacePrefix: string, namespacesTypeMapping: NamespaceTypesMapping, baseTypeName: string, baseTypeObject: TypeObject, propsInterfaceName?: string): string {
    const keys = getFilteredKeys(baseTypeObject);
    // Extraer nombre local del tipo base
    const baseTypeLocalName = extractLocalName(baseTypeName);
    
    // El elemento raíz siempre debe tener prefijo (es un elemento global)
    // Los elementos hijos dependen de $qualified
    
    // Determinar la ruta inicial de propiedades basándose en la interfaz de props
    // Si hay una propiedad principal en la interfaz de props, usarla como punto de partida
    const initialPropertyPath = propsInterfaceName ? toCamelCase(propsInterfaceName) : '';
    
    const properties = keys
        .map(key => {
            const element = baseTypeObject[key]!;
            if (typeof element === 'object' && element !== null) {
                const keyLocalName = extractLocalName(key);
                const keyCamelCase = toCamelCase(keyLocalName);
                
                // Si la clave actual coincide con propsInterfaceName, no agregarlo de nuevo a la ruta
                // Solo usar initialPropertyPath si no coincide
                const propertyPath = (initialPropertyPath && keyCamelCase === initialPropertyPath) 
                    ? initialPropertyPath 
                    : (initialPropertyPath 
                        ? `${initialPropertyPath}.${keyCamelCase}` 
                        : keyCamelCase);
                
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
