import { toCamelCase } from "../../util.js";
import { extractLocalName, getFilteredKeys } from "../utils.js";
import { debugContext } from "../../logger.js";
import type { TypeObject, TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../types.js";
import { generateXmlPropertyCode } from "./xml-property.js";
import { resolveReferencedType, resolveNestedType } from "./type-resolution.js";
import { getNamespacePrefix } from "../namespaces.js";

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
    prefixesMapping?: NamespacePrefixesMapping,
    tagUsageCollector?: TagUsageCollector
): string {
    const keys = getFilteredKeys(baseTypeObject);
    const localNames = keys.map(key => extractLocalName(key));
    // Extraer nombre local del tipo base
    const baseTypeLocalName = extractLocalName(baseTypeName);
    
    // Log del orden de propiedades para validación
    debugContext("generateXmlBodyCode", `Generando XML para tipo "${baseTypeName}" con ${keys.length} propiedades: ${keys.join(', ')}`);
    debugContext("generateXmlBodyCode", `Orden de tags XML (nombres locales): ${localNames.join(' -> ')}`);
    
    // El elemento raíz siempre debe tener prefijo (es un elemento global)
    // Los elementos hijos dependen de $qualified
    
    // IMPORTANTE: No expandir directamente cuando hay una sola clave con referencia
    // Debe generarse el tag intermedio (por ejemplo, reqConsultarPerfilCliente)
    // La expansión directa solo aplica cuando el type es un objeto inline, no una referencia
    // Si hay una sola clave y es un tipo complejo con type como objeto INLINE, procesar el type directamente
    if (keys.length === 1) {
        const singleKey = keys[0]!;
        const element = baseTypeObject[singleKey]!;
        
        if (typeof element === 'object' && element !== null && 'type' in element) {
            const typeValue = (element as any).type;
            
            // Solo expandir si type es un objeto (tipo complejo anidado inline), NO si es una referencia string
            if (typeof typeValue === 'object' && typeValue !== null) {
                const typeKeys = getFilteredKeys(typeValue as TypeObject);
                // Si tiene propiedades, procesar recursivamente el objeto type
                if (typeKeys.length > 0) {
                    return generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, baseTypeName, typeValue as TypeObject, propsInterfaceName, schemaObject, allComplexTypes, prefixesMapping, tagUsageCollector);
                }
            }
            // Si type es un string (referencia), NO expandir - dejar que generateXmlPropertyCode maneje el tag intermedio
        }
    }
    
    // Para elementos raíz, las propiedades son directas (props.intA, props.intB)
    // No necesitamos usar propsInterfaceName aquí porque estamos en el nivel raíz
    // propsInterfaceName solo sería útil si hubiera un wrapper, pero en este caso
    // las propiedades son directas del root element
    
    const properties = keys
        .map(key => {
            const element = baseTypeObject[key]!;
            debugContext("generateXmlBodyCode", `Procesando propiedad "${key}", typeof element: ${typeof element}, element: ${typeof element === 'object' && element !== null ? JSON.stringify(Object.keys(element)).substring(0, 100) : element}`);
            
            // Si el elemento es un string, tratarlo como un tipo simple
            if (typeof element === 'string') {
                const keyLocalName = extractLocalName(key);
                const keyCamelCase = toCamelCase(keyLocalName);
                const propertyPath = propsInterfaceName 
                    ? `${propsInterfaceName}.${keyCamelCase}`
                    : keyCamelCase;
                
                // Determinar el prefijo del namespace para este elemento
                const namespacePrefix = getNamespacePrefix(
                    namespacesTypeMapping,
                    baseNamespacePrefix,
                    key,
                    null,
                    { $qualified: true } as any,
                    prefixesMapping
                );
                
                debugContext("generateXmlBodyCode", `Generando tag para tipo simple string "${element}" con propertyPath "${propertyPath}"`);
                return `<${namespacePrefix}.${keyLocalName}>{props.${propertyPath}}</${namespacePrefix}.${keyLocalName}>`;
            }
            
            if (typeof element === 'object' && element !== null) {
                const keyLocalName = extractLocalName(key);
                const keyCamelCase = toCamelCase(keyLocalName);
                
                // Para propiedades del root element, usar directamente el nombre de la propiedad
                // Si propsInterfaceName está definido, usarlo como prefijo (para headers)
                const propertyPath = propsInterfaceName 
                    ? `${propsInterfaceName}.${keyCamelCase}`
                    : keyCamelCase;
                
                debugContext("generateXmlBodyCode", `Llamando a generateXmlPropertyCode para "${key}" con propertyPath "${propertyPath}"`);
                return generateXmlPropertyCode(
                    namespacesTypeMapping,
                    baseNamespacePrefix,
                    key,
                    element as TypeDefinition,
                    null,
                    propertyPath,
                    true, // El padre (root element) siempre es qualified
                    prefixesMapping,
                    schemaObject,
                    allComplexTypes,
                    tagUsageCollector
                );
            }
            debugContext("generateXmlBodyCode", `⚠ Propiedad "${key}" no es un objeto ni string, omitiendo`);
            return '';
        })
        .filter(Boolean)
        .join('\n');
    
    // El elemento raíz siempre tiene prefijo (es un elemento global, no local)
    // Registrar el tag raíz si hay collector
    if (tagUsageCollector) {
        tagUsageCollector.tagToPrefix.set(baseTypeLocalName, baseNamespacePrefix);
        if (prefixesMapping && prefixesMapping[baseNamespacePrefix]) {
            tagUsageCollector.prefixToNamespace.set(baseNamespacePrefix, prefixesMapping[baseNamespacePrefix]);
        }
    }
    
    return `<${baseNamespacePrefix}.${baseTypeLocalName}>
    ${properties}
</${baseNamespacePrefix}.${baseTypeLocalName}>`;
}
