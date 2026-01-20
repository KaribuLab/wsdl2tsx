import { toPascalCase, toCamelCase } from "./util.js";

const XML_SCHEMA_TYPES: Record<string, string> = {
    'string': 'string',
    'int': 'number',
    'float': 'number',
    'double': 'number',
    'boolean': 'boolean',
    'date': 'Date',
    'time': 'Date',
    'dateTime': 'Date',
    'duration': 'string',
    'gYearMonth': 'string',
    'gYear': 'string',
    'gMonthDay': 'string',
    'gDay': 'string',
    'gMonth': 'string',
    'gYearDay': 'string',
};

const NAMESPACE_KEY = '$namespace';
const XML_SCHEMA_URI = 'http://www.w3.org/2001/XMLSchema';
const DEFAULT_OCCURS = '1';

interface TypeDefinition {
    type: string | TypeObject;
    maxOccurs?: string;
    minOccurs?: string;
}

interface TypeObject {
    [key: string]: TypeDefinition | string | undefined;
    $namespace?: string;
}

interface NamespaceInfo {
    uri: string;
    prefix: string;
}

interface NamespaceTagsMapping {
    [prefix: string]: string[];
}

interface NamespacePrefixesMapping {
    [prefix: string]: string;
}

interface NamespaceTypesMapping {
    [name: string]: NamespaceInfo;
}

// Cache para memoización de extractNamespacePrefix
const namespacePrefixCache = new Map<string, string>();

// Cache para operaciones de split en strings
const stringSplitCache = new Map<string, string[]>();

// Cache para claves filtradas usando WeakMap (permite garbage collection automática)
const filteredKeysCache = new WeakMap<TypeObject, string[]>();

/**
 * Obtiene las claves de un objeto filtradas (sin NAMESPACE_KEY)
 * Cachea el resultado para evitar múltiples Object.keys() y filtros
 */
function getFilteredKeys(obj: TypeObject | null | undefined): string[] {
    if (!obj || typeof obj !== 'object') return [];
    
    if (filteredKeysCache.has(obj)) {
        return filteredKeysCache.get(obj)!;
    }
    
    const keys = Object.keys(obj).filter(key => key !== NAMESPACE_KEY);
    filteredKeysCache.set(obj, keys);
    return keys;
}

/**
 * Cachea el resultado de split para strings que se usan frecuentemente
 */
export function cachedSplit(str: string, separator: string): string[] {
    // Validar que str sea un string
    if (typeof str !== 'string') {
        return [String(str)];
    }
    const cacheKey = `${str}${separator}`;
    if (stringSplitCache.has(cacheKey)) {
        return stringSplitCache.get(cacheKey)!;
    }
    const result = str.split(separator);
    stringSplitCache.set(cacheKey, result);
    return result;
}

/**
 * Extrae el tipo de esquema XML de una cadena con formato "prefix:type"
 */
function extractXmlSchemaType(type: string | any): string {
    if (typeof type !== 'string') {
        // Si no es un string, intentar extraer el tipo de otra forma
        if (typeof type === 'object' && type !== null) {
            // Si es un objeto, puede ser un tipo complejo
            return 'any';
        }
        return 'string'; // Fallback por defecto
    }
    const parts = cachedSplit(type, ':');
    return parts.length > 1 ? parts[1]! : parts[0]!;
}

/**
 * Determina si una propiedad es opcional o un array basado en minOccurs y maxOccurs
 */
function getTypeModifier(propConfig?: TypeDefinition): string {
    const maxOccurs = propConfig?.maxOccurs ?? DEFAULT_OCCURS;
    const minOccurs = propConfig?.minOccurs ?? DEFAULT_OCCURS;
    
    if (maxOccurs !== DEFAULT_OCCURS) {
        return '[]';
    }
    if (minOccurs !== DEFAULT_OCCURS) {
        return '?';
    }
    return '';
}

/**
 * Crea una propiedad de interfaz TypeScript
 */
function createInterfacePropertyCode(prop: string, props: { type: TypeObject } & Record<string, any>): string {
    const childrenField = props.type[prop]!;
    if (typeof childrenField === 'string') {
        return `\t${toCamelCase(prop)}: string`;
    }
    const xmlSchemaType = extractXmlSchemaType(childrenField.type as string);
    const childrenType = XML_SCHEMA_TYPES[xmlSchemaType] ?? 'string';
    // props[prop] puede tener maxOccurs/minOccurs si existe directamente en props
    const propConfig = props[prop] || childrenField;
    const modifier = getTypeModifier(propConfig);
    
    return `\t${toCamelCase(prop)}: ${childrenType}${modifier}`;
}

/**
 * Filtra propiedades válidas para una interfaz TypeScript
 */
