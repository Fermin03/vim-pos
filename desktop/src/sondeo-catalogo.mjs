// Sondeo del menú: "¿cambió el catálogo en la nube?" cada minuto.
//
// POR QUÉ EXISTE. El ciclo de sync baja el catálogo 1 de cada 6 vueltas (≈1 h, ver
// sync-ciclo.mjs). Un producto dado de alta en /admin no aparecía en la caja hasta esa hora o
// hasta reiniciar la aplicación —el arranque siempre hace PULL—, y el dueño lo vivía como que
// "el POS no se entera". Bajar el catálogo entero cada 10 minutos tampoco es la respuesta: son
// productos, precios y permisos reescritos sobre la base de una caja que está cobrando.
//
// Así que en vez de bajar por si acaso, se PREGUNTA. La caja no puede recibir avisos (vive detrás
// del NAT del restaurante), pero preguntar sale casi gratis: `catalogo_version()` (migración 0109)
// devuelve UN timestamp por PostgREST. Si no cambió, no se hace nada; si cambió, se baja en el acto.
//
// Vive fuera de main.mjs porque ahí no se puede probar: ese módulo importa Electron. Aquí no hay
// dependencias — la lectura, la descarga y los temporizadores se inyectan —, así que el ritmo, el
// backoff y la regla de no solaparse se verifican con relojes falsos y sin levantar la app.

export const SONDEO_CADA_MS = 60 * 1000;        // ritmo normal: un minuto
export const SONDEO_TOPE_MS = 10 * 60 * 1000;   // techo del backoff cuando la nube no contesta

/**
 * Cuánto esperar hasta el siguiente sondeo.
 *
 * Sin fallos, cada minuto. Con fallos, backoff exponencial 1→2→4→8→10 min. Una caja sin internet
 * preguntando cada minuto solo llena el log con la misma línea 600 veces por noche; y como lo que
 * está en juego es ver un producto nuevo un poco antes —no una venta—, esperar más es barato.
 */
export function esperaSondeo(fallosSeguidos, { cadaMs = SONDEO_CADA_MS, topeMs = SONDEO_TOPE_MS } = {}) {
  if (fallosSeguidos <= 0) return cadaMs;
  return Math.min(topeMs, cadaMs * 2 ** fallosSeguidos);
}

/**
 * Crea el sondeo.
 *
 * @param leerVersion  `() => Promise<string|null>` — pregunta a la nube. `null` significa "no hay
 *                     nada que comparar" (caja sin vincular, tenant sin menú todavía): NO es un
 *                     fallo y no dispara backoff, simplemente no hay novedad.
 * @param bajarCatalogo `(version) => Promise<boolean>` — hace el PULL. Devuelve true si llegó a
 *                     completarse; solo entonces se da por vista esa versión.
 */
export function crearSondeoCatalogo({
  leerVersion,
  bajarCatalogo,
  cadaMs = SONDEO_CADA_MS,
  topeMs = SONDEO_TOPE_MS,
  log = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let timer = null;
  let enCurso = false;
  let detenido = false;
  let fallos = 0;
  // La última versión que sabemos REFLEJADA en el Postgres local.
  //
  // Empieza en `null` = "no sabemos". Con ese valor el primer sondeo que traiga cualquier versión
  // dispara un PULL, y eso es lo correcto: si la caja arrancó sin red, su copia local es de la
  // sesión anterior y hay que bajarla en cuanto vuelva la señal. Cuando el arranque SÍ logra
  // bajar el catálogo, main.mjs llama `marcarVista()` y ese PULL redundante no ocurre.
  let ultimaVista = null;
  let ultimoSondeoIso = null;

  function programar(ms) {
    if (timer) clearTimeoutFn(timer);
    timer = null;
    if (detenido) return; // apagando: no re-armar
    timer = setTimeoutFn(() => { tick().catch(() => {}); }, ms);
    timer?.unref?.(); // un temporizador pendiente no debe impedir que la app cierre
  }

  async function tick() {
    if (detenido) return;
    // Sin solaparse: bajar el catálogo puede tardar más de un minuto con mala red, y dos PULL a
    // la vez se pisarían escribiendo las mismas filas.
    if (enCurso) { programar(cadaMs); return; }
    enCurso = true;
    let ok = true;
    try {
      const version = await leerVersion();
      ultimoSondeoIso = new Date().toISOString();
      if (version && version !== ultimaVista) {
        log(`el menú cambió en la nube (${version}) — bajando catálogo`);
        // `version` se leyó ANTES del PULL a propósito. Si el dueño guarda otro producto mientras
        // el snapshot viaja, esa versión queda por delante de la que marcamos y el siguiente
        // sondeo vuelve a bajar. El error cae del lado de bajar de más, no de quedarse corto.
        if ((await bajarCatalogo(version)) === true) {
          ultimaVista = version;
          log("catálogo actualizado");
        } else {
          ok = false;
        }
      }
    } catch (e) {
      ok = false;
      log(`sondeo falló: ${e?.message ?? e}`);
    } finally {
      enCurso = false;
    }
    fallos = ok ? 0 : fallos + 1;
    programar(esperaSondeo(fallos, { cadaMs, topeMs }));
  }

  return {
    /** Sondea ya y deja el sondeo corriendo. */
    iniciar() { detenido = false; tick().catch(() => {}); },
    detener() { detenido = true; if (timer) clearTimeoutFn(timer); timer = null; },
    /**
     * "Esta versión ya está en el Postgres local." La llama quien baja el catálogo por otro
     * camino —el arranque, el ciclo horario, el botón de la caja— para que el sondeo no repita
     * un PULL que acaba de hacerse.
     */
    marcarVista(version) { if (version) ultimaVista = version; },
    /** Estado para diagnóstico. */
    estado() {
      return { fallos, enCurso, detenido, armado: timer !== null, ultimaVista, ultimoSondeo: ultimoSondeoIso };
    },
  };
}
