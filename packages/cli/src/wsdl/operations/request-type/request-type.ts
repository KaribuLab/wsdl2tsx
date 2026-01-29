import type { XmlNode } from "../../types.js";
import {
    getInputNode,
    getMessageNode,
    getPartNode,
    getNamespacesFromNode,
    getPortTypeNode,
} from "../../node-extractors.js";
import { getOperationName, getOperationNode } from "../operation-utils.js";
import { resolveRequestTypeFromPart } from "./type-resolver.js";

export const getRequestTypeFromOperation = (
    operationNode: XmlNode,
    definitionsNode: XmlNode,
    schemaObject: any,
    allComplexTypes?: any
): { operationName: string, requestType: string } | null => {
    const operationName = getOperationName(operationNode);
    
    const inputNode = getInputNode(operationNode);
    if (!inputNode) {
        return null; // Operación sin input
    }
    
    if (!inputNode.message) {
        throw new Error(`El nodo input de la operación '${operationName}' no tiene el atributo message definido`);
    }
    
    const messageNode = getMessageNode(definitionsNode);
    if (!messageNode || messageNode.length === 0) {
        throw new Error('No se encontraron nodos message en las definiciones del WSDL');
    }
    
    const inputMessageNode = messageNode.find(item => inputNode.message!.endsWith(item.name!));
    if (!inputMessageNode) {
        throw new Error(`No se encontró el mensaje ${inputNode.message} en las definiciones`);
    }
    
    const partNodeOrArray = getPartNode(inputMessageNode);
    if (!partNodeOrArray) {
        throw new Error(`No se encontró el nodo part en el mensaje de entrada de la operación '${operationName}'`);
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
            `Ninguno de los nodos part en el mensaje de entrada de la operación '${operationName}' ` +
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
    
    return { operationName, requestType: result.requestType };
};

export const getRequestTypeFromDefinitions = (definitionsNode: XmlNode, schemaObject: any, allComplexTypes?: any): string => {
    const portTypeNode = getPortTypeNode(definitionsNode);
    if (!portTypeNode) {
        throw new Error('No se encontró el nodo portType en las definiciones del WSDL');
    }
    
    const operationNode = getOperationNode(portTypeNode);
    if (!operationNode) {
        throw new Error('No se encontró el nodo operation en el portType');
    }
    
    const inputNode = getInputNode(operationNode);
    if (!inputNode) {
        throw new Error('El nodo input no tiene el atributo message definido');
    }
    
    if (!inputNode.message) {
        throw new Error('El nodo input no tiene el atributo message definido');
    }
    
    const messageNode = getMessageNode(definitionsNode);
    if (!messageNode || messageNode.length === 0) {
        throw new Error('No se encontraron nodos message en las definiciones del WSDL');
    }
    
    const inputMessageNode = messageNode.find(item => inputNode.message!.endsWith(item.name!));
    if (!inputMessageNode) {
        throw new Error(`No se encontró el mensaje ${inputNode.message} en las definiciones`);
    }
    
    const partNodeOrArray = getPartNode(inputMessageNode);
    if (!partNodeOrArray) {
        throw new Error('No se encontró el nodo part en el mensaje de entrada');
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
            `Ninguno de los nodos part en el mensaje de entrada tiene ni el atributo 'element' ni 'type' definido. Parts encontrados: ${partNames}`
        );
    }
    
    // Obtener namespaces para resolver prefijos
    const definitionsNamespaces = getNamespacesFromNode(definitionsNode);
    
    const result = resolveRequestTypeFromPart(partNode, definitionsNamespaces, schemaObject, allComplexTypes);
    
    if (!result) {
        throw new Error('El nodo part no tiene ni el atributo \'element\' ni \'type\' definido');
    }
    
    return result.requestType;
};
