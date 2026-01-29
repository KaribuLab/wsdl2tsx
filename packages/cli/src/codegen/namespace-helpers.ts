import { extractLocalName, getFilteredKeys, extractNamespacePrefix } from "./utils.js";
import { NAMESPACE_KEY } from "./constants.js";
import { debugContext } from "../logger.js";
import type { TypeObject, NamespaceTagsMapping, NamespaceTypesMapping } from "./types.js";

/**
 * Extrae tags anidados recursivamente (solo si son qualified)
 */
export function extractNestedTags(typeObject: TypeObject): string[] {
    const result: string[] = [];
    const nestedKeys = getFilteredKeys(typeObject);
    const isQualified = typeObject.$qualified === true;
    
    for (const nestedKey of nestedKeys) {
        const nestedElement = typeObject[nestedKey]!;
        // Solo agregar el tag si es qualified
        if (isQualified) {
            const tagLocalName = extractLocalName(nestedKey);
            result.push(tagLocalName);
        }
        
        if (typeof nestedElement === 'object' && nestedElement !== null && typeof nestedElement.type === 'object') {
            // También agregar tags anidados recursivamente
            const nestedTags = extractNestedTags(nestedElement.type as TypeObject);
            result.push(...nestedTags);
        }
    }
    
    return result;
}

/**
 * Resultado de la extracción de tags y namespaces del XML body
 */
export interface XmlBodyExtractionResult {
    tags: string[];
    namespaces: Map<string, string>; // prefix -> namespace URI
    tagsByNamespace: Map<string, string[]>; // namespace URI -> tags[]
}

/**
 * Extrae todos los tags que se usarán en el XML body (incluyendo no qualified)
 * También extrae los namespaces de tipos referenciados que se necesitan en el XML
 * Esto es necesario para registrar todos los tags en el namespace, incluso si no son qualified
 */
