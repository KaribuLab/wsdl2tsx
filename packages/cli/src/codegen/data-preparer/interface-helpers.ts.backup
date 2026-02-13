import { toPascalCase } from "../../util.js";
import { NAMESPACE_KEY } from "../constants.js";
import { extractLocalName } from "../utils.js";
import { extractNestedComplexTypes } from "./type-resolver.js";
import { debugContext } from "../../logger.js";
import type { TypeObject } from "../types.js";

/**
 * Busca una clave de tipo que coincida en allTypesForInterfaces
 * Busca por nombre local y también por coincidencia parcial del namespace
 */
export function findMatchingTypeKey(
    propKey: string,
    propInterfaceName: string,
    allTypesForInterfaces: TypeObject
): string | undefined {
    debugContext("findMatchingTypeKey", `Buscando tipo para "${propKey}" (interfaceName: "${propInterfaceName}")`);
    
    // Buscar el tipo en allTypesForInterfaces por nombre local (sin namespace)
    let matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => {
        const kLocalName = extractLocalName(k);
        return toPascalCase(kLocalName) === propInterfaceName;
    });
    
    // Si no se encuentra por nombre local, buscar también por coincidencia parcial del namespace
    // Esto es necesario porque el tipo puede estar referenciado con namespace completo
    if (!matchingTypeKey && propKey.includes(':')) {
        debugContext("findMatchingTypeKey", `No se encontró por nombre local, buscando por namespace parcial`);
        const propKeyLocalName = extractLocalName(propKey);
        matchingTypeKey = Object.keys(allTypesForInterfaces).find(k => {
            const kLocalName = extractLocalName(k);
            // Buscar por nombre local y también verificar si el namespace coincide parcialmente
            return toPascalCase(kLocalName) === toPascalCase(propKeyLocalName) ||
                   (k.includes(':') && k.endsWith(':' + propKeyLocalName)) ||
                   (propKey.includes(':') && propKey.endsWith(':' + kLocalName));
        });
    }
    
    if (matchingTypeKey) {
        debugContext("findMatchingTypeKey", `✓ Tipo encontrado: "${matchingTypeKey}"`);
    } else {
        debugContext("findMatchingTypeKey", `✗ Tipo no encontrado para "${propKey}"`);
    }
    
    return matchingTypeKey;
}

/**
 * Extrae un TypeObject de una definición de tipo
 * Maneja tanto tipos con wrapper 'type' como tipos complejos directos
 */
export function extractTypeObject(typeDef: any): TypeObject | null {
    if (typeof typeDef !== 'object' || typeDef === null) {
        return null;
    }
    
    // Si es un objeto con type que es objeto, es un tipo complejo
    if ('type' in typeDef && typeof typeDef.type === 'object') {
        const typeValue = typeDef.type;
        const typeKeys = Object.keys(typeValue).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
        if (typeKeys.length > 0) {
            return typeValue as TypeObject;
        }
    } else {
        // Es directamente un tipo complejo (sin wrapper type)
        const keys = Object.keys(typeDef).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
        if (keys.length > 0) {
            return typeDef as TypeObject;
        }
    }
    
    return null;
}

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
 * Procesa tipos complejos que están en allTypesForInterfaces pero no en requestTypeObject
 */
