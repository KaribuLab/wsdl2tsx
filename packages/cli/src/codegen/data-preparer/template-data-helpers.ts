import { toPascalCase, toCamelCase } from "../../util.js";
import { extractLocalName } from "../utils.js";
import { generateXmlBodyCode } from "../xml-generator/index.js";
import { extractAllNamespaceMappings } from "../namespaces.js";
import { preparePropsInterfaceData } from "./props-interface.js";
import { prepareSimpleTypesData } from "./simple-types.js";
import { prepareInterfacesData } from "./interface.js";
import { NAMESPACE_KEY, XML_SCHEMA_URI } from "../constants.js";
import { warn, debugContext } from "../../logger.js";
import type { HeaderData, NamespacePrefixesMapping, NamespaceTagsMapping, NamespaceTypesMapping, PropsInterfaceData, InterfaceData, TypeObject } from "../types.js";

/**
 * Procesa headers y actualiza los mappings de namespaces
 */
export function processHeaders(
    headersInfo: Array<{ partName: string; elementName: string; headerType: string }>,
    schemaObject: any,
    allTypesForInterfaces: TypeObject | undefined,
    allComplexTypes: any,
    baseNamespacePrefix: string,
    namespacesTypeMapping: NamespaceTypesMapping,
    namespacesTagsMapping: NamespaceTagsMapping,
    namespacesPrefixMapping: NamespacePrefixesMapping,
    propsInterface: PropsInterfaceData
): HeaderData[] {
    const headers: HeaderData[] = [];
    
    if (headersInfo && headersInfo.length > 0) {
        debugContext("processHeaders", `Procesando ${headersInfo.length} header(s): ${headersInfo.map(h => h.headerType).join(', ')}`);
        
        for (const headerInfo of headersInfo) {
            debugContext("processHeaders", `Buscando tipo de header: "${headerInfo.headerType}"`);
            const headerTypeObject = schemaObject[headerInfo.headerType] as any;
            
            if (!headerTypeObject) {
                warn(`⚠️  No se encontró el tipo de header ${headerInfo.headerType}, se omite`);
                continue;
            }
            
            debugContext("processHeaders", `✓ Header "${headerInfo.headerType}" encontrado y procesado`);
            
            // Asegurar que el objeto tenga $namespace
            if (!headerTypeObject['$namespace'] && schemaObject['$namespace']) {
                headerTypeObject['$namespace'] = schemaObject['$namespace'];
            }
            
            // Si todavía no tiene $namespace, intentar obtenerlo del nombre del tipo
            if (!headerTypeObject['$namespace']) {
                // El nombre del tipo puede tener formato "namespace:localName" o solo "localName"
                if (headerInfo.headerType.includes(':')) {
                    const [namespaceUri] = headerInfo.headerType.split(':');
                    if (namespaceUri.startsWith('http://') || namespaceUri.startsWith('https://')) {
                        headerTypeObject['$namespace'] = namespaceUri;
                    }
                }
            }
            
            if (!headerTypeObject['$namespace']) {
                warn(`⚠️  El tipo de header ${headerInfo.headerType} no tiene namespace definido, se omite`);
                continue;
            }
            
            // Extraer mappings de namespace para el header
            const headerNamespaceMappings = extractAllNamespaceMappings(headerInfo.headerType, headerTypeObject, schemaObject, allComplexTypes);
            const headerNamespacePrefix = headerNamespaceMappings.typesMapping[headerInfo.headerType]?.prefix || baseNamespacePrefix;
            
            // Generar código XML para el header usando el nombre del part como prefijo para las props
            const headerPartNameCamelCase = toCamelCase(extractLocalName(headerInfo.partName));
            const headerXmlCode = generateXmlBodyCode(
                headerNamespacePrefix,
                namespacesTypeMapping,
                headerInfo.headerType,
                headerTypeObject,
                headerPartNameCamelCase,
                schemaObject,
                allComplexTypes
            );
            
            // Preparar interfaz de props para el header
            const headerPropsInterface = preparePropsInterfaceData(
                headerInfo.headerType,
                headerTypeObject,
                allTypesForInterfaces,
                schemaObject,
                allComplexTypes
            );
            
            // Agregar el tipo del header a allTypesForInterfaces para que se genere su interfaz
            if (allTypesForInterfaces && !allTypesForInterfaces[headerInfo.headerType]) {
                allTypesForInterfaces[headerInfo.headerType] = headerTypeObject;
            }
            
            // Agregar los namespaces del header a los mappings si no existen
            mergeNamespaceMappings(
                headerNamespaceMappings,
                namespacesTagsMapping,
                namespacesPrefixMapping
            );
            
            headers.push({
                partName: headerInfo.partName,
                elementName: headerInfo.elementName,
                headerType: headerInfo.headerType,
                headerTypeObject,
                xmlCode: headerXmlCode
            });
            
            // Agregar propiedades del header a la interfaz de props principal
            const headerLocalName = extractLocalName(headerInfo.partName);
            const headerTypeLocalName = extractLocalName(headerInfo.headerType);
            propsInterface.properties.push({
                name: headerLocalName,
                type: toPascalCase(headerTypeLocalName)
            });
        }
    }
    
    return headers;
}

