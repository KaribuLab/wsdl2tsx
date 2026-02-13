import { extractLocalName, getFilteredKeys } from "../../utils.js";
import { debugContext } from "../../../logger.js";
import type { TypeObject, NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../../types.js";
import { handleSingleKey } from "./helpers/single-key-handler.js";
import { processStringElement } from "./helpers/string-element-processor.js";
import { processObjectElement } from "./helpers/object-element-processor.js";
import { generateRootTag } from "./helpers/root-tag-generator.js";

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
    
    // Manejar caso especial con una sola clave usando el helper
    const singleKeyResult = handleSingleKey(
        keys,
        baseTypeObject,
        baseTypeName,
        baseNamespacePrefix,
        namespacesTypeMapping,
        propsInterfaceName,
        schemaObject,
        allComplexTypes,
        prefixesMapping,
        tagUsageCollector
    );
    if (singleKeyResult !== null) {
        return singleKeyResult;
    }
    
    // Para elementos raíz, las propiedades son directas (props.intA, props.intB)
    // No necesitamos usar propsInterfaceName aquí porque estamos en el nivel raíz
    // propsInterfaceName solo sería útil si hubiera un wrapper, pero en este caso
    // las propiedades son directas del root element
    
    const properties = keys
        .map(key => {
            const element = baseTypeObject[key]!;
            debugContext("generateXmlBodyCode", `Procesando propiedad "${key}", typeof element: ${typeof element}, element: ${typeof element === 'object' && element !== null ? JSON.stringify(Object.keys(element)).substring(0, 100) : element}`);
            
            // Si el elemento es un string, usar el procesador de strings
            if (typeof element === 'string') {
                return processStringElement(
                    element,
                    key,
                    propsInterfaceName,
                    namespacesTypeMapping,
                    baseNamespacePrefix,
                    schemaObject,
                    allComplexTypes,
                    prefixesMapping,
                    tagUsageCollector
                );
            }
            
            // Si el elemento es un objeto, usar el procesador de objetos
            if (typeof element === 'object' && element !== null) {
                return processObjectElement(
                    element,
                    key,
                    propsInterfaceName,
                    namespacesTypeMapping,
                    baseNamespacePrefix,
                    schemaObject,
                    allComplexTypes,
                    prefixesMapping,
                    tagUsageCollector
                );
            }
            
            debugContext("generateXmlBodyCode", `⚠ Propiedad "${key}" no es un objeto ni string, omitiendo`);
            return '';
        })
        .filter(Boolean)
        .join('\n');
    
    // Generar el tag raíz usando el helper
    return generateRootTag(
        baseNamespacePrefix,
        baseTypeLocalName,
        properties,
        prefixesMapping,
        tagUsageCollector
    );
}