export function extractAllTagsForXmlBody(
    typeObject: TypeObject,
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    currentNamespace: string,
    visited: Set<string> = new Set(),
    schemaObject?: any,
    allComplexTypes?: any
): XmlBodyExtractionResult {
    const result: string[] = [];
    const foundNamespaces = new Map<string, string>();
    const tagsByNamespace = new Map<string, string[]>(); // namespace URI -> tags[]
    const keys = getFilteredKeys(typeObject);
    
    debugContext("extractAllTagsForXmlBody", `Extrayendo tags de tipo con ${keys.length} propiedad(es) en namespace "${currentNamespace}"`);
    
    for (const key of keys) {
        // Evitar procesar el mismo tipo dos veces
        const typeKey = `${currentNamespace}:${key}`;
        if (visited.has(typeKey)) {
            debugContext("extractAllTagsForXmlBody", `Omitiendo tag ya procesado: "${key}"`);
            continue;
        }
        visited.add(typeKey);
        
        const element = typeObject[key]!;
        const tagLocalName = extractLocalName(key);
        
        // Obtener el namespace del elemento
        let elementNamespace: string | undefined;
        let elementTypeValue: any = null;
        
        if (typeof element === 'object' && element !== null) {
            // IMPORTANTE: El namespace del ELEMENTO es diferente del namespace del TIPO referenciado
            // El elemento puede estar en un namespace y el tipo que referencia en otro
            // Por ejemplo: elemento "reqConsultarPerfilCliente" está en namespace base,
            // pero el tipo que referencia está en otro namespace
            const originalElementNamespace = (element as any).$namespace;
            elementNamespace = originalElementNamespace;
            
            // Si el elemento tiene un type que es string (referencia), intentar resolverlo
            if ('type' in element && typeof element.type === 'string') {
                const referencedType = element.type;
                debugContext("extractAllTagsForXmlBody", `Resolviendo tipo referenciado: "${referencedType}" para tag "${tagLocalName}"`);
                
                // Buscar el tipo referenciado en schemaObject o allComplexTypes
                let referencedTypeObject = schemaObject?.[referencedType] || allComplexTypes?.[referencedType];
                
                // Si no se encuentra exactamente, buscar por nombre local
                if (!referencedTypeObject) {
                    const referencedLocalName = referencedType.split(':').pop() || referencedType;
                    const matchingKey = Object.keys(schemaObject || {}).find(k => {
                        const kLocalName = k.split(':').pop();
                        return kLocalName === referencedLocalName;
                    }) || Object.keys(allComplexTypes || {}).find(k => {
                        const kLocalName = k.split(':').pop();
                        return kLocalName === referencedLocalName;
                    });
                    
                    if (matchingKey) {
                        referencedTypeObject = schemaObject?.[matchingKey] || allComplexTypes?.[matchingKey];
                        debugContext("extractAllTagsForXmlBody", `Tipo referenciado encontrado por nombre local: "${matchingKey}"`);
                    }
                }
                
                if (referencedTypeObject) {
                    elementTypeValue = referencedTypeObject;
                    // IMPORTANTE: NO cambiar elementNamespace aquí - el elemento mantiene su propio namespace
                    // Solo registrar el namespace del tipo referenciado para extraer sus tags anidados
                    if (typeof referencedTypeObject === 'object' && referencedTypeObject !== null) {
                        const refNamespace = referencedTypeObject[NAMESPACE_KEY];
                        if (refNamespace) {
                            // Registrar el namespace del tipo referenciado (para extraer tags anidados)
                            const refNamespacePrefix = extractNamespacePrefix(refNamespace);
                            if (!foundNamespaces.has(refNamespacePrefix)) {
                                foundNamespaces.set(refNamespacePrefix, refNamespace);
                                debugContext("extractAllTagsForXmlBody", `Registrando namespace del tipo referenciado: "${refNamespacePrefix}" -> "${refNamespace}"`);
                            }
                        }
                        // Si el tipo referenciado tiene un wrapper 'type', extraer el contenido
                        if ('type' in referencedTypeObject && typeof referencedTypeObject.type === 'object') {
                            elementTypeValue = referencedTypeObject.type;
                        }
                    }
                    debugContext("extractAllTagsForXmlBody", `✓ Tipo referenciado resuelto para "${tagLocalName}" (elemento en namespace: "${elementNamespace || currentNamespace}", tipo en namespace: "${referencedTypeObject[NAMESPACE_KEY] || 'N/A'}")`);
                } else {
                    debugContext("extractAllTagsForXmlBody", `✗ Tipo referenciado no encontrado: "${referencedType}"`);
                }
            } else if ('type' in element && typeof element.type === 'object') {
                elementTypeValue = element.type;
            }
        }
        
        // Usar el namespace del ELEMENTO, no del tipo referenciado
        const namespace = elementNamespace || currentNamespace;
        const namespacePrefix = extractNamespacePrefix(namespace);
        
        // Registrar el namespace si es diferente del base
        if (namespace !== currentNamespace && !foundNamespaces.has(namespacePrefix)) {
            foundNamespaces.set(namespacePrefix, namespace);
            debugContext("extractAllTagsForXmlBody", `Registrando namespace del elemento: "${namespacePrefix}" -> "${namespace}"`);
        }
        
        // IMPORTANTE: El tag debe agregarse al namespace del ELEMENTO, no al namespace del tipo referenciado
        // El elemento puede estar en un namespace diferente al tipo que referencia
        // Agregar el tag al namespace correspondiente (puede ser el base o un namespace diferente)
        // Esto incluye tanto elementos qualified como no qualified que se usarán en el XML
        debugContext("extractAllTagsForXmlBody", `Agregando tag "${tagLocalName}" al namespace "${namespacePrefix}" (namespace del elemento: "${namespace}")`);
        result.push(tagLocalName);
        
        // Registrar el tag en el namespace del ELEMENTO (no del tipo referenciado)
        if (!tagsByNamespace.has(namespace)) {
            tagsByNamespace.set(namespace, []);
        }
        // Solo agregar si no está ya en el array para evitar duplicados
        if (!tagsByNamespace.get(namespace)!.includes(tagLocalName)) {
            tagsByNamespace.get(namespace)!.push(tagLocalName);
        }
        
        // Si el elemento tiene un tipo complejo (ya sea inline o referenciado), extraer sus tags también
        if (elementTypeValue && typeof elementTypeValue === 'object' && elementTypeValue !== null) {
            const nestedTypeObject = elementTypeValue as TypeObject;
            const nestedNamespace = nestedTypeObject[NAMESPACE_KEY] || namespace;
            debugContext("extractAllTagsForXmlBody", `Extrayendo tags anidados de "${tagLocalName}" en namespace "${nestedNamespace}"`);
            const nestedResult = extractAllTagsForXmlBody(
                nestedTypeObject,
                namespacesTypeMapping,
                baseNamespacePrefix,
                nestedNamespace,
                visited,
                schemaObject,
                allComplexTypes
            );
            if (nestedResult.tags.length > 0) {
                debugContext("extractAllTagsForXmlBody", `  → Encontrados ${nestedResult.tags.length} tag(s) anidado(s) en "${tagLocalName}"`);
            }
            result.push(...nestedResult.tags);
            // Agregar namespaces encontrados en los tipos anidados
            for (const [prefix, uri] of nestedResult.namespaces) {
                if (!foundNamespaces.has(prefix)) {
                    foundNamespaces.set(prefix, uri);
                }
            }
            // Agregar tags por namespace de los tipos anidados
            // Estos tags pertenecen al namespace del tipo anidado, no al namespace del elemento padre
            for (const [nsUri, tags] of nestedResult.tagsByNamespace) {
                if (!tagsByNamespace.has(nsUri)) {
                    tagsByNamespace.set(nsUri, []);
                }
                // Solo agregar tags que no estén ya en el array para evitar duplicados
                const existingTags = new Set(tagsByNamespace.get(nsUri)!);
                for (const tag of tags) {
                    if (!existingTags.has(tag)) {
                        tagsByNamespace.get(nsUri)!.push(tag);
                        existingTags.add(tag);
                    }
                }
            }
        }
    }
    
    debugContext("extractAllTagsForXmlBody", `Total de tags extraídos: ${result.length}, namespaces encontrados: ${foundNamespaces.size}`);
    return { tags: result, namespaces: foundNamespaces, tagsByNamespace };
}

