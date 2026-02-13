import { getFilteredKeys } from "../../../utils.js";
import type { TypeObject } from "../../../types.js";
import type { NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../../../types.js";
import { generateXmlBodyCode } from "../index.js";

/**
 * Maneja el caso con una sola clave
 * Retorna el resultado de la expansión o null si no aplica este caso
 */
export function handleSingleKey(
    keys: string[],
    baseTypeObject: TypeObject,
    baseTypeName: string,
    baseNamespacePrefix: string,
    namespacesTypeMapping: NamespaceTypesMapping,
    propsInterfaceName?: string,
    schemaObject?: any,
    allComplexTypes?: any,
    prefixesMapping?: NamespacePrefixesMapping,
    tagUsageCollector?: TagUsageCollector
): string | null {
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
                    return generateXmlBodyCode(
                        baseNamespacePrefix,
                        namespacesTypeMapping,
                        baseTypeName,
                        typeValue as TypeObject,
                        propsInterfaceName,
                        schemaObject,
                        allComplexTypes,
                        prefixesMapping,
                        tagUsageCollector
                    );
                }
            }
            // Si type es un string (referencia), NO expandir - dejar que generateXmlPropertyCode maneje el tag intermedio
        }
    }
    
    return null;
}
