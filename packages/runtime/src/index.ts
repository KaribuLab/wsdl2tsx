// JSX namespace declarations for TypeScript
// This allows any element name to be used as a JSX element
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
    interface Element extends String {}
  }
}

export { jsx, jsxs } from './jsx-runtime.js';
export { ns } from './ns.js';
export { soap, SOAP_TAGS, type SoapTag } from './soap.js';
export { xml, type TagFactory } from './tags.js';
