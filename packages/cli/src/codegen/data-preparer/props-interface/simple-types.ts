import { extractXmlSchemaType } from "../../utils.js";
import { XML_SCHEMA_TYPES } from "../../constants.js";

/**
 * Determina el tipo TypeScript para un elemento que es un tipo simple (xsd:string, etc.)
 */
export function getSimpleType(element: string): string {
    const xmlSchemaType = extractXmlSchemaType(element);
    return XML_SCHEMA_TYPES[xmlSchemaType] ?? 'string';
}
