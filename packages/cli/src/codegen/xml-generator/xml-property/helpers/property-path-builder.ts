import { toCamelCase } from "../../../../util.js";
import { extractLocalName } from "../../../utils.js";

/**
 * Construye el propertyPath completo
 */
export function buildPropertyPath(
    propertyPath: string,
    tagCamelCase: string
): string {
    // Si propertyPath ya termina con el nombre del tag actual, no agregarlo de nuevo
    return propertyPath 
        ? (propertyPath.endsWith(`.${tagCamelCase}`) || propertyPath === tagCamelCase
            ? propertyPath
            : `${propertyPath}.${tagCamelCase}`)
        : tagCamelCase;
}
