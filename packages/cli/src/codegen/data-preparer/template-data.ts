import { toPascalCase, toCamelCase } from "../../util.js";
import { NAMESPACE_KEY, XML_SCHEMA_URI } from "../constants.js";
import type { HeaderData, NamespacePrefixesMapping, NamespaceTagsMapping, NamespaceTypesMapping, TemplateData, TypeObject } from "../types.js";
import { extractLocalName } from "../utils.js";
import { generateXmlBodyCode } from "../xml-generator/index.js";
import { extractAllNamespaceMappings } from "../namespaces.js";
import { prepareSimpleTypesData } from "./simple-types.js";
import { preparePropsInterfaceData } from "./props-interface.js";
import { prepareInterfacesData } from "./interface.js";

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
    allTypesForInterfaces?: TypeObject, // Opcional: tipos adicionales para generar interfaces
    schemaObject?: any, // Opcional: schemaObject completo para resolver referencias
    allComplexTypes?: any, // Opcional: allComplexTypes para resolver tipos complejos referenciados
    headersInfo?: Array<{ partName: string; elementName: string; headerType: string }> // Opcional: información de headers
): TemplateData {
    const simpleTypes = prepareSimpleTypesData(requestTypeObject, XML_SCHEMA_URI);
    const propsInterface = preparePropsInterfaceData(requestType, requestTypeObject, allTypesForInterfaces, schemaObject, allComplexTypes);
    
    // Para interfaces, usar allTypesForInterfaces si está disponible, sino usar requestTypeObject
    // IMPORTANTE: Usar requestTypeObject como base para evitar incluir interfaces de otras operaciones
    // allTypesForInterfaces solo debe contener tipos referenciados por la operación actual
    const typesForInterfaces = requestTypeObject; // Usar requestTypeObject como base, no allTypesForInterfaces completo
    
    // Crear un Set con los nombres de los tipos simples para filtrarlos de las interfaces
    // Usar el nombre local en PascalCase para comparación consistente
    const simpleTypeNames = new Set(simpleTypes.map(st => {
        const localName = extractLocalName(st.name);
        return toPascalCase(localName);
    }));
    
    // Procesar headers si existen ANTES de generar las interfaces
    // para que los tipos de header se incluyan en allTypesForInterfaces
    const headers: HeaderData[] = [];
    console.log(`[DEBUG prepareTemplateData] headersInfo: ${headersInfo ? JSON.stringify(headersInfo.map(h => ({ partName: h.partName, headerType: h.headerType }))) : 'undefined'}`);
    if (headersInfo && headersInfo.length > 0) {
        console.log(`[DEBUG prepareTemplateData] Procesando ${headersInfo.length} header(s)`);
        for (const headerInfo of headersInfo) {
            console.log(`[DEBUG prepareTemplateData] Buscando headerType: "${headerInfo.headerType}"`);
            const headerTypeObject = schemaObject[headerInfo.headerType] as any;
            if (!headerTypeObject) {
                console.warn(`⚠️  No se encontró el tipo de header ${headerInfo.headerType}, se omite`);
                continue;
            }
            console.log(`[DEBUG prepareTemplateData] Header encontrado, procesando...`);
            
            // Extraer mappings de namespace para el header
            const headerNamespaceMappings = extractAllNamespaceMappings(headerInfo.headerType, headerTypeObject);
            const headerNamespacePrefix = headerNamespaceMappings.typesMapping[headerInfo.headerType]?.prefix || baseNamespacePrefix;
            
            // Generar código XML para el header usando el nombre del part como prefijo para las props
            const headerPartNameCamelCase = toCamelCase(extractLocalName(headerInfo.partName));
            const headerXmlCode = generateXmlBodyCode(
                headerNamespacePrefix,
                namespacesTypeMapping,
                headerInfo.headerType,
                headerTypeObject,
                headerPartNameCamelCase, // Pasar el nombre del part para usar como prefijo en las props
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
            if (!allTypesForInterfaces[headerInfo.headerType]) {
                allTypesForInterfaces[headerInfo.headerType] = headerTypeObject;
            }
            
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
    
    // Generar las interfaces DESPUÉS de procesar los headers
    // para que los tipos de header se incluyan en allTypesForInterfaces
    // También incluir tipos de header en typesForInterfaces para que se generen sus interfaces
    const typesForInterfacesWithHeaders = { ...typesForInterfaces };
    if (headersInfo && headersInfo.length > 0 && allTypesForInterfaces) {
        for (const headerInfo of headersInfo) {
            if (allTypesForInterfaces[headerInfo.headerType] && !typesForInterfacesWithHeaders[headerInfo.headerType]) {
                typesForInterfacesWithHeaders[headerInfo.headerType] = allTypesForInterfaces[headerInfo.headerType];
            }
        }
    }
    const interfaces = prepareInterfacesData(typesForInterfacesWithHeaders, NAMESPACE_KEY, XML_SCHEMA_URI, allTypesForInterfaces, simpleTypeNames);
    
    // Para el body, no usar prefijo de propsInterfaceName (las propiedades son directas)
    // Solo usar propsInterfaceName para headers
    const xmlBody = generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, requestType, requestTypeObject, undefined, schemaObject, allComplexTypes);
    
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
        headers: headers.length > 0 ? headers : undefined,
    };
}
