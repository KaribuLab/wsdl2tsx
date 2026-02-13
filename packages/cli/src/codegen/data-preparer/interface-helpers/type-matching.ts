import { toPascalCase } from "../../../util.js";
import { extractLocalName } from "../../utils.js";
import { debugContext } from "../../../logger.js";
import type { TypeObject } from "../../types.js";

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