export function processAdditionalComplexTypes(
    allTypesForInterfaces: TypeObject,
    requestTypeObject: TypeObject,
    namespaceKey: string,
    xmlSchemaUri: string,
    extractionVisited: Set<string>,
    allComplexTypes: Array<{ interfaceName: string; typeObject: TypeObject }>
): void {
    debugContext("processAdditionalComplexTypes", `Procesando tipos adicionales de allTypesForInterfaces`);
    
    const allTypesKeys = Object.keys(allTypesForInterfaces).filter(k => 
        k !== namespaceKey && k !== '$namespace' && k !== '$qualified' && k !== '$base'
    );
    
    debugContext("processAdditionalComplexTypes", `Total de tipos a procesar: ${allTypesKeys.length}`);
    
    for (const key of allTypesKeys) {
        const localName = extractLocalName(key);
        const interfaceName = toPascalCase(localName);
        
        // Evitar duplicados
        if (extractionVisited.has(interfaceName)) continue;
        
        const typeDef = allTypesForInterfaces[key]!;
        const typeObject = extractTypeObject(typeDef);
        
        // Si encontramos un tipo complejo que no está en requestTypeObject, agregarlo
        if (typeObject) {
            const requestTypeKeys = Object.keys(requestTypeObject).filter(k => k !== namespaceKey);
            const isInRequestType = requestTypeKeys.some(k => {
                const kLocalName = extractLocalName(k);
                return toPascalCase(kLocalName) === interfaceName;
            });
            
            // También verificar si está en allComplexTypes ya extraídos
            const isAlreadyExtracted = allComplexTypes.some(ct => ct.interfaceName === interfaceName);
            
            if (!isInRequestType && !isAlreadyExtracted) {
                debugContext("processAdditionalComplexTypes", `Agregando tipo adicional: "${interfaceName}"`);
                extractionVisited.add(interfaceName);
                allComplexTypes.push({ interfaceName, typeObject });
                
                // También extraer tipos anidados dentro de este tipo
                const nestedTypes = extractNestedComplexTypes(
                    typeObject,
                    namespaceKey,
                    xmlSchemaUri,
                    extractionVisited
                );
                if (nestedTypes.length > 0) {
                    debugContext("processAdditionalComplexTypes", `  → Encontrados ${nestedTypes.length} tipo(s) anidado(s) en "${interfaceName}"`);
                }
                allComplexTypes.push(...nestedTypes);
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

/**
 * Procesa tipos del nivel superior que son tipos complejos
 */
export function processTopLevelTypes(
    requestTypeObject: TypeObject,
    namespaceKey: string,
    allTypesForInterfaces: TypeObject | undefined,
    simpleTypeNames: Set<string> | undefined,
    visited: Set<string>,
    interfaces: any[],
    prepareInterfaceData: (name: string, def: any, allTypes?: TypeObject) => any
): void {
    debugContext("processTopLevelTypes", `Procesando tipos del nivel superior`);
    
    const topLevelKeys = Object.keys(requestTypeObject)
        .filter(key => {
            if (key === namespaceKey) return false;
            const typeDef = requestTypeObject[key]!;
            // Incluir si es un objeto con type que es objeto (tipo complejo)
            if (typeof typeDef === 'object' && typeDef !== null && 'type' in typeDef) {
                const typeValue = (typeDef as any).type;
                if (typeof typeValue === 'object' && typeValue !== null) {
                    // Verificar que tenga propiedades además de $namespace
                    const typeKeys = Object.keys(typeValue).filter(k => k !== '$namespace' && k !== '$base');
                    return typeKeys.length > 0;
                }
            }
            return false;
        });
    
    debugContext("processTopLevelTypes", `Total de tipos del nivel superior encontrados: ${topLevelKeys.length}`);
    
    // Procesar tipos del nivel superior
    for (const key of topLevelKeys) {
        const localName = extractLocalName(key);
        const interfaceName = toPascalCase(localName);
        // Excluir tipos simples que ya se generan como export type
        if (simpleTypeNames && simpleTypeNames.has(interfaceName)) {
            debugContext("processTopLevelTypes", `Omitiendo tipo simple: "${interfaceName}"`);
            continue;
        }
        if (!visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName)) {
            debugContext("processTopLevelTypes", `Procesando tipo del nivel superior: "${interfaceName}"`);
            visited.add(interfaceName);
            interfaces.push(prepareInterfaceData(interfaceName, requestTypeObject[key] as any, allTypesForInterfaces));
        }
    }
}

/**
 * Procesa tipos restantes que están directamente en requestTypeObject
 * pero que no fueron procesados como tipos del nivel superior
 */
export function processRemainingTypes(
    requestTypeObject: TypeObject,
    namespaceKey: string,
    allTypesForInterfaces: TypeObject | undefined,
    simpleTypeNames: Set<string> | undefined,
    visited: Set<string>,
    interfaces: any[],
    prepareInterfaceData: (name: string, def: any, allTypes?: TypeObject) => any
): void {
    const remainingKeys = Object.keys(requestTypeObject)
        .filter(key => {
            if (key === namespaceKey || key === '$qualified') return false;
            // Solo procesar si es un complexType (tiene estructura de tipo complejo)
            const typeDef = requestTypeObject[key]!;
            if (typeof typeDef === 'object' && typeDef !== null) {
                // Si es un objeto con type que es objeto, es un tipo complejo
                if ('type' in typeDef && typeof (typeDef as any).type === 'object') {
                    const localName = extractLocalName(key);
                    const interfaceName = toPascalCase(localName);
                    // Verificar usando PascalCase y también si ya existe la interfaz
                    return !visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName);
                }
                // Si es directamente un tipo complejo (sin wrapper type), también procesarlo
                const keys = Object.keys(typeDef).filter(k => k !== '$namespace' && k !== '$base' && k !== '$qualified');
                if (keys.length > 0) {
                    const localName = extractLocalName(key);
                    const interfaceName = toPascalCase(localName);
                    return !visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName);
                }
            }
            return false;
        });
    
    for (const key of remainingKeys) {
        const localName = extractLocalName(key);
        const interfaceName = toPascalCase(localName);
        // Excluir tipos simples que ya se generan como export type
        if (simpleTypeNames && simpleTypeNames.has(interfaceName)) {
            continue;
        }
        if (!visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName)) {
            visited.add(interfaceName);
            const typeDef = requestTypeObject[key]!;
            
            // Preparar la estructura correcta para prepareInterfaceData
            if (typeof typeDef === 'object' && typeDef !== null && 'type' in typeDef && typeof (typeDef as any).type === 'object') {
                interfaces.push(prepareInterfaceData(localName, typeDef as any, allTypesForInterfaces));
            } else if (typeof typeDef === 'object' && typeDef !== null) {
                // Es un tipo complejo directo
                interfaces.push(prepareInterfaceData(localName, { type: typeDef } as any, allTypesForInterfaces));
            }
        }
    }
}

