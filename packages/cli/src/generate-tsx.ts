import {
    loadXml,
    getAllSchemaNodes,
    getTypesNode,
    getDefinitionsNode,
    getNamespacesFromNode,
    complexTypesFromSchema,
    getPortTypeNode,
    getOperationNodes,
    getOperationName,
    type XmlNode,
} from "./wsdl/index.js";
import { processSchemaAndImports, validateSchemaObject } from "./generator/schema-processing.js";
import { getSoapNamespaceURI } from "./generator/soap-namespace.js";
import { processOperation } from "./generator/operation-processing.js";

/**
 * Función principal que genera el archivo TSX desde un WSDL
 */
export async function generateTsxFromWsdl(
    wsdlPath: string, 
    outDir: string, 
    operationName?: string
): Promise<void> {
    const wsdlRoot = await loadXml(wsdlPath);
    const definitionsNode = getDefinitionsNode(wsdlRoot);
    if (!definitionsNode) {
        throw new Error('No se encontró el nodo definitions en el WSDL');
    }
    const typeNode = getTypesNode(definitionsNode);
    if (!typeNode) {
        throw new Error('No se encontró el nodo types en el WSDL');
    }
    
    // Obtener TODOS los schemas (puede haber múltiples)
    const schemaNodes = getAllSchemaNodes(typeNode);
    
    if (schemaNodes.length === 0) {
        throw new Error('No se encontraron nodos schema en el WSDL');
    }
    
    const definitionsNamespaces = getNamespacesFromNode(definitionsNode);
    const soapNamespaceURI = getSoapNamespaceURI(definitionsNamespaces);
    
    // Recopilar namespaces de todos los schemas
    let allNamespaces = new Map(definitionsNamespaces);
    for (const schemaNode of schemaNodes) {
        const schemaNamespaces = getNamespacesFromNode(schemaNode);
        allNamespaces = new Map([...allNamespaces, ...schemaNamespaces]);
    }
    
    // Procesar todos los schemas para obtener complexTypes
    let allComplexTypes: any = {};
    for (const schemaNode of schemaNodes) {
        const complexTypes = await complexTypesFromSchema(wsdlPath, schemaNode, allNamespaces);
        allComplexTypes = { ...allComplexTypes, ...complexTypes };
    }
    
    // Procesar todos los schemas para obtener elementos y construir schemaObject
    // También procesar elementos de XSDs importados
    let schemaObject: any = {};
    
    // Procesar todos los schemas principales y sus imports
    for (const schemaNode of schemaNodes) {
        await processSchemaAndImports(schemaNode, wsdlPath, allNamespaces, allComplexTypes, schemaObject);
    }
    
    // Validar que schemaObject tenga contenido
    validateSchemaObject(schemaObject, schemaNodes, allComplexTypes, allNamespaces);
    
    // Obtener portType y operaciones
    const portTypeNode = getPortTypeNode(definitionsNode);
    if (!portTypeNode) {
        throw new Error('No se encontró el nodo portType en las definiciones del WSDL');
    }
    
    const operationNodes = getOperationNodes(portTypeNode);
    if (operationNodes.length === 0) {
        throw new Error('No se encontraron operaciones en el portType');
    }
    
    // Filtrar operaciones si se especificó un nombre
    const operationsToProcess = operationName 
        ? operationNodes.filter(op => {
            const opName = getOperationName(op);
            return opName === operationName || opName.toLowerCase() === operationName.toLowerCase();
        })
        : operationNodes;
    
    if (operationName && operationsToProcess.length === 0) {
        const availableOps = operationNodes.map(op => getOperationName(op)).join(', ');
        throw new Error(
            `No se encontró la operación '${operationName}'. Operaciones disponibles: ${availableOps || 'ninguna'}`
        );
    }
    
    // Iterar sobre las operaciones a procesar
    let generatedCount = 0;
    for (const operationNode of operationsToProcess) {
        try {
            processOperation(operationNode, definitionsNode, schemaObject, allComplexTypes, soapNamespaceURI, outDir);
            generatedCount++;
        } catch (error: any) {
            const opName = getOperationName(operationNode);
            const { error: logError } = await import("./logger.js");
            logError(`❌ Error al procesar operación '${opName}': ${error.message}`);
            // Si se especificó una operación específica, lanzar el error
            if (operationName) {
                throw error;
            }
            // Si no, continuar con las demás operaciones
        }
    }
    
    if (generatedCount === 0) {
        throw new Error('No se generó ningún archivo. Verifica que las operaciones tengan input definido.');
    }
    
    const { info } = await import("./logger.js");
    info(`\n✨ Proceso completado: ${generatedCount} archivo(s) generado(s)`);
}
