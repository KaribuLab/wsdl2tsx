import { getFilteredKeys } from "../../utils.js";
import { DEFAULT_OCCURS } from "../../constants.js";
import type { TypeObject, TypeDefinition, NamespaceTypesMapping, NamespacePrefixesMapping, TagUsageCollector } from "../../types.js";
import { debugContext } from "../../../logger.js";
import { generateSimplePropertyCode } from "./simple-property.js";
import { prepareTags } from "./helpers/tag-preparation.js";
import { buildPropertyPath } from "./helpers/property-path-builder.js";
import { generateReferenceWrapper } from "./helpers/reference-wrapper-generator.js";
import { routeByType } from "./helpers/type-router.js";

/**
 * Genera el código del template de una propiedad del cuerpo XML
 */
export function generateXmlPropertyCode(
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    key: string,
    elementObject: TypeDefinition,
    parentKey: string | null = null,
    propertyPath: string = '',
    parentIsQualified: boolean = true, // El padre (root element) siempre es qualified
    prefixesMapping?: NamespacePrefixesMapping,
    schemaObject?: any,
    allComplexTypes?: any,
    tagUsageCollector?: TagUsageCollector
): string {
    // Preparar tags usando el helper
    const tagPrep = prepareTags(
        key,
        elementObject,
        namespacesTypeMapping,
        baseNamespacePrefix,
        parentKey,
        prefixesMapping,
        tagUsageCollector
    );
    const { namespacePrefix, tagLocalName, tagCamelCase, isQualified, openTag, closeTag } = tagPrep;
    
    // Detectar si es un array basándose en maxOccurs
    const isArray = typeof elementObject === 'object' && elementObject !== null && 
                    'maxOccurs' in elementObject && 
                    elementObject.maxOccurs !== undefined && 
                    elementObject.maxOccurs !== '1' && 
                    elementObject.maxOccurs !== DEFAULT_OCCURS;
    
    // Construir la ruta de propiedad completa usando el helper
    const currentPropertyPath = buildPropertyPath(propertyPath, tagCamelCase);
    
    // Si el elemento tiene un type que es string (referencia), resolverlo y generar el tag intermedio
    // IMPORTANTE: Solo intentar resolver si parece ser una referencia a un tipo complejo (contiene ':' o no es un tipo XSD simple conocido)
    const isXsdSimpleType = typeof elementObject === 'object' && elementObject !== null && typeof elementObject.type === 'string' && 
        (elementObject.type.startsWith('xsd:') || 
         elementObject.type === 'string' || 
         elementObject.type === 'int' || 
         elementObject.type === 'boolean' || 
         elementObject.type === 'date' ||
         elementObject.type === 'dateTime');
    
    debugContext("generateXmlPropertyCode", `Procesando propiedad "${key}" (tagLocalName: "${tagLocalName}"), elementObject.type: ${typeof elementObject === 'object' && elementObject !== null ? (typeof elementObject.type) : 'N/A'}, isXsdSimpleType: ${isXsdSimpleType}`);
    
    if (typeof elementObject === 'object' && elementObject !== null && typeof elementObject.type === 'string' && (schemaObject || allComplexTypes) && !isXsdSimpleType) {
        const referencedType = elementObject.type;
        const wrapperResult = generateReferenceWrapper(
            referencedType,
            elementObject,
            key,
            tagLocalName,
            tagCamelCase,
            namespacePrefix,
            isQualified,
            propertyPath,
            namespacesTypeMapping,
            baseNamespacePrefix,
            parentKey,
            prefixesMapping,
            schemaObject,
            allComplexTypes,
            tagUsageCollector
        );
        
        if (wrapperResult !== null) {
            return wrapperResult;
        }
        
        // Si no se pudo resolver o no tiene propiedades, usar la propiedad directamente
        // Esto puede pasar si la referencia no se encuentra o es un tipo simple
        // En este caso, generar el tag con el valor de la propiedad directamente
        if (typeof elementObject.type === 'string') {
            // Es un tipo simple (xsd:string, etc.) o una referencia que no se pudo resolver
            // Generar el tag con el valor de la propiedad
            return generateSimplePropertyCode(openTag, closeTag, currentPropertyPath);
        }
    }
    
    // Si el elemento tiene un type que es string simple (xsd:string, etc.), generar el tag directamente
    if (typeof elementObject === 'object' && elementObject !== null && typeof elementObject.type === 'string') {
        // Es un tipo simple (xsd:string, etc.)
        return generateSimplePropertyCode(openTag, closeTag, currentPropertyPath, elementObject.type);
    }
    
    if (typeof elementObject === 'object' && elementObject !== null && typeof elementObject.type === 'object') {
        const keys = getFilteredKeys(elementObject.type as TypeObject);
        
        // Usar el router para decidir cómo generar el código
        return routeByType(
            elementObject,
            keys,
            isArray,
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
    }
    
    // Para tipos simples, usar la ruta completa de la propiedad
    return generateSimplePropertyCode(openTag, closeTag, currentPropertyPath);
}
