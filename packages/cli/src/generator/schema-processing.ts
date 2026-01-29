import type { XmlNode } from "../wsdl/types.js";
import { getImportNode, getSchemaNode, getElementNode } from "../wsdl/node-extractors.js";
import { schemaToObject } from "../wsdl/index.js";
import { loadXsd } from "../wsdl/loader.js";

/**
 * Función auxiliar para procesar un schema y sus imports recursivamente
 */
export async function processSchemaAndImports(
    schemaNode: XmlNode,
    wsdlPath: string,
    allNamespaces: Map<string, string>,
    allComplexTypes: any,
    schemaObject: any
): Promise<void> {
    // Procesar el schema actual
    const schemaObj = schemaToObject(schemaNode, allNamespaces, allComplexTypes);
    // Combinar objetos, evitando sobrescribir $namespace
    for (const [key, value] of Object.entries(schemaObj)) {
        if (key !== '$namespace' || !schemaObject['$namespace']) {
            schemaObject[key] = value;
        }
    }
    // Usar el $namespace del último schema si no hay uno definido
    if (!schemaObject['$namespace'] && schemaObj['$namespace']) {
        schemaObject['$namespace'] = schemaObj['$namespace'];
    }
    
    // Procesar imports del schema
    const importNode = getImportNode(schemaNode);
    if (importNode !== undefined) {
        const imports = Array.isArray(importNode) ? importNode : [importNode];
        for (const item of imports) {
            if (item.schemaLocation) {
                try {
                    const importedXsd = await loadXsd(wsdlPath, item.schemaLocation);
                    const importedSchemaNode = getSchemaNode(importedXsd);
                    if (importedSchemaNode) {
                        // Procesar recursivamente el schema importado
                        await processSchemaAndImports(importedSchemaNode, wsdlPath, allNamespaces, allComplexTypes, schemaObject);
                    }
                } catch (error: any) {
                    // Si falla al cargar el XSD externo, continuar sin él
                    const { warn } = await import("../logger.js");
                    warn(`Advertencia: No se pudo cargar el XSD importado desde ${item.schemaLocation}: ${error.message}`);
                }
            }
        }
    }
}

/**
 * Valida que schemaObject tenga contenido y genera mensaje de error detallado si no
 */
export function validateSchemaObject(schemaObject: any, schemaNodes: XmlNode[], allComplexTypes: any, allNamespaces: Map<string, string>): void {
    const schemaKeys = Object.keys(schemaObject).filter(k => k !== '$namespace');
    if (schemaKeys.length === 0) {
        const complexTypeKeys = Object.keys(allComplexTypes);
        
        // Debug: obtener información detallada de los elementos en todos los schemas
        let elementDetails = '';
        for (let i = 0; i < schemaNodes.length; i++) {
            const schemaNode = schemaNodes[i];
            const elementNode = getElementNode(schemaNode);
            const hasElements = elementNode !== undefined;
            
            if (hasElements) {
                elementDetails += `\nSchema [${i}] (targetNamespace: ${schemaNode.targetNamespace || 'no definido'}):\n`;
                if (Array.isArray(elementNode)) {
                    elementDetails += `  Detalles de elementos:\n`;
                    elementNode.forEach((elem, idx) => {
                        elementDetails += `    [${idx}]: name=${elem.name || 'sin nombre'}, type=${elem.type || 'sin tipo'}, ref=${elem.ref || 'sin ref'}\n`;
                    });
                } else {
                    const elem = elementNode as any;
                    elementDetails += `  Detalle del elemento: name=${elem.name || 'sin nombre'}, type=${elem.type || 'sin tipo'}, ref=${elem.ref || 'sin ref'}\n`;
                }
            }
        }
        
        let errorMsg = 'El schema no contiene tipos definidos.\n';
        errorMsg += `- Schemas encontrados: ${schemaNodes.length}\n`;
        errorMsg += `- ComplexTypes encontrados: ${complexTypeKeys.length > 0 ? complexTypeKeys.join(', ') : 'ninguno'}\n`;
        errorMsg += `- Elementos en schemas:${elementDetails || ' ninguno'}\n`;
        errorMsg += `- Namespaces disponibles: ${Array.from(allNamespaces.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
        
        if (complexTypeKeys.length > 0) {
            errorMsg += '\nSugerencia: Los tipos están definidos como complexTypes pero no como elementos. ';
            errorMsg += 'Puede que el WSDL use referencias de tipo en lugar de elementos directos.';
        } else if (elementDetails) {
            errorMsg += '\nSugerencia: Hay elementos pero no se pudieron procesar. ';
            errorMsg += 'Verifica que los elementos tengan name o type definido.';
        }
        
        throw new Error(errorMsg);
    }
}
