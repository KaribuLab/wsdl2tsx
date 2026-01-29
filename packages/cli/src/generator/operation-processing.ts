import type { XmlNode } from "../wsdl/types.js";
import { extractAllNamespaceMappings, extractLocalName } from "../codegen/index.js";
import { getRequestTypeFromOperation, getResponseTypeFromOperation, getHeadersFromOperation, getOperationName } from "../wsdl/index.js";
import { prepareTemplateData } from "../codegen/data-preparer/index.js";
import { findReferencedTypes } from "./type-resolution.js";
import { compileTemplate } from "./template-compilation.js";
import { warn, info, debugContext } from "../logger.js";
import fs from "fs";
import path from "path";

/**
 * Función auxiliar para procesar una operación individual
 */
export function processOperation(
    operationNode: XmlNode,
    definitionsNode: XmlNode,
    schemaObject: any,
    allComplexTypes: any,
    soapNamespaceURI: string,
    outDir: string
): void {
    const operationInfo = getRequestTypeFromOperation(operationNode, definitionsNode, schemaObject, allComplexTypes);
    
    if (!operationInfo) {
        const opName = getOperationName(operationNode);
        warn(`⚠️  Operación '${opName}' no tiene input, se omite`);
        return;
    }
    
    const { operationName: opName, requestType } = operationInfo;
    
    const requestTypeObject = schemaObject[requestType] as any;
    
    if (!requestTypeObject) {
        throw new Error(`No se encontró el objeto de tipo ${requestType} en el schema para la operación '${opName}'`);
    }
    
    // Asegurar que el objeto tenga $namespace
    if (!requestTypeObject['$namespace'] && schemaObject['$namespace']) {
        requestTypeObject['$namespace'] = schemaObject['$namespace'];
    }
    
    if (!requestTypeObject['$namespace']) {
        throw new Error(`El tipo ${requestType} no tiene namespace definido para la operación '${opName}'`);
    }
    
    // Incluir todos los complexTypes referenciados en el requestTypeObject
    // Esto asegura que se generen interfaces para tipos como CodigoPlanListTO que están referenciados
    const allTypesForInterfaces: any = { ...requestTypeObject };
    
    const referencedTypeNames = findReferencedTypes(requestTypeObject, allComplexTypes, new Set(), 0, schemaObject);
    
    // Agregar los tipos referenciados encontrados a allTypesForInterfaces
    for (const typeName of referencedTypeNames) {
        if (!allTypesForInterfaces[typeName]) {
            // Buscar primero en schemaObject, luego en allComplexTypes
            const typeObject = schemaObject[typeName] || allComplexTypes[typeName];
            if (typeObject) {
                allTypesForInterfaces[typeName] = typeObject;
            }
        }
    }
    
    // Agregar solo los tipos referenciados encontrados (no todos los tipos del WSDL)
    // Esto asegura que solo se generen interfaces para tipos realmente usados por esta operación
    for (const typeName of referencedTypeNames) {
        if (!allTypesForInterfaces[typeName] && allComplexTypes[typeName]) {
            allTypesForInterfaces[typeName] = allComplexTypes[typeName];
        }
    }
    
    // Extraer headers de la operación
    const headersInfo = getHeadersFromOperation(operationNode, definitionsNode, schemaObject, allComplexTypes);
    
    // Extraer todos los mappings de namespace en una sola pasada (optimización)
    const namespaceMappings = extractAllNamespaceMappings(requestType, requestTypeObject, schemaObject, allComplexTypes);
    const namespacesTagsMapping = namespaceMappings.tagsMapping;
    const namespacesPrefixMapping = namespaceMappings.prefixesMapping;
    const namespacesTypeMapping = namespaceMappings.typesMapping;
    const baseNamespacePrefix = namespacesTypeMapping[requestType]!.prefix;
    
    // Intentar extraer el tipo de respuesta de la operación
    let responseType: string | undefined;
    let responseTypeObject: any | undefined;
    let responseAllTypesForInterfaces: any | undefined;
    
    try {
        const responseInfo = getResponseTypeFromOperation(operationNode, definitionsNode, schemaObject, allComplexTypes);
        if (responseInfo) {
            responseType = responseInfo.responseType;
            responseTypeObject = schemaObject[responseType] as any;
            
            if (responseTypeObject) {
                // Asegurar que el objeto tenga $namespace
                if (!responseTypeObject['$namespace'] && schemaObject['$namespace']) {
                    responseTypeObject['$namespace'] = schemaObject['$namespace'];
                }
                
                // Incluir tipos referenciados en el response
                responseAllTypesForInterfaces = { ...responseTypeObject };
                const responseReferencedTypeNames = findReferencedTypes(responseTypeObject, allComplexTypes, new Set(), 0, schemaObject);
                
                // Buscar recursivamente dentro de los tipos encontrados
                const allResponseTypes = new Set(responseReferencedTypeNames);
                const processedTypes = new Set<string>();
                
                const processTypeRecursively = (typeName: string) => {
                    if (processedTypes.has(typeName)) return;
                    processedTypes.add(typeName);
                    
                    const typeObject = schemaObject[typeName] || allComplexTypes[typeName];
                    if (typeObject) {
                        if (!responseAllTypesForInterfaces[typeName]) {
                            responseAllTypesForInterfaces[typeName] = typeObject;
                        }
                        
                        // Buscar tipos referenciados dentro de este tipo
                        const nestedTypes = findReferencedTypes(typeObject, allComplexTypes, new Set(), 0, schemaObject);
                        for (const nestedTypeName of nestedTypes) {
                            if (!allResponseTypes.has(nestedTypeName)) {
                                allResponseTypes.add(nestedTypeName);
                                processTypeRecursively(nestedTypeName);
                            }
                        }
                    }
                };
                
                // Procesar todos los tipos encontrados recursivamente
                for (const typeName of responseReferencedTypeNames) {
                    processTypeRecursively(typeName);
                }
                
                // Agregar también los tipos del response a allTypesForInterfaces para que se generen sus interfaces
                if (!allTypesForInterfaces[responseType]) {
                    allTypesForInterfaces[responseType] = responseTypeObject;
                }
                for (const typeName of responseReferencedTypeNames) {
                    if (!allTypesForInterfaces[typeName]) {
                        // Buscar primero en schemaObject, luego en allComplexTypes
                        const typeObject = schemaObject[typeName] || allComplexTypes[typeName];
                        if (typeObject) {
                            allTypesForInterfaces[typeName] = typeObject;
                        }
                    }
                }
            }
        }
    } catch (error: any) {
        // Si no se puede extraer el response, continuar sin él (no es obligatorio)
        warn(`⚠️  No se pudo extraer el tipo de respuesta para la operación '${opName}': ${error.message}`);
    }
    
    // Preparar datos estructurados para el template Handlebars
    // IMPORTANTE: Para propsInterface usar solo requestTypeObject (no allTypesForInterfaces)
    // Para interfaces usar allTypesForInterfaces para incluir todos los tipos referenciados
    const templateData = prepareTemplateData(
        requestType,
        requestTypeObject, // Usar requestTypeObject original para propsInterface
        namespacesTagsMapping,
        namespacesPrefixMapping,
        namespacesTypeMapping,
        soapNamespaceURI,
        baseNamespacePrefix,
        allTypesForInterfaces, // Pasar allTypesForInterfaces como parámetro adicional para interfaces
        schemaObject, // Pasar schemaObject para resolver referencias de elementos
        allComplexTypes, // Pasar allComplexTypes para resolver tipos complejos referenciados
        headersInfo, // Pasar información de headers
        responseType, // Pasar tipo de respuesta si existe
        responseTypeObject, // Pasar objeto de tipo de respuesta si existe
        responseAllTypesForInterfaces // Pasar tipos referenciados del response
    );
    
    // Compilar el template y generar el código
    const generatedCode = compileTemplate(templateData);
    
    // Usar el nombre de la operación para el nombre del archivo
    const typeNameForFile = opName;
    
    // Asegurar que el directorio de salida existe
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    
    const outputPath = path.join(outDir, `${typeNameForFile}.tsx`);
    fs.writeFileSync(outputPath, generatedCode);
    info(`✅ Archivo ${typeNameForFile}.tsx generado correctamente en ${outDir}`);
}
