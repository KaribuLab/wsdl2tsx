import { extractLocalName } from "../../../utils.js";
import type { TypeObject } from "../../../types.js";
import type { PropsInterfaceData } from "../../../types.js";
import { getSimpleType } from "../simple-types.js";
import { getComplexType } from "../complex-types.js";

/**
 * Construye las propiedades finales de la interfaz
 */
export function buildProperties(
    keys: string[],
    typeObject: TypeObject,
    allTypesForInterfaces?: TypeObject
): PropsInterfaceData['properties'] {
    // Usar nombres locales para las propiedades y determinar el tipo correcto
    // Filtrar propiedades internas que empiezan con _ (como _referencedElementNamespace)
    return keys
        .filter(key => {
            const localName = extractLocalName(key);
            // Filtrar propiedades internas que empiezan con _
            return !localName.startsWith('_');
        })
        .map(key => {
            const localName = extractLocalName(key);
            const element = typeObject[key]!;
            
            let propertyType: string;
            
            if (typeof element === 'string') {
                // Tipo simple (xsd:string, etc.)
                propertyType = getSimpleType(element);
            } else if (typeof element === 'object' && element !== null) {
                // Tipo complejo
                propertyType = getComplexType(element, localName, allTypesForInterfaces);
            } else {
                propertyType = 'any';
            }
            
            return {
                name: localName,
                type: propertyType,
            };
        });
}
