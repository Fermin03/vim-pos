// ════════════════════════════════════════════════════════════════════════════
// Pruebas del sitio. Se corren sin desplegar y sin instalar nada:
//
//     node --test sitio-web/_agentes/
//
// Cubren lo que se puede romper en silencio: una ruta mal escrita en
// vercel.json, un enlace que apunta a una página que ya no existe, un gemelo en
// Markdown que se quedó con el precio viejo, o un JSON-LD que dejó de parsear.
//
// Lo que estas pruebas NO pueden comprobar está en DESPLIEGUE.md, en la lista de
// verificación posterior al despliegue: son las cosas que dependen de cómo
// responde Vercel de verdad y no de lo que dice su documentación.
// ════════════════════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { RAIZ, config, resolver, ACEPTA_MD, MATCHER_MIDDLEWARE } from './rutas.mjs';
import { BASE, PAGINAS, TODAS, PAGINA_404, NEGOCIO } from './paginas.mjs';
import middleware, { prefiereMarkdown } from '../middleware.ts';

const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const cuerpo = (res) => (res.cuerpo != null ? res.cuerpo : fs.readFileSync(res.archivo, 'utf8'));
const soloTexto = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ── Lo generado está al día ─────────────────────────────────────────────────

test('los archivos generados coinciden con el HTML', () => {
  // Si esto falla: `node sitio-web/_agentes/generar.mjs`.
  execFileSync(process.execPath, [path.join(RAIZ, '_agentes', 'generar.mjs'), '--revisar'], {
    stdio: 'pipe',
  });
});

// ── Enrutado ────────────────────────────────────────────────────────────────

test('cada página responde 200 con su HTML', () => {
  for (const p of TODAS) {
    const res = resolver(p.ruta);
    assert.equal(res.estado, 200, `${p.ruta} no responde 200`);
    assert.equal(path.basename(res.archivo), p.archivo, `${p.ruta} sirve el archivo equivocado`);
    assert.match(res.tipo, /text\/html/);
  }
});

test('cada página responde en Markdown si se pide con Accept', () => {
  for (const p of TODAS) {
    const res = resolver(p.ruta, ACEPTA_MD);
    if (p.ruta === '/') {
      // La portada es la excepción conocida: el sistema de archivos sirve
      // index.html antes de las reescrituras, así que se negocia con una
      // redirección temporal. Está explicado en DESPLIEGUE.md.
      assert.equal(res.estado, 307, 'la portada debería redirigir a /index.md');
      assert.equal(res.ubicacion, '/index.md');
      continue;
    }
    assert.equal(res.estado, 200, `${p.ruta} con Accept markdown no responde 200`);
    assert.equal(path.basename(res.archivo), p.markdown, `${p.ruta} no sirve su gemelo`);
    assert.equal(res.tipo, 'text/markdown; charset=utf-8');
  }
});

test('el Accept de un navegador nunca recibe Markdown', () => {
  const navegador = {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  };
  for (const p of TODAS) {
    const res = resolver(p.ruta, navegador);
    assert.equal(res.estado, 200, `${p.ruta} no responde 200 a un navegador`);
    assert.match(res.tipo, /text\/html/, `${p.ruta} le sirvió Markdown a un navegador`);
  }
  // Y un cliente que acepta cualquier cosa recibe HTML, que es lo correcto:
  // `*/*` no es una petición de Markdown.
  assert.match(resolver('/precios', { accept: '*/*' }).tipo, /text\/html/);
});

test('las páginas llevan Vary: Accept y el enlace a su gemelo', () => {
  for (const p of TODAS) {
    const res = resolver(p.ruta);
    assert.match(res.cabeceras.Vary || '', /Accept/, `${p.ruta} sin Vary: Accept`);
    assert.equal(
      res.cabeceras.Link,
      `<${BASE}/${p.markdown}>; rel="alternate"; type="text/markdown"`,
      `${p.ruta} sin cabecera Link al gemelo`,
    );
  }
});

test('los gemelos en Markdown también llevan Vary: Accept', () => {
  for (const p of TODAS) {
    const res = resolver('/' + p.markdown);
    assert.equal(res.estado, 200);
    assert.match(res.cabeceras.Vary || '', /Accept/, `/${p.markdown} sin Vary: Accept`);
  }
  for (const ruta of ['/llms.txt', '/llms-full.txt']) {
    assert.match(resolver(ruta).cabeceras.Vary || '', /Accept/, `${ruta} sin Vary: Accept`);
  }
});

