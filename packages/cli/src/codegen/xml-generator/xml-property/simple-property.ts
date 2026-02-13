import { debugContext } from "../../../logger.js";

/**
 * Genera código XML para propiedades de tipo simple
 */
export function generateSimplePropertyCode(
    openTag: string,
    closeTag: string,
    propertyPath: string,
    elementType?: string
): string {
    if (elementType) {
        debugContext("generateXmlPropertyCode", `Generando tag para tipo simple "${elementType}" con propertyPath "${propertyPath}"`);
    }
    return `${openTag}{props.${propertyPath}}${closeTag}`;
}
