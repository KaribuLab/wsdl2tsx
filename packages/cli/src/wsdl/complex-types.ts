import type { XmlNode, ComplexTypes } from "./types.js";
import {
    getElementNode,
    getComplexTypeNode,
    getNamespacesFromNode,
} from "./node-extractors.js";
import { complexTypeToObject } from "./processors/index.js";
import { processImports, processComplexTypeNodes, processElementNodes } from "./complex-type-helpers.js";

export const complexTypesFromSchema = async (wsdlFile: string, node: XmlNode, namespaces: Map<string, string> | undefined, processedSchemas: Set<string> = new Set()): Promise<ComplexTypes> => {
    const targetNamespace = node.targetNamespace;
    const isQualified = node.elementFormDefault === 'qualified';
    const schemaNamespaces = namespaces ?? getNamespacesFromNode(node);
    const currentNamespaces = schemaNamespaces;
    let object: ComplexTypes = {};
    
    // Procesar imports
    await processImports(wsdlFile, node, currentNamespaces, object, processedSchemas);
    
    // Procesar complexType nodes
    processComplexTypeNodes(node, targetNamespace, currentNamespaces, object, isQualified);
    
    // Procesar element nodes con complexType inline o sequence
    processElementNodes(node, targetNamespace, currentNamespaces, object, isQualified);
    
    return object;
};

export const schemaToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes): any => {
    const object: any = {};
    const isQualified = node.elementFormDefault === 'qualified';
    const elementNode = getElementNode(node);
    
    if (Array.isArray(elementNode)) {
        for (const item of elementNode) {
            const elementName = item.name;
            // Si no tiene name pero tiene type, usar el type como nombre
            if (!elementName) {
                if (item.type) {
                    // Intentar usar el tipo como nombre
                    const typeName = item.type.includes(':') ? item.type.split(':')[1] : item.type;
                    if (typeName) {
                        const fullName = node.targetNamespace ? `${node.targetNamespace}:${typeName}` : typeName;
                        if (item.type && complexTypes[item.type]) {
                            object[fullName] = { ...complexTypes[item.type], $qualified: isQualified };
                        } else {
                            object[fullName] = { type: item.type || 'xsd:anyType', $qualified: isQualified };
                        }
                    }
                }
                continue;
            }
            
            // Buscar complexType inline
            const complexTypeNode = getComplexTypeNode(item);
            if (complexTypeNode !== undefined) {
                // Construir el nombre completo con namespace
                const fullName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                object[fullName] = complexTypeToObject(complexTypeNode, namespaces, complexTypes, node.targetNamespace, isQualified);
            } else if (item.type) {
                // Elemento que referencia un tipo existente
                const typeName = item.type;
                // Buscar el tipo en complexTypes
                const fullTypeName = typeName.includes(':') 
                    ? typeName 
                    : (node.targetNamespace ? `${node.targetNamespace}:${typeName}` : typeName);
                
                if (complexTypes[fullTypeName]) {
                    // El tipo existe en complexTypes, crear referencia
                    const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                    // El elemento tiene el $qualified del schema actual, pero su contenido interno
                    // mantiene el $qualified del tipo referenciado
                    // Crear un wrapper que preserve el namespace del elemento actual
                    const typeContent = complexTypes[fullTypeName];
                    object[fullElementName] = { 
                        type: typeContent,  // El contenido interno mantiene su propio $qualified
                        $qualified: isQualified,  // Este elemento específico usa el qualified del schema actual
                        $namespace: node.targetNamespace  // El namespace del elemento es el del schema actual
                    };
                } else {
                    // Tipo simple o no encontrado
                    const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                    object[fullElementName] = { type: typeName, $qualified: isQualified };
                }
            } else {
                // Elemento sin tipo definido
                const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                object[fullElementName] = { type: 'xsd:anyType', $qualified: isQualified };
            }
        }
    } else if (elementNode !== undefined) {
        const element = elementNode as XmlNode;
        const elementName = element.name;
        
        if (elementName) {
            // Buscar complexType inline en el elemento o en el schema
            const complexTypeNode = getComplexTypeNode(element) || getComplexTypeNode(node);
            if (complexTypeNode !== undefined) {
                const fullName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                object[fullName] = complexTypeToObject(complexTypeNode, namespaces, complexTypes, node.targetNamespace, isQualified);
            } else if (element.type) {
                // Elemento que referencia un tipo
                const typeName = element.type;
                const fullTypeName = typeName.includes(':') 
                    ? typeName 
                    : (node.targetNamespace ? `${node.targetNamespace}:${typeName}` : typeName);
                
                if (complexTypes[fullTypeName]) {
                    const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                    // El elemento tiene el $qualified del schema actual, pero su contenido interno
                    // mantiene el $qualified del tipo referenciado
                    const typeContent = complexTypes[fullTypeName];
                    object[fullElementName] = { 
                        type: typeContent,
                        $qualified: isQualified,
                        $namespace: node.targetNamespace
                    };
                } else {
                    const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                    object[fullElementName] = { type: typeName, $qualified: isQualified };
        }
    } else {
                const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                object[fullElementName] = { type: 'xsd:anyType', $qualified: isQualified };
            }
        }
    }
    
    // Si no encontramos elementos pero hay complexTypes, agregarlos también
    const schemaKeys = Object.keys(object).filter(k => k !== '$namespace' && k !== '$qualified');
    if (schemaKeys.length === 0 && Object.keys(complexTypes).length > 0) {
        // Agregar los complexTypes directamente al objeto
        for (const [typeName, typeObject] of Object.entries(complexTypes)) {
            object[typeName] = typeObject;
    }
    }
    
    object["$namespace"] = node.targetNamespace;
    object["$qualified"] = isQualified;
    return object;
};
