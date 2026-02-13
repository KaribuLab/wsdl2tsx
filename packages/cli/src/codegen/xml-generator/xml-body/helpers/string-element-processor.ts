import { toCamelCase } from "../../../../util.js";
import { extractLocalName, getFilteredKeys } from "../../../utils.js";
import { debugContext } from "../../../../logger.js";
import type { NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../../../types.js";
import { getNamespacePrefix, shouldHavePrefix } from "../../../namespaces/index.js";
import { resolveReferencedType } from "../../type-resolution.js";
import { generateXmlPropertyCode } from "../../xml-property/index.js";
import { handleCircularReference } from "../circular-reference.js";

/**
 * Procesa elementos string (referencias)
 */
export function processStringElement(
    element: string,
    key: string,
    propsInterfaceName: string | undefined,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    schemaObject?: any,
    allComplexTypes?: any,
    prefixesMapping?: NamespacePrefixesMapping,
    tagUsageCollector?: TagUsageCollector
): string {
    // Verificar si parece ser una referencia a un tipo complejo (contiene ':' y no es un tipo XSD simple conocido)
    const isXsdSimpleType = element.startsWith('xsd:') || 
        element === 'string' || 
        element === 'int' || 
        element === 'boolean' || 
        element === 'date' ||
        element === 'dateTime';
    
    // Si no es un tipo XSD simple y parece ser una referencia (contiene ':'), intentar resolverla
    if (!isXsdSimpleType && element.includes(':') && (schemaObject || allComplexTypes)) {
        const referencedElement = resolveReferencedType(element, schemaObject, allComplexTypes);
        
        debugContext("generateXmlBodyCode", `Intentando resolver referencia "${element}", resultado: ${referencedElement ? (typeof referencedElement === 'object' ? `objeto con ${Object.keys(referencedElement).length} propiedades: ${Object.keys(referencedElement).join(', ')}` : typeof referencedElement) : 'null'}`);
        
        if (referencedElement && typeof referencedElement === 'object') {
            // Verificar si el elemento referenciado tiene un 'type' que también es un string (referencia anidada)
            if ('type' in referencedElement && typeof referencedElement.type === 'string' && !referencedElement.type.startsWith('xsd:')) {
                // El tipo referenciado tiene otra referencia, expandir directamente sus propiedades
                // IMPORTANTE: Evitar referencias circulares (si el tipo anidado es el mismo que el original)
                if (referencedElement.type !== element) {
                    const nestedReferencedElement = resolveReferencedType(referencedElement.type, schemaObject, allComplexTypes);
                    
                    if (nestedReferencedElement && typeof nestedReferencedElement === 'object') {
                        // Verificar si el elemento anidado también tiene un 'type' que es un objeto (complexType inline)
                        // Si tiene 'type' como objeto, usar ese objeto directamente
                        let finalNestedElement = nestedReferencedElement;
                        if ('type' in nestedReferencedElement && typeof nestedReferencedElement.type === 'object' && nestedReferencedElement.type !== null) {
                            finalNestedElement = nestedReferencedElement.type as any;
                            debugContext("generateXmlBodyCode", `Usando complexType inline del tipo anidado "${referencedElement.type}"`);
                        }
                        
                        // Expandir las propiedades del tipo anidado directamente
                        const nestedKeys = getFilteredKeys(finalNestedElement);
                        debugContext("generateXmlBodyCode", `Expandiendo tipo anidado "${referencedElement.type}" con ${nestedKeys.length} propiedades: ${nestedKeys.join(', ')}`);
                        
                        // Procesar cada propiedad del tipo anidado
                        const keyLocalName = extractLocalName(key);
                        const keyCamelCase = toCamelCase(keyLocalName);
                        const propertyPath = propsInterfaceName 
                            ? `${propsInterfaceName}.${keyCamelCase}`
                            : keyCamelCase;
                        
                        const nestedProperties = nestedKeys
                            .map(nestedKey => {
                                const nestedElement = finalNestedElement[nestedKey]!;
                                if (typeof nestedElement === 'object' && nestedElement !== null) {
                                    const nestedKeyLocalName = extractLocalName(nestedKey);
                                    const nestedKeyCamelCase = toCamelCase(nestedKeyLocalName);
                                    const nestedPropertyPath = `${propertyPath}.${nestedKeyCamelCase}`;
                                    
                                    return generateXmlPropertyCode(
                                        namespacesTypeMapping,
                                        baseNamespacePrefix,
                                        nestedKey,
                                        nestedElement as any,
                                        key,
                                        nestedPropertyPath,
                                        true,
                                        prefixesMapping,
                                        schemaObject,
                                        allComplexTypes,
                                        tagUsageCollector
                                    );
                                } else if (typeof nestedElement === 'string') {
                                    // Si el elemento anidado es un string simple, generar el tag directamente
                                    const nestedKeyLocalName = extractLocalName(nestedKey);
                                    const nestedKeyCamelCase = toCamelCase(nestedKeyLocalName);
                                    const nestedPropertyPath = `${propertyPath}.${nestedKeyCamelCase}`;
                                    const nestedNamespacePrefix = getNamespacePrefix(
                                        namespacesTypeMapping,
                                        baseNamespacePrefix,
                                        nestedKey,
                                        key,
                                        { $qualified: true } as any,
                                        prefixesMapping
                                    );
                                    
                                    return `<${nestedNamespacePrefix}.${nestedKeyLocalName}>{props.${nestedPropertyPath}}</${nestedNamespacePrefix}.${nestedKeyLocalName}>`;
                                }
                                return '';
                            })
                            .filter(Boolean)
                            .join('\n');
                        
                        // Determinar el prefijo del namespace para el tag wrapper
                        const namespacePrefix = getNamespacePrefix(
                            namespacesTypeMapping,
                            baseNamespacePrefix,
                            key,
                            null,
                            referencedElement as any,
                            prefixesMapping
                        );
                        
                        const isQualified = shouldHavePrefix(referencedElement as any);
                        const wrapperOpenTag = isQualified ? `<${namespacePrefix}.${keyLocalName}>` : `<xml.${keyLocalName}>`;
                        const wrapperCloseTag = isQualified ? `</${namespacePrefix}.${keyLocalName}>` : `</xml.${keyLocalName}>`;
                        
                        return `${wrapperOpenTag}
    ${nestedProperties}
${wrapperCloseTag}`;
                    }
                } else {
                    // Referencia circular detectada
                    const circularResult = handleCircularReference(
                        element,
                        key,
                        propsInterfaceName,
                        namespacesTypeMapping,
                        baseNamespacePrefix,
                        prefixesMapping,
                        schemaObject,
                        allComplexTypes,
                        tagUsageCollector
                    );
                    
                    if (circularResult !== null) {
                        return circularResult;
                    }
                }
            }
            
            // Es una referencia a un tipo complejo, procesarla como objeto
            debugContext("generateXmlBodyCode", `Resolviendo referencia "${element}" a tipo complejo con propiedades: ${Object.keys(referencedElement).filter(k => !k.startsWith('$')).join(', ')}`);
            const keyLocalName = extractLocalName(key);
            const keyCamelCase = toCamelCase(keyLocalName);
            const propertyPath = propsInterfaceName 
                ? `${propsInterfaceName}.${keyCamelCase}`
                : keyCamelCase;
            
            // Convertir el string a un objeto TypeDefinition para procesarlo
            const elementAsObject: any = { 
                type: element, 
                $qualified: true 
            };
            
            return generateXmlPropertyCode(
                namespacesTypeMapping,
                baseNamespacePrefix,
                key,
                elementAsObject,
                null,
                propertyPath,
                true,
                prefixesMapping,
                schemaObject,
                allComplexTypes,
                tagUsageCollector
            );
        } else {
            debugContext("generateXmlBodyCode", `No se pudo resolver la referencia "${element}", tratando como tipo simple`);
        }
    }
    
    // Si no se pudo resolver o es un tipo simple, tratarlo como tipo simple
    const keyLocalName = extractLocalName(key);
    const keyCamelCase = toCamelCase(keyLocalName);
    const propertyPath = propsInterfaceName 
        ? `${propsInterfaceName}.${keyCamelCase}`
        : keyCamelCase;
    
    // Determinar el prefijo del namespace para este elemento
    const namespacePrefix = getNamespacePrefix(
        namespacesTypeMapping,
        baseNamespacePrefix,
        key,
        null,
        { $qualified: true } as any,
        prefixesMapping
    );
    
    debugContext("generateXmlBodyCode", `Generando tag para tipo simple string "${element}" con propertyPath "${propertyPath}"`);
    return `<${namespacePrefix}.${keyLocalName}>{props.${propertyPath}}</${namespacePrefix}.${keyLocalName}>`;
}
