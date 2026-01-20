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

console.log('📦 Empaquetando paquetes para pruebas locales...\n');

// 1. Construir ambos paquetes
console.log('🔨 Construyendo paquetes...');
try {
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
} catch (error) {
  console.error('❌ Error al construir los paquetes');
  process.exit(1);
}

// 2. Leer package.json del CLI
const cliPackageJson = JSON.parse(readFileSync(cliPackageJsonPath, 'utf-8'));
const originalDependency = cliPackageJson.dependencies['@karibulab/wsdl2tsx-runtime'];

// 3. Actualizar dependencia temporalmente a versión exacta
console.log('\n📝 Actualizando dependencia del CLI a versión exacta...');
cliPackageJson.dependencies['@karibulab/wsdl2tsx-runtime'] = '1.0.0';
writeFileSync(cliPackageJsonPath, JSON.stringify(cliPackageJson, null, 2) + '\n');

try {
  // 4. Crear tarball del runtime
  console.log('\n📦 Creando tarball del runtime...');
  const runtimeOutput = execSync('npm pack', { 
    cwd: join(rootDir, 'packages', 'runtime'),
    encoding: 'utf-8'
  });
  const runtimeTarball = runtimeOutput.trim();
  const runtimeTarballPath = join(rootDir, 'packages', 'runtime', runtimeTarball);
  console.log(`✅ Runtime empaquetado: ${runtimeTarball}`);

  // 5. Crear tarball del CLI
  console.log('\n📦 Creando tarball del CLI...');
  const cliOutput = execSync('npm pack', { 
    cwd: join(rootDir, 'packages', 'cli'),
    encoding: 'utf-8'
  });
  const cliTarball = cliOutput.trim();
  const cliTarballPath = join(rootDir, 'packages', 'cli', cliTarball);
  console.log(`✅ CLI empaquetado: ${cliTarball}`);

  // 6. Restaurar dependencia original
  console.log('\n🔄 Restaurando dependencia original del CLI...');
  cliPackageJson.dependencies['@karibulab/wsdl2tsx-runtime'] = originalDependency;
  writeFileSync(cliPackageJsonPath, JSON.stringify(cliPackageJson, null, 2) + '\n');

  // 7. Mostrar instrucciones
  console.log('\n✨ ¡Empaquetado completado!\n');
  console.log('📋 Para instalar en un proyecto externo, ejecuta:\n');
  console.log(`npm install ${runtimeTarballPath} ${cliTarballPath}\n`);
  console.log('O individualmente:');
  console.log(`npm install ${runtimeTarballPath}`);
  console.log(`npm install ${cliTarballPath}\n`);
  console.log('📁 Los tarballs están en:');
  console.log(`   - Runtime: ${runtimeTarballPath}`);
  console.log(`   - CLI: ${cliTarballPath}\n`);

} catch (error) {
  // Restaurar dependencia en caso de error
  cliPackageJson.dependencies['@karibulab/wsdl2tsx-runtime'] = originalDependency;
  writeFileSync(cliPackageJsonPath, JSON.stringify(cliPackageJson, null, 2) + '\n');
  console.error('❌ Error durante el empaquetado:', error.message);
  process.exit(1);
}
