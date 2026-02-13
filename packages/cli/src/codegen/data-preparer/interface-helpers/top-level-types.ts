import { toPascalCase } from "../../../util.js";
import { extractLocalName } from "../../utils.js";
import { debugContext } from "../../../logger.js";
import type { TypeObject } from "../../types.js";
import { extractTypeObject } from "./type-matching.js";

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