/**
 * Fusiona mappings de namespaces de headers en los mappings principales
 */
function mergeNamespaceMappings(
    headerNamespaceMappings: { tagsMapping: NamespaceTagsMapping; prefixesMapping: NamespacePrefixesMapping },
    namespacesTagsMapping: NamespaceTagsMapping,
    namespacesPrefixMapping: NamespacePrefixesMapping
): void {
    // Agregar los namespaces del header a los mappings si no existen
    for (const [prefix, uri] of Object.entries(headerNamespaceMappings.prefixesMapping)) {
        if (!namespacesPrefixMapping[prefix]) {
            namespacesPrefixMapping[prefix] = uri;
        }
    }
    
    // Agregar los tags del header a los mappings si no existen
    for (const [prefix, tags] of Object.entries(headerNamespaceMappings.tagsMapping)) {
        if (!namespacesTagsMapping[prefix]) {
            namespacesTagsMapping[prefix] = tags;
        } else {
            // Agregar tags que no existan
            const existingTags = new Set(namespacesTagsMapping[prefix]);
            for (const tag of tags) {
                if (!existingTags.has(tag)) {
                    namespacesTagsMapping[prefix].push(tag);
                }
            }
        }
    }
}

/**
 * Procesa response y genera interfaces correspondientes
 */
export function processResponse(
    responseType: string,
    responseTypeObject: TypeObject,
    responseAllTypesForInterfaces: TypeObject | undefined,
    allTypesForInterfaces: TypeObject | undefined,
    schemaObject: any,
    allComplexTypes: any,
    existingInterfaces: InterfaceData[]
): { responsePropsInterface: PropsInterfaceData; responseInterfaces: InterfaceData[] } {
    debugContext("processResponse", `Procesando response tipo: "${responseType}"`);
    
    // Preparar interfaz de props para el response
    const responsePropsInterface = preparePropsInterfaceData(
        responseType,
        responseTypeObject,
        responseAllTypesForInterfaces || allTypesForInterfaces,
        schemaObject,
        allComplexTypes
    );
    
    // Preparar interfaces para el response
    // IMPORTANTE: Usar responseAllTypesForInterfaces como base (similar a como se hace para request)
    // para incluir todos los tipos referenciados del response
    const responseTypesForInterfaces = responseAllTypesForInterfaces || responseTypeObject;
    const responseSimpleTypeNames = new Set(
        prepareSimpleTypesData(responseTypeObject, XML_SCHEMA_URI).map(st => {
            const localName = extractLocalName(st.name);
            return toPascalCase(localName);
        })
    );
    
    const responseInterfaces = prepareInterfacesData(
        responseTypesForInterfaces,
        NAMESPACE_KEY,
        XML_SCHEMA_URI,
        responseAllTypesForInterfaces || allTypesForInterfaces,
        responseSimpleTypeNames
    );
    
    // Agregar también los tipos del response a las interfaces principales si no están ya
    const existingInterfaceNames = new Set(existingInterfaces.map(i => i.name));
    let addedCount = 0;
    
    for (const responseInterface of responseInterfaces) {
        if (!existingInterfaceNames.has(responseInterface.name)) {
            debugContext("processResponse", `Agregando interfaz de response: "${responseInterface.name}"`);
            existingInterfaces.push(responseInterface);
            addedCount++;
        }
    }
    
    debugContext("processResponse", `✓ Response procesado: ${responseInterfaces.length} interfaz(es) generada(s), ${addedCount} nueva(s) agregada(s)`);
    
    return { responsePropsInterface, responseInterfaces };
}

/**
 * Prepara typesForInterfaces incluyendo tipos de headers si existen
 */
export function prepareTypesForInterfaces(
    requestTypeObject: TypeObject,
    headersInfo: Array<{ partName: string; elementName: string; headerType: string }> | undefined,
    allTypesForInterfaces: TypeObject | undefined
): TypeObject {
    const typesForInterfaces = { ...requestTypeObject };
    
    if (headersInfo && headersInfo.length > 0 && allTypesForInterfaces) {
        for (const headerInfo of headersInfo) {
            if (allTypesForInterfaces[headerInfo.headerType] && !typesForInterfaces[headerInfo.headerType]) {
                typesForInterfaces[headerInfo.headerType] = allTypesForInterfaces[headerInfo.headerType];
            }
        }
    }
    
    return typesForInterfaces;
}
