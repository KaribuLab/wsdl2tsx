import fs from "fs";
import path from "path";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";

// Tipos para nodos XML
interface XmlNode {
    [key: string]: any;
    targetNamespace?: string;
    name?: string;
    type?: string;
    ref?: string;
    schemaLocation?: string;
    message?: string;
    element?: string;
    base?: string;
    maxOccurs?: string;
    minOccurs?: string;
}

interface ComplexTypes {
    [key: string]: any;
}

export const loadXml = async (xmlPath: string): Promise<XmlNode> => {
    let xmlContentString: string | Buffer;
    
    if (xmlPath.match(/^http(s)?:\/\//)) {
        try {
            const response = await axios.get(xmlPath, {
                responseType: 'text',
                timeout: 30000, // 30 segundos de timeout
                headers: {
                    'Accept': 'application/xml, text/xml, */*'
                }
            });
            xmlContentString = response.data;
        } catch (error: any) {
            if (error.response) {
                // El servidor respondió con un código de estado fuera del rango 2xx
                throw new Error(
                    `Error HTTP ${error.response.status}: ${error.response.statusText} al descargar ${xmlPath}`
                );
            } else if (error.request) {
                // La solicitud se hizo pero no se recibió respuesta
                throw new Error(
                    `No se recibió respuesta del servidor al intentar descargar ${xmlPath}. Verifica tu conexión a internet.`
                );
            } else {
                // Algo pasó al configurar la solicitud
                throw new Error(
                    `Error al configurar la solicitud para ${xmlPath}: ${error.message}`
                );
            }
        }
    } else {
        try {
            xmlContentString = fs.readFileSync(xmlPath);
        } catch (error: any) {
            throw new Error(`Error al leer archivo ${xmlPath}: ${error.message}`);
        }
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        removeNSPrefix: false,
    });
    
    try {
        const xmlContentObject = parser.parse(xmlContentString.toString());
        return xmlContentObject;
    } catch (error: any) {
        throw new Error(`Error al parsear XML desde ${xmlPath}: ${error.message}`);
    }
};

export const loadXsd = async (wsdlFile: string, xsdPath: string): Promise<XmlNode> => {
    if (wsdlFile.match(/^http(s)?:\/\//)) {
        const wsdlURLWithoutName = wsdlFile.split('/').slice(0, -1).join('/');
        return await loadXml([wsdlURLWithoutName, xsdPath].join('/'));
    }
    const wsdlDir = path.dirname(wsdlFile);
    return await loadXml(path.resolve(wsdlDir, xsdPath));
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

// Función para procesar un elemento individual
const processSingleElement = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined): any => {
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
        const inlineType = complexTypeToObject(complexTypeNode, namespaces, complexTypes ?? {}, targetNamespace);
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

// Función genérica para procesar elementos (usada por sequence, choice, all)
const processElementsToObject = (elementNode: XmlNode | XmlNode[] | undefined, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined): any => {
    // Si elementNode es undefined, retornar objeto vacío
    if (elementNode === undefined) {
        const object: any = {};
        if (targetNamespace !== undefined) {
            object["$namespace"] = targetNamespace;
        }
        return object;
    }
    
    if (Array.isArray(elementNode)) {
        const object: any = {};
        // Establecer el namespace del objeto al targetNamespace del schema
        if (targetNamespace !== undefined) {
            object["$namespace"] = targetNamespace;
        }
        for (const node of elementNode) {
            // Manejar elementos <any> que no tienen name
            if (node === undefined || node.name === undefined) {
                // Es un elemento <any> o undefined, podemos omitirlo o agregarlo como tipo especial
                continue;
            }
            const processedType = processSingleElement(node, namespaces, complexTypes, targetNamespace);
            object[node.name] = {
                maxOccurs: node.maxOccurs ?? '1',
                minOccurs: node.minOccurs ?? '1',
                type: processedType,
            };
        }
        return object;
    } else {
        const object: any = {};
        // Establecer el namespace del objeto al targetNamespace del schema
        if (targetNamespace !== undefined) {
            object["$namespace"] = targetNamespace;
        }
        
        // Manejar elementos <any> que no tienen name
        if (elementNode.name === undefined) {
            // Es un elemento <any>, retornar objeto con tipo especial
            return object;
        }
        
        const processedType = processSingleElement(elementNode, namespaces, complexTypes, targetNamespace);
        object[elementNode.name] = {
            maxOccurs: elementNode.maxOccurs ?? '1',
            minOccurs: elementNode.minOccurs ?? '1',
            type: processedType,
        };
        return object;
    }
};

export const sequenceToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined): any => {
    const elementNode = getElementNode(node);
    return processElementsToObject(elementNode, namespaces, complexTypes, targetNamespace);
};

export const choiceToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined): any => {
    const elementNode = getElementNode(node);
    return processElementsToObject(elementNode, namespaces, complexTypes, targetNamespace);
};

