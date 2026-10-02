// Anuncios de la pantalla del cliente: la copia local de las imágenes.
//
// La lista (`anuncios_pantalla`) baja con el pull; las imágenes no caben ahí, así que después de
// cada pull se descargan a disco las que falten y se borran las que ya no están en la lista. La
// pantalla del cliente solo enseña lo que ya está en disco: así funciona sin internet y nunca
// pinta una imagen a medias.
//
// Nada de aquí lanza. Los anuncios son un adorno: una descarga fallida se reintenta en el
// siguiente pull, y un fallo no puede tocar la venta, el sync ni el arranque.
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** La única forma de nombre que se guarda y se sirve. */
export const ARCHIVO_VALIDO = new RegExp(`^${UUID}\\.(jpg|png|webp)$`);
const TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/** La forma exacta de `ruta` que exige la nube: <carpeta del negocio>/<id>.<ext>, todo en minúsculas. */
const RUTA_VALIDA = new RegExp(`^${UUID}/${UUID}\\.(jpg|png|webp)$`);
/** El almacén acepta hasta 1 MB; el doble de margen por si el tope cambia allá antes que aquí. */
const MAX_BYTES = 2 * 1024 * 1024;
const SEGUNDOS = 8;
const valido = (n) => Number.isInteger(n) && n >= 3 && n <= 60;

export function nombreArchivo(fila) {
  const m = typeof fila?.ruta === "string" ? RUTA_VALIDA.exec(fila.ruta) : null;
  const nombre = m ? `${fila.id}.${m[1]}` : null;
  return nombre && ARCHIVO_VALIDO.test(nombre) ? nombre : null;
}

/** Qué bajar y qué borrar. PURA. Solo borra lo que tiene forma de anuncio (o un temporal suyo). */
export function planAnuncios(filas, enDisco) {
  const quiero = new Map();
  for (const f of filas) { const a = nombreArchivo(f); if (a) quiero.set(a, f.ruta); }
  const tengo = new Set(enDisco);
  const descargar = [...quiero].filter(([a]) => !tengo.has(a)).map(([archivo, ruta]) => ({ archivo, ruta }));
  const borrar = enDisco.filter((a) => (ARCHIVO_VALIDO.test(a) && !quiero.has(a)) || (a.endsWith(".tmp") && ARCHIVO_VALIDO.test(a.slice(0, -4))));
  return { descargar, borrar };
}

const SQL_FILAS = `SELECT id, ruta, segundos FROM anuncios_pantalla WHERE tenant_id = $1 AND activo AND deleted_at IS NULL ORDER BY orden, created_at`;
const ES_UUID = new RegExp(`^${UUID}$`, "i");

/**
 * El negocio al que está vinculada la caja hoy: el del último snapshot (sync-pull.mjs lo anota en
 * `_vim_sync`). El pull solo hace upsert, así que una caja revinculada del negocio A al B conserva
 * las filas de A en su base; sin este filtro la pantalla mezclaba los anuncios de los dos. Sin
 * negocio anotado (la caja aún no hace un pull) devuelve null: sin anuncios, que es lo seguro.
 * Lanza si la base falla: quien llama distingue "no hay negocio" de "no se pudo leer".
 */
async function tenantVinculado(pool) {
  // `_vim_sync` la crea el primer pull; antes no existe y leerla directo sería un error, no un "sin negocio".
  const hay = (await pool.query(`SELECT to_regclass('public._vim_sync') IS NOT NULL AS hay`)).rows[0]?.hay;
  if (!hay) return null;
  const valor = (await pool.query(`SELECT valor FROM _vim_sync WHERE clave = 'tenant'`)).rows[0]?.valor;
  return typeof valor === "string" && ES_UUID.test(valor) ? valor : null;
}

/** Las filas de anuncios del negocio vinculado ([] si no hay ninguno anotado). Lanza si la base falla. */
async function filasDelNegocio(pool) {
  const tenant = await tenantVinculado(pool);
  if (!tenant) return { tenant: null, filas: [] };
  return { tenant, filas: (await pool.query(SQL_FILAS, [tenant])).rows };
}

export async function sincronizarAnuncios({ pool, dir, cloudUrl, fetch: pedir = fetch, log = () => {} }) {
  const r = { bajados: 0, borrados: 0, fallidos: 0 };
  let filas;
  // Sin negocio anotado la lista queda vacía y la limpieza de abajo borra lo que hubiera en disco;
  // con el negocio cambiado, borra por sí sola las imágenes del anterior.
  try { ({ filas } = await filasDelNegocio(pool)); } catch (e) { log(`no se pudo leer la lista: ${e?.message ?? e}`); return r; }
  let plan;
  try { mkdirSync(dir, { recursive: true }); plan = planAnuncios(filas, readdirSync(dir)); } catch (e) { log(`no se pudo leer la carpeta: ${e?.message ?? e}`); return r; }

  for (const a of plan.borrar) { try { rmSync(path.join(dir, a), { force: true }); if (!a.endsWith(".tmp")) r.borrados++; } catch { /* se reintenta en el siguiente pull */ } }

  for (const { archivo, ruta } of plan.descargar) {
    const destino = path.join(dir, archivo);
    try {
      const res = await pedir(`${String(cloudUrl).replace(/\/+$/, "")}/storage/v1/object/public/anuncios/${ruta}`, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tipo = String(res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!TIPOS[tipo]) throw new Error(`no es una imagen (${tipo || "sin tipo"})`);
      const datos = Buffer.from(await res.arrayBuffer());
      if (datos.length === 0 || datos.length > MAX_BYTES) throw new Error(`tamaño fuera de rango (${datos.length} bytes)`);
      // A un temporal y luego rename: la pantalla nunca ve un archivo a medio escribir.
      writeFileSync(destino + ".tmp", datos);
      renameSync(destino + ".tmp", destino);
      r.bajados++;
    } catch (e) {
      r.fallidos++;
      try { rmSync(destino + ".tmp", { force: true }); } catch { /* */ }
      log(`no se pudo bajar ${archivo}: ${e?.message ?? e}`);
    }
  }
  return r;
}

export async function listarAnuncios({ pool, dir }) {
  try {
    const { tenant, filas } = await filasDelNegocio(pool);
    if (!tenant) return { segundos: SEGUNDOS, anuncios: [] };
    // Del negocio vinculado: la configuración del negocio anterior también se quedó en la base.
    const cfg = (await pool.query(`SELECT pantalla_cliente_segundos FROM configuracion_tenant WHERE tenant_id = $1 LIMIT 1`, [tenant])).rows[0];
    const s = Number(cfg?.pantalla_cliente_segundos);
    const general = valido(s) ? s : SEGUNDOS;
    const anuncios = [];
    for (const f of filas) {
      const archivo = nombreArchivo(f);
      if (archivo && existsSync(path.join(dir, archivo))) anuncios.push({ id: String(f.id), url: `/__anuncios/${archivo}`, segundos: f.segundos !== null && valido(Number(f.segundos)) ? Number(f.segundos) : general });
    }
    return { segundos: general, anuncios };
  } catch {
    return { segundos: SEGUNDOS, anuncios: [] };
  }
}

/** Ruta en disco de un anuncio, o null si el nombre no tiene forma de anuncio. Sin rutas libres. */
export function rutaDeAnuncio(dir, archivo) {
  return typeof archivo === "string" && ARCHIVO_VALIDO.test(archivo) ? path.join(dir, archivo) : null;
}
