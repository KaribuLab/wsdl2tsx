import { toPascalCase } from "../../../util.js";
import { extractLocalName } from "../../utils.js";
import { resolveTypeName } from "../type-resolver.js";
import type { TypeObject } from "../../types.js";

/**
 * Determina el tipo TypeScript para un elemento que es un tipo complejo
 */
export function getComplexType(
    element: any,
    localName: string,
    allTypesForInterfaces: TypeObject | undefined
): string {
    if ('type' in element && typeof (element as any).type === 'string') {
        // Tipo referenciado por string (ej: "tns2:CodigoPlanListTO")
        return resolveTypeName((element as any).type, localName, allTypesForInterfaces);
    } else if ('type' in element && typeof (element as any).type === 'object') {
        // Tipo complejo inline con type como objeto - usar el nombre local en PascalCase como tipo de interfaz
        return toPascalCase(localName);
    } else {
        // Tipo complejo inline sin type - usar el nombre local en PascalCase como tipo de interfaz
        return toPascalCase(localName);
    }
}
