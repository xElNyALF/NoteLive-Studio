'use strict';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

(async () => {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log('\nNoteLive Studio · Configurar actualizaciones automáticas\n');
    console.log('Necesitas un repositorio de GitHub. El método más sencillo usa Releases públicos; eso hace visible el código y las publicaciones del repositorio.');
    const owner = (await rl.question('Tu nombre de usuario de GitHub [xEINyALF]: ')).trim() || 'xEINyALF';
    const repo = (await rl.question('Nombre exacto del repositorio [NoteLive-Studio]: ')).trim() || 'NoteLive-Studio';
    if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) || owner.includes('YOUR_')) throw new Error('El nombre de usuario no parece válido.');
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo) || repo.includes('YOUR_')) throw new Error('El nombre del repositorio no parece válido.');

    const packagePath = path.join(__dirname, 'package.json');
    const configPath = path.join(__dirname, 'update-config.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const updateConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const targets = Array.isArray(packageJson.build.publish) ? packageJson.build.publish : [packageJson.build.publish];
    const github = targets.find(item => item && item.provider === 'github');
    if (!github) throw new Error('No se encontró la configuración GitHub en package.json.');
    github.owner = owner;
    github.repo = repo;
    updateConfig.owner = owner;
    updateConfig.repo = repo;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
    fs.writeFileSync(configPath, JSON.stringify(updateConfig, null, 2) + '\n');

    console.log('\nConfiguración guardada en package.json y update-config.json.');
    console.log(`Repositorio: https://github.com/${owner}/${repo}`);
    console.log('\nAún falta subir el proyecto a ese repositorio y publicar el primer tag v0.3.0.');
    console.log('No pongas config.json, tokens.json, claves de API ni credenciales en el repositorio.');
  } catch (error) {
    console.error(`\nNo se pudo configurar: ${error.message}`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
})();
