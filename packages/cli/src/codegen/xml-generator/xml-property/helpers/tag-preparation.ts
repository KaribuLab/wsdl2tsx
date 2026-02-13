import { toCamelCase } from "../../../../util.js";
import { extractLocalName } from "../../../utils.js";
import { getNamespacePrefix, shouldHavePrefix } from "../../../namespaces/index.js";
import type { TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../../../types.js";

export interface TagPreparationResult {
    namespacePrefix: string;
    tagLocalName: string;
    tagCamelCase: string;
    isQualified: boolean;
    openTag: string;
    closeTag: string;
}

/**
 * Prepara los tags (namespacePrefix, openTag/closeTag, collector)
 */
export function prepareTags(
    key: string,
    elementObject: TypeDefinition,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    parentKey: string | null,
    prefixesMapping?: NamespacePrefixesMapping,
    tagUsageCollector?: TagUsageCollector
): TagPreparationResult {
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
    // Para tags sin namespace, usar variable individual <tagName>
    const openTag = isQualified ? `<${namespacePrefix}.${tagLocalName}>` : `<${tagLocalName}>`;
    const closeTag = isQualified ? `</${namespacePrefix}.${tagLocalName}>` : `</${tagLocalName}>`;
    
    // Registrar el tag usado con su prefijo si hay collector
    if (tagUsageCollector && isQualified) {
        tagUsageCollector.tagToPrefix.set(tagLocalName, namespacePrefix);
        // También registrar el namespace URI si tenemos prefixesMapping
        if (prefixesMapping && prefixesMapping[namespacePrefix]) {
            tagUsageCollector.prefixToNamespace.set(namespacePrefix, prefixesMapping[namespacePrefix]);
        }
    }
    if (tagUsageCollector && !isQualified) {
        tagUsageCollector.unqualifiedTags.add(tagLocalName);
    }
    
    return {
        namespacePrefix,
        tagLocalName,
        tagCamelCase,
        isQualified,
        openTag,
        closeTag
    };
}
