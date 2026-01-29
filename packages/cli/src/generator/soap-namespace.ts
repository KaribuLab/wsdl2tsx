const SOAP12_ENVELOPE_URI = 'http://www.w3.org/2003/05/soap-envelope';
const SOAP11_ENVELOPE_URI = 'http://schemas.xmlsoap.org/soap/envelope/';

/**
 * Determina la URI del namespace SOAP basado en las definiciones del WSDL
 */
export function getSoapNamespaceURI(definitionsNamespaces: Map<string, string>): string {
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
