import type { XmlNode, ComplexTypes } from "../types.js";
import {
    getSequenceNode,
    getChoiceNode,
    getAllNode,
    getGroupNode,
    getSimpleContentNode,
    getComplexContentNode,
} from "../node-extractors.js";
import { sequenceToObject, choiceToObject, allToObject, groupToObject } from "./sequence-processors.js";
import { simpleContentToObject, complexContentToObject } from "./content-processors.js";

export const complexTypeToObject = (node: XmlNode | XmlNode[] | undefined | null, namespaces: Map<string, string>, complexTypes: ComplexTypes, targetNamespace: string | undefined, isQualified: boolean = false): any => {
    if (!node) {
        // Retornar objeto vacío si el nodo es undefined o null
        const object: any = {};
        if (targetNamespace !== undefined) {
            object["$namespace"] = targetNamespace;
        }
        object["$qualified"] = isQualified;
        return object;
    }
    if (Array.isArray(node)) {
        const resultObject: any = {};
        resultObject["$qualified"] = isQualified;
        for (const item of node) {
            const sequenceNode = getSequenceNode(item);
            if (sequenceNode !== undefined) {
                resultObject[item.name!] = sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace, isQualified);
                continue;
            }
            
            const choiceNode = getChoiceNode(item);
            if (choiceNode !== undefined) {
                resultObject[item.name!] = choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace, isQualified);
                continue;
            }
            
            const allNode = getAllNode(item);
            if (allNode !== undefined) {
                resultObject[item.name!] = allToObject(allNode, namespaces, complexTypes, targetNamespace, isQualified);
                continue;
            }
            
            const groupNode = getGroupNode(item);
            if (groupNode !== undefined) {
                resultObject[item.name!] = groupToObject(groupNode, namespaces, complexTypes, targetNamespace, isQualified);
                continue;
            }
            
            const simpleContentNode = getSimpleContentNode(item);
            if (simpleContentNode !== undefined) {
                resultObject[item.name!] = simpleContentToObject(simpleContentNode, namespaces, complexTypes, targetNamespace, isQualified);
                continue;
            }
            
            const complexContentNode = getComplexContentNode(item);
            if (complexContentNode !== undefined) {
                resultObject[item.name!] = complexContentToObject(complexContentNode, namespaces, complexTypes, targetNamespace, isQualified);
                continue;
            }
        }
        return resultObject;
    } else {
        // Buscar sequence primero
        const sequenceNode = getSequenceNode(node);
        if (sequenceNode !== undefined) {
            const result = sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace, isQualified);
            // Establecer el namespace del objeto complejo al targetNamespace del schema
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            result["$qualified"] = isQualified;
            return result;
        }
        
        // Buscar choice
        const choiceNode = getChoiceNode(node);
        if (choiceNode !== undefined) {
            const result = choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace, isQualified);
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            result["$qualified"] = isQualified;
            return result;
        }
        
        // Buscar all
        const allNode = getAllNode(node);
        if (allNode !== undefined) {
            const result = allToObject(allNode, namespaces, complexTypes, targetNamespace, isQualified);
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            result["$qualified"] = isQualified;
            return result;
        }
        
        // Buscar group
        const groupNode = getGroupNode(node);
        if (groupNode !== undefined) {
            const result = groupToObject(groupNode, namespaces, complexTypes, targetNamespace, isQualified);
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            result["$qualified"] = isQualified;
            return result;
        }
        
        // Buscar simpleContent
        const simpleContentNode = getSimpleContentNode(node);
        if (simpleContentNode !== undefined) {
            const result = simpleContentToObject(simpleContentNode, namespaces, complexTypes, targetNamespace, isQualified);
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            result["$qualified"] = isQualified;
            return result;
        }
        
        // Buscar complexContent
        const complexContentNode = getComplexContentNode(node);
        if (complexContentNode !== undefined) {
            const result = complexContentToObject(complexContentNode, namespaces, complexTypes, targetNamespace, isQualified);
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            result["$qualified"] = isQualified;
            return result;
        }
        
        throw new Error('No se encontró nodo sequence, choice, all, group, simpleContent o complexContent');
    }
};