function isValidInterfaceProperty(prop: string, props: Record<string, any>): boolean {
    if (prop.includes('$')) return false;
    if (prop === 'minOccurs' || prop === 'maxOccurs') return false;
    if (prop === NAMESPACE_KEY) return false;
    if (/^[0-9]*$/.test(prop)) return false;
    // En el código original se accede a props[prop]
    // Esta condición filtra propiedades cuyo tipo es un string simple de XML Schema
    // Solo aplica cuando la propiedad está directamente en el nivel superior (no dentro de type)
    // Dentro de interfaces complejas (cuando accedemos a props.type[prop]), estas propiedades SÍ deben incluirse
    const propDef = props[prop];
    if (propDef && typeof propDef.type === 'string' && propDef.type.includes(XML_SCHEMA_URI) && !props.type) {
        return false;
    }
    
    return true;
}

/**
 * Extrae el nombre local de un tipo (después del último ':')
 */
function extractLocalName(fullName: string): string {
    if (fullName.includes(':')) {
        return fullName.split(':').pop()!;
    }
    return fullName;
}

/**
 * Extrae el prefijo de namespace de una URI
 * Optimizado: usa memoización para evitar recalcular el mismo namespace
 * Genera prefijos válidos de JavaScript (solo letras, números, guiones bajos)
 */
function extractNamespacePrefix(namespace: string): string {
    if (namespacePrefixCache.has(namespace)) {
        return namespacePrefixCache.get(namespace)!;
    }
    
    const hasSlash = namespace.indexOf('/') !== -1;
    let namespaceLastPart: string;
    
    if (hasSlash) {
        const parts = cachedSplit(namespace, '/');
        namespaceLastPart = parts[parts.length - 1]!;
    } else {
        namespaceLastPart = namespace;
    }
    
    // Remover puntos y otros caracteres inválidos, tomar primeros caracteres válidos
    const cleanPart = namespaceLastPart.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    // Usar al menos 2 caracteres, máximo 10 para evitar colisiones
    let prefix = cleanPart.slice(0, Math.max(2, Math.min(10, cleanPart.length)));
    
    // Si no hay suficientes caracteres, usar un prefijo genérico basado en hash
    if (prefix.length < 2) {
        // Generar un hash simple del namespace
        let hash = 0;
        for (let i = 0; i < namespace.length; i++) {
            hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
            hash = hash & hash;
        }
        prefix = 'ns' + Math.abs(hash).toString(36).slice(0, 3);
    }
    
    namespacePrefixCache.set(namespace, prefix);
    return prefix;
}


/**
 * Interfaz para los mappings combinados de namespace
 */
export interface CombinedNamespaceMappings {
    tagsMapping: NamespaceTagsMapping
    prefixesMapping: NamespacePrefixesMapping
    typesMapping: NamespaceTypesMapping
}

/**
 * Extrae todos los mappings de namespace en una sola pasada sobre los datos
 * Optimización: combina las tres extracciones (tags, prefixes, types) en una sola iteración
 */
