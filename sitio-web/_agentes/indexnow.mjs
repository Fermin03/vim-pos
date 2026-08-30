// ════════════════════════════════════════════════════════════════════════════
// Avisar a los buscadores de que este sitio existe, por IndexNow.
//
//     node _agentes/indexnow.mjs --probar   enseña lo que mandaría, sin mandarlo
//     node _agentes/indexnow.mjs            lo manda de verdad
//
// Para qué: el 30 de agosto de 2026 el dominio NO estaba indexado —una búsqueda
// de «vimpos.com.mx» no lo devolvía— y la marca compite con una empresa sueca
// que se llama Vimpos y vende cajas registradoras, más varias cuentas de redes.
// Publicar y esperar a que un rastreador pase puede tardar semanas.
//
// IndexNow (indexnow.org) es el protocolo con el que un sitio avisa: «estas
// direcciones son nuevas, vengan a verlas». Lo comparten Bing, Yandex, Seznam y
// Naver — **Google no participa**, y eso importa saberlo: para Google el camino
// es Search Console y los enlaces entrantes, que no se pueden automatizar desde
// aquí. Aun así vale la pena, porque varios agentes de IA buscan contra Bing.
//
// La autenticación es la más simple que existe: se publica un archivo con la
// clave dentro, en la raíz del sitio, y el buscador lo lee para comprobar que
// quien avisa manda en el dominio. Por eso la clave NO es un secreto: está
// publicada a propósito.
//
// Y por eso empieza por `indexnow` y no por unos hexadecimales sueltos: el
// matcher del middleware del 404 excluye el prefijo `index` —por index.html e
// index.md—, así que este archivo cae dentro de esa exclusión y se sirve. Con
// un nombre aleatorio daría 404 y la comprobación de propiedad fallaría sin
// decir por qué. La prueba `el matcher del middleware no toca NINGUNA ruta
// real` recorre la carpeta entera, así que si esto se rompe, se sabe.
// ════════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, PAGINAS } from './paginas.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const soloProbar = process.argv.includes('--probar');

// La clave es el nombre del archivo que la contiene. Se busca en vez de
// escribirla aquí para que no haya dos sitios que puedan discrepar.
const archivoClave = fs.readdirSync(RAIZ).find((f) => /^indexnow-[a-z0-9-]+\.txt$/.test(f));
if (!archivoClave) {
  console.error(
    'No encuentro el archivo de la clave (indexnow-….txt) en la raíz del sitio.\n' +
      'Se crea con: node -e "const c=\'indexnow-\'+require(\'crypto\').randomBytes(16).toString(\'hex\');' +
      'require(\'fs\').writeFileSync(c+\'.txt\',c)"',
  );
  process.exit(1);
}

const clave = archivoClave.replace(/\.txt$/, '');
const contenido = fs.readFileSync(path.join(RAIZ, archivoClave), 'utf8').trim();
if (contenido !== clave) {
  console.error(`El archivo ${archivoClave} tiene que contener exactamente «${clave}».`);
  process.exit(1);
}

const host = new URL(BASE).host;

// Las páginas indexables, más los archivos que un agente querría encontrar. Las
// direcciones que no se indexan —el 404, los alias en inglés— no se mandan: son
// la misma página y solo gastarían cuota.
const urlList = [
  ...PAGINAS.filter((p) => p.enSitemap).map((p) => BASE + (p.ruta === '/' ? '/' : p.ruta)),
  `${BASE}/llms.txt`,
  `${BASE}/agents.md`,
  `${BASE}/sitemap.xml`,
];

const cuerpo = { host, key: clave, keyLocation: `${BASE}/${archivoClave}`, urlList };

console.log(`IndexNow · ${host} · ${urlList.length} direcciones`);
console.log(JSON.stringify(cuerpo, null, 2));

if (soloProbar) {
  console.log('\n(--probar: no se ha mandado nada)');
  process.exit(0);
}

// Antes de avisar, comprobar que la clave está publicada. Si no lo está, el
// buscador rechaza el aviso y no dice por qué; mejor enterarse aquí.
const comprobacion = await fetch(cuerpo.keyLocation);
const publicada = comprobacion.ok ? (await comprobacion.text()).trim() : null;
if (publicada !== clave) {
  console.error(
    `\n${cuerpo.keyLocation} devolvió ${comprobacion.status} y no la clave.\n` +
      'Hay que publicar el sitio antes de avisar.',
  );
  process.exit(1);
}

const respuesta = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(cuerpo),
});

// 200 = aceptado. 202 = aceptado, clave pendiente de comprobar. Los dos son
// buenos; cualquier otro no.
console.log(`\nRespuesta: ${respuesta.status} ${respuesta.statusText}`);
const texto = await respuesta.text();
if (texto) console.log(texto);
if (respuesta.status !== 200 && respuesta.status !== 202) process.exit(1);
console.log('Avisado. Bing, Yandex, Seznam y Naver lo reciben; Google no participa en IndexNow.');
