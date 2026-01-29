import type { XmlNode } from "./types.js";
import {
    getOperationNodes as getOperationNodesFromNode,
    getInputNode,
    getMessageNode,
    getPartNode,
    getNamespacesFromNode,
    getPortTypeNode,
    getBindingNode,
    getHeaderNode,
    getBodyNode,
} from "./node-extractors.js";

// Re-export para mantener compatibilidad
export { getOperationNodesFromNode as getOperationNodes };

export const getOperationNode = (node: XmlNode): XmlNode | undefined => {
    const operations = getOperationNodesFromNode(node);
    return operations.length > 0 ? operations[0] : undefined;
};

export const getOperationName = (operationNode: XmlNode): string => {
    // El nombre puede estar en operationNode.name o en la clave del objeto padre
    return operationNode.name || 'UnknownOperation';
};

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
        throw new Error('No se encontró el nodo input en la operación');
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
            `Ninguno de los nodos part en el mensaje de entrada tiene ni el atributo 'element' ni 'type' definido. ` +
            `Parts encontrados: ${partNames}`
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
        
        const requestType = findTypeInObject(schemaObject, elementName, resolvedElementName);
        
        if (requestType) {
            return requestType;
        }
        
        // Buscar en allComplexTypes si está disponible
        if (allComplexTypes) {
            const complexTypeKey = findTypeInObject(allComplexTypes, elementName, resolvedElementName);
            
            if (complexTypeKey) {
                const complexType = allComplexTypes[complexTypeKey];
                schemaObject[complexTypeKey] = complexType;
                return complexTypeKey;
            }
        }
        
        const availableTypes = Object.keys(schemaObject).filter(k => k !== '$namespace').join(', ');
        throw new Error(
            `No se encontró el tipo de solicitud '${partNode.element}' (resuelto: '${resolvedElementName}') en el schema. ` +
            `Tipos disponibles: ${availableTypes || 'ninguno'}`
        );
    } else if (partNode.type) {
        // Caso 2: El part tiene 'type' (RPC/Encoded o Document/Literal con type)
        const typeName = partNode.type;
        const resolvedTypeName = resolveTypeName(typeName);
        
        // Buscar primero en allComplexTypes
        if (allComplexTypes) {
            const complexTypeKey = findTypeInObject(allComplexTypes, typeName, resolvedTypeName);
            
            if (complexTypeKey) {
                const complexType = allComplexTypes[complexTypeKey];
                schemaObject[complexTypeKey] = complexType;
                return complexTypeKey;
            }
        }
        
        // Buscar en schemaObject
        const requestType = findTypeInObject(schemaObject, typeName, resolvedTypeName);
        
        if (requestType) {
            return requestType;
        }
        
        const availableTypes = Object.keys(schemaObject).filter(k => k !== '$namespace').join(', ');
        const availableComplexTypes = allComplexTypes ? Object.keys(allComplexTypes).filter(k => k !== '$namespace').join(', ') : 'ninguno';
        throw new Error(
            `No se encontró el tipo de solicitud '${partNode.type}' (resuelto: '${resolvedTypeName}') en el schema. ` +
            `Tipos en schemaObject: ${availableTypes || 'ninguno'}. Tipos en complexTypes: ${availableComplexTypes}`
        );
    } else {
        throw new Error('El nodo part no tiene ni el atributo \'element\' ni \'type\' definido');
    }
};
