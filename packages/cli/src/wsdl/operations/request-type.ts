import type { XmlNode } from "../types.js";
import {
    getInputNode,
    getMessageNode,
    getPartNode,
    getNamespacesFromNode,
    getPortTypeNode,
} from "../node-extractors.js";
import { getOperationName, getOperationNode } from "./operation-utils.js";

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
    
    // Manejar tanto 'element' como 'type' en el nodo part
    if (partNode.element) {
        // Caso 1: El part tiene 'element' (Document/Literal style)
        const elementName = partNode.element;
        const resolvedElementName = resolveTypeName(elementName);
        
        // Buscar el tipo en schemaObject (elementos)
        const requestType = findTypeInObject(schemaObject, elementName, resolvedElementName);
        
        if (requestType) {
            return { operationName, requestType };
        }
        
        // Si no se encuentra en schemaObject, buscar en allComplexTypes
        if (allComplexTypes) {
            const complexTypeKey = findTypeInObject(allComplexTypes, elementName, resolvedElementName);
            
            if (complexTypeKey) {
                // Crear un wrapper en schemaObject para que el resto del código funcione
                const complexType = allComplexTypes[complexTypeKey];
                schemaObject[complexTypeKey] = complexType;
                return { operationName, requestType: complexTypeKey };
            }
        }
        
        const availableTypes = Object.keys(schemaObject).filter(k => k !== '$namespace').join(', ');
        throw new Error(
            `No se encontró el tipo de solicitud '${partNode.element}' (resuelto: '${resolvedElementName}') ` +
            `para la operación '${operationName}'. Tipos disponibles: ${availableTypes || 'ninguno'}`
        );
    } else if (partNode.type) {
        // Caso 2: El part tiene 'type' (RPC/Encoded o Document/Literal con type)
        const typeName = partNode.type;
        const resolvedTypeName = resolveTypeName(typeName);
        
        // Buscar primero en allComplexTypes (donde están los complexTypes)
        if (allComplexTypes) {
            const complexTypeKey = findTypeInObject(allComplexTypes, typeName, resolvedTypeName);
            
            if (complexTypeKey) {
                // Crear un wrapper en schemaObject para que el resto del código funcione
                const complexType = allComplexTypes[complexTypeKey];
                schemaObject[complexTypeKey] = complexType;
                return { operationName, requestType: complexTypeKey };
            }
        }
        
        // Si no se encuentra en allComplexTypes, buscar en schemaObject
        const requestType = findTypeInObject(schemaObject, typeName, resolvedTypeName);
        
        if (requestType) {
            return { operationName, requestType };
        }
        
        const availableTypes = Object.keys(schemaObject).filter(k => k !== '$namespace').join(', ');
        const availableComplexTypes = allComplexTypes ? Object.keys(allComplexTypes).filter(k => k !== '$namespace').join(', ') : 'ninguno';
        throw new Error(
            `No se encontró el tipo de solicitud '${partNode.type}' (resuelto: '${resolvedTypeName}') ` +
            `para la operación '${operationName}'. Tipos en schemaObject: ${availableTypes || 'ninguno'}. ` +
            `Tipos en complexTypes: ${availableComplexTypes}`
        );
    } else {
        // Caso 3: No tiene ni 'element' ni 'type'
        throw new Error(
            `El nodo part de la operación '${operationName}' no tiene ni el atributo 'element' ni 'type' definido`
        );
    }
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
    
    // Manejar tanto 'element' como 'type' en el nodo part
    if (partNode.element) {
        // Caso 1: El part tiene 'element' (Document/Literal style)
        const elementName = partNode.element;
        const resolvedElementName = resolveTypeName(elementName);
        
        // Buscar el tipo en schemaObject (elementos)
        const requestType = findTypeInObject(schemaObject, elementName, resolvedElementName);
        
        if (requestType) {
            return requestType;
        }
        
        // Si no se encuentra en schemaObject, buscar en allComplexTypes
        if (allComplexTypes) {
            const complexTypeKey = findTypeInObject(allComplexTypes, elementName, resolvedElementName);
            
            if (complexTypeKey) {
                // Crear un wrapper en schemaObject para que el resto del código funcione
                const complexType = allComplexTypes[complexTypeKey];
                schemaObject[complexTypeKey] = complexType;
                return complexTypeKey;
            }
        }
        
        const availableTypes = Object.keys(schemaObject).filter(k => k !== '$namespace').join(', ');
        throw new Error(
            `No se encontró el tipo de solicitud '${partNode.element}' (resuelto: '${resolvedElementName}'). Tipos disponibles: ${availableTypes || 'ninguno'}`
        );
    } else if (partNode.type) {
        // Caso 2: El part tiene 'type' (RPC/Encoded o Document/Literal con type)
        const typeName = partNode.type;
        const resolvedTypeName = resolveTypeName(typeName);
        
        // Buscar primero en allComplexTypes (donde están los complexTypes)
        if (allComplexTypes) {
            const complexTypeKey = findTypeInObject(allComplexTypes, typeName, resolvedTypeName);
            
            if (complexTypeKey) {
                // Crear un wrapper en schemaObject para que el resto del código funcione
                const complexType = allComplexTypes[complexTypeKey];
                schemaObject[complexTypeKey] = complexType;
                return complexTypeKey;
            }
        }
        
        // Si no se encuentra en allComplexTypes, buscar en schemaObject
        const requestType = findTypeInObject(schemaObject, typeName, resolvedTypeName);
        
        if (requestType) {
            return requestType;
        }
        
        const availableTypes = Object.keys(schemaObject).filter(k => k !== '$namespace').join(', ');
        const availableComplexTypes = allComplexTypes ? Object.keys(allComplexTypes).filter(k => k !== '$namespace').join(', ') : 'ninguno';
        throw new Error(
            `No se encontró el tipo de solicitud '${partNode.type}' (resuelto: '${resolvedTypeName}'). ` +
            `Tipos en schemaObject: ${availableTypes || 'ninguno'}. Tipos en complexTypes: ${availableComplexTypes}`
        );
    } else {
        // Caso 3: No tiene ni 'element' ni 'type'
        throw new Error('El nodo part no tiene ni el atributo \'element\' ni \'type\' definido');
    }
};
