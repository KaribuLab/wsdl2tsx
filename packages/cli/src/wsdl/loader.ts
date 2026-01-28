import fs from "fs";
import path from "path";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import type { XmlNode } from "./types.js";

export const loadXml = async (xmlPath: string): Promise<XmlNode> => {
    let xmlContentString: string | Buffer;
    
    if (xmlPath.match(/^http(s)?:\/\//)) {
        try {
            const response = await axios.get(xmlPath, {
                responseType: 'text',
                timeout: 30000, // 30 segundos de timeout
                headers: {
                    'Accept': 'application/xml, text/xml, */*'
                }
            });
            xmlContentString = response.data;
        } catch (error: any) {
            if (error.response) {
                // El servidor respondió con un código de estado fuera del rango 2xx
                throw new Error(
                    `Error HTTP ${error.response.status}: ${error.response.statusText} al descargar ${xmlPath}`
                );
            } else if (error.request) {
                // La solicitud se hizo pero no se recibió respuesta
                throw new Error(
                    `No se recibió respuesta del servidor al intentar descargar ${xmlPath}. Verifica tu conexión a internet.`
                );
            } else {
                // Algo pasó al configurar la solicitud
                throw new Error(
                    `Error al configurar la solicitud para ${xmlPath}: ${error.message}`
                );
            }
        }
    } else {
        try {
        xmlContentString = fs.readFileSync(xmlPath);
        } catch (error: any) {
            throw new Error(`Error al leer archivo ${xmlPath}: ${error.message}`);
        }
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        removeNSPrefix: false,
    });
    
    try {
    const xmlContentObject = parser.parse(xmlContentString.toString());
    return xmlContentObject;
    } catch (error: any) {
        throw new Error(`Error al parsear XML desde ${xmlPath}: ${error.message}`);
    }
};

export const loadXsd = async (wsdlFile: string, xsdPath: string): Promise<XmlNode> => {
    if (wsdlFile.match(/^http(s)?:\/\//)) {
        const wsdlURLWithoutName = wsdlFile.split('/').slice(0, -1).join('/');
        return await loadXml([wsdlURLWithoutName, xsdPath].join('/'));
    }
    const wsdlDir = path.dirname(wsdlFile);
    return await loadXml(path.resolve(wsdlDir, xsdPath));
};