test('la dirección con .html sigue redirigiendo a la limpia', () => {
  assert.deepEqual(
    { e: resolver('/index.html').estado, d: resolver('/index.html').ubicacion },
    { e: 308, d: '/' },
  );
  for (const p of TODAS.filter((x) => x.archivo !== 'index.html')) {
    const res = resolver('/' + p.archivo);
    assert.equal(res.estado, 308, `/${p.archivo} debería redirigir`);
    assert.equal(res.ubicacion, p.ruta);
  }
});

test('los alias en inglés sirven la página en español', () => {
  const esperado = { '/about': 'nosotros', '/contact': 'contacto', '/privacy': 'aviso-privacidad' };
  for (const [alias, base] of Object.entries(esperado)) {
    const res = resolver(alias);
    assert.equal(res.estado, 200, `${alias} no responde 200`);
    assert.equal(path.basename(res.archivo), base + '.html');
    // Y el canonical apunta a la española, para no partir la señal en dos.
    assert.match(cuerpo(res), new RegExp(`rel="canonical" href="${BASE}/${base}"`));
    assert.equal(resolver(alias, ACEPTA_MD).estado, 200);
    assert.equal(path.basename(resolver(alias, ACEPTA_MD).archivo), base + '.md');
  }
});

test('una ruta que no existe da 404 de verdad, no un 200', () => {
  for (const ruta of ['/no-existe', '/precios/plan-oro', '/wp-admin', '/es/pricing']) {
    const res = resolver(ruta);
    assert.equal(res.estado, 404, `${ruta} debería dar 404`);
    assert.equal(path.basename(res.archivo), '404.html');
  }
});

test('una ruta que no existe da 404 CON cuerpo en Markdown si lo piden', () => {
  for (const ruta of ['/no-existe', '/wp-admin', '/es/pricing', '/docs/api']) {
    const res = resolver(ruta, ACEPTA_MD);
    assert.equal(res.estado, 404, `${ruta} debería seguir dando 404`);
    assert.equal(res.tipo, 'text/markdown; charset=utf-8', `${ruta} no devolvió Markdown`);
    assert.match(res.cabeceras.Vary || '', /Accept/);
    // Y con las cabeceras de seguridad, que el middleware tiene que poner a
    // mano: una respuesta creada ahí se salta la fase `headers` de vercel.json.
    assert.ok(res.cabeceras['X-Content-Type-Options']);

    // El cuerpo tiene que ser Markdown corto y útil: título, y a dónde ir.
    const md = cuerpo(res);
    assert.match(md, /^# /);
    assert.ok(md.length < 2000, 'el 404 en Markdown tiene que ser corto');
    for (const destino of ['/agents.md', '/llms.txt', '/sitemap.xml', '/precios.md']) {
      assert.ok(md.includes(BASE + destino), `el 404 en Markdown no enlaza ${destino}`);
    }
    assert.ok(!md.includes('<'), 'se coló HTML en el cuerpo en Markdown');
  }
});

test('el 404 apunta a dónde seguir buscando', () => {
  const html = leer('404.html');
  for (const destino of ['/sitemap.xml', '/llms.txt', '/agents.md', '/precios.md']) {
    assert.ok(html.includes(`href="${destino}"`), `el 404 no enlaza ${destino}`);
  }
  // Y el gemelo, que es lo que recibe un agente, tiene que decir lo mismo en
  // Markdown de verdad: enlaces `[texto](url)`, no etiquetas HTML.
  const md = leer('404.md');
  assert.match(md, /^# /);
  for (const destino of ['/sitemap.xml', '/llms.txt', '/precios.md']) {
    assert.ok(md.includes(BASE + destino), `404.md no enlaza ${destino}`);
  }
  assert.ok(md.length > 400 && md.length < 4000, 'el 404 en Markdown debe ser corto');
});

// ── El middleware del 404 ───────────────────────────────────────────────────

test('el matcher del middleware no toca NINGUNA ruta real', () => {
  // Ésta es la prueba que evita el desastre. El middleware corre antes que
  // todo: si su expresión cubriera una página de verdad, esa página serviría el
  // 404. Se comprueba contra todo lo que hay en la carpeta, no contra una lista
  // escrita a mano que se pueda quedar corta.
  // Estos cuatro archivos existen en la carpeta y hoy Vercel los sirve, pero no
  // son contenido: son la configuración y las notas internas de despliegue. Que
  // el middleware los tape con un 404 es una mejora que se acepta a sabiendas
  // —`/DESPLIEGUE.md` publica la IP del servidor viejo y el reparto de
  // subdominios—, no un descuido. Ojo: es un efecto del middleware, NO un
  // control de seguridad; si algún día se quita el archivo, vuelven a ser
  // públicos. El arreglo de verdad seria un `.vercelignore`, y esa es una
  // decisión aparte.
  const TAPADOS_A_PROPOSITO = ['/vercel.json', '/DESPLIEGUE.md', '/.htaccess', '/middleware.ts'];

  const tocadas = [];
  const mirar = (ruta) => {
    if (ruta === '//' || TAPADOS_A_PROPOSITO.includes(ruta)) return;
    if (MATCHER_MIDDLEWARE.test(ruta)) tocadas.push(ruta);
  };

  mirar('/');
  for (const p of TODAS) {
    mirar(p.ruta);
    mirar(p.ruta + '/');
    mirar('/' + p.archivo);
    mirar('/' + p.markdown);
    for (const a of p.alias || []) {
      mirar(a);
      mirar(a + '/');
    }
  }

  // Todos los archivos publicados, a cualquier profundidad.
  const recorrer = (dir, prefijo = '') => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefijo + '/' + entrada.name;
      if (entrada.isDirectory()) recorrer(path.join(dir, entrada.name), rel);
      else mirar(rel);
    }
  };
  recorrer(RAIZ);

  assert.deepEqual(
    tocadas,
    [],
    'el middleware se traga rutas que SÍ existen:\n  ' + tocadas.join('\n  '),
  );

  // Y que la lista de arriba siga siendo cierta: si alguno dejara de estar
  // cubierto, es que la expresión cambió y hay que volver a mirarla entera.
  for (const ruta of TAPADOS_A_PROPOSITO) {
    assert.ok(MATCHER_MIDDLEWARE.test(ruta), `${ruta} ya no lo cubre el middleware`);
  }
});