export function extractAllNamespaceMappings(
    baseTypeName: string,
    baseTypeObject: TypeObject
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
    
    const baseNamespacePrefix = extractNamespacePrefix(baseNamespace);
    
    // Extraer nombre local del tipo base
    const baseTypeLocalName = extractLocalName(baseTypeName);
    
    // Inicializar mappings base (usar nombres locales para los tags)
    tagsMapping[baseNamespacePrefix] = [baseTypeLocalName];
    prefixesMapping[baseNamespacePrefix] = baseNamespace;
    typesMapping[baseTypeName] = {
        uri: baseNamespace,
        prefix: baseNamespacePrefix,
    };
    
    const keys = getFilteredKeys(baseTypeObject);
    
    // Función auxiliar recursiva para extraer tags anidados
    const extractNestedTags = (typeObject: TypeObject): string[] => {
        const result: string[] = [];
        const nestedKeys = getFilteredKeys(typeObject);
        
        for (const nestedKey of nestedKeys) {
            const nestedElement = typeObject[nestedKey]!;
            // Siempre agregar el nombre local del tag actual
            const tagLocalName = extractLocalName(nestedKey);
            result.push(tagLocalName);
            
            if (typeof nestedElement === 'object' && nestedElement !== null && typeof nestedElement.type === 'object') {
                // También agregar tags anidados recursivamente
                const nestedTags = extractNestedTags(nestedElement.type as TypeObject);
                result.push(...nestedTags);
            }
        }
        
        return result;
    };
    
    // Función auxiliar recursiva para aplanar claves con información de namespace
    const flattenKeys = (
        typeObject: TypeObject,
        currentNamespace: string,
        currentNamespacePrefix: string
    ): Array<{ name: string; uri: string; prefix: string }> => {
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
                
                const nested = flattenKeys(objElement.type as TypeObject, objNamespace, objNamespacePrefix);
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
    };
    
    // Una sola iteración sobre las claves principales
    for (const key of keys) {
        const element = baseTypeObject[key]!;
        let namespace = key;
        // Extraer nombre local del tag
        const tagLocalName = extractLocalName(key);
        const tagNames = [tagLocalName];
        
        if (typeof element === 'object' && element !== null && typeof element.type === 'object') {
            const elementNamespace = (element.type as TypeObject)[NAMESPACE_KEY];
            if (elementNamespace) {
                namespace = elementNamespace;
                const nestedTags = extractNestedTags(element.type as TypeObject);
                tagNames.push(...nestedTags);
            }
        }
        
        const namespacePrefix = extractNamespacePrefix(namespace);
        
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
    
    // Construir typesMapping usando flattenKeys
    const flatKeys = flattenKeys(baseTypeObject, baseNamespace, baseNamespacePrefix);
    for (const item of flatKeys) {
        typesMapping[item.name] = {
            uri: item.uri,
            prefix: item.prefix,
        };
    }
    
    return {
        tagsMapping,
        prefixesMapping,
        typesMapping,
    };
}

/**
 * Genera el código de declaraciones de namespaces
 */
/**
 * Obtiene el prefijo de namespace para un elemento
 */
function getNamespacePrefix(namespacesTypeMapping: NamespaceTypesMapping, baseNamespacePrefix: string, key: string, parentKey: string | null): string {
    if (parentKey !== null) {
        return namespacesTypeMapping[parentKey]?.prefix ?? baseNamespacePrefix;
    }
    return namespacesTypeMapping[key]?.prefix ?? baseNamespacePrefix;
}

/**
 * Genera el código del template de una propiedad del cuerpo XML
 */
function generateXmlPropertyCode(
    namespacesTypeMapping: NamespaceTypesMapping,
    baseNamespacePrefix: string,
    key: string,
    elementObject: TypeDefinition,
    parentKey: string | null = null,
    propertyPath: string = ''
): string {
    const namespacePrefix = getNamespacePrefix(
        namespacesTypeMapping,
        baseNamespacePrefix,
        key,
        parentKey
    );
    
    // Extraer nombre local del tag
    const tagLocalName = extractLocalName(key);
    const tagCamelCase = toCamelCase(tagLocalName);
    
    // Detectar si es un array basándose en maxOccurs
    const isArray = typeof elementObject === 'object' && elementObject !== null && 
                    'maxOccurs' in elementObject && 
                    elementObject.maxOccurs !== undefined && 
                    elementObject.maxOccurs !== '1' && 
                    elementObject.maxOccurs !== DEFAULT_OCCURS;
    
    // Construir la ruta de propiedad completa
    // Si propertyPath ya termina con el nombre del tag actual, no agregarlo de nuevo
    const currentPropertyPath = propertyPath 
        ? (propertyPath.endsWith(`.${tagCamelCase}`) || propertyPath === tagCamelCase
            ? propertyPath
            : `${propertyPath}.${tagCamelCase}`)
        : tagCamelCase;
    
    if (typeof elementObject === 'object' && elementObject !== null && typeof elementObject.type === 'object') {
        const keys = getFilteredKeys(elementObject.type as TypeObject);
        
        // Si es un array, generar código que itere sobre el array
        if (isArray) {
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
                                'item' // Usar 'item' directamente en lugar de la ruta completa con índice
                            );
                        } else {
                            // Tipo simple dentro del array - usar 'item' directamente
                            const nestedTagLocalName = extractLocalName(elementKey);
                            const nestedTagCamelCase = toCamelCase(nestedTagLocalName);
                            const nestedNamespacePrefix = getNamespacePrefix(
                                namespacesTypeMapping,
                                baseNamespacePrefix,
                                elementKey,
                                key
                            );
                            return `<${nestedNamespacePrefix}.${nestedTagLocalName}>{item.${nestedTagCamelCase}}</${nestedNamespacePrefix}.${nestedTagLocalName}>`;
                        }
                    }
                    return '';
                })
                .filter(Boolean)
                .join('\n');
            
            return `{props.${currentPropertyPath}.map((item, i) => (
    <${namespacePrefix}.${tagLocalName}>
    ${nestedProperties}
    </${namespacePrefix}.${tagLocalName}>
))}`;
        } else {
            // No es un array, generar código normal
            const nestedProperties = keys
                .map(elementKey => {
                    const nestedElement = (elementObject.type as TypeObject)[elementKey]!;
                    if (typeof nestedElement === 'object' && nestedElement !== null) {
                        return generateXmlPropertyCode(
                            namespacesTypeMapping,
                            baseNamespacePrefix,
                            elementKey,
                            nestedElement as TypeDefinition,
                            key,
                            currentPropertyPath
                        );
                    }
                    return '';
                })
                .filter(Boolean)
                .join('\n');
            
            return `<${namespacePrefix}.${tagLocalName}>
    ${nestedProperties}
    </${namespacePrefix}.${tagLocalName}>`;
        }
    }
    
    // Para tipos simples, usar la ruta completa de la propiedad
    return `<${namespacePrefix}.${tagLocalName}>{props.${currentPropertyPath}}</${namespacePrefix}.${tagLocalName}>`;
}

/**
 * Genera el código del cuerpo XML principal
 */
