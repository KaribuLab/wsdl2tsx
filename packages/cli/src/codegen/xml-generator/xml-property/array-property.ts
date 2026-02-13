import { toCamelCase } from "../../../util.js";
import { extractLocalName, getFilteredKeys } from "../../utils.js";
import { getNamespacePrefix, shouldHavePrefix } from "../../namespaces/index.js";
import { DEFAULT_OCCURS } from "../../constants.js";
import type { TypeObject, TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping } from "../../types.js";
import { generateXmlPropertyCode } from "./index.js";

/**
 * Genera código XML para propiedades que son arrays
 */
export function generateArrayPropertyCode(
    elementObject: TypeDefinition,
    keys: string[],
    openTag: string,
    closeTag: string,
    propertyPath: string,
    currentPropertyPath: string,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    key: string,
    isQualified: boolean,
    prefixesMapping: NamespacePrefixesMapping | undefined,
    schemaObject: any,
    allComplexTypes: any
): string {
    const nestedProperties = keys
        .map(elementKey => {
            const nestedElement = (elementObject.type as TypeObject)[elementKey]!;
            if (typeof nestedElement === 'object' && nestedElement !== null) {
                // Para arrays, usar 'item' como ruta base en lugar de acceder al array con índice
                // Verificar si el elemento anidado también es un array
                const nestedIsArray = typeof nestedElement === 'object' && nestedElement !== null &&
                                     'maxOccurs' in nestedElement &&
                                     nestedElement.maxOccurs !== undefined &&
                                     nestedElement.maxOccurs !== '1' &&
                                     nestedElement.maxOccurs !== DEFAULT_OCCURS;
                
                if (nestedIsArray || (typeof nestedElement === 'object' && nestedElement !== null && typeof nestedElement.type === 'object')) {
                    // Tipo complejo anidado dentro del array - usar 'item' como ruta base
                    return generateXmlPropertyCode(
                        namespacesTypeMapping,
                        baseNamespacePrefix,
                        elementKey,
                        nestedElement as TypeDefinition,
                        key,
                        'item', // Usar 'item' directamente en lugar de la ruta completa con índice
                        isQualified,
                        prefixesMapping,
                        schemaObject,
                        allComplexTypes
                    );
                } else {
                    // Tipo simple dentro del array - usar 'item' directamente
                    const nestedTagLocalName = extractLocalName(elementKey);
                    const nestedTagCamelCase = toCamelCase(nestedTagLocalName);
                    const nestedIsQualified = shouldHavePrefix(nestedElement as TypeDefinition);
                    
                    if (nestedIsQualified) {
                        const nestedNamespacePrefix = getNamespacePrefix(
                            namespacesTypeMapping,
                            baseNamespacePrefix,
                            elementKey,
                            key,
                            nestedElement as TypeDefinition,
                            prefixesMapping
                        );
                        return `<${nestedNamespacePrefix}.${nestedTagLocalName}>{item.${nestedTagCamelCase}}</${nestedNamespacePrefix}.${nestedTagLocalName}>`;
                    } else {
                        return `<xml.${nestedTagLocalName}>{item.${nestedTagCamelCase}}</xml.${nestedTagLocalName}>`;
                    }
                }
            }
            return '';
        })
        .filter(Boolean)
        .join('\n');
    
    // Si propertyPath tiene un prefijo (propsInterfaceName), usarlo en el map
    const mapPath = propertyPath || currentPropertyPath;
    return `{props.${mapPath}.map((item, i) => (
    ${openTag}
    ${nestedProperties}
    ${closeTag}
))}`;
}
