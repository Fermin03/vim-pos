// ════════════════════════════════════════════════════════════════════════════
// El sitio, servido en local con las reglas de vercel.json.
//
//     node _agentes/servidor.mjs            → http://localhost:4173
//     node _agentes/servidor.mjs 5000       → otro puerto
//
// No es un servidor de desarrollo con recarga: es una forma de mirar con curl
// lo que va a hacer Vercel antes de publicarlo. Para comprobar la negociación
// de Markdown:
//
//     curl -sSi -H "Accept: text/markdown" http://localhost:4173/precios
//     curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:4173/no-existe
//
// Lo que aquí sale bien puede salir distinto en Vercel en un punto concreto: el
// `Content-Type` de los .md lo pone Vercel a partir de la extensión, y eso solo
// se comprueba con el sitio publicado. Está en la lista de DESPLIEGUE.md.
// ════════════════════════════════════════════════════════════════════════════

import http from 'node:http';
import fs from 'node:fs';
import { resolver } from './rutas.mjs';

const puerto = Number(process.argv[2]) || 4173;

http
  .createServer((peticion, respuesta) => {
    const ruta = new URL(peticion.url, 'http://localhost').pathname;
    const res = resolver(ruta, peticion.headers);

    if (res.ubicacion) {
      // Igual que Vercel: una redirección no lleva las cabeceras propias.
      respuesta.writeHead(res.estado, {
        Location: res.ubicacion,
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Content-Type': 'text/plain',
      });
      respuesta.end(`Redirecting to ${res.ubicacion}`);
      console.log(res.estado, ruta, '→', res.ubicacion);
      return;
    }

    const cuerpo = fs.readFileSync(res.archivo);
    respuesta.writeHead(res.estado, {
      ...res.cabeceras,
      'Content-Type': res.tipo,
      'Content-Length': cuerpo.length,
    });
    respuesta.end(peticion.method === 'HEAD' ? undefined : cuerpo);
    console.log(res.estado, ruta, '→', res.archivo.split(/[\\/]/).pop());
  })
  .listen(puerto, () => {
    console.log(`El sitio está en http://localhost:${puerto}`);
  });
