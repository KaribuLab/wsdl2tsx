import type { XmlNode, ComplexTypes } from "../types.js";
import { getSimpleContentNode, getComplexContentNode, getExtensionNode, getRestrictionNode, getAttributeNode, getSequenceNode, getChoiceNode, getAllNode } from "../node-extractors.js";
import { sequenceToObject, choiceToObject, allToObject } from "./sequence-processors.js";

export const simpleContentToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any => {
    const object: any = {};
    if (targetNamespace !== undefined) {
        object["$namespace"] = targetNamespace;
    }
    object["$qualified"] = isQualified;
    
    // Buscar extension o restriction dentro de simpleContent
    const extensionNode = getExtensionNode(node);
    if (extensionNode !== undefined) {
        // El extension tiene un base que es el tipo base
        if (extensionNode.base !== undefined) {
            object["$base"] = extensionNode.base;
        }
        
        // Puede tener attributes
        const attributeNode = getAttributeNode(extensionNode);
        if (attributeNode !== undefined) {
            const attributes = Array.isArray(attributeNode) ? attributeNode : [attributeNode];
            const attrs: Record<string, string> = {};
            for (const attr of attributes) {
                if (attr.name !== undefined) {
                    const attrType = attr.type || attr.base || 'xsd:string';
                    attrs[attr.name] = attrType;
                }
            }
            if (Object.keys(attrs).length > 0) {
                object["$attributes"] = attrs;
            }
        }
        
        // Buscar sequence, choice, all dentro del extension (aunque es raro en simpleContent)
        const sequenceNode = getSequenceNode(extensionNode);
        if (sequenceNode !== undefined) {
            const seqResult = sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace, isQualified);
            Object.assign(object, seqResult);
        }
        
        return object;
    }
    
    const restrictionNode = getRestrictionNode(node);
    if (restrictionNode !== undefined) {
        // Similar a extension pero con restriction
        if (restrictionNode.base !== undefined) {
            object["$base"] = restrictionNode.base;
        }
        
        const attributeNode = getAttributeNode(restrictionNode);
        if (attributeNode !== undefined) {
            const attributes = Array.isArray(attributeNode) ? attributeNode : [attributeNode];
            const attrs: Record<string, string> = {};
            for (const attr of attributes) {
                if (attr.name !== undefined) {
                    const attrType = attr.type || attr.base || 'xsd:string';
                    attrs[attr.name] = attrType;
                }
            }
            if (Object.keys(attrs).length > 0) {
                object["$attributes"] = attrs;
            }
        }
        
        return object;
    }
    
    return object;
};

export const complexContentToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any => {
    const object: any = {};
    if (targetNamespace !== undefined) {
        object["$namespace"] = targetNamespace;
    }
    object["$qualified"] = isQualified;
    
    // Buscar extension o restriction dentro de complexContent
    const extensionNode = getExtensionNode(node);
    if (extensionNode !== undefined) {
        // El extension tiene un base que es el tipo base
        if (extensionNode.base !== undefined) {
            object["$base"] = extensionNode.base;
        }
        
        // Buscar sequence, choice, all dentro del extension
        const sequenceNode = getSequenceNode(extensionNode);
        if (sequenceNode !== undefined) {
            const seqResult = sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace, isQualified);
            Object.assign(object, seqResult);
        }
        
        const choiceNode = getChoiceNode(extensionNode);
        if (choiceNode !== undefined) {
            const choiceResult = choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace, isQualified);
            Object.assign(object, choiceResult);
        }
        
        const allNode = getAllNode(extensionNode);
        if (allNode !== undefined) {
            const allResult = allToObject(allNode, namespaces, complexTypes, targetNamespace, isQualified);
            Object.assign(object, allResult);
        }
        
        // Puede tener attributes
        const attributeNode = getAttributeNode(extensionNode);
        if (attributeNode !== undefined) {
            const attributes = Array.isArray(attributeNode) ? attributeNode : [attributeNode];
            const attrs: Record<string, string> = {};
            for (const attr of attributes) {
                if (attr.name !== undefined) {
                    const attrType = attr.type || attr.base || 'xsd:string';
                    attrs[attr.name] = attrType;
                }
            }
            if (Object.keys(attrs).length > 0) {
                object["$attributes"] = attrs;
            }
        }
        
        return object;
    }
    
    const restrictionNode = getRestrictionNode(node);
    if (restrictionNode !== undefined) {
        // Similar a extension pero con restriction
        if (restrictionNode.base !== undefined) {
            object["$base"] = restrictionNode.base;
        }
        
        const sequenceNode = getSequenceNode(restrictionNode);
        if (sequenceNode !== undefined) {
            const seqResult = sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace, isQualified);
            Object.assign(object, seqResult);
        }
        
        const choiceNode = getChoiceNode(restrictionNode);
        if (choiceNode !== undefined) {
            const choiceResult = choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace, isQualified);
            Object.assign(object, choiceResult);
        }
        
        const allNode = getAllNode(restrictionNode);
        if (allNode !== undefined) {
            const allResult = allToObject(allNode, namespaces, complexTypes, targetNamespace, isQualified);
            Object.assign(object, allResult);
        }
        
        return object;
    }
    
    return object;
};
