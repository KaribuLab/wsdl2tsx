#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const cliPackageJsonPath = join(rootDir, 'packages', 'cli', 'package.json');
const runtimePackageJsonPath = join(rootDir, 'packages', 'runtime', 'package.json');

console.log('🚀 Iniciando proceso de publicación...\n');

// 1. Verificar que kli está instalado
try {
  execSync('which kli', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ Error: kli no está instalado. Por favor instala kli primero.');
  console.error('   Visita: https://github.com/KaribuLab/kli');
  process.exit(1);
}

// 2. Ejecutar kli semver para obtener la versión
console.log('📊 Calculando versión con kli semver...');
let versionTag;
try {
  const output = execSync('kli semver', { 
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  versionTag = output.trim();
  
  if (!versionTag || versionTag === '') {
    console.log('⚠️  No se pudo calcular una versión. Asegúrate de tener commits con convenciones (fix:, feat:, etc.)');
    process.exit(0);
  }
  
  console.log(`✅ Versión calculada: ${versionTag}`);
} catch (error) {
  console.error('❌ Error al ejecutar kli semver:', error.message);
  process.exit(1);
}

// 3. Extraer versión sin prefijo 'v'
const version = versionTag.replace(/^v/, '');
console.log(`📦 Versión a publicar: ${version}\n`);

// 4. Construir ambos paquetes
console.log('🔨 Construyendo paquetes...');
try {
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
} catch (error) {
  console.error('❌ Error al construir los paquetes');
  process.exit(1);
}

// 5. Leer package.json de ambos paquetes
const cliPackageJson = JSON.parse(readFileSync(cliPackageJsonPath, 'utf-8'));
const runtimePackageJson = JSON.parse(readFileSync(runtimePackageJsonPath, 'utf-8'));
const originalRuntimeDependency = cliPackageJson.dependencies['@karibulab/wsdl2tsx-runtime'];

// 6. Actualizar versiones en package.json
console.log(`\n📝 Actualizando versiones a ${version}...`);

// Actualizar runtime
runtimePackageJson.version = version;
writeFileSync(runtimePackageJsonPath, JSON.stringify(runtimePackageJson, null, 2) + '\n');
console.log(`✅ packages/runtime/package.json actualizado a ${version}`);

// Actualizar CLI
cliPackageJson.version = version;
cliPackageJson.dependencies['@karibulab/wsdl2tsx-runtime'] = version;
writeFileSync(cliPackageJsonPath, JSON.stringify(cliPackageJson, null, 2) + '\n');
console.log(`✅ packages/cli/package.json actualizado a ${version}`);
console.log(`✅ Dependencia del runtime actualizada a ${version}\n`);

// 7. Publicar runtime primero
console.log('📦 Publicando @karibulab/wsdl2tsx-runtime...');
try {
  execSync('npm publish --access public', { 
    cwd: join(rootDir, 'packages', 'runtime'),
    stdio: 'inherit'
  });
  console.log(`✅ @karibulab/wsdl2tsx-runtime@${version} publicado exitosamente\n`);
} catch (error) {
  console.error('❌ Error al publicar runtime');
  // Restaurar dependencia original en caso de error
  cliPackageJson.dependencies['@karibulab/wsdl2tsx-runtime'] = originalRuntimeDependency;
  writeFileSync(cliPackageJsonPath, JSON.stringify(cliPackageJson, null, 2) + '\n');
  process.exit(1);
}

// 8. Publicar CLI
console.log('📦 Publicando @karibulab/wsdl2tsx...');
try {
  execSync('npm publish --access public', { 
    cwd: join(rootDir, 'packages', 'cli'),
    stdio: 'inherit'
  });
  console.log(`✅ @karibulab/wsdl2tsx@${version} publicado exitosamente\n`);
} catch (error) {
  console.error('❌ Error al publicar CLI');
  process.exit(1);
}

console.log('✨ ¡Publicación completada exitosamente!');
console.log(`\n📋 Paquetes publicados:`);
console.log(`   - @karibulab/wsdl2tsx-runtime@${version}`);
console.log(`   - @karibulab/wsdl2tsx@${version}\n`);
