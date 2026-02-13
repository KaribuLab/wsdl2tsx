export interface TypeDefinition {
    type: string | TypeObject;
    maxOccurs?: string;
    minOccurs?: string;
    $qualified?: boolean;
}

export interface TypeObject {
    [key: string]: TypeDefinition | string | boolean | undefined;
    $namespace?: string;
    $qualified?: boolean;
}

export interface NamespaceInfo {
    uri: string;
    prefix: string;
}

export interface NamespaceTagsMapping {
    [prefix: string]: string[];
}

export interface NamespacePrefixesMapping {
    [prefix: string]: string;
}

export interface NamespaceTypesMapping {
    [name: string]: NamespaceInfo;
}

export interface SimpleTypeData {
    name: string;
    tsType: string;
}

export interface PropertyData {
    name: string;
    type: string;
    modifier: string;
}

export interface InterfaceData {
    name: string;
    properties: PropertyData[];
}

export interface PropsInterfaceData {
    name: string;
    properties: Array<{ name: string; type: string }>;
}

export interface HeaderData {
    partName: string;
    elementName: string;
    headerType: string;
    headerTypeObject: TypeObject;
    xmlCode: string;
}

export interface TemplateData {
    requestType: string;
    namespaces: NamespaceTagsMapping;
    unqualifiedTags?: string[]; // tags sin namespace, para generar const y usar como variables
    simpleTypes: SimpleTypeData[];
    propsInterface: PropsInterfaceData;
    interfaces: InterfaceData[];
    soapNamespaceURI: string;
    xmlnsAttributes: NamespacePrefixesMapping;
    xmlBody: string;
    headers?: HeaderData[];
    // Response data (opcional)
    responseType?: string;
    responsePropsInterface?: PropsInterfaceData;
    responseInterfaces?: InterfaceData[];
}

export interface CombinedNamespaceMappings {
    tagsMapping: NamespaceTagsMapping
    prefixesMapping: NamespacePrefixesMapping
    typesMapping: NamespaceTypesMapping
    unqualifiedTags: string[]
}

/**
 * Recolecta información sobre tags usados durante la generación del XML
 * Mapea: tagLocalName -> namespacePrefix usado en el XML
 */
export interface TagUsageCollector {
    tagToPrefix: Map<string, string>; // tagLocalName -> prefix usado
    prefixToNamespace: Map<string, string>; // prefix -> namespace URI
    unqualifiedTags: Set<string>; // tagLocalName sin namespace (para variables individuales)
}
