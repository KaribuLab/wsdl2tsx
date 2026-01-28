# @karibulab/wsdl2tsx

Generador de código TypeScript/TSX desde archivos WSDL para crear componentes tipados que generan XML SOAP.

## Instalación

```bash
npm install -g @karibulab/wsdl2tsx
```

O usar directamente con `npx`:

```bash
npx @karibulab/wsdl2tsx <wsdl-url> <directorio-salida> [--operation=<nombre>]
```

## Uso

### Desde línea de comandos

```bash
wsdl2tsx <ruta-wsdl> <directorio-salida> [--operation=<nombre>]
```

**Ejemplos:**

```bash
# Generar todas las operaciones
wsdl2tsx http://ejemplo.com/servicio?wsdl ./output
```

```bash
# Generar solo una operación específica
wsdl2tsx http://ejemplo.com/servicio?wsdl ./output --operation=ConsultaCodigoPlan
```

```bash
# Con flag corto
wsdl2tsx http://ejemplo.com/servicio?wsdl ./output -o ConsultaCodigoPlan
```

### Parámetros

- `<ruta-wsdl>`: URL o ruta local al archivo WSDL
- `<directorio-salida>`: Directorio donde se generarán los archivos TSX
- `--operation=<nombre>` o `-o <nombre>` (opcional): Especifica el nombre de la operación a generar. Si no se especifica, se generan todas las operaciones con input definido. El nombre debe coincidir exactamente con el nombre de la operación en el WSDL (no es case-sensitive).

## Características

- ✅ Genera componentes TypeScript/TSX tipados desde WSDL
- ✅ **Soporta múltiples operaciones**: Genera un archivo TSX por cada operación del WSDL
- ✅ **Filtrado por operación**: Permite generar solo una operación específica con `--operation` o `-o`
- ✅ Respeta `elementFormDefault` para manejo correcto de namespaces
- ✅ Genera interfaces TypeScript para todos los tipos complejos
- ✅ Soporta múltiples schemas y namespaces
- ✅ Maneja imports y referencias entre schemas
- ✅ Omite automáticamente operaciones sin input (notificaciones, solo-output)
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
node dist/cli.js <wsdl-url> <output-dir> [--operation=<nombre>]
```

### Notas sobre operaciones

- **Operaciones sin input**: Las operaciones que no tienen un nodo `input` definido (como notificaciones o operaciones solo-output) se omiten automáticamente con una advertencia.
- **Múltiples operaciones**: Por defecto, el CLI procesa todas las operaciones válidas y genera un archivo por cada una.
- **Filtrado**: Usa `--operation` o `-o` para generar solo una operación específica, útil cuando trabajas con WSDL grandes.

## Licencia

ISC

## Repositorio

https://github.com/KaribuLab/wsdl2tsx
