import {execFileSync} from 'node:child_process';import {readFileSync,existsSync} from 'node:fs';
for(const p of ['public/app.js','public/sw.js','netlify/functions/api.mjs','netlify/functions/core.mjs','scripts/setup.mjs'])execFileSync(process.execPath,['--check',p],{stdio:'inherit'});
const manifest=JSON.parse(readFileSync('public/manifest.webmanifest'));for(const i of manifest.icons)if(!existsSync('public'+i.src))throw Error('Falta icono');console.log('Sintaxis y archivos PWA verificados.');
