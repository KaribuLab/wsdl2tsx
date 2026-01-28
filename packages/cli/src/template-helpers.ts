import Handlebars from "handlebars";
import { toPascalCase, toCamelCase } from "./util.js";
import { cachedSplit } from "./codegen/index.js";

const XML_SCHEMA_TYPES: Record<string, string> = {
    'string': 'string',
    'int': 'number',
    'float': 'number',
    'double': 'number',
    'boolean': 'boolean',
    'date': 'Date',
    'time': 'Date',
    'dateTime': 'Date',
    'duration': 'string',
    'gYearMonth': 'string',
    'gYear': 'string',
    'gMonthDay': 'string',
    'gDay': 'string',
    'gMonth': 'string',
    'gYearDay': 'string',
};

const DEFAULT_OCCURS = '1';

// Flag para evitar registro repetido de helpers
let helpersRegistered = false;

/**
 * Registra todos los helpers personalizados de Handlebars
 */
export function registerHandlebarsHelpers(): void {
    if (helpersRegistered) return;
    // Helper para convertir a PascalCase
    Handlebars.registerHelper('pascalCase', (str: string) => {
        return toPascalCase(str);
    });

    // Helper para convertir a camelCase
    Handlebars.registerHelper('camelCase', (str: string) => {
        return toCamelCase(str);
    });

    // Helper para obtener el modificador de tipo (?, [])
    Handlebars.registerHelper('typeModifier', (propConfig: any) => {
        const maxOccurs = propConfig?.maxOccurs ?? DEFAULT_OCCURS;
        const minOccurs = propConfig?.minOccurs ?? DEFAULT_OCCURS;
        
        if (maxOccurs !== DEFAULT_OCCURS) {
            return '[]';
        }
        if (minOccurs !== DEFAULT_OCCURS) {
            return '?';
        }
        return '';
    });

    // Helper para extraer y mapear tipos de XML Schema
    Handlebars.registerHelper('xmlSchemaType', (type: string) => {
        const parts = cachedSplit(type, ':');
        const xmlSchemaTypeName = parts[parts.length - 1]!;
        return XML_SCHEMA_TYPES[xmlSchemaTypeName] ?? 'string';
    });

    // Helper para generar atributos xmlns
    Handlebars.registerHelper('xmlnsAttributes', (namespacesPrefixMapping: Record<string, string>) => {
        return new Handlebars.SafeString(
            Object.keys(namespacesPrefixMapping)
                .map(key => `xmlns:${key}="${namespacesPrefixMapping[key]}"`)
                .join(' ')
        );
    });

    // Helper para generar nombres de tags en formato array
    Handlebars.registerHelper('tagNamesArray', (tags: string[]) => {
        return new Handlebars.SafeString(
            tags.map(tag => `"${tag}"`).join(', ')
        );
    });

    // Helper para generar propiedades XML recursivamente
    Handlebars.registerHelper('xmlProperty', function(
        this: any,
        namespacesTypeMapping: Record<string, { uri: string; prefix: string }>,
        baseNamespacePrefix: string,
        key: string,
        elementObject: any,
        parentKey: string | null = null
    ) {
        const getNamespacePrefix = (key: string, parentKey: string | null): string => {
            if (parentKey !== null) {
                return namespacesTypeMapping[parentKey]?.prefix ?? baseNamespacePrefix;
            }
            return namespacesTypeMapping[key]?.prefix ?? baseNamespacePrefix;
        };

        const namespacePrefix = getNamespacePrefix(key, parentKey);
        
        if (typeof elementObject?.type === 'object') {
            const keys = Object.keys(elementObject.type).filter(k => k !== '$namespace');
            const nestedProperties = keys
                .map(elementKey => {
                    return Handlebars.helpers.xmlProperty.call(
                        this,
                        namespacesTypeMapping,
                        baseNamespacePrefix,
                        elementKey,
                        elementObject.type[elementKey],
                        key
                    );
                })
                .join('\n');
            
            return new Handlebars.SafeString(`<${namespacePrefix}.${key}>
    ${nestedProperties}
    </${namespacePrefix}.${key}>`);
        }
        
        const propertyName = parentKey !== null
            ? `${toCamelCase(parentKey)}.${toCamelCase(key)}`
            : toCamelCase(key);
        
        return new Handlebars.SafeString(`<${namespacePrefix}.${key}>{props.${propertyName}}</${namespacePrefix}.${key}>`);
    });

    // Helper para comparar valores
    Handlebars.registerHelper('eq', (a: any, b: any) => {
        return a === b;
    });

    // Helper para verificar si un valor existe
    Handlebars.registerHelper('exists', (value: any) => {
        return value !== undefined && value !== null;
    });
    
    helpersRegistered = true;
}
