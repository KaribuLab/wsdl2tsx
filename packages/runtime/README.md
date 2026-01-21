# @karibulab/wsdl2tsx-runtime

Runtime XML para código TSX generado desde WSDL. Proporciona funciones JSX personalizadas para construir documentos XML/SOAP.

## Instalación

```bash
npm install @karibulab/wsdl2tsx-runtime
```

## Uso

Este paquete es utilizado automáticamente por el código generado por `@karibulab/wsdl2tsx`. No necesitas importarlo manualmente en la mayoría de los casos.

### Configuración de TypeScript

Para que TypeScript reconozca los elementos JSX personalizados, configura tu `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@karibulab/wsdl2tsx-runtime"
  }
}
```

### API

#### `soap`

Objeto con elementos SOAP predefinidos:

```tsx
import { soap } from "@karibulab/wsdl2tsx-runtime";

<soap.Envelope>
  <soap.Header />
  <soap.Body>
    {/* contenido */}
  </soap.Body>
</soap.Envelope>
```

#### `ns(prefix, tags)`

Función helper para crear namespaces personalizados:

```tsx
import { ns } from "@karibulab/wsdl2tsx-runtime";

const myns = ns("myns", ["tag1", "tag2"] as const);

<myns.tag1>
  <myns.tag2>Contenido</myns.tag2>
</myns.tag1>
```

### Ejemplo completo

```tsx
import { soap, ns } from "@karibulab/wsdl2tsx-runtime";

const facade = ns("facade", ["consultaCodigoPlan"] as const);

export function ConsultaCodigoPlan(props: ConsultaCodigoPlanProps) {
  return (
    <soap.Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap.Header />
      <soap.Body>
        <facade.consultaCodigoPlan>
          {/* contenido del body */}
        </facade.consultaCodigoPlan>
      </soap.Body>
    </soap.Envelope>
  );
}
```

### Obteniendo el string XML

Las funciones generadas retornan directamente un string XML. Puedes usarlas así:

```tsx
import { ConsultaCodigoPlan } from './consultaCodigoPlan';

// Llamar a la función con los props
const xmlString = ConsultaCodigoPlan({
  codigoPlanList: {
    planTO: {
      codigoPlan: "12345",
      tipoCliente: "FISICO"
    }
  }
});

// xmlString es un string XML válido que puedes usar directamente
console.log(xmlString);
// Output: <soap:Envelope xmlns:soap="...">...</soap:Envelope>

// Enviar en una petición HTTP
fetch('https://api.ejemplo.com/soap', {
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': 'consultaCodigoPlan'
  },
  body: xmlString
});
```

**Nota importante:** El runtime convierte JSX directamente a strings XML. No necesitas renderizar ni procesar el resultado - las funciones retornan el XML como string listo para usar.

## Características

- ✅ JSX personalizado para construir XML
- ✅ Soporte completo para namespaces XML
- ✅ Genera XML válido desde componentes TSX
- ✅ TypeScript tipado para todos los elementos
- ✅ Compatible con ESM (ES Modules)

## Desarrollo

```bash
# Clonar el repositorio
git clone https://github.com/KaribuLab/wsdl2tsx.git
cd wsdl2tsx

# Instalar dependencias
npm install

# Construir el runtime
npm run build:runtime
```

## Licencia

ISC

## Repositorio

https://github.com/KaribuLab/wsdl2tsx