export const allToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined): any => {
    const elementNode = getElementNode(node);
    return processElementsToObject(elementNode, namespaces, complexTypes, targetNamespace);
};

export const groupToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined): any => {
    // Un group puede contener sequence, choice, all, etc.
    // Primero intentamos obtener los elementos directamente del group
    const elementNode = getElementNode(node);
    if (elementNode !== undefined) {
        return processElementsToObject(elementNode, namespaces, complexTypes, targetNamespace);
    }
    
    // Si no hay elementos directos, buscamos sequence, choice, all dentro del group
    const sequenceNode = getSequenceNode(node);
    if (sequenceNode !== undefined) {
        return sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace);
    }
    
    const choiceNode = getChoiceNode(node);
    if (choiceNode !== undefined) {
        return choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace);
    }
    
    const allNode = getAllNode(node);
    if (allNode !== undefined) {
        return allToObject(allNode, namespaces, complexTypes, targetNamespace);
    }
    
    // Si no encontramos nada, retornamos objeto vacío
    const object: any = {};
    if (targetNamespace !== undefined) {
        object["$namespace"] = targetNamespace;
    }
    return object;
};

export const simpleContentToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined): any => {
    const object: any = {};
    if (targetNamespace !== undefined) {
        object["$namespace"] = targetNamespace;
    }
    
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
            const seqResult = sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace);
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

export const complexContentToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes | undefined, targetNamespace: string | undefined): any => {
    const object: any = {};
    if (targetNamespace !== undefined) {
        object["$namespace"] = targetNamespace;
    }
    
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
            const seqResult = sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace);
            Object.assign(object, seqResult);
        }
        
        const choiceNode = getChoiceNode(extensionNode);
        if (choiceNode !== undefined) {
            const choiceResult = choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace);
            Object.assign(object, choiceResult);
        }
        
        const allNode = getAllNode(extensionNode);
        if (allNode !== undefined) {
            const allResult = allToObject(allNode, namespaces, complexTypes, targetNamespace);
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
            const seqResult = sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace);
            Object.assign(object, seqResult);
        }
        
        const choiceNode = getChoiceNode(restrictionNode);
        if (choiceNode !== undefined) {
            const choiceResult = choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace);
            Object.assign(object, choiceResult);
        }
        
        const allNode = getAllNode(restrictionNode);
        if (allNode !== undefined) {
            const allResult = allToObject(allNode, namespaces, complexTypes, targetNamespace);
            Object.assign(object, allResult);
        }
        
        return object;
    }
    
    return object;
};

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

