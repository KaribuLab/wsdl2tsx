import { toPascalCase } from "../../../util.js";
import { extractLocalName } from "../../utils.js";
import { extractNestedComplexTypes } from "../type-resolver.js";
import { debugContext } from "../../../logger.js";
import type { TypeObject } from "../../types.js";
import { extractTypeObject } from "./type-matching.js";

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
