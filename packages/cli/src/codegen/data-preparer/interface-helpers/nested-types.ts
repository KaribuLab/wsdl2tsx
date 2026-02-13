import { toPascalCase } from "../../../util.js";
import { extractLocalName } from "../../utils.js";
import { extractNestedComplexTypes } from "../type-resolver.js";
import { debugContext } from "../../../logger.js";
import type { TypeObject } from "../../types.js";
import { findMatchingTypeKey, extractTypeObject } from "./type-matching.js";

/**
 * Procesa tipos complejos anidados dentro de propiedades
 * Retorna las interfaces generadas y actualiza visited
 */
export function processNestedComplexTypesInProperty(
    propKey: string,
    propTypeValue: TypeObject,
    propInterfaceName: string,
    namespaceKey: string,
    xmlSchemaUri: string,
    allTypesForInterfaces: TypeObject,
    visited: Set<string>,
    interfaces: any[],
    extractionVisited: Set<string>,
    prepareInterfaceData: (name: string, def: any, allTypes?: TypeObject) => any
): void {
    debugContext("processNestedComplexTypesInProperty", `Procesando tipo anidado en propiedad "${propKey}" → "${propInterfaceName}"`);
    
    // Verificar si este tipo está en allTypesForInterfaces pero no se ha procesado
    if (!visited.has(propInterfaceName) && !interfaces.some(i => i.name === propInterfaceName)) {
        const matchingTypeKey = findMatchingTypeKey(propKey, propInterfaceName, allTypesForInterfaces);
        
        if (matchingTypeKey) {
            const matchingTypeDef = allTypesForInterfaces[matchingTypeKey]!;
            const matchingTypeObject = extractTypeObject(matchingTypeDef);
            
            if (matchingTypeObject) {
                visited.add(propInterfaceName);
                interfaces.push(prepareInterfaceData(propInterfaceName, { type: matchingTypeObject } as any, allTypesForInterfaces));
            }
        } else {
            // Si no se encuentra en allTypesForInterfaces, usar el tipo inline directamente
            // Esto es necesario para tipos como ConsultarPerfilClienteResponseType que están
            // definidos inline dentro de propiedades
            debugContext("processNestedComplexTypesInProperty", `Usando tipo inline para "${propInterfaceName}"`);
            visited.add(propInterfaceName);
            interfaces.push(prepareInterfaceData(propInterfaceName, { type: propTypeValue } as any, allTypesForInterfaces));
            
            // También extraer tipos anidados dentro de este tipo inline
            const nestedTypes = extractNestedComplexTypes(
                propTypeValue,
                namespaceKey,
                xmlSchemaUri,
                extractionVisited
            );
            if (nestedTypes.length > 0) {
                debugContext("processNestedComplexTypesInProperty", `  → Extrayendo ${nestedTypes.length} tipo(s) anidado(s) de "${propInterfaceName}"`);
            }
            for (const { interfaceName: nestedInterfaceName, typeObject: nestedTypeObject } of nestedTypes) {
                if (!visited.has(nestedInterfaceName) && !interfaces.some(i => i.name === nestedInterfaceName)) {
                    visited.add(nestedInterfaceName);
                    interfaces.push(prepareInterfaceData(nestedInterfaceName, { type: nestedTypeObject } as any, allTypesForInterfaces));
                }
            }
        }
    }
}

/**
 * Procesa tipos complejos anidados dentro de propiedades de tipos complejos
 */
