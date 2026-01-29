import { NAMESPACE_KEY, XML_SCHEMA_URI } from "../constants.js";
import type { NamespacePrefixesMapping, NamespaceTagsMapping, NamespaceTypesMapping, TemplateData, TypeObject, InterfaceData, PropsInterfaceData } from "../types.js";
import { extractLocalName } from "../utils.js";
import { generateXmlBodyCode } from "../xml-generator/index.js";
import { prepareSimpleTypesData } from "./simple-types.js";
import { preparePropsInterfaceData } from "./props-interface.js";
import { prepareInterfacesData } from "./interface.js";
import { processHeaders, processResponse, prepareTypesForInterfaces } from "./template-data-helpers.js";

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
    headersInfo?: Array<{ partName: string; elementName: string; headerType: string }>, // Opcional: información de headers
    responseType?: string, // Opcional: tipo de respuesta
    responseTypeObject?: TypeObject, // Opcional: objeto de tipo de respuesta
    responseAllTypesForInterfaces?: TypeObject // Opcional: tipos referenciados del response
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
    const headers = headersInfo && headersInfo.length > 0 && schemaObject
        ? processHeaders(
            headersInfo,
            schemaObject,
            allTypesForInterfaces,
            allComplexTypes,
            baseNamespacePrefix,
            namespacesTypeMapping,
            namespacesTagsMapping,
            namespacesPrefixMapping,
            propsInterface
        )
        : [];
    
    // Generar las interfaces DESPUÉS de procesar los headers
    // para que los tipos de header se incluyan en allTypesForInterfaces
    // También incluir tipos de header en typesForInterfaces para que se generen sus interfaces
    const typesForInterfacesWithHeaders = prepareTypesForInterfaces(typesForInterfaces, headersInfo, allTypesForInterfaces);
    const interfaces = prepareInterfacesData(typesForInterfacesWithHeaders, NAMESPACE_KEY, XML_SCHEMA_URI, allTypesForInterfaces, simpleTypeNames);
    
    // Para el body, no usar prefijo de propsInterfaceName (las propiedades son directas)
    // Solo usar propsInterfaceName para headers
    const xmlBody = generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, requestType, requestTypeObject, undefined, schemaObject, allComplexTypes, namespacesPrefixMapping);
    
    // Usar nombre local del requestType para el template
    const requestTypeLocalName = extractLocalName(requestType);
    
    // Procesar response si existe
    let responsePropsInterface: PropsInterfaceData | undefined;
    let responseInterfaces: InterfaceData[] | undefined;
    
    if (responseType && responseTypeObject) {
        const responseResult = processResponse(
            responseType,
            responseTypeObject,
            responseAllTypesForInterfaces,
            allTypesForInterfaces,
            schemaObject,
            allComplexTypes,
            interfaces
        );
        responsePropsInterface = responseResult.responsePropsInterface;
        responseInterfaces = responseResult.responseInterfaces;
    }
    
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
        responseType: responseType ? extractLocalName(responseType) : undefined,
        responsePropsInterface,
        responseInterfaces,
    };
}
