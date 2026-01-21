#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const cliPackageJsonPath = join(rootDir, 'packages', 'cli', 'package.json');

// Obtener versión desde argumentos
const version = process.argv[2];

if (!version) {
  console.error('❌ Error: Se requiere la versión como argumento');
  console.error('Uso: node scripts/update-runtime-dependency.mjs <version>');
  process.exit(1);
}

try {
  // Leer package.json del CLI
  const cliPackageJson = JSON.parse(readFileSync(cliPackageJsonPath, 'utf-8'));
  
  // Actualizar dependencia del runtime
  cliPackageJson.dependencies['@karibulab/wsdl2tsx-runtime'] = version;
  
  // Escribir archivo actualizado
  writeFileSync(cliPackageJsonPath, JSON.stringify(cliPackageJson, null, 2) + '\n');
  
  console.log(`✅ Dependencia @karibulab/wsdl2tsx-runtime actualizada a ${version}`);
} catch (error) {
  console.error('❌ Error al actualizar dependencia:', error.message);
  process.exit(1);
}