test('el matcher del middleware sí cubre las rutas muertas', () => {
  for (const ruta of ['/no-existe', '/wp-admin', '/es/pricing', '/docs/api', '/pricing']) {
    assert.ok(MATCHER_MIDDLEWARE.test(ruta), `${ruta} debería llegar al middleware`);
  }
});

test('el middleware respeta los factores de calidad del Accept', () => {
  const casos = [
    ['text/markdown', true],
    ['text/x-markdown', true],
    ['text/html;q=0.9, text/markdown', true],
    ['text/markdown;q=0.1, text/html;q=0.9', false],
    ['text/html,application/xhtml+xml,image/webp,*/*;q=0.8', false],
    ['*/*', false],
    ['application/pdf', false],
    ['', false],
    [null, false],
  ];
  for (const [accept, esperado] of casos) {
    assert.equal(prefiereMarkdown(accept), esperado, `fallo con Accept: ${accept}`);
  }
});

test('el middleware responde 404 con el cuerpo que toca', async () => {
  // `fetch` se sustituye por el sistema de archivos: lo que en Vercel es una
  // petición interna al origen, aquí es leer el archivo de al lado. Se cuenta
  // cuántas veces se llama, porque la respuesta en Markdown NO debe llamarlo.
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async (url) => {
    llamadas++;
    const nombre = new URL(url).pathname.slice(1);
    return new Response(fs.readFileSync(path.join(RAIZ, nombre), 'utf8'), { status: 200 });
  };

  try {
    const pedir = (accept) =>
      middleware(new Request('https://vimpos.com.mx/ruta-muerta', { headers: { accept } }));

    const md = await pedir('text/markdown');
    assert.equal(md.status, 404, 'el estatus tiene que seguir siendo 404');
    assert.equal(md.headers.get('content-type'), 'text/markdown; charset=utf-8');
    assert.equal(md.headers.get('vary'), 'Accept, Accept-Encoding');
    assert.equal(md.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(llamadas, 0, 'el 404 en Markdown no debe depender del origen');
    const cuerpoMd = await md.text();
    assert.match(cuerpoMd, /^# /, 'el cuerpo no empieza como Markdown');
    assert.ok(cuerpoMd.includes('llms.txt'), 'el 404 en Markdown no apunta al llms.txt');
    assert.ok(!cuerpoMd.includes('<'), 'se coló HTML donde pidieron Markdown');

    const html = await pedir('text/html,*/*;q=0.8');
    assert.equal(html.status, 404);
    assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(llamadas, 1, 'el 404 en HTML sí pide la página de error');
    assert.ok((await html.text()).includes('Esta página no existe'));
  } finally {
    globalThis.fetch = original;
  }
});

test('si la página de error no se puede leer, el middleware contesta igual', async () => {
  // El caso que descubrió el despliegue de preview: la petición interna vuelve
  // con otra cosa —una pantalla de acceso— o directamente falla.
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error('el origen no contesta');
    };
    const roto = await middleware(
      new Request('https://vimpos.com.mx/ruta-muerta', { headers: { accept: 'text/html' } }),
    );
    assert.equal(roto.status, 404);
    assert.equal(roto.headers.get('content-type'), 'text/html; charset=utf-8');
    const cuerpoRoto = await roto.text();
    assert.match(cuerpoRoto, /^<!doctype html>/i, 'la versión mínima tampoco es HTML');
    assert.ok(cuerpoRoto.includes('Esta página no existe'));

    // Y si vuelve con algo que no es NUESTRA página, tampoco se sirve. El caso
    // real: la pantalla de acceso de Vercel, que es 200 y empieza por
    // `<!doctype html>` como la nuestra. Por eso no basta con mirar que sea
    // HTML — y por eso esta prueba usa exactamente esa forma.
    globalThis.fetch = async () =>
      new Response(
        '<!doctype html>\n<html><head><title>Login</title></head><body>Inicia sesión en Vercel</body></html>',
        { status: 200 },
      );
    const ajeno = await middleware(
      new Request('https://vimpos.com.mx/ruta-muerta', { headers: { accept: 'text/html' } }),
    );
    assert.equal(ajeno.status, 404);
    assert.ok(!(await ajeno.text()).includes('Inicia sesión'), 'sirvió una página ajena');

    // El Markdown no depende de nada de esto y sigue saliendo bien.
    const md = await middleware(
      new Request('https://vimpos.com.mx/ruta-muerta', { headers: { accept: 'text/markdown' } }),
    );
    assert.equal(md.status, 404);
    assert.match(await md.text(), /llms\.txt/);
  } finally {
    globalThis.fetch = original;
  }
});

