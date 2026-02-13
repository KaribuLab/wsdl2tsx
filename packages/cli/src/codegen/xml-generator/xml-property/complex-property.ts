import { getFilteredKeys } from "../../utils.js";
import type { TypeObject, TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../../types.js";
import { generateXmlPropertyCode } from "./index.js";

/**
 * Genera código XML para propiedades de tipo complejo (no arrays)
 */
export function generateComplexPropertyCode(
    elementObject: TypeDefinition,
    keys: string[],
    openTag: string,
    closeTag: string,
    currentPropertyPath: string,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    key: string,
    isQualified: boolean,
    prefixesMapping: NamespacePrefixesMapping | undefined,
    schemaObject: any,
    allComplexTypes: any,
    tagUsageCollector: TagUsageCollector | undefined
): string {
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
                    allComplexTypes,
                    tagUsageCollector
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
