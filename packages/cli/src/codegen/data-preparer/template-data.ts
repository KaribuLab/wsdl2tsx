import { NAMESPACE_KEY, XML_SCHEMA_URI } from "../constants.js";
import type { NamespacePrefixesMapping, NamespaceTagsMapping, NamespaceTypesMapping, TemplateData, TypeObject, InterfaceData, PropsInterfaceData } from "../types.js";
import { extractLocalName, getFilteredKeys, validatePropertyOrder } from "../utils.js";
import { toPascalCase } from "../../util.js";
import { debugContext, warn } from "../../logger.js";
import { generateXmlBodyCode } from "../xml-generator/index.js";
import { prepareSimpleTypesData } from "./simple-types.js";
import { preparePropsInterfaceData } from "./props-interface/index.js";
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
    responseAllTypesForInterfaces?: TypeObject, // Opcional: tipos referenciados del response
    unqualifiedTags?: string[] // Opcional: tags sin namespace para generar variables individuales
): TemplateData {
    const simpleTypes = prepareSimpleTypesData(requestTypeObject, XML_SCHEMA_URI);
    
    // IMPORTANTE: Tanto preparePropsInterfaceData como generateXmlBodyCode deben usar el mismo requestTypeObject
    // sin transformaciones intermedias para garantizar que el orden de propiedades sea idéntico.
    // El orden se preserva desde el WSDL original a través de processElementsToObject() que itera
    // sobre el array elementNode preservando el orden de inserción.
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
    // Nota: No pasamos tagUsageCollector aquí porque ya se recolectó la información en extractAllNamespaceMappings
    const xmlBody = generateXmlBodyCode(baseNamespacePrefix, namespacesTypeMapping, requestType, requestTypeObject, undefined, schemaObject, allComplexTypes, namespacesPrefixMapping);
    
    // Validar que el orden de propiedades en propsInterface coincide con el orden en XML
    // NOTA: Cuando preparePropsInterfaceData expande tipos referenciados, las propiedades se aplanan
    // al nivel superior, mientras que generateXmlBodyCode mantiene los tags intermedios.
    // Por lo tanto, la validación solo es precisa cuando no hay expansión de tipos referenciados.
    
    // Extraer orden de props (excluyendo headers que se agregan después)
    const propsOrder = propsInterface.properties
        .filter(prop => {
            // Excluir headers del body (se procesan por separado)
            return !headers.some(h => extractLocalName(h.partName) === prop.name);
        })
        .map(prop => prop.name);
    
    // Extraer orden de XML body (solo propiedades del body, no headers)
    const bodyKeys = getFilteredKeys(requestTypeObject);
    const xmlOrder = bodyKeys.map(key => extractLocalName(key));
    
    // Validar orden del body solo si las longitudes coinciden
    // Si no coinciden, probablemente hay expansión de tipos referenciados (comportamiento esperado)
    if (propsOrder.length === xmlOrder.length) {
        const orderValidation = validatePropertyOrder(propsOrder, xmlOrder, `body-${requestType}`);
        if (!orderValidation.isValid) {
            warn(`⚠️  Advertencia: El orden de propiedades no coincide entre props y XML para "${requestType}"`);
            debugContext("prepareTemplateData", `Orden en props: ${propsOrder.join(' -> ')}`);
            debugContext("prepareTemplateData", `Orden en XML: ${xmlOrder.join(' -> ')}`);
            if (orderValidation.differences) {
                orderValidation.differences.forEach(diff => {
                    debugContext("prepareTemplateData", `  Diferencia en índice ${diff.index}: props="${diff.props}" vs xml="${diff.xml}"`);
                });
            }
        } else {
            debugContext("prepareTemplateData", `✓ Orden de propiedades del body validado correctamente para "${requestType}"`);
        }
    } else {
        // Diferencia en longitud: probablemente hay expansión de tipos referenciados
        debugContext("prepareTemplateData", `Nota: Props tiene ${propsOrder.length} propiedades, XML tiene ${xmlOrder.length} propiedades. Esto puede indicar expansión de tipos referenciados (comportamiento esperado).`);
        debugContext("prepareTemplateData", `Orden en props: ${propsOrder.join(' -> ')}`);
        debugContext("prepareTemplateData", `Orden en XML (nivel raíz): ${xmlOrder.join(' -> ')}`);
    }
    
    // Validar orden de headers
    if (headers.length > 0) {
        const headersPropsOrder = propsInterface.properties
            .filter(prop => headers.some(h => extractLocalName(h.partName) === prop.name))
            .map(prop => prop.name);
        
        const headersXmlOrder = headers.map(h => extractLocalName(h.partName));
        
        const headersOrderValidation = validatePropertyOrder(headersPropsOrder, headersXmlOrder, `headers-${requestType}`);
        if (!headersOrderValidation.isValid) {
            warn(`⚠️  Advertencia: El orden de headers no coincide entre props y XML para "${requestType}"`);
            debugContext("prepareTemplateData", `Orden de headers en props: ${headersPropsOrder.join(' -> ')}`);
            debugContext("prepareTemplateData", `Orden de headers en XML: ${headersXmlOrder.join(' -> ')}`);
            if (headersOrderValidation.differences) {
                headersOrderValidation.differences.forEach(diff => {
                    debugContext("prepareTemplateData", `  Diferencia en índice ${diff.index}: props="${diff.props}" vs xml="${diff.xml}"`);
                });
            }
        } else {
            debugContext("prepareTemplateData", `✓ Orden de headers validado correctamente para "${requestType}"`);
        }
    }
    
    // Usar nombre local del requestType para el template
    const requestTypeLocalName = extractLocalName(requestType);
    
    // Filtrar namespaces vacíos (sin tags) para evitar advertencias de TypeScript
    const filteredNamespaces: NamespaceTagsMapping = {};
    for (const [prefix, tags] of Object.entries(namespacesTagsMapping)) {
        if (tags && tags.length > 0) {
            filteredNamespaces[prefix] = tags;
        }
    }
    
    // También filtrar xmlnsAttributes para excluir prefijos sin tags asociados
    const filteredXmlnsAttributes: NamespacePrefixesMapping = {};
    for (const [prefix, uri] of Object.entries(namespacesPrefixMapping)) {
        if (filteredNamespaces[prefix] && filteredNamespaces[prefix].length > 0) {
            filteredXmlnsAttributes[prefix] = uri;
        }
    }
    
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
        namespaces: filteredNamespaces,
        unqualifiedTags: unqualifiedTags && unqualifiedTags.length > 0 ? unqualifiedTags : undefined,
        simpleTypes,
        propsInterface,
        interfaces,
        soapNamespaceURI,
        xmlnsAttributes: filteredXmlnsAttributes,
        xmlBody,
        headers: headers.length > 0 ? headers : undefined,
        responseType: responseType ? extractLocalName(responseType) : undefined,
        responsePropsInterface,
        responseInterfaces,
    };
}
