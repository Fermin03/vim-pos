// ════════════════════════════════════════════════════════════════════════════
// El enrutador de Vercel, reproducido aquí para poder probarlo sin desplegar.
//
// Implementa el orden que documenta Vercel y que costó comprobar contra
// producción con curl:
//
//   1. redirects        — cortan la petición; NO llevan las cabeceras propias
//                         (comprobado: el 308 de /precios.html no trae ninguna
//                         de las cuatro de seguridad)
//   2. headers          — se casan contra la ruta PEDIDA, no contra la servida
//   3. sistema de archivos — gana sobre las reescrituras; por eso `cleanUrls`
//                         estaba impidiendo negociar Markdown
//   4. rewrites         — solo si no hubo archivo
//   5. 404.html         — con estatus 404
//
// De aquí salen dos cosas: las pruebas (pruebas.test.mjs) y el servidor local
// (servidor.mjs), que sirve el sitio con estas mismas reglas para poder mirarlo
// con curl antes de publicar.
// ════════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));

// Un `source` de Vercel es una ruta literal donde los paréntesis se dejan pasar
// como expresión regular. Se escapa todo lo de fuera y se respeta lo de dentro.
function aRegExp(source) {
  let salida = '';
  let dentro = 0;
  for (const c of source) {
    if (c === '(') { dentro++; salida += c; continue; }
    if (c === ')') { dentro--; salida += c; continue; }
    if (dentro > 0) { salida += c; continue; }
    salida += /[.*+?^${}[\]\\|]/.test(c) ? '\\' + c : c;
  }
  return new RegExp('^' + salida + '$');
}

const casa = (source, ruta) => aRegExp(source).test(ruta);

function condicionesOk(regla, cabeceras) {
  for (const h of regla.has || []) {
    if (h.type !== 'header') return false;
    const valor = cabeceras[h.key.toLowerCase()];
    if (valor === undefined) return false;
    if (h.value && !new RegExp('^' + h.value + '$').test(valor)) return false;
  }
  for (const h of regla.missing || []) {
    if (h.type === 'header' && cabeceras[h.key.toLowerCase()] !== undefined) return false;
  }
  return true;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function archivoDe(ruta) {
  if (ruta.endsWith('/')) ruta += 'index.html';
  const destino = path.join(RAIZ, decodeURIComponent(ruta));
  // Ni salirse de la carpeta ni servir un directorio.
  if (!destino.startsWith(RAIZ)) return null;
  if (!fs.existsSync(destino) || !fs.statSync(destino).isFile()) return null;
  return destino;
}

/**
 * Resuelve una petición como lo haría Vercel con este vercel.json.
 *
 * @returns {{estado:number, archivo?:string, ubicacion?:string, cabeceras:Object, tipo?:string}}
 */
export function resolver(ruta, cabeceras = {}) {
  const normalizadas = Object.fromEntries(
    Object.entries(cabeceras).map(([k, v]) => [k.toLowerCase(), v]),
  );

  // 1. Redirecciones. Cortan aquí, y sin cabeceras propias.
  for (const r of config.redirects || []) {
    if (casa(r.source, ruta) && condicionesOk(r, normalizadas)) {
      return {
        estado: r.permanent === false ? 307 : 308,
        ubicacion: r.destination,
        cabeceras: {},
      };
    }
  }

  // 2. Cabeceras: se acumulan contra la ruta pedida.
  const salida = {};
  for (const h of config.headers || []) {
    if (casa(h.source, ruta) && condicionesOk(h, normalizadas)) {
      for (const { key, value } of h.headers) salida[key] = value;
    }
  }

  // 3. Sistema de archivos. Gana sobre las reescrituras.
  let archivo = archivoDe(ruta === '/' ? '/index.html' : ruta);

  // 4. Reescrituras, solo si no había archivo.
  if (!archivo) {
    for (const r of config.rewrites || []) {
      if (casa(r.source, ruta) && condicionesOk(r, normalizadas)) {
        archivo = archivoDe(r.destination);
        break;
      }
    }
  }

  // 5. El 404.
  if (!archivo) {
    return {
      estado: 404,
      archivo: path.join(RAIZ, '404.html'),
      tipo: TIPOS['.html'],
      cabeceras: { ...salida, 'Cache-Control': 'public, max-age=0, must-revalidate' },
    };
  }

  return {
    estado: 200,
    archivo,
    tipo: TIPOS[path.extname(archivo)] || 'application/octet-stream',
    cabeceras: salida,
  };
}

export const ACEPTA_MD = { accept: 'text/markdown' };
