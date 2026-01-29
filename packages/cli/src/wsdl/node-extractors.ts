import type { XmlNode } from "./types.js";

export const getSequenceNode = (node: XmlNode | undefined | null): XmlNode | undefined => {
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    const sequenceField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?sequence/));
    return sequenceField ? node[sequenceField] : undefined;
};

export const getChoiceNode = (node: XmlNode | undefined | null): XmlNode | undefined => {
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    const choiceField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?choice/));
    return choiceField ? node[choiceField] : undefined;
};

export const getAllNode = (node: XmlNode | undefined | null): XmlNode | undefined => {
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    const allField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?all/));
    return allField ? node[allField] : undefined;
};

export const getGroupNode = (node: XmlNode | undefined | null): XmlNode | undefined => {
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    const groupField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?group/));
    return groupField ? node[groupField] : undefined;
};

export const getSimpleContentNode = (node: XmlNode | undefined | null): XmlNode | undefined => {
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    const simpleContentField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?simpleContent/));
    return simpleContentField ? node[simpleContentField] : undefined;
};

export const getComplexContentNode = (node: XmlNode | undefined | null): XmlNode | undefined => {
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    const complexContentField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?complexContent/));
    return complexContentField ? node[complexContentField] : undefined;
};

export const getExtensionNode = (node: XmlNode | undefined | null): XmlNode | undefined => {
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    const extensionField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?extension/));
    return extensionField ? node[extensionField] : undefined;
};

export const getRestrictionNode = (node: XmlNode | undefined | null): XmlNode | undefined => {
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    const restrictionField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?restriction/));
    return restrictionField ? node[restrictionField] : undefined;
};

export const getAttributeNode = (node: XmlNode): XmlNode | XmlNode[] | undefined => {
    const attributeField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?attribute/));
    return node[attributeField!];
};

export const getSchemaNode = (node: XmlNode): XmlNode | undefined => {
    const schemaField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?schema/));
    return node[schemaField!];
};

export const getAllSchemaNodes = (node: XmlNode): XmlNode[] => {
    const schemas: XmlNode[] = [];
    for (const key of Object.keys(node)) {
        if (key.match(/([a-zA-z0-9]*:)?schema/)) {
            const schemaValue = node[key];
            if (Array.isArray(schemaValue)) {
                schemas.push(...schemaValue);
            } else if (schemaValue !== undefined) {
                schemas.push(schemaValue);
            }
        }
    }
    return schemas;
};

export const getElementNode = (node: XmlNode | XmlNode[]): XmlNode | XmlNode[] | undefined => {
    if (Array.isArray(node)) {
        const elementNodes: XmlNode[] = [];
        for (const item of node) {
            const elementNode = getElementNode(item);
            if (elementNode !== undefined) {
                elementNodes.push(elementNode as XmlNode);
            }
        }
        return elementNodes;
    }
    const elementField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?element/));
    return node[elementField!];
};

export const getComplexTypeNode = (node: XmlNode): XmlNode | undefined => {
    const complexTypeField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?complexType/));
    return node[complexTypeField!];
};

export const getDefinitionsNode = (node: XmlNode): XmlNode | undefined => {
    const definitionsField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?definitions/));
    return node[definitionsField!];
};

export const getTypesNode = (node: XmlNode): XmlNode | undefined => {
    const typesField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?types/));
    return node[typesField!];
};

export const getImportNode = (node: XmlNode): XmlNode | XmlNode[] | undefined => {
    const importField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?import/));
    return node[importField!];
};

export const getMessageNode = (node: XmlNode): XmlNode[] => {
    const messageField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?message/));
    const messageValue = node[messageField!];
    return Array.isArray(messageValue) ? messageValue : [messageValue];
};

export const getPortTypeNode = (node: XmlNode): XmlNode | undefined => {
    const portTypeField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?portType/));
    return node[portTypeField!];
};

export const getOperationNodes = (node: XmlNode): XmlNode[] => {
    const operationField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?operation/));
    if (!operationField) return [];
    const operationValue = node[operationField];
    return Array.isArray(operationValue) ? operationValue : (operationValue ? [operationValue] : []);
};

export const getInputNode = (node: XmlNode): XmlNode | undefined => {
    const inputField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?input/));
    return node[inputField!];
};

export const getPartNode = (node: XmlNode): XmlNode | XmlNode[] | undefined => {
    const partField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?part/));
    if (!partField) return undefined;
    const partValue = node[partField];
    // Puede ser un solo part o un array de parts
    return partValue;
};

export const getNamespacesFromNode = (node: XmlNode): Map<string, string> => {
    const namespaces = new Map<string, string>();
    if (node.targetNamespace !== undefined) {
        namespaces.set('targetNamespace', node.targetNamespace);
    }
    for (const key of Object.keys(node)) {
        const match = key.match(/xmlns:([a-zA-z0-9]*)/);
        if (match !== null) {
            const value = node[key];
            namespaces.set(match[1]!, value);
        }
    }
    return namespaces;
};
