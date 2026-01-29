import { toCamelCase } from "../../util.js";
import { extractLocalName, getFilteredKeys } from "../utils.js";
import type { TypeObject, TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping } from "../types.js";
import { generateXmlPropertyCode } from "./xml-property.js";
import { resolveReferencedType, resolveNestedType } from "./type-resolution.js";

/**
 * Genera el código del cuerpo XML principal
 */
export function generateXmlBodyCode(
    baseNamespacePrefix: string,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseTypeName: string,
    baseTypeObject: TypeObject,
    propsInterfaceName?: string,
    schemaObject?: any,
    allComplexTypes?: any,
    prefixesMapping?: NamespacePrefixesMapping
): string {
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
                const referencedElement = resolveReferencedType(typeValue, schemaObject, allComplexTypes);
                
                if (referencedElement && typeof referencedElement === 'object') {
                    // Si el elemento referenciado tiene un type que es string, seguir resolviendo
                    if ('type' in referencedElement && typeof referencedElement.type === 'string') {
                        // Continuar resolviendo recursivamente - buscar primero en schemaObject, luego en allComplexTypes
                        const nestedTypeValue = referencedElement.type;
                        const nestedReferencedElement = resolveNestedType(nestedTypeValue, schemaObject, allComplexTypes);
                        
                        if (nestedReferencedElement && typeof nestedReferencedElement === 'object') {
                            // Usar el tipo anidado directamente
                            return generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, baseTypeName, nestedReferencedElement, propsInterfaceName, schemaObject, allComplexTypes, prefixesMapping);
                        }
                    }
                    // Si encontramos el elemento referenciado, expandir su contenido
                    return generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, baseTypeName, referencedElement, propsInterfaceName, schemaObject, allComplexTypes, prefixesMapping);
                }
            }
            
            // Si type es un objeto (tipo complejo anidado), procesar ese objeto directamente
            if (typeof typeValue === 'object' && typeValue !== null) {
                const typeKeys = getFilteredKeys(typeValue as TypeObject);
                // Si tiene propiedades, procesar recursivamente el objeto type
                if (typeKeys.length > 0) {
                    return generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, baseTypeName, typeValue as TypeObject, propsInterfaceName, schemaObject, allComplexTypes, prefixesMapping);
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
                    true, // El padre (root element) siempre es qualified
                    prefixesMapping
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
