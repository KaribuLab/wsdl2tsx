import type { XmlNode, ComplexTypes } from "../types.js";
import { complexTypeToObject } from "./complex-type.js";

// Función para procesar un elemento individual
export function processSingleElement(node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any {
    // Manejar elementos con ref en lugar de type (debe verificarse ANTES de verificar type === undefined)
    if (node.ref !== undefined) {
        const refValue = node.ref;
        console.log(`[DEBUG processSingleElement] Elemento con ref="${refValue}"`);
        if (refValue.includes(':')) {
            const [prefix, name] = refValue.split(':');
            const namespace = namespaces.get(prefix) !== undefined ? namespaces.get(prefix)! : namespaces.get('targetNamespace')!;
            const resolvedRef = namespace + ':' + name;
            console.log(`[DEBUG processSingleElement] Ref resuelto: "${resolvedRef}"`);
            return resolvedRef;
        } else {
            const namespace = namespaces.get('targetNamespace') || targetNamespace;
            const resolvedRef = namespace + ':' + refValue;
            console.log(`[DEBUG processSingleElement] Ref resuelto: "${resolvedRef}"`);
            return resolvedRef;
        }
    }
    
    // Manejar elementos <any> que no tienen type ni ref
    if (node.type === undefined) {
        // Si es un elemento <any>, usar un tipo genérico
        return 'xsd:anyType';
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
}

function fillObject(object: any, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined): any {
    for (const item of Object.keys(object)) {
        const value = object[item];
        if (complexTypes !== undefined && complexTypes[value.type] !== undefined) {
            object[item] = fillObject(complexTypes[value.type], namespaces, complexTypes);
        }
    }
    return object;
}

// Función genérica para procesar elementos (usada por sequence, choice, all)
export function processElementsToObject(elementNode: XmlNode | XmlNode[] | undefined, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined, isQualified: boolean = false): any {
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
            // Manejar elementos con ref pero sin name
            if (node !== undefined && node.ref !== undefined && node.name === undefined) {
                // Extraer el nombre del elemento referenciado del ref
                const refValue = node.ref;
                let refName: string;
                if (refValue.includes(':')) {
                    const [, name] = refValue.split(':');
                    refName = name;
                } else {
                    refName = refValue;
                }
                // Cuando hay ref, processSingleElement devuelve la referencia completa (namespace:name)
                // pero necesitamos usar esa referencia directamente, no procesarla más
                const processedType = processSingleElement(node, namespaces, complexTypes, targetNamespace, isQualified);
                console.log(`[DEBUG processElementsToObject] Elemento con ref="${refValue}", refName="${refName}", processedType="${processedType}"`);
                object[refName] = {
                    maxOccurs: node.maxOccurs ?? '1',
                    minOccurs: node.minOccurs ?? '1',
                    type: processedType,
                    $qualified: isQualified,
                    $namespace: targetNamespace,  // Asignar el namespace del schema donde está definido el elemento
                };
                continue;
            }
            
            // Manejar elementos <any> que no tienen name ni ref
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
        
        // Manejar elementos con ref pero sin name
        if (elementNode.ref !== undefined && elementNode.name === undefined) {
            // Extraer el nombre del elemento referenciado del ref
            const refValue = elementNode.ref;
            let refName: string;
            if (refValue.includes(':')) {
                const [, name] = refValue.split(':');
                refName = name;
            } else {
                refName = refValue;
            }
            const processedType = processSingleElement(elementNode, namespaces, complexTypes, targetNamespace, isQualified);
            object[refName] = {
                maxOccurs: elementNode.maxOccurs ?? '1',
                minOccurs: elementNode.minOccurs ?? '1',
                type: processedType,
                $qualified: isQualified,
                $namespace: targetNamespace,  // Asignar el namespace del schema donde está definido el elemento
            };
            return object;
        }
        
        // Manejar elementos <any> que no tienen name ni ref
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
}