export function generateXmlBodyCode(baseNamespacePrefix: string, namespacesTypeMapping: NamespaceTypesMapping, baseTypeName: string, baseTypeObject: TypeObject, propsInterfaceName?: string): string {
    const keys = getFilteredKeys(baseTypeObject);
    // Extraer nombre local del tipo base
    const baseTypeLocalName = extractLocalName(baseTypeName);
    
    // Determinar la ruta inicial de propiedades basándose en la interfaz de props
    // Si hay una propiedad principal en la interfaz de props, usarla como punto de partida
    const initialPropertyPath = propsInterfaceName ? toCamelCase(propsInterfaceName) : '';
    
    const properties = keys
        .map(key => {
            const element = baseTypeObject[key]!;
            if (typeof element === 'object' && element !== null) {
                const keyLocalName = extractLocalName(key);
                const keyCamelCase = toCamelCase(keyLocalName);
                
                // Si la clave actual coincide con propsInterfaceName, no agregarlo de nuevo a la ruta
                // Solo usar initialPropertyPath si no coincide
                const propertyPath = (initialPropertyPath && keyCamelCase === initialPropertyPath) 
                    ? initialPropertyPath 
                    : (initialPropertyPath 
                        ? `${initialPropertyPath}.${keyCamelCase}` 
                        : keyCamelCase);
                
                return generateXmlPropertyCode(
                    namespacesTypeMapping,
                    baseNamespacePrefix,
                    key,
                    element as TypeDefinition,
                    null,
                    propertyPath
                );
            }
            return '';
        })
        .filter(Boolean)
        .join('\n');
    
    return `<${baseNamespacePrefix}.${baseTypeLocalName}>
    ${properties}
</${baseNamespacePrefix}.${baseTypeLocalName}>`;
}

// ============================================================================
// Funciones para preparar datos estructurados para Handlebars
// ============================================================================

export interface SimpleTypeData {
    name: string;
    tsType: string;
}

export interface PropertyData {
    name: string;
    type: string;
    modifier: string;
}

export interface InterfaceData {
    name: string;
    properties: PropertyData[];
}

export interface PropsInterfaceData {
    name: string;
    properties: Array<{ name: string; type: string }>;
}

export interface TemplateData {
    requestType: string;
    namespaces: NamespaceTagsMapping;
    simpleTypes: SimpleTypeData[];
    propsInterface: PropsInterfaceData;
    interfaces: InterfaceData[];
    soapNamespaceURI: string;
    xmlnsAttributes: NamespacePrefixesMapping;
    xmlBody: string;
}

/**
 * Prepara datos de tipos simples para el template
 */
export function prepareSimpleTypesData(typeObject: TypeObject, xmlSchemaUri: string): SimpleTypeData[] {
    return Object.keys(typeObject)
        .filter(key => {
            if (key === NAMESPACE_KEY) return false;
            const typeDef = typeObject[key]!;
            return typeof typeDef === 'string' || (typeof typeDef === 'object' && typeDef !== null && typeof typeDef.type === 'string' && typeDef.type.includes(xmlSchemaUri));
        })
        .map(key => {
            const typeDef = typeObject[key]!;
            const typeValue = typeof typeDef === 'string' ? typeDef : (typeDef.type as string);
            return {
                name: key,
                tsType: 'string',
            };
        });
}

/**
 * Prepara datos de la interfaz de props para el template
 */
export function preparePropsInterfaceData(typeName: string, typeObject: TypeObject, allTypesForInterfaces?: TypeObject): PropsInterfaceData {
    const keys = getFilteredKeys(typeObject);
    // Usar nombres locales para las propiedades y determinar el tipo correcto
    const properties = keys.map(key => {
        const localName = extractLocalName(key);
        const element = typeObject[key]!;
        
        let propertyType: string;
        
        if (typeof element === 'string') {
            // Tipo simple (xsd:string, etc.)
            const xmlSchemaType = extractXmlSchemaType(element);
            propertyType = XML_SCHEMA_TYPES[xmlSchemaType] ?? 'string';
        } else if (typeof element === 'object' && element !== null) {
            // Tipo complejo
            if ('type' in element && typeof (element as any).type === 'string') {
                // Tipo referenciado por string (ej: "tns2:CodigoPlanListTO")
                propertyType = resolveTypeName((element as any).type, localName, allTypesForInterfaces);
            } else {
                // Tipo complejo inline - usar el nombre local en PascalCase como tipo de interfaz
                propertyType = toPascalCase(localName);
            }
        } else {
            propertyType = 'any';
        }
        
        return {
            name: localName,
            type: propertyType,
        };
    });
    
    // Usar nombre local para el tipo
    return {
        name: extractLocalName(typeName),
        properties,
    };
}

/**
 * Prepara datos de una interfaz TypeScript para el template
 */