/**
 * Procesa tipos en allTypesForInterfaces que no están en requestTypeObject
 */
export function processMissingTypes(
    allTypesForInterfaces: TypeObject,
    namespaceKey: string,
    simpleTypeNames: Set<string> | undefined,
    visited: Set<string>,
    interfaces: any[],
    prepareInterfaceData: (name: string, def: any, allTypes?: TypeObject) => any
): void {
    debugContext("processMissingTypes", `Procesando tipos faltantes en allTypesForInterfaces`);
    
    const allTypesKeys = Object.keys(allTypesForInterfaces).filter(k => 
        k !== namespaceKey && k !== '$namespace' && k !== '$qualified' && k !== '$base'
    );
    const missingKeys = allTypesKeys.filter(key => {
        const localName = extractLocalName(key);
        const interfaceName = toPascalCase(localName);
        return !visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName);
    });
    
    debugContext("processMissingTypes", `Total de tipos faltantes encontrados: ${missingKeys.length}`);
    
    for (const key of missingKeys) {
        const localName = extractLocalName(key);
        const interfaceName = toPascalCase(localName);
        // Excluir tipos simples que ya se generan como export type
        if (simpleTypeNames && simpleTypeNames.has(interfaceName)) {
            debugContext("processMissingTypes", `Omitiendo tipo simple: "${interfaceName}"`);
            continue;
        }
        if (!visited.has(interfaceName) && !interfaces.some(i => i.name === interfaceName)) {
            debugContext("processMissingTypes", `Procesando tipo faltante: "${interfaceName}"`);
            visited.add(interfaceName);
            const typeDef = allTypesForInterfaces[key]!;
            const typeObject = extractTypeObject(typeDef);
            
            if (typeObject) {
                // Preparar la estructura correcta para prepareInterfaceData
                if ('type' in typeDef && typeof (typeDef as any).type === 'object') {
                    interfaces.push(prepareInterfaceData(localName, typeDef as any, allTypesForInterfaces));
                } else {
                    // Es directamente un tipo complejo (sin wrapper type)
                    interfaces.push(prepareInterfaceData(localName, { type: typeObject } as any, allTypesForInterfaces));
                }
            }
        }
    }
}
