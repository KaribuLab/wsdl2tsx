// Tipos para nodos XML
export interface XmlNode {
    [key: string]: any;
    targetNamespace?: string;
    elementFormDefault?: string;
    name?: string;
    type?: string;
    ref?: string;
    schemaLocation?: string;
    message?: string;
    element?: string;
    base?: string;
    maxOccurs?: string;
    minOccurs?: string;
}

export interface ComplexTypes {
    [key: string]: any;
}