export function prepareInterfaceData(interfaceName: string, interfaceDefinition: { type: TypeObject } & Record<string, any>, allTypesForInterfaces?: TypeObject): InterfaceData {
    const keys = Object.keys(interfaceDefinition.type);
    const properties = keys
        .filter(prop => isValidInterfaceProperty(prop, interfaceDefinition))
        .map(prop => {
            const childrenField = interfaceDefinition.type[prop]!;
            
            let propertyType: string;
            let modifier: string;

            if (typeof childrenField === 'string') {
                // Direct string type (e.g., "xsd:string")
                const xmlSchemaType = extractXmlSchemaType(childrenField);
                propertyType = XML_SCHEMA_TYPES[xmlSchemaType] ?? 'string';
                modifier = '';
            } else if (typeof childrenField === 'object' && childrenField !== null) {
                // Nested complex type
                if ('type' in childrenField && typeof childrenField.type === 'string') {
                    // Tipo referenciado por string (ej: "tns2:CodigoPlanListTO" o "xsd:string")
                    // Usar resolveTypeName que maneja tanto tipos simples como complejos
                    propertyType = resolveTypeName(childrenField.type, prop, allTypesForInterfaces);
                } else {
                    // It's a nested object, so it's an inline complex type definition
                    // Intentar buscar el tipo correcto en allTypesForInterfaces basándose en el nombre de la propiedad
                    const propPascalCase = toPascalCase(prop);
                    if (allTypesForInterfaces) {
                        // Buscar un tipo que coincida con el nombre de la propiedad o que contenga el nombre
                        const matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => {
                            const kLocalName = extractLocalName(k);
                            // Buscar coincidencia exacta o parcial (ej: "CodigoPlanList" -> "CodigoPlanListTO")
                            return kLocalName === propPascalCase || 
                                   kLocalName.startsWith(propPascalCase) || 
                                   propPascalCase.startsWith(kLocalName);
                        });
                        
                        if (matchingTypeKey) {
                            propertyType = toPascalCase(extractLocalName(matchingTypeKey));
                            console.log(`[DEBUG] prepareInterfaceData: Tipo anidado '${prop}' resuelto a '${propertyType}' desde allTypesForInterfaces`);
                        } else {
                            propertyType = propPascalCase; // Fallback al nombre de la propiedad
                            console.log(`[DEBUG] prepareInterfaceData: Tipo anidado '${prop}' no encontrado en allTypesForInterfaces, usando '${propertyType}'`);
                        }
                    } else {
                        propertyType = propPascalCase; // Fallback al nombre de la propiedad
                    }
                }
                const propConfig = interfaceDefinition[prop] || childrenField;
                modifier = getTypeModifier(propConfig);
            } else {
                propertyType = 'any';
                modifier = '';
            }
            
            return {
                name: prop,
                type: propertyType,
                modifier,
            };
        });
    
    return {
        name: interfaceName,
        properties,
    };
}

/**
 * Extrae recursivamente todos los tipos complejos anidados de un TypeObject
 */
function extractNestedComplexTypes(
    typeObject: TypeObject,
    namespaceKey: string,
    xmlSchemaUri: string,
    visited: Set<string> = new Set()
): Array<{ interfaceName: string; typeObject: TypeObject }> {
    const result: Array<{ interfaceName: string; typeObject: TypeObject }> = [];
    const keys = getFilteredKeys(typeObject);
    
    for (const key of keys) {
        const typeDef = typeObject[key]!;
        
        // Si es un objeto con estructura { type: ..., maxOccurs: ..., minOccurs: ... }
        if (typeof typeDef === 'object' && typeDef !== null && 'type' in typeDef) {
            const typeValue = (typeDef as any).type;
            
            // Verificar si type es un objeto (tipo complejo anidado)
            if (typeof typeValue === 'object' && typeValue !== null) {
                // Verificar que no sea un tipo simple de XML Schema
                const isSimpleType = typeof typeValue === 'string' && typeValue.includes(xmlSchemaUri);
                
                if (!isSimpleType) {
                    // Verificar que el objeto type tenga propiedades (no solo $namespace)
                    const typeKeys = Object.keys(typeValue).filter(k => k !== '$namespace' && k !== '$base');
                    if (typeKeys.length > 0) {
                        // Usar el nombre de la propiedad en PascalCase como nombre de interfaz
                        const interfaceName = toPascalCase(extractLocalName(key));
                        
                        // Evitar procesar el mismo tipo dos veces usando el nombre de la interfaz
                        if (visited.has(interfaceName)) continue;
                        visited.add(interfaceName);
                        
                        result.push({ interfaceName, typeObject: typeValue as TypeObject });
                        
                        // Recursivamente extraer tipos complejos anidados dentro de este tipo
                        const nestedTypes = extractNestedComplexTypes(
                            typeValue as TypeObject,
                            namespaceKey,
                            xmlSchemaUri,
                            visited
                        );
                        result.push(...nestedTypes);
                    }
                }
            }
        }
    }
    
    return result;
}

/**
 * Prepara datos de todas las interfaces para el template
 */
