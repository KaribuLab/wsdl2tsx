import { NAMESPACE_KEY } from "../constants.js";
import type { SimpleTypeData, TypeDefinition, TypeObject } from "../types.js";

/**
 * Prepara datos de tipos simples para el template
 */
export function prepareSimpleTypesData(typeObject: TypeObject, xmlSchemaUri: string): SimpleTypeData[] {
    return Object.keys(typeObject)
        .filter(key => {
            if (key === NAMESPACE_KEY) return false;
            const typeDef = typeObject[key]!;
            if (typeof typeDef === 'boolean') return false;
            return typeof typeDef === 'string' || (typeof typeDef === 'object' && typeDef !== null && typeof typeDef.type === 'string' && typeDef.type.includes(xmlSchemaUri));
        })
        .map(key => {
            const typeDef = typeObject[key]!;
            if (typeof typeDef === 'boolean') {
                return { name: key, tsType: 'boolean' };
            }
            const typeValue = typeof typeDef === 'string' ? typeDef : ((typeDef as TypeDefinition).type as string);
            return {
                name: key,
                tsType: 'string',
            };
        });
}
