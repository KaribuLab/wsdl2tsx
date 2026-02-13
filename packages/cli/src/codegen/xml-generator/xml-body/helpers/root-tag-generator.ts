import { extractLocalName } from "../../../utils.js";
import type { NamespacePrefixesMapping, TagUsageCollector } from "../../../types.js";

/**
 * Genera el tag raíz final
 */
export function generateRootTag(
    baseNamespacePrefix: string,
    baseTypeLocalName: string,
    properties: string,
    prefixesMapping?: NamespacePrefixesMapping,
    tagUsageCollector?: TagUsageCollector
): string {
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