export function prepareInterfacesData(requestTypeObject: TypeObject, namespaceKey: string, xmlSchemaUri: string, allTypesForInterfaces?: TypeObject): InterfaceData[] {
    console.log('[DEBUG] prepareInterfacesData: Iniciando generación de interfaces...');
    const visited = new Set<string>();
    const interfaces: InterfaceData[] = [];
    
    const allKeys = Object.keys(requestTypeObject).filter(k => k !== namespaceKey);
    console.log(`[DEBUG] prepareInterfacesData: Total de claves en requestTypeObject: ${allKeys.length}`);
    console.log(`[DEBUG] prepareInterfacesData: Claves encontradas: ${allKeys.slice(0, 10).join(', ')}${allKeys.length > 10 ? '...' : ''}`);
    
    // Extraer todos los tipos complejos anidados recursivamente
    console.log('[DEBUG] prepareInterfacesData: Extrayendo tipos complejos anidados...');
    const allComplexTypes = extractNestedComplexTypes(requestTypeObject, namespaceKey, xmlSchemaUri, visited);
    console.log(`[DEBUG] prepareInterfacesData: Tipos complejos anidados encontrados: ${allComplexTypes.length}`);
    if (allComplexTypes.length > 0) {
        console.log(`[DEBUG] prepareInterfacesData: Lista de tipos anidados: ${allComplexTypes.map(t => t.interfaceName).join(', ')}`);
    }
    
    // También incluir los tipos del nivel superior que son tipos complejos
    const topLevelKeys = Object.keys(requestTypeObject)
        .filter(key => {
            if (key === namespaceKey) return false;
            const typeDef = requestTypeObject[key]!;
            // Incluir si es un objeto con type que es objeto (tipo complejo)
            if (typeof typeDef === 'object' && typeDef !== null && 'type' in typeDef) {
                const typeValue = (typeDef as any).type;
                if (typeof typeValue === 'object' && typeValue !== null) {
                    // Verificar que tenga propiedades además de $namespace
                    const typeKeys = Object.keys(typeValue).filter(k => k !== '$namespace' && k !== '$base');
                    return typeKeys.length > 0;
                }
            }
            return false;
        });
    
    console.log(`[DEBUG] prepareInterfacesData: Tipos del nivel superior encontrados: ${topLevelKeys.length}`);
    if (topLevelKeys.length > 0) {
        console.log(`[DEBUG] prepareInterfacesData: Lista de tipos nivel superior: ${topLevelKeys.map(k => extractLocalName(k)).join(', ')}`);
    }
    
    // Procesar tipos del nivel superior
    for (const key of topLevelKeys) {
        const localName = extractLocalName(key);
        if (!visited.has(localName)) {
            visited.add(localName);
            console.log(`[DEBUG] prepareInterfacesData: Generando interfaz para tipo nivel superior: ${localName}`);
            interfaces.push(prepareInterfaceData(localName, requestTypeObject[key] as any, allTypesForInterfaces));
            
            // También buscar tipos anidados dentro de este tipo del nivel superior
            const nestedTypes = extractNestedComplexTypes(
                (requestTypeObject[key] as any).type as TypeObject,
                namespaceKey,
                xmlSchemaUri,
                visited
            );
            for (const { interfaceName, typeObject } of nestedTypes) {
                if (!visited.has(interfaceName)) {
                    visited.add(interfaceName);
                    console.log(`[DEBUG] prepareInterfacesData: Generando interfaz para tipo anidado: ${interfaceName}`);
                    interfaces.push(prepareInterfaceData(interfaceName, { type: typeObject } as any, allTypesForInterfaces));
                }
            }
        }
    }
    
    // Procesar tipos complejos anidados encontrados recursivamente
    for (const { interfaceName, typeObject } of allComplexTypes) {
        if (!visited.has(interfaceName)) {
            visited.add(interfaceName);
            console.log(`[DEBUG] prepareInterfacesData: Generando interfaz para tipo complejo anidado: ${interfaceName}`);
            interfaces.push(prepareInterfaceData(interfaceName, { type: typeObject } as any, allTypesForInterfaces));
        } else {
            console.log(`[DEBUG] prepareInterfacesData: Tipo ${interfaceName} ya procesado (omitido)`);
            // Aunque esté marcado como visitado, verificar si realmente se generó la interfaz
            // Si no está en la lista de interfaces generadas, procesarlo de nuevo
            const alreadyGenerated = interfaces.some(i => i.name === interfaceName);
            if (!alreadyGenerated) {
                console.log(`[DEBUG] prepareInterfacesData: Tipo ${interfaceName} estaba marcado como visitado pero no se generó, generándolo ahora`);
                interfaces.push(prepareInterfaceData(interfaceName, { type: typeObject } as any, allTypesForInterfaces));
            }
        }
    }
    
    // IMPORTANTE: También procesar todos los tipos complejos que están directamente en requestTypeObject
    // pero que no fueron procesados como tipos del nivel superior (porque tienen nombres completos con namespace)
    const remainingKeys = Object.keys(requestTypeObject)
        .filter(key => {
            if (key === namespaceKey) return false;
            // Solo procesar si es un complexType (tiene estructura de tipo complejo)
            const typeDef = requestTypeObject[key]!;
            if (typeof typeDef === 'object' && typeDef !== null) {
                // Si es un objeto con type que es objeto, es un tipo complejo
                if ('type' in typeDef && typeof (typeDef as any).type === 'object') {
                    const localName = extractLocalName(key);
                    return !visited.has(localName);
                }
                // Si es directamente un tipo complejo (sin wrapper type), también procesarlo
                const keys = Object.keys(typeDef).filter(k => k !== '$namespace' && k !== '$base');
                if (keys.length > 0) {
                    const localName = extractLocalName(key);
                    return !visited.has(localName);
                }
            }
            return false;
        });
    
    console.log(`[DEBUG] prepareInterfacesData: Tipos restantes a procesar: ${remainingKeys.length}`);
    for (const key of remainingKeys) {
        const localName = extractLocalName(key);
        if (!visited.has(localName)) {
            visited.add(localName);
            const typeDef = requestTypeObject[key]!;
            console.log(`[DEBUG] prepareInterfacesData: Generando interfaz para tipo restante: ${localName}`);
            
            // Preparar la estructura correcta para prepareInterfaceData
            if (typeof typeDef === 'object' && typeDef !== null && 'type' in typeDef && typeof (typeDef as any).type === 'object') {
                interfaces.push(prepareInterfaceData(localName, typeDef as any, allTypesForInterfaces));
            } else if (typeof typeDef === 'object' && typeDef !== null) {
                // Es un tipo complejo directo
                interfaces.push(prepareInterfaceData(localName, { type: typeDef } as any, allTypesForInterfaces));
            }
        }
    }
    
    // IMPORTANTE: También procesar tipos en allTypesForInterfaces que no están en requestTypeObject
    // Esto asegura que se generen interfaces para tipos como PlanTO que están referenciados pero no directamente en requestTypeObject
    if (allTypesForInterfaces) {
        const allTypesKeys = Object.keys(allTypesForInterfaces).filter(k => k !== namespaceKey && k !== '$namespace');
        const missingKeys = allTypesKeys.filter(key => {
            const localName = extractLocalName(key);
            return !visited.has(localName);
        });
        
        console.log(`[DEBUG] prepareInterfacesData: Tipos en allTypesForInterfaces no procesados: ${missingKeys.length}`);
        for (const key of missingKeys) {
            const localName = extractLocalName(key);
            if (!visited.has(localName)) {
                visited.add(localName);
                const typeDef = allTypesForInterfaces[key]!;
                console.log(`[DEBUG] prepareInterfacesData: Generando interfaz para tipo en allTypesForInterfaces: ${localName}`);
                
                // Verificar que sea un tipo complejo antes de procesarlo
                if (typeof typeDef === 'object' && typeDef !== null) {
                    // Si es un objeto con type que es objeto, es un tipo complejo
                    if ('type' in typeDef && typeof (typeDef as any).type === 'object') {
                        const typeValue = (typeDef as any).type;
                        const typeKeys = Object.keys(typeValue).filter(k => k !== '$namespace' && k !== '$base');
                        if (typeKeys.length > 0) {
                            interfaces.push(prepareInterfaceData(localName, typeDef as any, allTypesForInterfaces));
                        }
                    } else {
                        // Es directamente un tipo complejo (sin wrapper type)
                        const keys = Object.keys(typeDef).filter(k => k !== '$namespace' && k !== '$base');
                        if (keys.length > 0) {
                            interfaces.push(prepareInterfaceData(localName, { type: typeDef } as any, allTypesForInterfaces));
                        }
                    }
                }
            }
        }
    }
    
    console.log(`[DEBUG] prepareInterfacesData: Total de interfaces generadas: ${interfaces.length}`);
    if (interfaces.length > 0) {
        console.log(`[DEBUG] prepareInterfacesData: Lista de interfaces: ${interfaces.map(i => i.name).join(', ')}`);
    }
    
    return interfaces;
}

