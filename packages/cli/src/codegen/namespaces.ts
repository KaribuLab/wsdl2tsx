import { extractNamespacePrefix, extractLocalName, getFilteredKeys } from "./utils.js";
import { NAMESPACE_KEY } from "./constants.js";
import { debugContext } from "../logger.js";
import type { TypeObject, CombinedNamespaceMappings, NamespaceTagsMapping, NamespacePrefixesMapping, NamespaceTypesMapping, NamespaceInfo } from "./types.js";
import { extractNestedTags, flattenKeysWithNamespace, extractAllTagsForXmlBody } from "./namespace-helpers.js";

/**
 * Extrae todos los mappings de namespace en una sola pasada sobre los datos
 * Optimización: combina las tres extracciones (tags, prefixes, types) en una sola iteración
 * Solo incluye namespaces qualified en prefixesMapping (para xmlns declarations)
 */
export function extractAllNamespaceMappings(
    baseTypeName: string,
    baseTypeObject: TypeObject,
    schemaObject?: any,
    allComplexTypes?: any
): CombinedNamespaceMappings {
    const tagsMapping: NamespaceTagsMapping = {};
    const prefixesMapping: NamespacePrefixesMapping = {};
    const typesMapping: NamespaceTypesMapping = {};
    
    // Validar que baseTypeObject tenga $namespace
    if (!baseTypeObject || typeof baseTypeObject !== 'object') {
        throw new Error(`El objeto de tipo ${baseTypeName} es inválido o está vacío`);
    }
    
    const baseNamespace = baseTypeObject[NAMESPACE_KEY];
    if (!baseNamespace) {
        throw new Error(`El tipo ${baseTypeName} no tiene la propiedad $namespace definida`);
    }
    
    // Verificar si el tipo base es qualified
    const baseIsQualified = baseTypeObject.$qualified === true;
    
    // Crear un set para rastrear prefijos existentes y evitar colisiones
    const existingPrefixesSet = new Set<string>();
    const baseNamespacePrefix = extractNamespacePrefix(baseNamespace, existingPrefixesSet);
    existingPrefixesSet.add(baseNamespacePrefix);
    
    // Extraer nombre local del tipo base
    const baseTypeLocalName = extractLocalName(baseTypeName);
    
    // Inicializar mappings base (usar nombres locales para los tags)
    // Solo agregar al tagsMapping si es qualified
    if (baseIsQualified) {
        tagsMapping[baseNamespacePrefix] = [baseTypeLocalName];
        prefixesMapping[baseNamespacePrefix] = baseNamespace;
    }
    
    typesMapping[baseTypeName] = {
        uri: baseNamespace,
        prefix: baseNamespacePrefix,
    };
    
    const keys = getFilteredKeys(baseTypeObject);
    
    // Una sola iteración sobre las claves principales
    for (const key of keys) {
        const element = baseTypeObject[key]!;
        // Extraer nombre local del tag
        const tagLocalName = extractLocalName(key);
        
        // Verificar si el elemento es qualified
        let elementIsQualified = false;
        // Obtener el namespace del elemento (no del tipo interno)
        let elementNamespace: string | undefined;
        
        if (typeof element === 'object' && element !== null) {
            elementIsQualified = (element as any).$qualified === true;
            // Usar el $namespace del propio elemento si existe
            elementNamespace = (element as any).$namespace;
        }
        
        // Usar el namespace del elemento, o el del baseType como fallback
        const namespace = elementNamespace || baseNamespace;
        
        const tagNames = elementIsQualified ? [tagLocalName] : [];
        
        if (typeof element === 'object' && element !== null && typeof element.type === 'object') {
            // Los tags anidados pueden tener un namespace diferente (del tipo interno)
            const nestedTags = extractNestedTags(element.type as TypeObject);
            tagNames.push(...nestedTags);
        }
        
        // Verificar si hay colisión antes de generar el prefijo
        let namespacePrefix = extractNamespacePrefix(namespace, existingPrefixesSet);
        // Si hay colisión (el prefijo ya existe con un URI diferente), generar uno nuevo
        if (prefixesMapping[namespacePrefix] && prefixesMapping[namespacePrefix] !== namespace) {
            namespacePrefix = extractNamespacePrefix(namespace, existingPrefixesSet);
        }
        existingPrefixesSet.add(namespacePrefix);
        
        // Solo agregar al tagsMapping y prefixesMapping si hay tags qualified
        if (tagNames.length > 0) {
            // Actualizar tagsMapping (usar nombres locales)
            if (tagsMapping[namespacePrefix] === undefined) {
                tagsMapping[namespacePrefix] = tagNames;
            } else {
                tagsMapping[namespacePrefix]!.push(...tagNames);
            }
            
            // Actualizar prefixesMapping
            if (prefixesMapping[namespacePrefix] === undefined) {
                prefixesMapping[namespacePrefix] = namespace;
            }
        }
    }
    
    // Construir typesMapping usando flattenKeysWithNamespace
    const flatKeys = flattenKeysWithNamespace(baseTypeObject, baseNamespace, baseNamespacePrefix);
    for (const item of flatKeys) {
        typesMapping[item.name] = {
            uri: item.uri,
            prefix: item.prefix,
        };
    }
    
    // IMPORTANTE: También extraer todos los tags que se usarán en el XML body
    // Esto incluye tags de tipos referenciados que pueden no ser qualified pero se usan con prefijo
    // Necesario para registrar tags como rutCliente, aniCliente en el namespace
    const xmlBodyResult = extractAllTagsForXmlBody(
        baseTypeObject,
        typesMapping,
        baseNamespacePrefix,
        baseNamespace,
        new Set(),
        schemaObject,
        allComplexTypes
    );
    
    // Agregar namespaces adicionales encontrados en tipos referenciados
    // Esto es necesario para incluir namespaces como "http://osbcorp.vtr.cl/CLI/EMP/consultarPerfilClienteReq"
    // Si hay colisión de prefijos, generar un prefijo único usando extractNamespacePrefix con retry
    for (const [prefix, uri] of xmlBodyResult.namespaces) {
        // Verificar si ya existe un prefijo para este URI
        let finalPrefix: string | undefined;
        for (const [p, u] of Object.entries(prefixesMapping)) {
            if (u === uri) {
                finalPrefix = p;
                break;
            }
        }
        
        // Si no existe o hay colisión, generar uno nuevo
        if (!finalPrefix || (prefixesMapping[prefix] && prefixesMapping[prefix] !== uri)) {
            finalPrefix = extractNamespacePrefix(uri, existingPrefixesSet);
            existingPrefixesSet.add(finalPrefix);
            if (prefixesMapping[prefix] && prefixesMapping[prefix] !== uri) {
                debugContext("extractAllNamespaceMappings", `Colisión de prefijo detectada para "${prefix}", usando prefijo único: "${finalPrefix}"`);
            }
        }
        
        if (!prefixesMapping[finalPrefix]) {
            prefixesMapping[finalPrefix] = uri;
            debugContext("extractAllNamespaceMappings", `Agregando namespace adicional al prefixesMapping: "${finalPrefix}" -> "${uri}"`);
        }
        // También asegurar que el namespace tenga tags registrados si no los tiene
        if (!tagsMapping[finalPrefix]) {
            tagsMapping[finalPrefix] = [];
        }
    }
    
    // Agregar tags al namespace correspondiente según su namespace real
    // IMPORTANTE: Solo agregar tags que no estén ya en otro namespace para evitar duplicados
    const allTagsAdded = new Set<string>();
    for (const [nsUri, tags] of xmlBodyResult.tagsByNamespace) {
        // Buscar si ya existe un prefijo para este URI
        let finalPrefix: string | undefined;
        for (const [p, u] of Object.entries(prefixesMapping)) {
            if (u === nsUri) {
                finalPrefix = p;
                break;
            }
        }
        
        // Si no existe, generar uno nuevo
        if (!finalPrefix) {
            finalPrefix = extractNamespacePrefix(nsUri, existingPrefixesSet);
            existingPrefixesSet.add(finalPrefix);
        }
        
        if (!tagsMapping[finalPrefix]) {
            tagsMapping[finalPrefix] = [];
        }
        
        // Agregar tags que no estén ya en el array y que no hayan sido agregados a otro namespace
        const existingTags = new Set(tagsMapping[finalPrefix] || []);
        const tagsToAdd: string[] = [];
        for (const tag of tags) {
            // Solo agregar si no está en este namespace Y no ha sido agregado a otro namespace
            if (!existingTags.has(tag) && !allTagsAdded.has(tag)) {
                tagsToAdd.push(tag);
                allTagsAdded.add(tag);
            }
        }
        
        if (tagsToAdd.length > 0) {
            tagsMapping[finalPrefix]!.push(...tagsToAdd);
            debugContext("extractAllNamespaceMappings", `Agregando ${tagsToAdd.length} tag(s) al namespace "${finalPrefix}" (${nsUri}): ${tagsToAdd.join(', ')}`);
        }
    }
    
    // Solo agregar tags al namespace base si pertenecen al namespace base
    // No agregar tags que ya fueron asignados a otros namespaces
    const baseNamespaceTags = xmlBodyResult.tagsByNamespace.get(baseNamespace);
    if (baseNamespaceTags && baseNamespaceTags.length > 0) {
        if (tagsMapping[baseNamespacePrefix] === undefined) {
            tagsMapping[baseNamespacePrefix] = [];
            prefixesMapping[baseNamespacePrefix] = baseNamespace;
        }
        
        // Agregar solo los tags que pertenecen al namespace base
        const existingTags = new Set(tagsMapping[baseNamespacePrefix] || []);
        for (const tag of baseNamespaceTags) {
            if (!existingTags.has(tag)) {
                tagsMapping[baseNamespacePrefix]!.push(tag);
                existingTags.add(tag);
            }
        }
        debugContext("extractAllNamespaceMappings", `Agregando ${baseNamespaceTags.length} tag(s) al namespace base "${baseNamespacePrefix}"`);
    }
    
    return {
        tagsMapping,
        prefixesMapping,
        typesMapping,
    };
}

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

/**
 * Determina si un elemento debe tener prefijo de namespace
 * Basado en el atributo elementFormDefault del schema
 */
export function shouldHavePrefix(elementObject: any): boolean {
    if (!elementObject || typeof elementObject !== 'object') return false;
    
    // Si el elemento tiene $qualified definido, usarlo
    if ('$qualified' in elementObject && typeof elementObject.$qualified === 'boolean') {
        return elementObject.$qualified;
    }
    
    // Si el elemento tiene un type que es objeto, verificar si tiene $qualified
    if ('type' in elementObject && typeof elementObject.type === 'object' && elementObject.type !== null) {
        const typeObj = elementObject.type;
        if ('$qualified' in typeObj && typeof typeObj.$qualified === 'boolean') {
            return typeObj.$qualified;
        }
    }
    
    // Por defecto, no agregar prefijo (unqualified)
    return false;
}
