import type { XmlNode } from "../types.js";
import {
    getInputNode,
    getMessageNode,
    getPartNode,
    getNamespacesFromNode,
    getPortTypeNode,
    getBindingNode,
    getHeaderNode,
    getOperationNodes as getOperationNodesFromNode,
} from "../node-extractors.js";
import { getOperationName } from "./operation-utils.js";

export interface HeaderInfo {
    partName: string;
    elementName: string;
    headerType: string;
}

export const getHeadersFromOperation = (
    operationNode: XmlNode,
    definitionsNode: XmlNode,
    schemaObject: any,
    allComplexTypes?: any
): HeaderInfo[] => {
    const operationName = getOperationName(operationNode);
    const inputNode = getInputNode(operationNode);
    if (!inputNode) {
        return [];
    }
    
    // Buscar el binding correspondiente al portType de la operación
    const portTypeNode = getPortTypeNode(definitionsNode);
    if (!portTypeNode) {
        return [];
    }
    
    // Buscar el binding que referencia este portType
    const bindingField = Object.keys(definitionsNode).find(key => key.match(/([a-zA-z0-9]*:)?binding/));
    if (!bindingField) {
        return [];
    }
    
    const bindingValue = definitionsNode[bindingField];
    const bindings = Array.isArray(bindingValue) ? bindingValue : (bindingValue ? [bindingValue] : []);
    
    // Buscar el binding que tenga el mismo type que el portType
    const portTypeName = portTypeNode.name;
    const matchingBinding = bindings.find((binding: XmlNode) => {
        if (!binding.type) return false;
        return binding.type.endsWith(portTypeName || '');
    });
    
    if (!matchingBinding) {
        return [];
    }
    
    // Buscar la operación en el binding que coincida con el nombre
    const bindingOperations = getOperationNodesFromNode(matchingBinding);
    const bindingOperation = bindingOperations.find(op => getOperationName(op) === operationName);
    if (!bindingOperation) {
        return [];
    }
    
    const bindingInputNode = getInputNode(bindingOperation);
    if (!bindingInputNode) {
        return [];
    }
    
    // Extraer headers del binding input
    const headerNodes = getHeaderNode(bindingInputNode);
    if (!headerNodes) {
        return [];
    }
    
    const headers: HeaderInfo[] = [];
    const headerArray = Array.isArray(headerNodes) ? headerNodes : [headerNodes];
    const definitionsNamespaces = getNamespacesFromNode(definitionsNode);
    
    // Función auxiliar para resolver un nombre de tipo
    const resolveTypeName = (name: string): string => {
        if (name.includes(':')) {
            const [prefix, localName] = name.split(':');
            const namespaceUri = definitionsNamespaces.get(prefix);
            if (namespaceUri) {
                return `${namespaceUri}:${localName}`;
            }
        }
        return name;
    };
    
    // Función auxiliar para buscar un tipo en un objeto
    const findTypeInObject = (obj: any, typeName: string, resolvedTypeName: string): string | undefined => {
        return Object.keys(obj).find(item => {
            if (item === '$namespace') return false;
            const itemLocalName = item.split(':').pop() || '';
            const typeLocalName = typeName.split(':').pop() || '';
            return item === resolvedTypeName || 
                   item === typeName ||
                   item.endsWith(`:${typeLocalName}`) ||
                   resolvedTypeName.endsWith(itemLocalName) ||
                   typeName.endsWith(itemLocalName);
        });
    };
    
    for (const headerNode of headerArray) {
        if (!headerNode.part || !headerNode.message) {
            continue;
        }
        
        const partName = headerNode.part;
        const messageRef = headerNode.message;
        
        // Buscar el mensaje referenciado
        const messageNodes = getMessageNode(definitionsNode);
        const messageNode = messageNodes.find(msg => messageRef.endsWith(msg.name!));
        if (!messageNode) {
            continue;
        }
        
        // Buscar el part en el mensaje
        const partNodes = getPartNode(messageNode);
        if (!partNodes) {
            continue;
        }
        
        const partsArray = Array.isArray(partNodes) ? partNodes : [partNodes];
        const headerPart = partsArray.find(p => p.name === partName);
        if (!headerPart || (!headerPart.element && !headerPart.type)) {
            continue;
        }
        
        // Resolver el tipo del header
        let headerType: string | undefined;
        if (headerPart.element) {
            const elementName = headerPart.element;
            const resolvedElementName = resolveTypeName(elementName);
            headerType = findTypeInObject(schemaObject, elementName, resolvedElementName);
            
            if (!headerType && allComplexTypes) {
                headerType = findTypeInObject(allComplexTypes, elementName, resolvedElementName);
            }
        } else if (headerPart.type) {
            const typeName = headerPart.type;
            const resolvedTypeName = resolveTypeName(typeName);
            
            if (allComplexTypes) {
                headerType = findTypeInObject(allComplexTypes, typeName, resolvedTypeName);
            }
            
            if (!headerType) {
                headerType = findTypeInObject(schemaObject, typeName, resolvedTypeName);
            }
        }
        
        if (headerType) {
            headers.push({
                partName,
                elementName: headerPart.element || headerPart.type || '',
                headerType
            });
        }
    }
    
    return headers;
};
