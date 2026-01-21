# @karibulab/wsdl2tsx

Generador de código TypeScript/TSX desde archivos WSDL para crear componentes tipados que generan XML SOAP.

## Instalación

```bash
npm install -g @karibulab/wsdl2tsx
```

O usar directamente con `npx`:

```bash
npx @karibulab/wsdl2tsx <wsdl-url> <directorio-salida>
```

## Uso

### Desde línea de comandos

```bash
wsdl2tsx <ruta-wsdl> <directorio-salida>
```

**Ejemplo:**

```bash
wsdl2tsx http://ejemplo.com/servicio?wsdl ./output
```

### Parámetros

- `<ruta-wsdl>`: URL o ruta local al archivo WSDL
- `<directorio-salida>`: Directorio donde se generarán los archivos TSX

## Características

- ✅ Genera componentes TypeScript/TSX tipados desde WSDL
- ✅ Respeta `elementFormDefault` para manejo correcto de namespaces
- ✅ Genera interfaces TypeScript para todos los tipos complejos
- ✅ Soporta múltiples schemas y namespaces
- ✅ Maneja imports y referencias entre schemas
- ✅ Genera código compatible con el runtime `@karibulab/wsdl2tsx-runtime`

## Ejemplo de salida

El CLI genera un archivo TSX por cada operación definida en el WSDL. Por ejemplo:

```tsx
import { soap, ns } from "@karibulab/wsdl2tsx-runtime";

export interface ConsultaCodigoPlanProps {
  codigoPlanList: CodigoPlanList;
}

export function ConsultaCodigoPlan(props: ConsultaCodigoPlanProps) {
  return (
    <soap.Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap.Header />
      <soap.Body>
        {/* XML generado automáticamente */}
      </soap.Body>
    </soap.Envelope>
  );
}
```

## Requisitos

- Node.js 18 o superior
- `@karibulab/wsdl2tsx-runtime` (se instala automáticamente como dependencia)

## Desarrollo

```bash
# Clonar el repositorio
git clone https://github.com/KaribuLab/wsdl2tsx.git
cd wsdl2tsx

# Instalar dependencias
npm install

# Construir el CLI
npm run build:cli

# Ejecutar localmente
cd packages/cli
node dist/cli.js <wsdl-url> <output-dir>
```

## Licencia

ISC

## Repositorio

https://github.com/KaribuLab/wsdl2tsx