/**
 * Aplana claves con información de namespace recursivamente
 */
export function flattenKeysWithNamespace(
    typeObject: TypeObject,
    currentNamespace: string,
    currentNamespacePrefix: string
): Array<{ name: string; uri: string; prefix: string }> {
    const result: Array<{ name: string; uri: string; prefix: string }> = [];
    const objKeys = getFilteredKeys(typeObject);
    
    for (const objKey of objKeys) {
        const objElement = typeObject[objKey]!;
        
        if (typeof objElement === 'object' && objElement !== null && typeof objElement.type === 'object') {
            const objNamespace = (objElement.type as TypeObject)[NAMESPACE_KEY];
            if (!objNamespace) {
                // Si no tiene namespace, usar el namespace actual
                result.push({
                    name: objKey,
                    uri: currentNamespace,
                    prefix: currentNamespacePrefix,
                });
                continue;
            }
            const objNamespacePrefix = extractNamespacePrefix(objNamespace);
            
            const nested = flattenKeysWithNamespace(objElement.type as TypeObject, objNamespace, objNamespacePrefix);
            result.push(...nested);
            
            result.push({
                name: objKey,
                uri: objNamespace,
                prefix: objNamespacePrefix,
            });
        } else {
            result.push({
                name: objKey,
                uri: currentNamespace,
                prefix: currentNamespacePrefix,
            });
        }
    }
    
    return result;
}
