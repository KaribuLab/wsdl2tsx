import { getNamespacesFromNode } from "../../node-extractors.js";
import type { XmlNode } from "../../types.js";

/**
 * Función auxiliar para resolver un nombre de tipo
 */
export function resolveTypeName(name: string, definitionsNamespaces: Map<string, string>): string {
    if (name.includes(':')) {
        const [prefix, localName] = name.split(':');
        const namespaceUri = definitionsNamespaces.get(prefix);
        if (namespaceUri) {
            return `${namespaceUri}:${localName}`;
        }
    }
    return name;
}

/**
 * Función auxiliar para buscar un tipo en un objeto
 */
export function findTypeInObject(obj: any, typeName: string, resolvedTypeName: string): string | undefined {
    return Object.keys(obj).find(item => {
        if (item === '$namespace') return false;
        const itemLocalName = item.split(':').pop() || '';
        const typeLocalName = typeName.split(':').pop() || '';
        return item === resolvedTypeName || 
               item === typeName ||
               item.endsWith(`:${typeLocalName}`) ||
               resolvedTypeName.endsWith(itemLocalName) ||
               typeName.endsWith(itemLocalName);
    });
}

/**
 * Resuelve el tipo de solicitud desde un part node
 */
export function resolveRequestTypeFromPart(
    partNode: XmlNode,
    definitionsNamespaces: Map<string, string>,
    schemaObject: any,
    allComplexTypes?: any
): { requestType: string; operationName?: string } | null {
    // Manejar tanto 'element' como 'type' en el nodo part
    if (partNode.element) {
        // Caso 1: El part tiene 'element' (Document/Literal style)
        const elementName = partNode.element;
        const resolvedElementName = resolveTypeName(elementName, definitionsNamespaces);
        
        // Buscar el tipo en schemaObject (elementos)
        const requestType = findTypeInObject(schemaObject, elementName, resolvedElementName);
        
        if (requestType) {
            return { requestType };
        }
        
        // Si no se encuentra en schemaObject, buscar en allComplexTypes
        if (allComplexTypes) {
            const complexTypeKey = findTypeInObject(allComplexTypes, elementName, resolvedElementName);
            
            if (complexTypeKey) {
                // Crear un wrapper en schemaObject para que el resto del código funcione
                const complexType = allComplexTypes[complexTypeKey];
                schemaObject[complexTypeKey] = complexType;
                return { requestType: complexTypeKey };
            }
        }
        
        const availableTypes = Object.keys(schemaObject).filter(k => k !== '$namespace').join(', ');
        throw new Error(
            `No se encontró el tipo de solicitud '${partNode.element}' (resuelto: '${resolvedElementName}'). Tipos disponibles: ${availableTypes || 'ninguno'}`
        );
    } else if (partNode.type) {
        // Caso 2: El part tiene 'type' (RPC/Encoded o Document/Literal con type)
        const typeName = partNode.type;
        const resolvedTypeName = resolveTypeName(typeName, definitionsNamespaces);
        
        // Buscar primero en allComplexTypes (donde están los complexTypes)
        if (allComplexTypes) {
            const complexTypeKey = findTypeInObject(allComplexTypes, typeName, resolvedTypeName);
            
            if (complexTypeKey) {
                // Crear un wrapper en schemaObject para que el resto del código funcione
                const complexType = allComplexTypes[complexTypeKey];
                schemaObject[complexTypeKey] = complexType;
                return { requestType: complexTypeKey };
            }
        }
        
        // Si no se encuentra en allComplexTypes, buscar en schemaObject
        const requestType = findTypeInObject(schemaObject, typeName, resolvedTypeName);
        
        if (requestType) {
            return { requestType };
        }
        
        const availableTypes = Object.keys(schemaObject).filter(k => k !== '$namespace').join(', ');
        const availableComplexTypes = allComplexTypes ? Object.keys(allComplexTypes).filter(k => k !== '$namespace').join(', ') : 'ninguno';
        throw new Error(
            `No se encontró el tipo de solicitud '${partNode.type}' (resuelto: '${resolvedTypeName}'). ` +
            `Tipos en schemaObject: ${availableTypes || 'ninguno'}. Tipos en complexTypes: ${availableComplexTypes}`
        );
    } else {
        // Caso 3: No tiene ni 'element' ni 'type'
        return null;
    }
}
