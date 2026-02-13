import { toCamelCase } from "../../../../util.js";
import { extractLocalName } from "../../../utils.js";
import { debugContext } from "../../../../logger.js";
import type { TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../../../types.js";
import { generateXmlPropertyCode } from "../../xml-property/index.js";

/**
 * Procesa elementos objeto
 */
export function processObjectElement(
    element: any,
    key: string,
    propsInterfaceName: string | undefined,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    schemaObject?: any,
    allComplexTypes?: any,
    prefixesMapping?: NamespacePrefixesMapping,
    tagUsageCollector?: TagUsageCollector
): string {
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