/**
 * Resuelve el nombre de interfaz correcto para un tipo referenciado
 * Busca en allTypesForInterfaces el tipo que corresponde al tipo referenciado
 */
function resolveTypeName(
    referencedType: string,
    propName: string,
    allTypesForInterfaces?: TypeObject
): string {
    console.log(`[DEBUG] resolveTypeName: Resolviendo tipo '${referencedType}' para propiedad '${propName}'`);
    
    // Verificar primero si es un tipo simple de XML Schema
    // Si referencedType contiene "xsd:" o "http://www.w3.org/2001/XMLSchema", es un tipo simple
    const isXsdType = referencedType.includes('xsd:');
    const isXmlSchemaType = referencedType.includes('http://www.w3.org/2001/XMLSchema');
    console.log(`[DEBUG] resolveTypeName: isXsdType=${isXsdType}, isXmlSchemaType=${isXmlSchemaType}`);
    
    if (isXsdType || isXmlSchemaType) {
        // Extraer el nombre del tipo correctamente
        let xmlSchemaType: string;
        if (referencedType.includes('xsd:')) {
            // Formato: "xsd:string"
            xmlSchemaType = referencedType.split('xsd:')[1] || referencedType.split(':').pop() || 'string';
        } else {
            // Formato: "http://www.w3.org/2001/XMLSchema:string"
            // Tomar la parte después del último ":"
            xmlSchemaType = referencedType.split(':').pop() || 'string';
        }
        
        if (XML_SCHEMA_TYPES[xmlSchemaType]) {
            console.log(`[DEBUG] resolveTypeName: '${referencedType}' es un tipo simple XML Schema (${xmlSchemaType}) -> '${XML_SCHEMA_TYPES[xmlSchemaType]}'`);
            return XML_SCHEMA_TYPES[xmlSchemaType];
        } else {
            console.log(`[DEBUG] resolveTypeName: '${referencedType}' parece ser XML Schema pero tipo '${xmlSchemaType}' no está mapeado, usando 'string' como fallback`);
            return 'string'; // Fallback para tipos XML Schema no mapeados
        }
    }
    
    // Si referencedType es un string que referencia un tipo complejo, buscar su nombre real
    if (allTypesForInterfaces && typeof referencedType === 'string') {
        // Buscar el tipo completo en allTypesForInterfaces
        // Primero buscar coincidencia exacta
        let matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => k === referencedType);
        
        // Si no hay coincidencia exacta, buscar por nombre local
        if (!matchingTypeKey) {
            const referencedLocalName = referencedType.split(':').pop()!;
            matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => {
                const kLocalName = k.split(':').pop();
                return kLocalName === referencedLocalName;
            });
        }
        
        // También buscar por coincidencia parcial (endsWith)
        if (!matchingTypeKey) {
            matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => 
                k.endsWith(':' + referencedType.split(':').pop())
            );
        }
        
        // Buscar por coincidencia parcial en el nombre local (ej: "CodigoPlanList" -> "CodigoPlanListTO")
        if (!matchingTypeKey) {
            const referencedLocalName = referencedType.split(':').pop()!;
            matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => {
                const kLocalName = k.split(':').pop();
                // Buscar si el nombre local referenciado es un prefijo del nombre local encontrado
                // o viceversa (ej: "CodigoPlanList" debería encontrar "CodigoPlanListTO")
                return kLocalName && (
                    kLocalName.startsWith(referencedLocalName) || 
                    referencedLocalName.startsWith(kLocalName)
                );
            });
        }
        
        if (matchingTypeKey) {
            // Usar el nombre local del tipo encontrado en PascalCase
            const resolvedName = toPascalCase(extractLocalName(matchingTypeKey));
            console.log(`[DEBUG] resolveTypeName: '${referencedType}' encontrado como '${matchingTypeKey}' -> '${resolvedName}'`);
            return resolvedName;
        } else {
            console.log(`[DEBUG] resolveTypeName: '${referencedType}' no encontrado en allTypesForInterfaces. Claves disponibles: ${Object.keys(allTypesForInterfaces).slice(0, 5).join(', ')}...`);
        }
    }
    
    // Si no se encuentra, usar el nombre de la propiedad en PascalCase como fallback
    const fallbackName = toPascalCase(propName);
    console.log(`[DEBUG] resolveTypeName: Usando fallback '${fallbackName}' para '${referencedType}'`);
    return fallbackName;
}

