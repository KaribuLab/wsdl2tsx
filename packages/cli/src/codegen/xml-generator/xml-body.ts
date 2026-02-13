import { toCamelCase } from "../../util.js";
import { extractLocalName, getFilteredKeys } from "../utils.js";
import { debugContext } from "../../logger.js";
import type { TypeObject, TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../types.js";
import { generateXmlPropertyCode } from "./xml-property.js";
import { resolveReferencedType, resolveNestedType } from "./type-resolution.js";
import { getNamespacePrefix } from "../namespaces.js";
import { shouldHavePrefix } from "../namespaces.js";

/**
 * Genera el código del cuerpo XML principal
 */
export function generateXmlBodyCode(
    baseNamespacePrefix: string,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseTypeName: string,
    baseTypeObject: TypeObject,
    propsInterfaceName?: string,
    schemaObject?: any,
    allComplexTypes?: any,
    prefixesMapping?: NamespacePrefixesMapping,
    tagUsageCollector?: TagUsageCollector
): string {
    const keys = getFilteredKeys(baseTypeObject);
    const localNames = keys.map(key => extractLocalName(key));
    // Extraer nombre local del tipo base
    const baseTypeLocalName = extractLocalName(baseTypeName);
    
    // Log del orden de propiedades para validación
    debugContext("generateXmlBodyCode", `Generando XML para tipo "${baseTypeName}" con ${keys.length} propiedades: ${keys.join(', ')}`);
    debugContext("generateXmlBodyCode", `Orden de tags XML (nombres locales): ${localNames.join(' -> ')}`);
    
    // El elemento raíz siempre debe tener prefijo (es un elemento global)
    // Los elementos hijos dependen de $qualified
    
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
                    return generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, baseTypeName, typeValue as TypeObject, propsInterfaceName, schemaObject, allComplexTypes, prefixesMapping, tagUsageCollector);
                }
            }
            // Si type es un string (referencia), NO expandir - dejar que generateXmlPropertyCode maneje el tag intermedio
        }
    }
    
    // Para elementos raíz, las propiedades son directas (props.intA, props.intB)
    // No necesitamos usar propsInterfaceName aquí porque estamos en el nivel raíz
    // propsInterfaceName solo sería útil si hubiera un wrapper, pero en este caso
    // las propiedades son directas del root element
    
    const properties = keys
        .map(key => {
            const element = baseTypeObject[key]!;
            debugContext("generateXmlBodyCode", `Procesando propiedad "${key}", typeof element: ${typeof element}, element: ${typeof element === 'object' && element !== null ? JSON.stringify(Object.keys(element)).substring(0, 100) : element}`);
            
            // Si el elemento es un string, verificar si es una referencia a un tipo complejo antes de tratarlo como tipo simple
            if (typeof element === 'string') {
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
                                                    nestedElement as TypeDefinition,
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
                                    const wrapperOpenTag = isQualified ? `<${namespacePrefix}.${keyLocalName}>` : `<${keyLocalName}>`;
                                    const wrapperCloseTag = isQualified ? `</${namespacePrefix}.${keyLocalName}>` : `</${keyLocalName}>`;
                                    
                                    return `${wrapperOpenTag}
    ${nestedProperties}
${wrapperCloseTag}`;
                                }
                            } else {
                                debugContext("generateXmlBodyCode", `⚠ Referencia circular detectada: "${element}" -> "${referencedElement.type}", buscando complexType directamente`);
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
                        const elementAsObject: TypeDefinition = { 
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
            
            if (typeof element === 'object' && element !== null) {
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
            debugContext("generateXmlBodyCode", `⚠ Propiedad "${key}" no es un objeto ni string, omitiendo`);
            return '';
        })
        .filter(Boolean)
        .join('\n');
    
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
