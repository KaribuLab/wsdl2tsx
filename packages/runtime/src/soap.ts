import { ns } from "./ns.js";

export const SOAP_TAGS = ["Envelope", "Header", "Body"] as const;

export type SoapTag = typeof SOAP_TAGS[number];

export const soap = ns("soap", SOAP_TAGS);
