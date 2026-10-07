/* ============================================================================
   Prepara la carpeta que se sube a Hostinger.

   POR QUÉ ESTO EXISTE

   Subir "la carpeta del sitio" a mano tiene dos formas conocidas de salir mal:

     · Se cuelan `_patron.html` y `_capturas/`. El segundo lleva
       `semilla-demo.sql` con contraseñas de desarrollo dentro — inofensivas,
       porque solo existen en el Supabase local, pero no hay razón para
       publicarlas.
     · Se queda fuera el `.htaccess`. Empieza con punto, así que la mayoría de
       los clientes de FTP lo ocultan por omisión, y el sitio acaba publicado
       sin HTTPS forzado, sin página de 404 propia y sin ninguna cabecera de
       seguridad. Se ve perfecto y está mal.

   Esto arma una carpeta que ya es exactamente lo que va en `public_html/`, y
   FALLA RUIDOSAMENTE si el `.htaccess` no llegó.

   Correr:  node _capturas/empaquetar.mjs
   ========================================================================== */

import { cp, readdir, stat, rm, access } from "node:fs/promises";
import path from "node:path";

const SITIO = path.resolve(import.meta.dirname, "..");
const DESTINO = path.resolve(SITIO, "../_publicar");

await rm(DESTINO, { recursive: true, force: true });

await cp(SITIO, DESTINO, {
  recursive: true,
  /* Todo lo que empieza con guion bajo es herramienta, no sitio. Es la misma
     regla que aplica el `.htaccess` como segundo cerrojo (`RewriteRule ^_`),
     y tenerla en los dos sitios es a propósito: éste evita que se suban, aquél
     los bloquea si se subieron de todos modos. */
  filter: (origen) => {
    const nombre = path.basename(origen);
    if (nombre.startsWith("_") || nombre === "node_modules") return false;

    /* Los PNG de `capturas/` NO se publican: el sitio referencia solo los
       `.webp`, así que son 1.6 MB que nadie pide nunca. Se quedan en el
       repositorio porque son la FUENTE con la que se regeneran los webp
       —`redimensionar.mjs` lee el png y escribe el webp—, pero en el servidor
       no pintan nada.

       Los PNG de `og/` sí van: la etiqueta og:image los referencia
       directamente, y ahí el PNG es correcto porque hay previsualizadores de
       enlaces que todavía no entienden WebP. */
    /* Se normaliza el separador antes de comparar: en Windows las rutas vienen
       con barra invertida y una expresión escrita solo para `/` no filtra nada
       — que es exactamente lo que pasó la primera vez. */
    const ruta = origen.replaceAll(path.sep, "/");
    if (ruta.includes("/capturas/") && ruta.endsWith(".png")) return false;

    return true;
  },
});

/* El .htaccess es el que se pierde. Si no está, mejor romper aquí que
   descubrirlo en producción por un sitio que no fuerza HTTPS. */
try {
  await access(path.join(DESTINO, ".htaccess"));
} catch {
  console.error("\n✗ El .htaccess NO llegó a la carpeta. No subas esto.");
  process.exit(1);
}

async function recorrer(dir, base = dir) {
  const salida = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...(await recorrer(p, base)));
    else salida.push([path.relative(base, p).replaceAll(path.sep, "/"), (await stat(p)).size]);
  }
  return salida;
}

const archivos = (await recorrer(DESTINO)).sort((a, b) => b[1] - a[1]);
const total = archivos.reduce((s, [, t]) => s + t, 0);

console.log(`\nCarpeta lista: ${DESTINO}\n`);
console.log("Los diez archivos más pesados:");
for (const [rel, t] of archivos.slice(0, 10)) {
  console.log(`  ${rel.padEnd(46)} ${String(Math.round(t / 1024)).padStart(4)} KB`);
}
console.log(`\n  ${archivos.length} archivos · ${Math.round(total / 1024)} KB en total`);

const colados = archivos.filter(([rel]) => rel.split("/").some((s) => s.startsWith("_")));
if (colados.length) {
  console.error("\n✗ Se colaron archivos de herramienta:", colados.map(([r]) => r));
  process.exit(1);
}
console.log("\n✓ Sin archivos de herramienta. El contenido de esta carpeta va a public_html/");
