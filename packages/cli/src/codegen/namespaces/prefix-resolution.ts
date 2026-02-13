import { extractNamespacePrefix } from "../utils.js";
import { debugContext } from "../../logger.js";
import type { NamespaceTypesMapping, NamespacePrefixesMapping } from "../types.js";

/**
 * Obtiene el prefijo de namespace para un elemento
 * Usa el namespace del propio elemento si tiene uno definido
 * Si hay colisiones de prefijos, busca el prefijo único en prefixesMapping
 */
export function getNamespacePrefix(
    namespacesTypeMapping: NamespaceTypesMapping, 
    baseNamespacePrefix: string, 
    key: string, 
    parentKey: string | null, 
    elementObject?: any,
    prefixesMapping?: NamespacePrefixesMapping
): string {
    // Si el elemento tiene su propio $namespace, usarlo para determinar el prefijo
    // IMPORTANTE: Usar solo el $namespace del elemento, no del tipo interno
    // El tipo interno puede tener un namespace diferente (del schema donde está definido el tipo)
    // pero el elemento usa el namespace del schema donde está definido el elemento
    if (elementObject && typeof elementObject === 'object') {
        const elemNs = (elementObject as any).$namespace;
        if (typeof elemNs === 'string') {
            debugContext("getNamespacePrefix", `Elemento "${key}" tiene namespace: "${elemNs}"`);
            // Si tenemos prefixesMapping, buscar el prefijo único que corresponde a este URI
            // Esto es necesario cuando hay colisiones de prefijos (mismo prefijo para diferentes URIs)
            if (prefixesMapping) {
                // Buscar el prefijo que corresponde a este URI
                for (const [prefix, uri] of Object.entries(prefixesMapping)) {
                    if (uri === elemNs) {
                        debugContext("getNamespacePrefix", `Encontrado prefijo "${prefix}" para namespace "${elemNs}"`);
                        return prefix;
                    }
                }
                debugContext("getNamespacePrefix", `No se encontró prefijo en prefixesMapping para "${elemNs}", usando extractNamespacePrefix`);
            }
            // Si no se encuentra en prefixesMapping, usar extractNamespacePrefix como fallback
            // (sin set de prefijos existentes para evitar recursión infinita)
            const extractedPrefix = extractNamespacePrefix(elemNs);
            debugContext("getNamespacePrefix", `Usando prefijo extraído: "${extractedPrefix}" para namespace "${elemNs}"`);
            return extractedPrefix;
        } else {
            // Si el elemento no tiene $namespace, verificar si el tipo interno tiene uno
            if ('type' in elementObject && typeof elementObject.type === 'object' && elementObject.type !== null) {
                const typeNs = (elementObject.type as any).$namespace;
                if (typeof typeNs === 'string') {
                    debugContext("getNamespacePrefix", `Elemento "${key}" no tiene $namespace, pero su tipo tiene: "${typeNs}"`);
                    if (prefixesMapping) {
                        for (const [prefix, uri] of Object.entries(prefixesMapping)) {
                            if (uri === typeNs) {
                                debugContext("getNamespacePrefix", `Encontrado prefijo "${prefix}" para namespace del tipo "${typeNs}"`);
                                return prefix;
                            }
                        }
                    }
                    // (sin set de prefijos existentes para evitar recursión infinita)
                    const extractedPrefix = extractNamespacePrefix(typeNs);
                    debugContext("getNamespacePrefix", `Usando prefijo extraído del tipo: "${extractedPrefix}" para namespace "${typeNs}"`);
                    return extractedPrefix;
                }
            }
        }
    }
    
    // Fallback al mapping existente
    if (parentKey !== null) {
        return namespacesTypeMapping[parentKey]?.prefix ?? baseNamespacePrefix;
    }
    return namespacesTypeMapping[key]?.prefix ?? baseNamespacePrefix;
}
