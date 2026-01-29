const SOAP12_ENVELOPE_URI = 'http://www.w3.org/2003/05/soap-envelope';
const SOAP11_ENVELOPE_URI = 'http://schemas.xmlsoap.org/soap/envelope/';

const SOAP12_BINDING_URI = 'http://schemas.xmlsoap.org/wsdl/soap12/';
const SOAP11_BINDING_URI = 'http://schemas.xmlsoap.org/wsdl/soap/';

/**
 * Determina la URI del namespace SOAP basado en las definiciones del WSDL
 * Busca específicamente el namespace del envelope SOAP (no el binding)
 */
export function getSoapNamespaceURI(definitionsNamespaces: Map<string, string>): string {
    // Primero buscar directamente los namespaces del envelope SOAP
    for (const uri of definitionsNamespaces.values()) {
        if (uri === SOAP12_ENVELOPE_URI) {
            return SOAP12_ENVELOPE_URI;
        }
        if (uri === SOAP11_ENVELOPE_URI) {
            return SOAP11_ENVELOPE_URI;
        }
    }
    
    // Si no se encuentra el namespace del envelope directamente, inferir desde el binding
    // Buscar el namespace del binding SOAP 1.2 o 1.1
    // El binding SOAP 1.2 tiene el URI: http://schemas.xmlsoap.org/wsdl/soap12/
    // El binding SOAP 1.1 tiene el URI: http://schemas.xmlsoap.org/wsdl/soap/
    for (const uri of definitionsNamespaces.values()) {
        // Detectar SOAP 1.2 binding: contiene "wsdl/soap12" o termina con "soap12/"
        if (uri === SOAP12_BINDING_URI || uri.includes('wsdl/soap12') || uri.endsWith('soap12/')) {
            return SOAP12_ENVELOPE_URI;
        }
        // Detectar SOAP 1.1 binding: contiene "wsdl/soap" pero NO "soap12"
        if (uri === SOAP11_BINDING_URI || (uri.includes('wsdl/soap') && !uri.includes('soap12'))) {
            return SOAP11_ENVELOPE_URI;
        }
    }
    
    // Fallback: buscar cualquier namespace que contenga "soap" y verificar si es SOAP 1.2
    const soapEntry = Array.from(definitionsNamespaces.entries())
        .find(entry => entry[1].includes('soap'));
    
    if (!soapEntry) {
        return SOAP11_ENVELOPE_URI;
    }
    
    // Si el namespace contiene "soap12" o "2003/05/soap-envelope", es SOAP 1.2
    const uri = soapEntry[1];
    if (uri.includes('soap12') || uri.includes('2003/05/soap-envelope')) {
        return SOAP12_ENVELOPE_URI;
    }
    
    // Por defecto, SOAP 1.1
    return SOAP11_ENVELOPE_URI;
}
