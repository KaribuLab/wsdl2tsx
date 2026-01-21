import {
    loadXml,
    getAllSchemaNodes,
    getTypesNode,
    getDefinitionsNode,
    getNamespacesFromNode,
    complexTypesFromSchema,
    schemaToObject,
    getRequestTypeFromDefinitions,
    getElementNode,
} from "./wsdl.js";
import {
    extractAllNamespaceMappings,
    prepareTemplateData,
} from "./template.js";
import { registerHandlebarsHelpers } from "./template-helpers.js";
import Handlebars, { type TemplateDelegate } from "handlebars";
import fs from "fs";
import path from "path";
// __dirname ya está disponible en CommonJS

/**
 * Verifica si un tipo está referenciado en algún lugar del objeto de tipo
 */
function isTypeReferenced(typeName: string, typeObject: any, allComplexTypes: any, visited: Set<string> = new Set()): boolean {
    if (visited.has(typeName)) return false;
    visited.add(typeName);
    
    const typeLocalName = typeName.split(':').pop()!;
    
    // Buscar en todas las propiedades del objeto
    for (const [key, value] of Object.entries(typeObject)) {
        if (key === '$namespace' || key === '$base') continue;
        
        if (typeof value === 'object' && value !== null) {
            // Si tiene una propiedad type que es un string, verificar si coincide
            if ('type' in value && typeof value.type === 'string') {
                const referencedType = value.type;
                // Comparar por nombre completo o por nombre local
                if (referencedType === typeName || 
                    referencedType.endsWith(':' + typeLocalName) ||
                    referencedType.split(':').pop() === typeLocalName) {
                    return true;
                }
                // Si el tipo referenciado está en complexTypes, buscar recursivamente dentro de él
                const fullReferencedType = Object.keys(allComplexTypes).find(k => 
                    k === referencedType || 
                    k.endsWith(':' + referencedType.split(':').pop()) ||
                    k.split(':').pop() === referencedType.split(':').pop()
                );
                if (fullReferencedType && allComplexTypes[fullReferencedType]) {
                    if (isTypeReferenced(typeName, allComplexTypes[fullReferencedType], allComplexTypes, visited)) {
                        return true;
                    }
                }
            } else if ('type' in value && typeof value.type === 'object') {
                // Tipo complejo anidado (objeto completo), verificar si es el mismo tipo
                // Comparar estructura o buscar recursivamente
                if (isTypeReferenced(typeName, value.type, allComplexTypes, visited)) {
                    return true;
                }
                // También verificar si este objeto anidado coincide con el tipo buscado
                // comparando las claves principales
                if (value.type && typeof value.type === 'object') {
                    const nestedKeys = Object.keys(value.type).filter((k: string) => k !== '$namespace' && k !== '$base');
                    const typeDef = allComplexTypes[typeName];
                    if (typeDef && typeof typeDef === 'object') {
                        const typeKeys = Object.keys(typeDef).filter((k: string) => k !== '$namespace' && k !== '$base');
                        if (nestedKeys.length > 0 && nestedKeys.every((k: string) => typeKeys.includes(k))) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    
    return false;
}

// Ruta al template Handlebars
const TEMPLATE_PATH = path.join(__dirname, "templates", "component.hbs");

// Cache para el template compilado
let compiledTemplate: TemplateDelegate | null = null;
let templateSource: string | null = null;

const SOAP12_ENVELOPE_URI = 'http://www.w3.org/2003/05/soap-envelope';
const SOAP11_ENVELOPE_URI = 'http://schemas.xmlsoap.org/soap/envelope/';

/**
 * Determina la URI del namespace SOAP basado en las definiciones del WSDL
 */
function getSoapNamespaceURI(definitionsNamespaces: Map<string, string>): string {
    const soapEntry = Array.from(definitionsNamespaces.entries())
        .find(entry => entry[1].includes('soap'));
    
    if (!soapEntry) {
        return SOAP11_ENVELOPE_URI;
    }
    
    const lastPart = soapEntry[1].split('/').slice(-1)[0]!;
    return lastPart === 'soap12' 
        ? SOAP12_ENVELOPE_URI 
        : SOAP11_ENVELOPE_URI;
}

/**
 * Compila el template Handlebars y genera el código del componente
 */
function compileTemplate(templateData: any): string {
    // Registrar helpers de Handlebars (solo una vez)
    registerHandlebarsHelpers();
    
    // Leer y cachear el template
    if (!templateSource) {
        templateSource = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    }
    
    // Cachear el template compilado
    if (!compiledTemplate) {
        compiledTemplate = Handlebars.compile(templateSource);
    }
    
    // Compilar el template con los datos
    return compiledTemplate(templateData);
}

/**
 * Función principal que genera el archivo TSX desde un WSDL
 */
export async function generateTsxFromWsdl(wsdlPath: string, outDir: string): Promise<void> {
    const wsdlRoot = await loadXml(wsdlPath);
    const definitionsNode = getDefinitionsNode(wsdlRoot);
    if (!definitionsNode) {
        throw new Error('No se encontró el nodo definitions en el WSDL');
    }
    const typeNode = getTypesNode(definitionsNode);
    if (!typeNode) {
        throw new Error('No se encontró el nodo types en el WSDL');
    }
    
    // Obtener TODOS los schemas (puede haber múltiples)
    const schemaNodes = getAllSchemaNodes(typeNode);
    
    if (schemaNodes.length === 0) {
        throw new Error('No se encontraron nodos schema en el WSDL');
    }
    
    const definitionsNamespaces = getNamespacesFromNode(definitionsNode);
    const soapNamespaceURI = getSoapNamespaceURI(definitionsNamespaces);
    
    // Recopilar namespaces de todos los schemas
    let allNamespaces = new Map(definitionsNamespaces);
    for (const schemaNode of schemaNodes) {
    const schemaNamespaces = getNamespacesFromNode(schemaNode);
        allNamespaces = new Map([...allNamespaces, ...schemaNamespaces]);
    }
    
    // Procesar todos los schemas para obtener complexTypes
    let allComplexTypes: any = {};
    for (const schemaNode of schemaNodes) {
        const complexTypes = await complexTypesFromSchema(wsdlPath, schemaNode, allNamespaces);
        allComplexTypes = { ...allComplexTypes, ...complexTypes };
    }
    
    // Procesar todos los schemas para obtener elementos y construir schemaObject
    let schemaObject: any = {};
    for (const schemaNode of schemaNodes) {
        const schemaObj = schemaToObject(schemaNode, allNamespaces, allComplexTypes);
        // Combinar objetos, evitando sobrescribir $namespace
        for (const [key, value] of Object.entries(schemaObj)) {
            if (key !== '$namespace' || !schemaObject['$namespace']) {
                schemaObject[key] = value;
            }
        }
        // Usar el $namespace del último schema si no hay uno definido
        if (!schemaObject['$namespace'] && schemaObj['$namespace']) {
            schemaObject['$namespace'] = schemaObj['$namespace'];
        }
    }
    
    // Validar que schemaObject tenga contenido
    const schemaKeys = Object.keys(schemaObject).filter(k => k !== '$namespace');
    if (schemaKeys.length === 0) {
        const complexTypeKeys = Object.keys(allComplexTypes);
        
        // Debug: obtener información detallada de los elementos en todos los schemas
        let elementDetails = '';
        for (let i = 0; i < schemaNodes.length; i++) {
            const schemaNode = schemaNodes[i];
            const elementNode = getElementNode(schemaNode);
            const hasElements = elementNode !== undefined;
            
            if (hasElements) {
                elementDetails += `\nSchema [${i}] (targetNamespace: ${schemaNode.targetNamespace || 'no definido'}):\n`;
                if (Array.isArray(elementNode)) {
                    elementDetails += `  Detalles de elementos:\n`;
                    elementNode.forEach((elem, idx) => {
                        elementDetails += `    [${idx}]: name=${elem.name || 'sin nombre'}, type=${elem.type || 'sin tipo'}, ref=${elem.ref || 'sin ref'}\n`;
                    });
                } else {
                    const elem = elementNode as any;
                    elementDetails += `  Detalle del elemento: name=${elem.name || 'sin nombre'}, type=${elem.type || 'sin tipo'}, ref=${elem.ref || 'sin ref'}\n`;
                }
            }
        }
        
        let errorMsg = 'El schema no contiene tipos definidos.\n';
        errorMsg += `- Schemas encontrados: ${schemaNodes.length}\n`;
        errorMsg += `- ComplexTypes encontrados: ${complexTypeKeys.length > 0 ? complexTypeKeys.join(', ') : 'ninguno'}\n`;
        errorMsg += `- Elementos en schemas:${elementDetails || ' ninguno'}\n`;
        errorMsg += `- Namespaces disponibles: ${Array.from(allNamespaces.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
        
        if (complexTypeKeys.length > 0) {
            errorMsg += '\nSugerencia: Los tipos están definidos como complexTypes pero no como elementos. ';
            errorMsg += 'Puede que el WSDL use referencias de tipo en lugar de elementos directos.';
        } else if (elementDetails) {
            errorMsg += '\nSugerencia: Hay elementos pero no se pudieron procesar. ';
            errorMsg += 'Verifica que los elementos tengan name o type definido.';
        }
        
        throw new Error(errorMsg);
    }
    
    const requestType = getRequestTypeFromDefinitions(definitionsNode, schemaObject);
    
    if (!requestType) {
        throw new Error('No se pudo determinar el tipo de solicitud desde las definiciones del WSDL');
    }
    
    const requestTypeObject = schemaObject[requestType] as any;
    
    if (!requestTypeObject) {
        throw new Error(`No se encontró el objeto de tipo ${requestType} en el schema`);
    }
    
    // Asegurar que el objeto tenga $namespace
    if (!requestTypeObject['$namespace'] && schemaObject['$namespace']) {
        requestTypeObject['$namespace'] = schemaObject['$namespace'];
    }
    
    if (!requestTypeObject['$namespace']) {
        throw new Error(`El tipo ${requestType} no tiene namespace definido`);
    }
    
    // Incluir todos los complexTypes referenciados en el requestTypeObject
    // Esto asegura que se generen interfaces para tipos como CodigoPlanListTO que están referenciados
    if (Object.keys(allComplexTypes).length > 0) {
    }
    
    const allTypesForInterfaces: any = { ...requestTypeObject };
    
    // Función recursiva para encontrar todos los tipos referenciados
    const findReferencedTypes = (obj: any, found: Set<string> = new Set(), depth: number = 0): Set<string> => {
        const indent = '  '.repeat(depth);
        for (const [key, value] of Object.entries(obj)) {
            if (key === '$namespace' || key === '$base') continue;
            
            if (typeof value === 'object' && value !== null && 'type' in value) {
                const typeValue = (value as any).type;
                if (typeof typeValue === 'string') {
                    // Buscar si este tipo está en allComplexTypes
                    const matchingType = Object.keys(allComplexTypes).find(k => 
                        k === typeValue || 
                        k.endsWith(':' + typeValue.split(':').pop()) ||
                        k.split(':').pop() === typeValue.split(':').pop()
                    );
                    if (matchingType && !found.has(matchingType)) {
                        found.add(matchingType);
                        // Buscar recursivamente dentro del tipo encontrado
                        if (allComplexTypes[matchingType]) {
                            findReferencedTypes(allComplexTypes[matchingType], found, depth + 1);
                        }
                    } else if (matchingType && found.has(matchingType)) {
                    }
                } else if (typeof typeValue === 'object' && typeValue !== null) {
                    // Tipo complejo anidado, buscar recursivamente
                    findReferencedTypes(typeValue, found, depth + 1);
                }
            }
        }
        return found;
    };
    
    const referencedTypeNames = findReferencedTypes(requestTypeObject);
    if (referencedTypeNames.size > 0) {
    }
    
    // Agregar tipos referenciados encontrados como strings
    for (const typeName of referencedTypeNames) {
        if (!allTypesForInterfaces[typeName] && allComplexTypes[typeName]) {
            allTypesForInterfaces[typeName] = allComplexTypes[typeName];
        }
    }
    
    // IMPORTANTE: Incluir TODOS los complexTypes que están en allComplexTypes
    // porque algunos pueden estar referenciados indirectamente o expandidos en la estructura
    for (const [typeName, typeDef] of Object.entries(allComplexTypes)) {
        if (!allTypesForInterfaces[typeName]) {
            allTypesForInterfaces[typeName] = typeDef;
        }
    }
    
    
    // Extraer todos los mappings de namespace en una sola pasada (optimización)
    const namespaceMappings = extractAllNamespaceMappings(requestType, requestTypeObject);
    const namespacesTagsMapping = namespaceMappings.tagsMapping;
    const namespacesPrefixMapping = namespaceMappings.prefixesMapping;
    const namespacesTypeMapping = namespaceMappings.typesMapping;
    const baseNamespacePrefix = namespacesTypeMapping[requestType]!.prefix;
    
    
    // Preparar datos estructurados para el template Handlebars
    // IMPORTANTE: Para propsInterface usar solo requestTypeObject (no allTypesForInterfaces)
    // Para interfaces usar allTypesForInterfaces para incluir todos los tipos referenciados
    const templateData = prepareTemplateData(
        requestType,
        requestTypeObject, // Usar requestTypeObject original para propsInterface
        namespacesTagsMapping,
        namespacesPrefixMapping,
        namespacesTypeMapping,
        soapNamespaceURI,
        baseNamespacePrefix,
        allTypesForInterfaces // Pasar allTypesForInterfaces como parámetro adicional para interfaces
    );
    
    if (templateData.interfaces.length > 0) {
    }
    
    // Compilar el template y generar el código
    const generatedCode = compileTemplate(templateData);
    
    // Extraer solo el nombre local del tipo (después del último ':') para el nombre del archivo
    const typeNameForFile = requestType.includes(':') 
        ? requestType.split(':').pop()! 
        : requestType;
    
    // Asegurar que el directorio de salida existe
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    
    const outputPath = path.join(outDir, `${typeNameForFile}.tsx`);
    fs.writeFileSync(outputPath, generatedCode);
    console.log(`Archivo ${typeNameForFile}.tsx generado correctamente en ${outDir}`);
}