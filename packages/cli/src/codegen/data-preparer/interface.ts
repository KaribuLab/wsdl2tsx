import { toPascalCase } from "../../util.js";
import { NAMESPACE_KEY, XML_SCHEMA_TYPES, XML_SCHEMA_URI } from "../constants.js";
import { extractLocalName, extractXmlSchemaType, getFilteredKeys, getTypeModifier, isValidInterfaceProperty } from "../utils.js";
import { resolveTypeName, extractNestedComplexTypes } from "./type-resolver.js";
import type { InterfaceData, TypeObject } from "../types.js";
import {
    processAdditionalComplexTypes,
    processNestedTypesInComplexTypes,
    processTopLevelTypes,
    processRemainingTypes,
    processMissingTypes
} from "./interface-helpers.js";

/**
 * Prepara datos de una interfaz TypeScript para el template
 */
export function prepareInterfaceData(interfaceName: string, interfaceDefinition: { type: TypeObject } & Record<string, any>, allTypesForInterfaces?: TypeObject): InterfaceData {
    const keys = Object.keys(interfaceDefinition.type);
    const properties = keys
        .filter(prop => isValidInterfaceProperty(prop, interfaceDefinition))
        .map(prop => {
            const childrenField = interfaceDefinition.type[prop]!;
            
            let propertyType: string;
            let modifier: string;

            if (typeof childrenField === 'string') {
                // Direct string type (e.g., "xsd:string")
                const xmlSchemaType = extractXmlSchemaType(childrenField);
                propertyType = XML_SCHEMA_TYPES[xmlSchemaType] ?? 'string';
                modifier = '';
            } else if (typeof childrenField === 'object' && childrenField !== null) {
                // Nested complex type
                if ('type' in childrenField && typeof childrenField.type === 'string') {
                    // Tipo referenciado por string (ej: "tns2:CodigoPlanListTO" o "xsd:string")
                    // Usar resolveTypeName que maneja tanto tipos simples como complejos
                    propertyType = resolveTypeName(childrenField.type, prop, allTypesForInterfaces);
                } else {
                    // It's a nested object, so it's an inline complex type definition
                    // Intentar buscar el tipo correcto en allTypesForInterfaces basándose en el nombre de la propiedad
                    const propPascalCase = toPascalCase(prop);
                    if (allTypesForInterfaces) {
                        // Buscar un tipo que coincida con el nombre de la propiedad o que contenga el nombre
                        const matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => {
                            const kLocalName = extractLocalName(k);
                            // Buscar coincidencia exacta o parcial (ej: "CodigoPlanList" -> "CodigoPlanListTO")
                            return kLocalName === propPascalCase || 
                                   kLocalName.startsWith(propPascalCase) || 
                                   propPascalCase.startsWith(kLocalName);
                        });
                        
                        if (matchingTypeKey) {
                            propertyType = toPascalCase(extractLocalName(matchingTypeKey));
                        } else {
                            propertyType = propPascalCase; // Fallback al nombre de la propiedad
                        }
                    } else {
                        propertyType = propPascalCase; // Fallback al nombre de la propiedad
                    }
                }
                const propConfig = interfaceDefinition[prop] || childrenField;
                modifier = getTypeModifier(propConfig);
            } else {
                propertyType = 'any';
                modifier = '';
            }
            
            return {
                name: prop,
                type: propertyType,
                modifier,
            };
        });
    
    return {
        name: interfaceName,
        properties,
    };
}

/**
 * Prepara datos de todas las interfaces para el template
 */
export function prepareInterfacesData(requestTypeObject: TypeObject, namespaceKey: string, xmlSchemaUri: string, allTypesForInterfaces?: TypeObject, simpleTypeNames?: Set<string>): InterfaceData[] {
    const visited = new Set<string>();
    const interfaces: InterfaceData[] = [];
    
    const allKeys = Object.keys(requestTypeObject).filter(k => k !== namespaceKey);
    
    // Extraer todos los tipos complejos anidados recursivamente
    // Usar un Set separado para evitar duplicados durante la extracción, pero no afectar visited aún
    const extractionVisited = new Set<string>();
    const allComplexTypes = extractNestedComplexTypes(requestTypeObject, namespaceKey, xmlSchemaUri, extractionVisited);
    
    // IMPORTANTE: También buscar tipos complejos que están en allTypesForInterfaces pero no en requestTypeObject
    // Esto es necesario para tipos como ConsultarPerfilClienteResponseType que están referenciados
    // pero no están directamente en requestTypeObject como propiedades con tipos complejos inline
    if (allTypesForInterfaces) {
        processAdditionalComplexTypes(
            allTypesForInterfaces,
            requestTypeObject,
            namespaceKey,
            xmlSchemaUri,
            extractionVisited,
            allComplexTypes
        );
    }
    
    // Procesar tipos del nivel superior que son tipos complejos
    processTopLevelTypes(
        requestTypeObject,
        namespaceKey,
        allTypesForInterfaces,
        simpleTypeNames,
        visited,
        interfaces,
        prepareInterfaceData
    );
    
    // Procesar tipos complejos anidados encontrados recursivamente
    for (const { interfaceName, typeObject } of allComplexTypes) {
        // Excluir tipos simples que ya se generan como export type
        if (simpleTypeNames && simpleTypeNames.has(interfaceName)) {
            continue;
        }
        if (!visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName)) {
            visited.add(interfaceName);
            interfaces.push(prepareInterfaceData(interfaceName, { type: typeObject } as any, allTypesForInterfaces));
        }
    }
    
    // IMPORTANTE: También procesar tipos complejos que están dentro de propiedades de tipos en allTypesForInterfaces
    // Esto es necesario para tipos como ConsultarPerfilClienteResponseType que están dentro de respConsultarPerfilCliente
    // como propiedades con tipos complejos anidados, pero no se están extrayendo correctamente
    if (allTypesForInterfaces) {
        processNestedTypesInComplexTypes(
            allComplexTypes,
            requestTypeObject,
            namespaceKey,
            xmlSchemaUri,
            allTypesForInterfaces,
            visited,
            interfaces,
            extractionVisited,
            prepareInterfaceData
        );
    }
    
    // IMPORTANTE: También procesar todos los tipos complejos que están directamente en requestTypeObject
    // pero que no fueron procesados como tipos del nivel superior (porque tienen nombres completos con namespace)
    processRemainingTypes(
        requestTypeObject,
        namespaceKey,
        allTypesForInterfaces,
        simpleTypeNames,
        visited,
        interfaces,
        prepareInterfaceData
    );
    
    // IMPORTANTE: También procesar tipos en allTypesForInterfaces que no están en requestTypeObject
    // Esto asegura que se generen interfaces para tipos como PlanTO que están referenciados pero no directamente en requestTypeObject
    if (allTypesForInterfaces) {
        processMissingTypes(
            allTypesForInterfaces,
            namespaceKey,
            simpleTypeNames,
            visited,
            interfaces,
            prepareInterfaceData
        );
    }
    
    return interfaces;
}
