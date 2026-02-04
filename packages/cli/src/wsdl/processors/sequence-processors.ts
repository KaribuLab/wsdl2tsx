import type { XmlNode, ComplexTypes } from "../types.js";
import { getElementNode, getSequenceNode, getChoiceNode, getAllNode } from "../node-extractors.js";
import { processElementsToObject } from "./element-processor.js";

export const sequenceToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any => {
    const object: any = {};
    if (targetNamespace !== undefined) {
        object["$namespace"] = targetNamespace;
    }
    object["$qualified"] = isQualified;
    
    // IMPORTANTE: Un sequence puede contener grupos (choice, sequence, all) además de elementos directos
    // El orden es importante: primero procesamos grupos (choice, sequence anidado, all), luego elementos directos
    // para mantener el orden correcto según el WSDL
    
    // Procesar choice primero si existe (debe aparecer antes de elementos directos)
    const choiceNode = getChoiceNode(node);
    if (choiceNode !== undefined) {
        const choiceResult = choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace, isQualified);
        // Combinar resultados del choice
        Object.assign(object, choiceResult);
    }
    
    // Procesar sequence anidado si existe
    const nestedSequenceNode = getSequenceNode(node);
    if (nestedSequenceNode !== undefined && nestedSequenceNode !== node) {
        const nestedSequenceResult = sequenceToObject(nestedSequenceNode, namespaces, complexTypes, targetNamespace, isQualified);
        Object.assign(object, nestedSequenceResult);
    }
    
    // Procesar all si existe
    const allNode = getAllNode(node);
    if (allNode !== undefined) {
        const allResult = allToObject(allNode, namespaces, complexTypes, targetNamespace, isQualified);
        Object.assign(object, allResult);
    }
    
    // Procesar elementos directos al final (después de grupos)
    const elementNode = getElementNode(node);
    if (elementNode !== undefined) {
        const elementResult = processElementsToObject(elementNode, namespaces, complexTypes, targetNamespace, isQualified);
        // Combinar resultados, preservando el namespace y qualified del objeto base
        Object.assign(object, elementResult);
    }
    
    return object;
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