export const complexTypeToObject = (node: XmlNode | XmlNode[] | undefined | null, namespaces: Map<string, string>, complexTypes: ComplexTypes, targetNamespace: string | undefined): any => {
    if (!node) {
        // Retornar objeto vacío si el nodo es undefined o null
        const object: any = {};
        if (targetNamespace !== undefined) {
            object["$namespace"] = targetNamespace;
        }
        return object;
    }
    if (Array.isArray(node)) {
        const resultObject: any = {};
        for (const item of node) {
            const sequenceNode = getSequenceNode(item);
            if (sequenceNode !== undefined) {
                resultObject[item.name!] = sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace);
                continue;
            }
            
            const choiceNode = getChoiceNode(item);
            if (choiceNode !== undefined) {
                resultObject[item.name!] = choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace);
                continue;
            }
            
            const allNode = getAllNode(item);
            if (allNode !== undefined) {
                resultObject[item.name!] = allToObject(allNode, namespaces, complexTypes, targetNamespace);
                continue;
            }
            
            const groupNode = getGroupNode(item);
            if (groupNode !== undefined) {
                resultObject[item.name!] = groupToObject(groupNode, namespaces, complexTypes, targetNamespace);
                continue;
            }
            
            const simpleContentNode = getSimpleContentNode(item);
            if (simpleContentNode !== undefined) {
                resultObject[item.name!] = simpleContentToObject(simpleContentNode, namespaces, complexTypes, targetNamespace);
                continue;
            }
            
            const complexContentNode = getComplexContentNode(item);
            if (complexContentNode !== undefined) {
                resultObject[item.name!] = complexContentToObject(complexContentNode, namespaces, complexTypes, targetNamespace);
                continue;
            }
        }
        return resultObject;
    } else {
        // Buscar sequence primero
        const sequenceNode = getSequenceNode(node);
        if (sequenceNode !== undefined) {
            const result = sequenceToObject(sequenceNode, namespaces, complexTypes, targetNamespace);
            // Establecer el namespace del objeto complejo al targetNamespace del schema
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            return result;
        }
        
        // Buscar choice
        const choiceNode = getChoiceNode(node);
        if (choiceNode !== undefined) {
            const result = choiceToObject(choiceNode, namespaces, complexTypes, targetNamespace);
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            return result;
        }
        
        // Buscar all
        const allNode = getAllNode(node);
        if (allNode !== undefined) {
            const result = allToObject(allNode, namespaces, complexTypes, targetNamespace);
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            return result;
        }
        
        // Buscar group
        const groupNode = getGroupNode(node);
        if (groupNode !== undefined) {
            const result = groupToObject(groupNode, namespaces, complexTypes, targetNamespace);
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            return result;
        }
        
        // Buscar simpleContent
        const simpleContentNode = getSimpleContentNode(node);
        if (simpleContentNode !== undefined) {
            const result = simpleContentToObject(simpleContentNode, namespaces, complexTypes, targetNamespace);
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            return result;
        }
        
        // Buscar complexContent
        const complexContentNode = getComplexContentNode(node);
        if (complexContentNode !== undefined) {
            const result = complexContentToObject(complexContentNode, namespaces, complexTypes, targetNamespace);
            if (targetNamespace !== undefined) {
                result["$namespace"] = targetNamespace;
            }
            return result;
        }
        
        throw new Error('No se encontró nodo sequence, choice, all, group, simpleContent o complexContent');
    }
};

export const complexTypesFromSchema = async (wsdlFile: string, node: XmlNode, namespaces: Map<string, string> | undefined): Promise<ComplexTypes> => {
    const targetNamespace = node.targetNamespace;
    const schemaNamespaces = namespaces ?? getNamespacesFromNode(node);
    const currentNamespaces = schemaNamespaces;
    let object: ComplexTypes = {};
    const importNode = getImportNode(node);
    if (importNode !== undefined) {
        if (Array.isArray(importNode)) {
            for (const item of importNode) {
                // Solo procesar imports que tengan schemaLocation definido
                if (!item.schemaLocation) {
                    // Import sin schemaLocation - los tipos pueden estar en el mismo WSDL
                    continue;
                }
                try {
                    const importedXsd = await loadXsd(wsdlFile, item.schemaLocation);
                    const schemaNode = getSchemaNode(importedXsd);
                    if (schemaNode) {
                        const importedComplexTypes = await complexTypesFromSchema(wsdlFile, schemaNode, currentNamespaces);
                        object = { ...object, ...importedComplexTypes };
                    }
                } catch (error: any) {
                    // Si falla al cargar el XSD externo, continuar sin él
                    // Los tipos pueden estar definidos en el mismo WSDL
                    console.warn(`Advertencia: No se pudo cargar el XSD importado desde ${item.schemaLocation}: ${error.message}`);
                }
            }
        } else {
            // Solo procesar imports que tengan schemaLocation definido
            if (importNode.schemaLocation) {
                try {
                    const importedXsd = await loadXsd(wsdlFile, importNode.schemaLocation);
                    const schemaNode = getSchemaNode(importedXsd);
                    if (schemaNode) {
                        const importedComplexTypes = await complexTypesFromSchema(wsdlFile, schemaNode, currentNamespaces);
                        object = { ...object, ...importedComplexTypes };
                    }
                } catch (error: any) {
                    // Si falla al cargar el XSD externo, continuar sin él
                    console.warn(`Advertencia: No se pudo cargar el XSD importado desde ${importNode.schemaLocation}: ${error.message}`);
                }
            }
        }
    }
    const complexTypeNode = getComplexTypeNode(node);
    if (complexTypeNode !== undefined) {
        if (Array.isArray(complexTypeNode)) {
            for (const item of complexTypeNode) {
                object[targetNamespace + ':' + item.name!] = complexTypeToObject(item, currentNamespaces, object, targetNamespace);
            }
        } else {
            object[targetNamespace + ':' + complexTypeNode.name!] = complexTypeToObject(complexTypeNode, currentNamespaces, object, targetNamespace);
        }
    }
    // Buscar elementos con complexType inline (elementos que tienen complexType dentro de ellos)
    const elementNode = getElementNode(node);
    if (elementNode !== undefined) {
        if (Array.isArray(elementNode)) {
            for (const item of elementNode) {
                const itemComplexType = getComplexTypeNode(item);
                if (itemComplexType !== undefined) {
                    // Elemento con complexType inline
                    object[targetNamespace + ':' + item.name!] = complexTypeToObject(itemComplexType, currentNamespaces, object, targetNamespace);
                } else if (getSequenceNode(item) !== undefined) {
                    // Elemento con sequence directamente (sin complexType wrapper)
                    object[targetNamespace + ':' + item.name!] = complexTypeToObject(item, currentNamespaces, object, targetNamespace);
                }
            }
        } else {
            const elementComplexType = getComplexTypeNode(elementNode as XmlNode);
            if (elementComplexType !== undefined) {
                // Elemento con complexType inline
                object[targetNamespace + ':' + (elementNode as XmlNode).name!] = complexTypeToObject(elementComplexType, currentNamespaces, object, targetNamespace);
            } else if (getSequenceNode(elementNode as XmlNode) !== undefined) {
                // Elemento con sequence directamente (sin complexType wrapper)
                object[targetNamespace + ':' + (elementNode as XmlNode).name!] = complexTypeToObject(elementNode as XmlNode, currentNamespaces, object, targetNamespace);
            }
        }
    }
    return object;
};