export function processNestedTypesInComplexTypes(
    allComplexTypes: Array<{ interfaceName: string; typeObject: TypeObject }>,
    requestTypeObject: TypeObject,
    namespaceKey: string,
    xmlSchemaUri: string,
    allTypesForInterfaces: TypeObject,
    visited: Set<string>,
    interfaces: any[],
    extractionVisited: Set<string>,
    prepareInterfaceData: (name: string, def: any, allTypes?: TypeObject) => any
): void {
    // Procesar también tipos que están directamente en allTypesForInterfaces como propiedades de otros tipos
    debugContext("processNestedTypesInComplexTypes", `Procesando tipos anidados en ${allComplexTypes.length} tipo(s) complejo(s)`);
    debugContext("processNestedTypesInComplexTypes", `Tipos complejos: ${allComplexTypes.map(ct => ct.interfaceName).join(', ')}`);
    
    // IMPORTANTE: También procesar tipos que están en allTypesForInterfaces pero no en allComplexTypes
    // Esto es necesario para tipos como RespConsultarPerfilCliente que están en allTypesForInterfaces
    // pero pueden no estar en allComplexTypes si no fueron extraídos desde requestTypeObject
    const allTypesKeys = Object.keys(allTypesForInterfaces).filter(k => 
        k !== namespaceKey && k !== '$namespace' && k !== '$qualified' && k !== '$base'
    );
    const complexTypesMap = new Map(allComplexTypes.map(ct => [ct.interfaceName, ct.typeObject]));
    
    for (const key of allTypesKeys) {
        const localName = extractLocalName(key);
        const interfaceName = toPascalCase(localName);
        
        // Si el tipo ya está en allComplexTypes, usar ese; si no, extraerlo de allTypesForInterfaces
        let typeObject: TypeObject | undefined = complexTypesMap.get(interfaceName);
        if (!typeObject) {
            const typeDef = allTypesForInterfaces[key]!;
            typeObject = extractTypeObject(typeDef);
        }
        
        if (typeObject) {
            const typeObjectKeys = Object.keys(typeObject).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
            debugContext("processNestedTypesInComplexTypes", `Revisando "${interfaceName}" con ${typeObjectKeys.length} propiedad(es): ${typeObjectKeys.slice(0, 5).join(', ')}${typeObjectKeys.length > 5 ? '...' : ''}`);
            for (const propKey of typeObjectKeys) {
                const propDef = typeObject[propKey]!;
                if (typeof propDef === 'object' && propDef !== null && 'type' in propDef) {
                    const propTypeValue = (propDef as any).type;
                    // Si type es un objeto (tipo complejo anidado), verificar si está en allTypesForInterfaces
                    if (typeof propTypeValue === 'object' && propTypeValue !== null) {
                        const propTypeKeys = Object.keys(propTypeValue).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
                        if (propTypeKeys.length > 0) {
                            const propLocalName = extractLocalName(propKey);
                            const propInterfaceName = toPascalCase(propLocalName);
                            debugContext("processNestedTypesInComplexTypes", `  → Propiedad "${propKey}" tiene tipo complejo anidado (${propTypeKeys.length} propiedades), procesando como "${propInterfaceName}"`);
                            
                            processNestedComplexTypesInProperty(
                                propKey,
                                propTypeValue as TypeObject,
                                propInterfaceName,
                                namespaceKey,
                                xmlSchemaUri,
                                allTypesForInterfaces,
                                visited,
                                interfaces,
                                extractionVisited,
                                prepareInterfaceData
                            );
                        }
                    } else if (typeof propTypeValue === 'string') {
                        // Tipo referenciado por string - verificar si está en allTypesForInterfaces
                        const propLocalName = extractLocalName(propKey);
                        const propInterfaceName = toPascalCase(propLocalName);
                        debugContext("processNestedTypesInComplexTypes", `  → Propiedad "${propKey}" referencia tipo "${propTypeValue}", buscando como "${propInterfaceName}"`);
                        
                        // IMPORTANTE: Si el tipo referenciado no existe en allTypesForInterfaces, podría ser un tipo complejo inline
                        // que necesita ser extraído. Buscar si existe en schemaObject o allComplexTypes
                        const matchingTypeKey = findMatchingTypeKey(propKey, propInterfaceName, allTypesForInterfaces);
                        if (!matchingTypeKey && propKey.toLowerCase().includes('responsetype')) {
                            debugContext("processNestedTypesInComplexTypes", `  ⚠️  Tipo "${propInterfaceName}" no encontrado en allTypesForInterfaces, podría ser un tipo complejo inline que necesita extracción`);
                        }
                    }
                } else if (typeof propDef === 'object' && propDef !== null) {
                    // Propiedad sin 'type' pero es un objeto - podría ser un tipo complejo directo (inline)
                    // Verificar si tiene propiedades que indiquen que es un tipo complejo
                    const propDefKeys = Object.keys(propDef).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
                    if (propDefKeys.length > 0) {
                        const propLocalName = extractLocalName(propKey);
                        const propInterfaceName = toPascalCase(propLocalName);
                        debugContext("processNestedTypesInComplexTypes", `  → Propiedad "${propKey}" es tipo complejo inline (${propDefKeys.length} propiedades), procesando como "${propInterfaceName}"`);
                        
                        // Procesar como tipo complejo inline
                        processNestedComplexTypesInProperty(
                            propKey,
                            propDef as TypeObject,
                            propInterfaceName,
                            namespaceKey,
                            xmlSchemaUri,
                            allTypesForInterfaces,
                            visited,
                            interfaces,
                            extractionVisited,
                            prepareInterfaceData
                        );
                    }
                }
            }
        }
    }
    
    // También procesar tipos que están en allComplexTypes (código original)
    for (const { interfaceName, typeObject } of allComplexTypes) {
        const typeObjectKeys = Object.keys(typeObject).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
        debugContext("processNestedTypesInComplexTypes", `Revisando "${interfaceName}" con ${typeObjectKeys.length} propiedad(es): ${typeObjectKeys.slice(0, 5).join(', ')}${typeObjectKeys.length > 5 ? '...' : ''}`);
        for (const propKey of typeObjectKeys) {
            const propDef = typeObject[propKey]!;
            if (typeof propDef === 'object' && propDef !== null && 'type' in propDef) {
                const propTypeValue = (propDef as any).type;
                // Si type es un objeto (tipo complejo anidado), verificar si está en allTypesForInterfaces
                if (typeof propTypeValue === 'object' && propTypeValue !== null) {
                    const propTypeKeys = Object.keys(propTypeValue).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
                    if (propTypeKeys.length > 0) {
                        const propLocalName = extractLocalName(propKey);
                        const propInterfaceName = toPascalCase(propLocalName);
                        debugContext("processNestedTypesInComplexTypes", `  → Propiedad "${propKey}" tiene tipo complejo anidado, procesando como "${propInterfaceName}"`);
                        
                        processNestedComplexTypesInProperty(
                            propKey,
                            propTypeValue as TypeObject,
                            propInterfaceName,
                            namespaceKey,
                            xmlSchemaUri,
                            allTypesForInterfaces,
                            visited,
                            interfaces,
                            extractionVisited,
                            prepareInterfaceData
                        );
                    }
                } else if (typeof propTypeValue === 'string') {
                    // Tipo referenciado por string - verificar si está en allTypesForInterfaces
                    const propLocalName = extractLocalName(propKey);
                    const propInterfaceName = toPascalCase(propLocalName);
                    debugContext("processNestedTypesInComplexTypes", `  → Propiedad "${propKey}" referencia tipo "${propTypeValue}", buscando como "${propInterfaceName}"`);
                }
            }
        }
    }
    
    // También procesar tipos que están directamente en requestTypeObject pero que tienen propiedades con tipos complejos
    const requestTypeKeys = Object.keys(requestTypeObject).filter(k => k !== namespaceKey && k !== '$qualified');
    for (const key of requestTypeKeys) {
        const typeDef = requestTypeObject[key]!;
        if (typeof typeDef === 'object' && typeDef !== null && 'type' in typeDef) {
            const typeValue = (typeDef as any).type;
            if (typeof typeValue === 'object' && typeValue !== null) {
                // Buscar propiedades dentro de typeValue que tengan tipos complejos anidados
                const typeValueKeys = Object.keys(typeValue).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
                for (const propKey of typeValueKeys) {
                    const propDef = typeValue[propKey]!;
                    if (typeof propDef === 'object' && propDef !== null && 'type' in propDef) {
                        const propTypeValue = (propDef as any).type;
                        if (typeof propTypeValue === 'object' && propTypeValue !== null) {
                            const propTypeKeys = Object.keys(propTypeValue).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
                            if (propTypeKeys.length > 0) {
                                const propLocalName = extractLocalName(propKey);
                                const propInterfaceName = toPascalCase(propLocalName);
                                
                                processNestedComplexTypesInProperty(
                                    propKey,
                                    propTypeValue as TypeObject,
                                    propInterfaceName,
                                    namespaceKey,
                                    xmlSchemaUri,
                                    allTypesForInterfaces,
                                    visited,
                                    interfaces,
                                    extractionVisited,
                                    prepareInterfaceData
                                );
                            }
                        }
                    }
                }
            }
        }
    }
}