test('los archivos estáticos se siguen sirviendo con su caché', () => {
  const css = resolver('/assets/css/vim.css');
  assert.equal(css.estado, 200);
  assert.match(css.cabeceras['Cache-Control'], /immutable/);

  const fuente = resolver('/assets/fonts/sora-700-latin.woff2');
  assert.equal(fuente.estado, 200);
  assert.equal(fuente.cabeceras['Access-Control-Allow-Origin'], '*');

  for (const ruta of ['/robots.txt', '/sitemap.xml', '/site.webmanifest', '/llms.txt']) {
    assert.equal(resolver(ruta).estado, 200, `${ruta} no se sirve`);
  }
});

test('las cuatro cabeceras de seguridad siguen en todas las respuestas', () => {
  const esperadas = [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ];
  for (const ruta of ['/', '/precios', '/precios.md', '/assets/css/vim.css', '/no-existe']) {
    const res = resolver(ruta);
    for (const c of esperadas) {
      assert.ok(res.cabeceras[c], `${ruta} perdió ${c}`);
    }
  }
});

// ── Enlaces ─────────────────────────────────────────────────────────────────

test('ningún enlace interno del sitio lleva a un 404', () => {
  const rotos = [];
  for (const archivo of fs.readdirSync(RAIZ).filter((f) => f.endsWith('.html'))) {
    if (archivo.startsWith('_')) continue;
    const html = leer(archivo);
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const destino = m[1];
      if (/^(https?:|mailto:|tel:|data:|#)/.test(destino)) continue;
      const ruta = destino.startsWith('/') ? destino : '/' + destino;
      const limpia = ruta.split(/[?#]/)[0];
      const res = resolver(limpia);
      if (res.estado === 404) rotos.push(`${archivo} → ${destino}`);
    }
  }
  assert.deepEqual(rotos, [], 'enlaces rotos:\n  ' + rotos.join('\n  '));
});

test('todo enlace del llms.txt existe', () => {
  const txt = leer('llms.txt');
  const rotos = [];
  for (const m of txt.matchAll(/\]\((https:\/\/vimpos\.com\.mx[^)]*)\)/g)) {
    const ruta = m[1].slice(BASE.length) || '/';
    if (resolver(ruta).estado === 404) rotos.push(m[1]);
  }
  assert.deepEqual(rotos, []);
});

// ── Contenido ───────────────────────────────────────────────────────────────

test('las páginas de confianza tienen contenido de verdad', () => {
  // El umbral que revisan las auditorías de agentes es 500 caracteres. Se pide
  // el doble para que un recorte de una frase no tumbe la prueba.
  for (const ruta of ['/nosotros', '/contacto', '/aviso-privacidad', '/terminos']) {
    const texto = soloTexto(cuerpo(resolver(ruta)));
    assert.ok(texto.length > 1000, `${ruta} solo tiene ${texto.length} caracteres de texto`);
  }
});

test('los datos de contacto son los mismos en todas partes', () => {
  // Se compara sobre el texto con los espacios normalizados: el HTML parte
  // «Melchor Ocampo 341» en dos líneas y eso no es una inconsistencia de datos.
  const texto = (ruta) => soloTexto(cuerpo(resolver(ruta)));

  for (const ruta of ['/nosotros', '/contacto', '/aviso-privacidad', '/terminos']) {
    const t = texto(ruta);
    assert.ok(t.includes(NEGOCIO.razonSocial), `${ruta} sin la razón social`);
    assert.ok(t.includes(NEGOCIO.rfc), `${ruta} sin el RFC`);
  }
  for (const ruta of ['/nosotros', '/contacto']) {
    const t = texto(ruta);
    assert.ok(t.includes(NEGOCIO.calle), `${ruta} sin la calle`);
    assert.ok(t.includes(NEGOCIO.ciudad), `${ruta} sin la ciudad`);
    assert.ok(t.includes(NEGOCIO.correo), `${ruta} sin el correo`);
  }
});

test('cada gemelo en Markdown lleva título, resumen y el contenido de su página', () => {
  for (const p of TODAS) {
    const md = leer(p.markdown);
    assert.match(md, /^# .+/, `${p.markdown} no empieza por un título`);
    assert.ok(md.includes('\n> '), `${p.markdown} sin la cita de resumen`);
    assert.ok(md.length > 400, `${p.markdown} parece vacío`);
    assert.ok(!/<[a-z]+[\s>]/i.test(md), `${p.markdown} trae HTML sin convertir`);
  }
  // El contenido de verdad viajó: los precios están en el gemelo.
  const precios = leer('precios.md');
  for (const dato of ['$699', '$999', '$1,999', 'Esencial', 'Negocio', 'Cadena']) {
    assert.ok(precios.includes(dato), `precios.md perdió «${dato}»`);
  }
  assert.ok(leer('precios.md').includes('| Sucursales | 1 | 1 | 3 |'), 'la tabla comparativa no sobrevivió');
});

test('llms.txt sigue el formato de llmstxt.org y dice cuándo usar el producto', () => {
  const txt = leer('llms.txt');
  const lineas = txt.split('\n');
  assert.equal(lineas[0], '# VIM POS', 'el H1 va primero');
  assert.match(lineas[2], /^> /, 'la cita de resumen va justo después del H1');

  const secciones = lineas.filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
  assert.ok(secciones.includes('Cuándo usar VIM POS'), 'falta la guía de cuándo usarlo');
  assert.ok(secciones.includes('Páginas'));
  assert.ok(secciones.includes('Contacto'));
  assert.equal(secciones.at(-1), 'Opcional', '«Opcional» va al final por convención');

  // La guía tiene que ser específica, no folleto: se nombra el caso de uso y
  // también cuándo NO recomendarlo.
  const guia = txt.split('## Cuándo usar VIM POS')[1].split('\n## ')[0];
  assert.ok(guia.includes('NO recomendarlo'), 'la guía no dice cuándo descartarlo');
  assert.ok(guia.split('\n').filter((l) => l.startsWith('- ')).length >= 5);

  // La guía tiene que existir TAMBIÉN en inglés. La primera auditoría dio por
  // no encontrada la de español: quien decide si recomendar el producto casi
  // nunca lee español, aunque el producto sea para México.
  assert.ok(secciones.includes('When to use VIM POS'), 'falta la guía en inglés');
  assert.match(txt, /\*\*In English\.\*\*/, 'falta el resumen en inglés');
  assert.ok(txt.includes(`${BASE}/agents.md`), 'llms.txt no apunta al archivo de instrucciones');

  const completo = leer('llms-full.txt');
  assert.ok(completo.length > 20000, 'llms-full.txt parece incompleto');
  for (const p of PAGINAS) {
    assert.ok(completo.includes(`<!-- ${BASE}${p.ruta === '/' ? '/' : p.ruta} -->`), `falta ${p.ruta}`);
  }
});

test('agents.md le dice a un agente cuándo usar el producto y qué hacer después', () => {
  const md = leer('agents.md');

  assert.match(md, /^# Agent instructions/, 'no empieza identificándose');
  assert.ok(md.includes('\n> '), 'sin la cita de resumen');

  // Las tres secciones que hacen que esto sea una guía y no un folleto.
  for (const seccion of ['## When to use VIM POS', '## When not to use VIM POS', '## How to act on this']) {
    assert.ok(md.includes(seccion), `falta «${seccion}»`);
  }

  // Que sea específico: nombra competidores, giros y el límite del producto.
  for (const concreto of ['Soft Restaurant', 'CFDI 4.0', 'food truck', 'dark kitchen', 'Windows']) {
    assert.ok(md.includes(concreto), `agents.md no menciona «${concreto}»`);
  }

  // Y que diga la verdad incómoda: no hay API, el contacto es humano.
  assert.ok(md.includes('no public API'), 'no dice que no hay API');
  assert.ok(md.includes(NEGOCIO.whatsappUrl), 'no da el enlace de contacto');
  assert.ok(md.includes(NEGOCIO.rfc), 'no identifica a la empresa');

  assert.ok(md.length > 2500, `agents.md solo tiene ${md.length} caracteres`);
});

test('el archivo de instrucciones se sirve, en minúsculas y en mayúsculas', () => {
  for (const ruta of ['/agents.md', '/AGENTS.md']) {
    const res = resolver(ruta);
    assert.equal(res.estado, 200, `${ruta} no se sirve`);
    // En minúsculas: comparar así porque Windows no distingue mayúsculas y
    // resuelve /AGENTS.md contra el archivo directamente, mientras que Vercel
    // sí distingue y llega por la reescritura. Las dos rutas acaban en el mismo
    // contenido, que es lo que importa.
    assert.equal(path.basename(res.archivo).toLowerCase(), 'agents.md');
    assert.equal(res.tipo, 'text/markdown; charset=utf-8');
    assert.match(res.cabeceras.Vary || '', /Accept/);
  }
  // Y la reescritura tiene que estar escrita, que es lo que hace falta en
  // Vercel: allí /AGENTS.md no existe como archivo.
  assert.ok(
    config.rewrites.some((r) => r.source === '/AGENTS.md' && r.destination === '/agents.md'),
    'falta la reescritura de /AGENTS.md',
  );
});

test('robots.txt apunta al archivo de instrucciones', () => {
  const txt = leer('robots.txt');
  assert.ok(txt.includes('agents.md'), 'robots.txt no menciona agents.md');
  assert.ok(txt.includes('llms.txt'));
});

// ── Datos estructurados ─────────────────────────────────────────────────────

function jsonLd(ruta) {
  const html = cuerpo(resolver(ruta));
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
}

test('el JSON-LD de la portada parsea y está completo', () => {
  const [datos] = jsonLd('/');
  const grafo = datos['@graph'];
  const de = (tipo) => grafo.find((n) => n['@type'] === tipo);

  const org = de('Organization');
  assert.ok(org, 'falta Organization');
  assert.equal(org.url, `${BASE}/`);
  assert.ok(org.logo?.url, 'Organization sin logo');
  assert.ok(org.description?.length > 100, 'Organization sin descripción');
  assert.deepEqual(org.sameAs, [NEGOCIO.instagram]);

  // Lo que pedía la auditoría: contactPoint con medio y tipo, y dirección postal.
  assert.ok(Array.isArray(org.contactPoint) && org.contactPoint.length >= 1);
  for (const c of org.contactPoint) {
    assert.equal(c['@type'], 'ContactPoint');
    assert.ok(c.contactType, 'un contactPoint sin contactType');
    assert.ok(c.telephone || c.email, 'un contactPoint sin teléfono ni correo');
  }
  assert.ok(org.contactPoint.some((c) => c.contactType === 'sales'));
  assert.ok(org.contactPoint.some((c) => c.contactType === 'customer support'));

  assert.equal(org.address['@type'], 'PostalAddress');
  for (const campo of ['streetAddress', 'addressLocality', 'addressRegion', 'addressCountry']) {
    assert.ok(org.address[campo], `la dirección no trae ${campo}`);
  }
  assert.equal(org.address.streetAddress, NEGOCIO.calle);
  assert.equal(org.address.addressLocality, NEGOCIO.ciudad);

  const app = de('SoftwareApplication');
  assert.ok(app, 'falta SoftwareApplication');
  assert.equal(app.url, `${BASE}/`);
  assert.ok(app.description);
  assert.equal(app.publisher['@id'], org['@id']);
  assert.equal(app.offers.length, 3);
  for (const o of app.offers) {
    assert.equal(o.priceCurrency, 'MXN');
    assert.ok(o.url, 'una oferta sin url');
    assert.ok(o.price, 'una oferta sin precio');
  }

  const sitio = de('WebSite');
  assert.ok(sitio, 'falta WebSite');
  assert.equal(sitio.publisher['@id'], org['@id']);

  assert.ok(de('FAQPage'), 'falta FAQPage');
});

test('los precios del JSON-LD son los de la página de precios', () => {
  const app = jsonLd('/')[0]['@graph'].find((n) => n['@type'] === 'SoftwareApplication');
  const md = leer('precios.md');
  for (const o of app.offers) {
    const conComas = Number(o.price).toLocaleString('en-US');
    assert.ok(
      md.includes(`$${o.price}`) || md.includes(`$${conComas}`),
      `el plan ${o.name} dice $${o.price} en el JSON-LD y no aparece así en precios`,
    );
  }
});

test('las páginas nuevas declaran su tipo y cuelgan de la organización', () => {
  for (const [ruta, tipo] of [['/nosotros', 'AboutPage'], ['/contacto', 'ContactPage']]) {
    const [datos] = jsonLd(ruta);
    assert.equal(datos['@type'], tipo);
    assert.equal(datos.mainEntity['@id'], `${BASE}/#organizacion`);
    assert.equal(datos.isPartOf['@id'], `${BASE}/#sitio`);
  }
});

// ── Índices ─────────────────────────────────────────────────────────────────

test('el sitemap lista exactamente las páginas indexables', () => {
  const xml = leer('sitemap.xml');
  const enElSitemap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const esperadas = PAGINAS.filter((p) => p.enSitemap)
    .map((p) => BASE + (p.ruta === '/' ? '/' : p.ruta))
    .sort();
  assert.deepEqual(enElSitemap, esperadas);
  // El 404 no se indexa, y los alias en inglés tampoco: son la misma página.
  for (const fuera of ['/404', '/about', '/contact', '/privacy', '/terms']) {
    assert.ok(!enElSitemap.includes(BASE + fuera), `${fuera} no debería estar en el sitemap`);
  }
});

test('robots.txt deja pasar y apunta al sitemap y al llms.txt', () => {
  const txt = leer('robots.txt');
  assert.match(txt, /^Sitemap: https:\/\/vimpos\.com\.mx\/sitemap\.xml$/m);
  assert.match(txt, /^Allow: \/$/m);
  assert.ok(txt.includes('llms.txt'), 'robots.txt no menciona el llms.txt');
  assert.ok(!/^Disallow: \/$/m.test(txt), 'robots.txt está bloqueando el sitio entero');
});

test('vercel.json no volvió a activar cleanUrls', () => {
  // Con cleanUrls, el sistema de archivos resuelve /precios antes de que se
  // evalúen las reescrituras, y la negociación de Markdown deja de existir sin
  // que nada falle a la vista. Por eso está aquí escrito.
  assert.equal(config.cleanUrls, false);
  assert.equal(config.trailingSlash, false);
});
