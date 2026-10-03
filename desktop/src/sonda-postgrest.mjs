// Sonda de PostgREST: ¿está vivo, con su schema cache cargado y con conexión a la base?
//
// POR QUÉ EXISTE. La salud profunda (/health/deep, la que mira el watchdog) le pedía «/» a
// PostgREST. «/» no es un ping: devuelve la descripción OpenAPI de TODO el esquema —152 relaciones
// y 189 funciones— y tarda. Medido el 2 oct 2026: 2.2 s en una laptop de desarrollo, igual con GET
// que con HEAD. La salud le daba 4 s de tope, así que en la PC de Knock-Out Obregón (más lenta)
// fallaba SIEMPRE: el watchdog reiniciaba un backend sano cada minuto y la caja decía «Sin
// internet» con el internet bien.
//
// La sonda es una lectura mínima a una tabla: 4 ms en esa misma laptop. Como `anon` no tiene
// permiso, PostgREST contesta 401 con el error 42501 que le devolvió Postgres — y eso ya demuestra
// las tres cosas: el servidor atiende, tiene el esquema cargado y habla con la base.
//
// QUÉ CUENTA COMO SANO: cualquier respuesta por debajo de 500, salvo un 400 sin código (ver abajo).
// Cuando PostgREST no está bien contesta 503 (PGRST000–003: sin conexión a la base, o esquema aún
// sin cargar). Se eligió «< 500»
// y no «solo 401» a propósito: un criterio estrecho que algún día deje de cumplirse —una migración
// que cambie los permisos de `tenants`, o que deje de exponerla (404)— metería el bucle de
// reinicios en TODAS las cajas, que es peor que el caso que dejaría pasar. Y ese caso está
// cubierto por otro lado: que Postgres vive lo comprueba /health/deep por su cuenta (SELECT 1).
//
// El readiness del arranque (runtime.mjs) sigue pidiendo «/» sin tope: ahí lo lento no hace daño y
// no se toca lo que hoy abre en todas las cajas.

/** Lectura mínima a una tabla que existe desde la primera migración. */
export const RUTA_SONDA = "/tenants?select=id&limit=1";

/** El motivo de un error, aunque venga sin mensaje (un AggregateError de conexión no trae). */
export function explicarError(e) {
  return e?.cause?.code || e?.code || e?.errors?.[0]?.code || e?.message || String(e);
}

/**
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>} nunca lanza: `error` dice
 *   por qué no está sano, que es lo que el watchdog deja en el log.
 */
export async function sondearPostgrest(restPort, { timeoutMs = 4000, fetchImpl = fetch } = {}) {
  let r;
  try {
    // 127.0.0.1 y no «localhost»: PostgREST escucha solo en IPv4 (ver runtime.mjs).
    r = await fetchImpl(`http://127.0.0.1:${restPort}${RUTA_SONDA}`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const vencio = e?.name === "TimeoutError" || e?.name === "AbortError";
    return { ok: false, error: vencio ? `PostgREST no contestó en ${timeoutMs} ms` : `PostgREST inalcanzable (${explicarError(e)})` };
  }
  let cuerpo = "";
  try { cuerpo = await r.text(); } catch { /* sin cuerpo */ }
  let codigo = "";
  try { codigo = JSON.parse(cuerpo)?.code ?? ""; } catch { /* no era JSON */ }
  // Medido con PostgREST 14.14: en el primer segundo tras morir Postgres, la conexión rota del pool
  // contesta 400 con `code` VACÍO (un error de libpq, sin SQLSTATE). Los 400 legítimos traen código
  // (PGRST1xx o el de Postgres). Pasado ese segundo ya es 503 (PGRST000, luego PGRST002).
  if (r.status === 400 && !codigo) return { ok: false, status: 400, error: "PostgREST perdió la conexión con la base (400 sin código)" };
  if (r.status < 500) return { ok: true, status: r.status };
  return { ok: false, status: r.status, error: `PostgREST contestó ${r.status}${codigo ? ` (${codigo})` : ""}` };
}
