import type { XmlNode } from "../../types.js";
import {
    getOutputNode,
    getMessageNode,
    getPartNode,
    getNamespacesFromNode,
} from "../../node-extractors.js";
import { getOperationName } from "../operation-utils.js";
import { resolveRequestTypeFromPart } from "../request-type/type-resolver.js";

export const getResponseTypeFromOperation = (
    operationNode: XmlNode,
    definitionsNode: XmlNode,
    schemaObject: any,
    allComplexTypes?: any
): { operationName: string, responseType: string } | null => {
    const operationName = getOperationName(operationNode);
    
    const outputNode = getOutputNode(operationNode);
    if (!outputNode) {
        return null; // Operación sin output
    }
    
    if (!outputNode.message) {
        throw new Error(`El nodo output de la operación '${operationName}' no tiene el atributo message definido`);
    }
    
    const messageNode = getMessageNode(definitionsNode);
    if (!messageNode || messageNode.length === 0) {
        throw new Error('No se encontraron nodos message en las definiciones del WSDL');
    }
    
    const outputMessageNode = messageNode.find(item => outputNode.message!.endsWith(item.name!));
    if (!outputMessageNode) {
        throw new Error(`No se encontró el mensaje ${outputNode.message} en las definiciones`);
    }
    
    const partNodeOrArray = getPartNode(outputMessageNode);
    if (!partNodeOrArray) {
        throw new Error(`No se encontró el nodo part en el mensaje de salida de la operación '${operationName}'`);
    }
    
    // Manejar tanto un solo part como un array de parts
    const partNodes: XmlNode[] = Array.isArray(partNodeOrArray) ? partNodeOrArray : [partNodeOrArray];
    
    // Buscar el part que tenga 'element' o 'type' definido
    let partNode: XmlNode | undefined = undefined;
    for (const part of partNodes) {
        if (part.element || part.type) {
            partNode = part;
            break;
        }
    }
    
    if (!partNode) {
        const partNames = partNodes.map(p => p.name || 'sin nombre').join(', ');
        throw new Error(
            `Ninguno de los nodos part en el mensaje de salida de la operación '${operationName}' ` +
            `tiene ni el atributo 'element' ni 'type' definido. Parts encontrados: ${partNames}`
        );
    }
    
    // Obtener namespaces para resolver prefijos
    const definitionsNamespaces = getNamespacesFromNode(definitionsNode);
    
    const result = resolveRequestTypeFromPart(partNode, definitionsNamespaces, schemaObject, allComplexTypes);
    
    if (!result) {
        throw new Error(
            `El nodo part de la operación '${operationName}' no tiene ni el atributo 'element' ni 'type' definido`
        );
    }
    
    return { operationName, responseType: result.requestType };
};
