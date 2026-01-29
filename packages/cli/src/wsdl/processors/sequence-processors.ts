import type { XmlNode, ComplexTypes } from "../types.js";
import { getElementNode, getSequenceNode, getChoiceNode, getAllNode } from "../node-extractors.js";
import { processElementsToObject } from "./element-processor.js";

export const sequenceToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any => {
    const elementNode = getElementNode(node);
    return processElementsToObject(elementNode, namespaces, complexTypes, targetNamespace, isQualified);
};

export const choiceToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any => {
    const elementNode = getElementNode(node);
    return processElementsToObject(elementNode, namespaces, complexTypes, targetNamespace, isQualified);
};

export const allToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any => {
    const elementNode = getElementNode(node);
    return processElementsToObject(elementNode, namespaces, complexTypes, targetNamespace, isQualified);
};

export const groupToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any => {
    // Un group puede contener sequence, choice, all, etc.
    // Primero intentamos obtener los elementos directamente del group
    const elementNode = getElementNode(node);
    if (elementNode !== undefined) {
        return processElementsToObject(elementNode, namespaces, complexTypes, targetNamespace, isQualified);
    }
    
    // Si no hay elementos directos, buscamos sequence, choice, all dentro del group
    const sequenceNode = getSequenceNode(node);
    if (sequenceNode !== undefined) {
        return sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace, isQualified);
    }
    
    const choiceNode = getChoiceNode(node);
    if (choiceNode !== undefined) {
        return choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace, isQualified);
    }
    
    const allNode = getAllNode(node);
    if (allNode !== undefined) {
        return allToObject(allNode, namespaces, complexTypes, targetNamespace, isQualified);
    }
    
    // Si no encontramos nada, retornamos objeto vacío
    const object: any = {};
    if (targetNamespace !== undefined) {
        object["$namespace"] = targetNamespace;
    }
    object["$qualified"] = isQualified;
    return object;
};