/**
 * Prepara todos los datos para el template Handlebars
 */
export function prepareTemplateData(
    requestType: string,
    requestTypeObject: TypeObject,
    namespacesTagsMapping: NamespaceTagsMapping,
    namespacesPrefixMapping: NamespacePrefixesMapping,
    namespacesTypeMapping: NamespaceTypesMapping,
    soapNamespaceURI: string,
    baseNamespacePrefix: string,
    allTypesForInterfaces?: TypeObject // Opcional: tipos adicionales para generar interfaces
): TemplateData {
    const simpleTypes = prepareSimpleTypesData(requestTypeObject, XML_SCHEMA_URI);
    const propsInterface = preparePropsInterfaceData(requestType, requestTypeObject, allTypesForInterfaces);
    
    // Para interfaces, usar allTypesForInterfaces si está disponible, sino usar requestTypeObject
    const typesForInterfaces = allTypesForInterfaces || requestTypeObject;
    const interfaces = prepareInterfacesData(typesForInterfaces, NAMESPACE_KEY, XML_SCHEMA_URI, allTypesForInterfaces);
    
    // Obtener el nombre de la propiedad principal de la interfaz de props para usarlo como punto de partida en las rutas XML
    const mainPropName = propsInterface.properties.length > 0 ? propsInterface.properties[0].name : undefined;
    const xmlBody = generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, requestType, requestTypeObject, mainPropName);
    
    // Usar nombre local del requestType para el template
    const requestTypeLocalName = extractLocalName(requestType);
    
    return {
        requestType: requestTypeLocalName,
        namespaces: namespacesTagsMapping,
        simpleTypes,
        propsInterface,
        interfaces,
        soapNamespaceURI,
        xmlnsAttributes: namespacesPrefixMapping,
        xmlBody,
    };
}
