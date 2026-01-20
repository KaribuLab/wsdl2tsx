export function jsx(tag: any, props: any) {
    return buildXml(tag, props);
  }
  
  export function jsxs(tag: any, props: any) {
    return buildXml(tag, props);
  }
  
  function buildXml(tag: any, props: any) {
    const { children = [], ...attrs } = props || {};
  
    const tagName = typeof tag === "function" ? tag() : tag;
  
    const attrString = Object.entries(attrs)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join("");
  
    const inner = Array.isArray(children)
      ? children.join("")
      : children ?? "";
  
    if (!inner) return `<${tagName}${attrString}/>`;
    return `<${tagName}${attrString}>${inner}</${tagName}>`;
  }
