import { getFilteredKeys } from "../../../utils.js";
import { DEFAULT_OCCURS } from "../../../constants.js";
import type { TypeObject, TypeDefinition } from "../../../types.js";
import { generateSimplePropertyCode } from "../simple-property.js";
import { generateArrayPropertyCode } from "../array-property.js";
import { generateComplexPropertyCode } from "../complex-property.js";
import type { NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../../../types.js";

/**
 * Routing final (decidir si es simple/complejo/array/referencia)
 */
export function routeByType(
    elementObject: TypeDefinition,
    keys: string[],
    isArray: boolean,
    openTag: string,
    closeTag: string,
    propertyPath: string,
    currentPropertyPath: string,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    key: string,
    isQualified: boolean,
    prefixesMapping?: NamespacePrefixesMapping,
    schemaObject?: any,
    allComplexTypes?: any,
    tagUsageCollector?: TagUsageCollector
): string {
    // Si es un array, generar código que itere sobre el array
    if (isArray) {
        return generateArrayPropertyCode(
            elementObject,
            keys,
            openTag,
            closeTag,
            propertyPath,
            currentPropertyPath,
            namespacesTypeMapping,
            baseNamespacePrefix,
            key,
            isQualified,
            prefixesMapping,
            schemaObject,
            allComplexTypes,
            tagUsageCollector
        );
    } else {
        // No es un array, generar código normal
        return generateComplexPropertyCode(
            elementObject,
            keys,
            openTag,
            closeTag,
            currentPropertyPath,
            namespacesTypeMapping,
            baseNamespacePrefix,
            key,
            isQualified,
            prefixesMapping,
            schemaObject,
            allComplexTypes,
            tagUsageCollector
        );
    }
}
