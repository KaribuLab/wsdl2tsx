import type { XmlNode } from "../types.js";
import { getOperationNodes as getOperationNodesFromNode } from "../node-extractors.js";

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
