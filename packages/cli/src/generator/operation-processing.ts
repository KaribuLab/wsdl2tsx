import type { XmlNode } from "../wsdl/types.js";
import { extractAllNamespaceMappings, extractLocalName } from "../codegen/index.js";
import { getRequestTypeFromOperation, getHeadersFromOperation, getOperationName } from "../wsdl/index.js";
import { prepareTemplateData } from "../codegen/data-preparer/index.js";
import { findReferencedTypes } from "./type-resolution.js";
import { compileTemplate } from "./template-compilation.js";
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
        console.warn(`⚠️  Operación '${opName}' no tiene input, se omite`);
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
    
    const referencedTypeNames = findReferencedTypes(requestTypeObject, allComplexTypes);
    
    // Agregar solo los tipos referenciados encontrados (no todos los tipos del WSDL)
    // Esto asegura que solo se generen interfaces para tipos realmente usados por esta operación
    for (const typeName of referencedTypeNames) {
        if (!allTypesForInterfaces[typeName] && allComplexTypes[typeName]) {
            allTypesForInterfaces[typeName] = allComplexTypes[typeName];
        }
    }
    
    // También incluir el tipo de respuesta si existe (ej: AddResponse)
    // Buscar tipos de respuesta relacionados con esta operación
    const responseTypeName = `${opName}Response`;
    const responseTypeKeys = Object.keys(allComplexTypes).filter(k => {
        const localName = extractLocalName(k);
        return localName === responseTypeName || localName.toLowerCase() === responseTypeName.toLowerCase();
    });
    
    for (const responseTypeKey of responseTypeKeys) {
        if (!allTypesForInterfaces[responseTypeKey] && allComplexTypes[responseTypeKey]) {
            allTypesForInterfaces[responseTypeKey] = allComplexTypes[responseTypeKey];
        }
    }
    
    // Extraer headers de la operación
    const headersInfo = getHeadersFromOperation(operationNode, definitionsNode, schemaObject, allComplexTypes);
    
    // Extraer todos los mappings de namespace en una sola pasada (optimización)
    const namespaceMappings = extractAllNamespaceMappings(requestType, requestTypeObject);
    const namespacesTagsMapping = namespaceMappings.tagsMapping;
    const namespacesPrefixMapping = namespaceMappings.prefixesMapping;
    const namespacesTypeMapping = namespaceMappings.typesMapping;
    const baseNamespacePrefix = namespacesTypeMapping[requestType]!.prefix;
    
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
        headersInfo // Pasar información de headers
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
    console.log(`✅ Archivo ${typeNameForFile}.tsx generado correctamente en ${outDir}`);
}
