import type { XmlNode } from "./types.js";
import {
    getOperationNodes as getOperationNodesFromNode,
    getInputNode,
    getMessageNode,
    getPartNode,
    getNamespacesFromNode,
    getPortTypeNode,
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

export const getRequestTypeFromOperation = (
    operationNode: XmlNode,
    definitionsNode: XmlNode,
    schemaObject: any
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
    
    const partNode = getPartNode(inputMessageNode);
    if (!partNode) {
        throw new Error(`No se encontró el nodo part en el mensaje de entrada de la operación '${operationName}'`);
    }
    
    if (!partNode.element) {
        throw new Error(`El nodo part de la operación '${operationName}' no tiene el atributo element definido`);
    }
    
    // Obtener namespaces para resolver prefijos
    const definitionsNamespaces = getNamespacesFromNode(definitionsNode);
    
    // Resolver el elemento: puede tener prefijo (ej: WL5G3N1:consultaCodigoPlan) o ser un nombre completo
    let elementName = partNode.element;
    let resolvedElementName = elementName;
    
    // Si tiene prefijo, intentar resolverlo
    if (elementName.includes(':')) {
        const [prefix, localName] = elementName.split(':');
        const namespaceUri = definitionsNamespaces.get(prefix);
        if (namespaceUri) {
            // Construir nombre completo con namespace URI
            resolvedElementName = `${namespaceUri}:${localName}`;
        }
    }
    
    // Buscar el tipo de varias formas:
    // 1. Por nombre completo resuelto (namespace URI:nombre)
    // 2. Por nombre con prefijo original
    // 3. Por nombre local (sin prefijo)
    const requestType = Object.keys(schemaObject).find(item => {
        // Filtrar la clave $namespace
        if (item === '$namespace') return false;
        
        // Buscar coincidencias exactas o por sufijo
        return item === resolvedElementName || 
               item === elementName ||
               item.endsWith(`:${elementName.split(':').pop()}`) ||
               resolvedElementName.endsWith(item.split(':').pop() || '') ||
               elementName.endsWith(item.split(':').pop() || '');
    });
    
    if (!requestType) {
        const availableTypes = Object.keys(schemaObject).filter(k => k !== '$namespace').join(', ');
        throw new Error(
            `No se encontró el tipo de solicitud '${partNode.element}' (resuelto: '${resolvedElementName}') ` +
            `para la operación '${operationName}'. Tipos disponibles: ${availableTypes || 'ninguno'}`
        );
    }
    
    return { operationName, requestType };
};

export const getRequestTypeFromDefinitions = (definitionsNode: XmlNode, schemaObject: any): string => {
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
    
    const partNode = getPartNode(inputMessageNode);
    if (!partNode) {
        throw new Error('No se encontró el nodo part en el mensaje de entrada');
    }
    
    if (!partNode.element) {
        throw new Error('El nodo part no tiene el atributo element definido');
    }
    
    // Obtener namespaces para resolver prefijos
    const definitionsNamespaces = getNamespacesFromNode(definitionsNode);
    
    // Resolver el elemento: puede tener prefijo (ej: WL5G3N1:consultaCodigoPlan) o ser un nombre completo
    let elementName = partNode.element;
    let resolvedElementName = elementName;
    
    // Si tiene prefijo, intentar resolverlo
    if (elementName.includes(':')) {
        const [prefix, localName] = elementName.split(':');
        const namespaceUri = definitionsNamespaces.get(prefix);
        if (namespaceUri) {
            // Construir nombre completo con namespace URI
            resolvedElementName = `${namespaceUri}:${localName}`;
        }
    }
    
    // Buscar el tipo de varias formas:
    // 1. Por nombre completo resuelto (namespace URI:nombre)
    // 2. Por nombre con prefijo original
    // 3. Por nombre local (sin prefijo)
    const requestType = Object.keys(schemaObject).find(item => {
        // Filtrar la clave $namespace
        if (item === '$namespace') return false;
        
        // Buscar coincidencias exactas o por sufijo
        return item === resolvedElementName || 
               item === elementName ||
               item.endsWith(`:${elementName.split(':').pop()}`) ||
               resolvedElementName.endsWith(item.split(':').pop() || '') ||
               elementName.endsWith(item.split(':').pop() || '');
    });
    
    if (!requestType) {
        const availableTypes = Object.keys(schemaObject).filter(k => k !== '$namespace').join(', ');
        throw new Error(
            `No se encontró el tipo de solicitud '${partNode.element}' (resuelto: '${resolvedElementName}') en el schema. ` +
            `Tipos disponibles: ${availableTypes || 'ninguno'}`
        );
    }
    
    return requestType;
};
