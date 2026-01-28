import type { XmlNode, ComplexTypes } from "./types.js";
import {
    getSequenceNode,
    getChoiceNode,
    getAllNode,
    getGroupNode,
    getSimpleContentNode,
    getComplexContentNode,
    getExtensionNode,
    getRestrictionNode,
    getAttributeNode,
    getElementNode,
    getComplexTypeNode,
} from "./node-extractors.js";

// Función para procesar un elemento individual
const processSingleElement = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any => {
    // Manejar elementos <any> que no tienen type
    if (node.type === undefined) {
        // Si es un elemento <any>, usar un tipo genérico
        return 'xsd:anyType';
    }
    
    // Manejar elementos con ref en lugar de type
    if (node.ref !== undefined) {
        const refValue = node.ref;
        if (refValue.includes(':')) {
            const [prefix, name] = refValue.split(':');
            const namespace = namespaces.get(prefix) !== undefined ? namespaces.get(prefix)! : namespaces.get('targetNamespace')!;
            return namespace + ':' + name;
        } else {
            const namespace = namespaces.get('targetNamespace') || targetNamespace;
            return namespace + ':' + refValue;
        }
    }
    
    // Manejar elementos con complexType inline
    if (node.complexType !== undefined || node['xsd:complexType'] !== undefined) {
        const complexTypeNode = node.complexType || node['xsd:complexType'];
        const inlineType = complexTypeToObject(complexTypeNode, namespaces, complexTypes ?? {}, targetNamespace, isQualified);
        return inlineType;
    }
    
    // Procesar tipo normal
    if (node.type.includes(':')) {
        const [prefix, name] = node.type.split(':');
        const namespace = namespaces.get(prefix) !== undefined ? namespaces.get(prefix)! : namespaces.get('targetNamespace')!;
        const type = namespace + ':' + name;
        
        if (complexTypes !== undefined) {
            const complexTypeObject = complexTypes[type];
            if (complexTypeObject !== undefined && typeof complexTypeObject === 'object') {
                return fillObject(complexTypeObject, namespaces, complexTypes);
            } else {
                return type;
            }
        } else {
            return type;
        }
    } else {
        // Tipo sin prefijo, usar targetNamespace
        const namespace = namespaces.get('targetNamespace') || targetNamespace;
        return namespace + ':' + node.type;
    }
};

const fillObject = (object: any, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined): any => {
    for (const item of Object.keys(object)) {
        const value = object[item];
        if (complexTypes !== undefined && complexTypes[value.type] !== undefined) {
            object[item] = fillObject(complexTypes[value.type], namespaces, complexTypes);
        }
    }
    return object;
};

// Función genérica para procesar elementos (usada por sequence, choice, all)
const processElementsToObject = (elementNode: XmlNode | XmlNode[] | undefined, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any => {
    // Si elementNode es undefined, retornar objeto vacío
    if (elementNode === undefined) {
        const object: any = {};
        if (targetNamespace !== undefined) {
            object["$namespace"] = targetNamespace;
        }
        object["$qualified"] = isQualified;
        return object;
    }
    
    if (Array.isArray(elementNode)) {
        const object: any = {};
        // Establecer el namespace del objeto al targetNamespace del schema
        if (targetNamespace !== undefined) {
            object["$namespace"] = targetNamespace;
        }
        object["$qualified"] = isQualified;
        for (const node of elementNode) {
            // Manejar elementos <any> que no tienen name
            if (node === undefined || node.name === undefined) {
                // Es un elemento <any> o undefined, podemos omitirlo o agregarlo como tipo especial
                continue;
            }
            const processedType = processSingleElement(node, namespaces, complexTypes, targetNamespace, isQualified);
            object[node.name] = {
                maxOccurs: node.maxOccurs ?? '1',
                minOccurs: node.minOccurs ?? '1',
                type: processedType,
                $qualified: isQualified,
                $namespace: targetNamespace,  // Asignar el namespace del schema donde está definido el elemento
            };
        }
        return object;
    } else {
        const object: any = {};
        // Establecer el namespace del objeto al targetNamespace del schema
        if (targetNamespace !== undefined) {
            object["$namespace"] = targetNamespace;
        }
        object["$qualified"] = isQualified;
        
        // Manejar elementos <any> que no tienen name
        if (elementNode.name === undefined) {
            // Es un elemento <any>, retornar objeto con tipo especial
            return object;
        }
        
        const processedType = processSingleElement(elementNode, namespaces, complexTypes, targetNamespace, isQualified);
        object[elementNode.name] = {
            maxOccurs: elementNode.maxOccurs ?? '1',
            minOccurs: elementNode.minOccurs ?? '1',
            type: processedType,
            $qualified: isQualified,
            $namespace: targetNamespace,  // Asignar el namespace del schema donde está definido el elemento
        };
        return object;
    }
};

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
