import type { XmlNode, ComplexTypes } from "./types.js";
import { loadXsd } from "./loader.js";
import {
    getSchemaNode,
    getImportNode,
    getComplexTypeNode,
    getElementNode,
    getSequenceNode,
} from "./node-extractors.js";
import { complexTypeToObject } from "./processors/index.js";
import { debugContext } from "../logger.js";

/**
 * Procesa imports de XSD y agrega tipos complejos al objeto resultante
 */
export async function processImports(
    wsdlFile: string,
    node: XmlNode,
    currentNamespaces: Map<string, string>,
    object: ComplexTypes,
    processedSchemas: Set<string> = new Set()
): Promise<void> {
    const importNode = getImportNode(node);
    
    if (importNode === undefined) {
        return;
    }
    
    const importsArray = Array.isArray(importNode) ? importNode : [importNode];
    debugContext("processImports", `Procesando ${importsArray.length} import(s) de XSD`);
    
    const processSingleImport = async (item: XmlNode): Promise<void> => {
        // Solo procesar imports que tengan schemaLocation definido
        if (!item.schemaLocation) {
            // Import sin schemaLocation - los tipos pueden estar en el mismo WSDL
            debugContext("processImports", `Import sin schemaLocation, omitiendo`);
            return;
        }
        
        // Crear un identificador único para este schema basado en su schemaLocation
        const schemaId = item.schemaLocation;
        
        // Si ya procesamos este schema, evitar procesarlo de nuevo (previene ciclos infinitos)
        if (processedSchemas.has(schemaId)) {
            debugContext("processImports", `Schema ya procesado, omitiendo: ${schemaId}`);
            return;
        }
        
        debugContext("processImports", `Cargando XSD importado desde: ${item.schemaLocation}`);
        
        try {
            const importedXsd = await loadXsd(wsdlFile, item.schemaLocation);
            const schemaNode = getSchemaNode(importedXsd);
            if (schemaNode) {
                // Marcar este schema como procesado antes de procesarlo recursivamente
                processedSchemas.add(schemaId);
                
                const { complexTypesFromSchema } = await import("./complex-types.js");
                const importedComplexTypes = await complexTypesFromSchema(wsdlFile, schemaNode, currentNamespaces, processedSchemas);
                const importedCount = Object.keys(importedComplexTypes).length;
                debugContext("processImports", `✓ XSD importado exitosamente: ${importedCount} tipo(s) complejo(s) encontrado(s)`);
                Object.assign(object, importedComplexTypes);
            }
        } catch (error: any) {
            // Si falla al cargar el XSD externo, continuar sin él
            // Los tipos pueden estar definidos en el mismo WSDL
            const { warn } = await import("../logger.js");
            warn(`Advertencia: No se pudo cargar el XSD importado desde ${item.schemaLocation}: ${error.message}`);
        }
    };
    
    if (Array.isArray(importNode)) {
        for (const item of importNode) {
            await processSingleImport(item);
        }
    } else {
        await processSingleImport(importNode);
    }
}

/**
 * Procesa complexType nodes y agrega tipos complejos al objeto resultante
 */
export function processComplexTypeNodes(
    node: XmlNode,
    targetNamespace: string,
    currentNamespaces: Map<string, string>,
    object: ComplexTypes,
    isQualified: boolean
): void {
    const complexTypeNode = getComplexTypeNode(node);
    
    if (complexTypeNode === undefined) {
        return;
    }
    
    if (Array.isArray(complexTypeNode)) {
        for (const item of complexTypeNode) {
            object[targetNamespace + ':' + item.name!] = complexTypeToObject(item, currentNamespaces, object, targetNamespace, isQualified);
        }
    } else {
        object[targetNamespace + ':' + complexTypeNode.name!] = complexTypeToObject(complexTypeNode, currentNamespaces, object, targetNamespace, isQualified);
    }
}

/**
 * Procesa element nodes con complexType inline o sequence
 */
export function processElementNodes(
    node: XmlNode,
    targetNamespace: string,
    currentNamespaces: Map<string, string>,
    object: ComplexTypes,
    isQualified: boolean
): void {
    const elementNode = getElementNode(node);
    
    if (elementNode === undefined) {
        return;
    }
    
    const elementsArray = Array.isArray(elementNode) ? elementNode : [elementNode];
    debugContext("processElementNodes", `Procesando ${elementsArray.length} element node(s)`);
    
    const processSingleElement = (item: XmlNode): void => {
        const itemComplexType = getComplexTypeNode(item);
        if (itemComplexType !== undefined) {
            // Elemento con complexType inline
            debugContext("processElementNodes", `Procesando elemento con complexType inline: "${item.name}"`);
            object[targetNamespace + ':' + item.name!] = complexTypeToObject(itemComplexType, currentNamespaces, object, targetNamespace, isQualified);
        } else if (getSequenceNode(item) !== undefined) {
            // Elemento con sequence directamente (sin complexType wrapper)
            debugContext("processElementNodes", `Procesando elemento con sequence: "${item.name}"`);
            object[targetNamespace + ':' + item.name!] = complexTypeToObject(item, currentNamespaces, object, targetNamespace, isQualified);
        }
    };
    
    if (Array.isArray(elementNode)) {
        for (const item of elementNode) {
            processSingleElement(item);
        }
    } else {
        processSingleElement(elementNode as XmlNode);
    }
}

