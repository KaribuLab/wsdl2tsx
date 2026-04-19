import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import type { XmlNode } from "./types.js";

const HTTP_FETCH_TIMEOUT_MS = 30_000;

async function fetchXmlAsText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/xml, text/xml, */*",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Error HTTP ${response.status}: ${response.statusText} al descargar ${url}`
      );
    }
    return await response.text();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Tiempo de espera agotado al descargar ${url}. Verifica tu conexión o que el servidor responda.`
      );
    }
    if (error instanceof Error && error.message.startsWith("Error HTTP")) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error al descargar ${url}: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export const loadXml = async (xmlPath: string): Promise<XmlNode> => {
  let xmlContentString: string | Buffer;

  if (xmlPath.match(/^http(s)?:\/\//)) {
    xmlContentString = await fetchXmlAsText(xmlPath);
  } else {
    try {
      xmlContentString = fs.readFileSync(xmlPath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Error al leer archivo ${xmlPath}: ${message}`);
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error al parsear XML desde ${xmlPath}: ${message}`);
  }
};

export const loadXsd = async (wsdlFile: string, xsdPath: string): Promise<XmlNode> => {
  // Si xsdPath ya es una URL completa, usarla directamente
  if (xsdPath.match(/^http(s)?:\/\//)) {
    return await loadXml(xsdPath);
  }

  if (wsdlFile.match(/^http(s)?:\/\//)) {
    const wsdlURLWithoutName = wsdlFile.split("/").slice(0, -1).join("/");
    return await loadXml([wsdlURLWithoutName, xsdPath].join("/"));
  }
  const wsdlDir = path.dirname(wsdlFile);
  return await loadXml(path.resolve(wsdlDir, xsdPath));
};