export const schemaToObject = (node: XmlNode, namespaces: Map<string, string>, complexTypes: ComplexTypes): any => {
    const object: any = {};
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
                            object[fullName] = complexTypes[item.type];
                        } else {
                            object[fullName] = { type: item.type || 'xsd:anyType' };
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
                object[fullName] = complexTypeToObject(complexTypeNode, namespaces, complexTypes, node.targetNamespace);
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
                    object[fullElementName] = complexTypes[fullTypeName];
                } else {
                    // Tipo simple o no encontrado
                    const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                    object[fullElementName] = { type: typeName };
                }
            } else {
                // Elemento sin tipo definido
                const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                object[fullElementName] = { type: 'xsd:anyType' };
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
                object[fullName] = complexTypeToObject(complexTypeNode, namespaces, complexTypes, node.targetNamespace);
            } else if (element.type) {
                // Elemento que referencia un tipo
                const typeName = element.type;
                const fullTypeName = typeName.includes(':') 
                    ? typeName 
                    : (node.targetNamespace ? `${node.targetNamespace}:${typeName}` : typeName);
                
                if (complexTypes[fullTypeName]) {
                    const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                    object[fullElementName] = complexTypes[fullTypeName];
                } else {
                    const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                    object[fullElementName] = { type: typeName };
                }
            } else {
                const fullElementName = node.targetNamespace ? `${node.targetNamespace}:${elementName}` : elementName;
                object[fullElementName] = { type: 'xsd:anyType' };
            }
        }
    }
    
    // Si no encontramos elementos pero hay complexTypes, agregarlos también
    const schemaKeys = Object.keys(object).filter(k => k !== '$namespace');
    if (schemaKeys.length === 0 && Object.keys(complexTypes).length > 0) {
        // Agregar los complexTypes directamente al objeto
        for (const [typeName, typeObject] of Object.entries(complexTypes)) {
            object[typeName] = typeObject;
        }
    }
    
    object["$namespace"] = node.targetNamespace;
    return object;
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

export const getOperationNode = (node: XmlNode): XmlNode | undefined => {
    const operationField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?operation/));
    return node[operationField!];
};

export const getInputNode = (node: XmlNode): XmlNode | undefined => {
    const inputField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?input/));
    return node[inputField!];
};

export const getPartNode = (node: XmlNode): XmlNode | undefined => {
    const partField = Object.keys(node).find(objectField => objectField.match(/([a-zA-z0-9]*:)?part/));
    return node[partField!];
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
