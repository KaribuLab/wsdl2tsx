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
    simpleTypes: SimpleTypeData[];
    propsInterface: PropsInterfaceData;
    interfaces: InterfaceData[];
    soapNamespaceURI: string;
    xmlnsAttributes: NamespacePrefixesMapping;
    xmlBody: string;
    headers?: HeaderData[];
}

export interface CombinedNamespaceMappings {
    tagsMapping: NamespaceTagsMapping
    prefixesMapping: NamespacePrefixesMapping
    typesMapping: NamespaceTypesMapping
}
