import { toCamelCase } from "../../../util.js";
import { extractLocalName, getFilteredKeys } from "../../utils.js";
import { getNamespacePrefix } from "../../namespaces/index.js";
import type { TypeObject, TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../../types.js";
import { generateXmlPropertyCode } from "../xml-property/index.js";
import { debugContext } from "../../../logger.js";

/**
 * Maneja referencias circulares expandiendo las propiedades directamente sin wrapper
 */
export function handleCircularReference(
    element: string,
    key: string,
    propsInterfaceName: string | undefined,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    prefixesMapping: NamespacePrefixesMapping | undefined,
    schemaObject: any,
    allComplexTypes: any,
    tagUsageCollector: TagUsageCollector | undefined
): string | null {
    debugContext("generateXmlBodyCode", `⚠ Referencia circular detectada: "${element}", buscando complexType directamente`);
    // Si hay una referencia circular, intentar buscar el complexType directamente en allComplexTypes
    const typeLocalName = element.split(':').pop() || element;
    if (allComplexTypes) {
        const complexTypeKey = Object.keys(allComplexTypes).find(k => {
            const kLocalName = k.split(':').pop() || k;
            return kLocalName === typeLocalName;
        });
        
        if (complexTypeKey) {
            const complexType = allComplexTypes[complexTypeKey];
            if (complexType && typeof complexType === 'object') {
                // Verificar si tiene 'type' como objeto (complexType inline)
                let finalComplexType = complexType;
                if ('type' in complexType && typeof complexType.type === 'object' && complexType.type !== null) {
                    finalComplexType = complexType.type as any;
                }
                
                const complexKeys = getFilteredKeys(finalComplexType);
                debugContext("generateXmlBodyCode", `Usando complexType "${complexTypeKey}" con ${complexKeys.length} propiedades: ${complexKeys.join(', ')}`);
                
                // Procesar las propiedades del complexType
                const keyLocalName = extractLocalName(key);
                const keyCamelCase = toCamelCase(keyLocalName);
                const propertyPath = propsInterfaceName 
                    ? `${propsInterfaceName}.${keyCamelCase}`
                    : keyCamelCase;
                
                // IMPORTANTE: Cuando hay una referencia circular, expandir las propiedades directamente sin wrapper
                // porque el elemento raíz ya es el wrapper
                const complexProperties = complexKeys
                    .map(complexKey => {
                        const complexElement = finalComplexType[complexKey]!;
                        if (typeof complexElement === 'object' && complexElement !== null) {
                            const complexKeyLocalName = extractLocalName(complexKey);
                            const complexKeyCamelCase = toCamelCase(complexKeyLocalName);
                            // Usar propertyPath directamente sin agregar el nombre del wrapper
                            const complexPropertyPath = propsInterfaceName 
                                ? `${propsInterfaceName}.${complexKeyCamelCase}`
                                : complexKeyCamelCase;
                            
                            return generateXmlPropertyCode(
                                namespacesTypeMapping,
                                baseNamespacePrefix,
                                complexKey,
                                complexElement as TypeDefinition,
                                null, // parentKey es null porque estamos en el nivel raíz
                                complexPropertyPath,
                                true,
                                prefixesMapping,
                                schemaObject,
                                allComplexTypes,
                                tagUsageCollector
                            );
                        } else if (typeof complexElement === 'string') {
                            const complexKeyLocalName = extractLocalName(complexKey);
                            const complexKeyCamelCase = toCamelCase(complexKeyLocalName);
                            // Usar propertyPath directamente sin agregar el nombre del wrapper
                            const complexPropertyPath = propsInterfaceName 
                                ? `${propsInterfaceName}.${complexKeyCamelCase}`
                                : complexKeyCamelCase;
                            const complexNamespacePrefix = getNamespacePrefix(
                                namespacesTypeMapping,
                                baseNamespacePrefix,
                                complexKey,
                                null, // parentKey es null porque estamos en el nivel raíz
                                { $qualified: true } as any,
                                prefixesMapping
                            );
                            
                            return `<${complexNamespacePrefix}.${complexKeyLocalName}>{props.${complexPropertyPath}}</${complexNamespacePrefix}.${complexKeyLocalName}>`;
                        }
                        return '';
                    })
                    .filter(Boolean)
                    .join('\n');
                
                // Retornar las propiedades directamente sin wrapper cuando hay referencia circular
                return complexProperties;
            }
        }
    }
    
    return null;
}
