// Respaldo DIARIO automático de la caja.
//
// POR QUÉ EXISTE. El respaldo en frío de `backup.mjs` solo corría al SALIR de la app o al pulsar
// "Respaldar ahora". Pero la caja vive en la bandeja y casi nunca se cierra: un restaurante que no
// apaga la computadora —lo normal— podía pasar semanas sin una sola copia local. El sitio promete
// una copia diaria; este módulo es lo que la hace cierta.
//
// LA REGLA QUE MANDA: nunca interrumpir a un cajero. El respaldo detiene Postgres unos segundos
// (es una copia en frío, el bin embebido no trae pg_dump), así que solo se intenta cuando la caja
// está QUIETA:
//   · no hay ningún turno abierto, y
//   · nadie ha operado la caja en los últimos 10 minutos (una escritura por el gateway), y
//   · nadie ha tocado el teclado ni el mouse de esa computadora en 10 minutos, y
//   · no hay otra cosa en curso (una sincronización, una actualización, otro respaldo).
// Se revisa cada 15 minutos. Si el día se va sin una ventana quieta, se respalda en la primera que
// aparezca: no se "salta" el día, se corre. Y si pasan días sin poder —un negocio que nunca cierra
// turno— se reporta a VIM por la bitácora de errores, que es lo que VIM sí ve.
//
// Aquí vive la POLÍTICA (pura, con reloj inyectado) y el temporizador. Lo que toca Electron,
// Postgres y el disco se inyecta desde main.mjs: así se prueba con `node --test` sin base de datos.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Cada cuánto se mira si toca respaldar. */
export const REVISAR_CADA_MS = 15 * MIN;
/**
 * Mínimo entre dos respaldos automáticos. 20 horas y no 24: un local que cierra a las 23:00 y al
 * día siguiente a las 22:00 debe poder respaldar las dos noches. Y no "una vez por día de
 * calendario": un cierre a las 23:50 y otro chequeo a las 00:05 gastarían dos de las siete copias
 * en quince minutos.
 */
export const HORAS_ENTRE_RESPALDOS = 20;
/** La caja está quieta si nadie la opera desde hace esto. */
export const MIN_SIN_ACTIVIDAD = 10;
/** Tras un respaldo fallido no se reintenta antes de esto: cada intento detiene Postgres. */
export const MIN_ENTRE_REINTENTOS = 60;
/** Días sin respaldo a partir de los cuales se le avisa a VIM (una vez al día). */
export const DIAS_PARA_AVISAR = 3;

const ms = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Como `ms`, pero una fecha "en el futuro" no vale. Si la computadora tuvo el reloj adelantado
 * —pila agotada, alguien puso 2027— y luego se corrigió, el "último respaldo" queda por delante de
 * hoy y `ahora - ultimoOk` sería negativo para siempre: la caja no volvería a respaldar nunca.
 * Una hora de tolerancia absorbe el ruido normal de un reloj que se sincroniza.
 */
const msPasado = (iso, ahora) => {
  const t = ms(iso);
  return t !== null && t > ahora + HORA ? null : t;
};

/**
 * ¿Toca respaldar AHORA? Pura.
 *
 * @param {object} c
 * @param {number} c.ahora            epoch ms
 * @param {string|null} c.ultimoOk    ISO del último respaldo que SÍ terminó (cualquiera: diario,
 *                                    manual o el de salir)
 * @param {string|null} c.ultimoFallo ISO del último intento fallido
 * @param {boolean|null} c.turnoAbierto  null = no se pudo saber (la base no contestó)
 * @param {number|null} c.ultimaActividad epoch ms de la última operación en el gateway
 * @param {number|null} c.inactividadSistemaSeg segundos desde la última tecla o movimiento del mouse
 *                                    en la computadora de la caja (`powerMonitor.getSystemIdleTime()`);
 *                                    null = el sistema no lo sabe decir
 * @param {boolean} c.ocupado         hay una sincronización, actualización u otro respaldo en curso
 * @returns {{ respaldar: boolean, motivo: string }}
 */
export function debeRespaldar({ ahora, ultimoOk = null, ultimoFallo = null, turnoAbierto, ultimaActividad = null, inactividadSistemaSeg = null, ocupado = false }) {
  const ok = msPasado(ultimoOk, ahora);
  if (ok !== null && ahora - ok < HORAS_ENTRE_RESPALDOS * HORA) return { respaldar: false, motivo: "al-dia" };
  // De aquí en adelante SÍ toca; lo que sigue decide si se puede.
  if (ocupado) return { respaldar: false, motivo: "ocupado" };
  // Sin saber si hay turno abierto no se arriesga: la duda se resuelve a favor del cajero.
  if (turnoAbierto !== false) return { respaldar: false, motivo: turnoAbierto === true ? "turno-abierto" : "sin-dato-de-turno" };
  if (ultimaActividad !== null && ahora - ultimaActividad < MIN_SIN_ACTIVIDAD * MIN) return { respaldar: false, motivo: "actividad-reciente" };
  // El gateway solo ve ESCRITURAS. Un cajero puede pasar once minutos contando el fondo sin
  // escribir nada y pulsar «Abrir turno» justo cuando la base está detenida. El teclado y el mouse
  // sí lo delatan.
  if (inactividadSistemaSeg !== null && inactividadSistemaSeg < MIN_SIN_ACTIVIDAD * 60) return { respaldar: false, motivo: "equipo-en-uso" };
  const fallo = ms(ultimoFallo);
  if (fallo !== null && (ok === null || fallo > ok) && ahora - fallo < MIN_ENTRE_REINTENTOS * MIN) return { respaldar: false, motivo: "reintento-pendiente" };
  return { respaldar: true, motivo: "toca" };
}

/**
 * ¿Hay que avisarle a VIM de que esta caja lleva días sin respaldo? Devuelve los días, o null.
 *
 * Una caja recién instalada no tiene `ultimoOk`: se cuenta desde `desde` (la primera vez que este
 * módulo corrió ahí), para no reportar "sin respaldo" a la hora de instalarla.
 */
export function diasSinRespaldo({ ahora, ultimoOk = null, desde = null, ultimoAviso = null }) {
  const ref = msPasado(ultimoOk, ahora) ?? ms(desde);
  if (ref === null) return null;
  const dias = Math.floor((ahora - ref) / DIA);
  if (dias < DIAS_PARA_AVISAR) return null;
  const aviso = ms(ultimoAviso);
  if (aviso !== null && ahora - aviso < DIA) return null;
  return dias;
}

const p2 = (n) => String(n).padStart(2, "0");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * El renglón de la bandeja: "Último respaldo: hoy 03:12", "ayer 23:10", "24 sep 23:10".
 * En la hora de la computadora de la caja, que es la del local.
 */
export function textoUltimoRespaldo(ultimoOk, ahora = Date.now()) {
  const t = ms(ultimoOk);
  if (t === null) return "Último respaldo: ninguno todavía";
  const d = new Date(t);
  const hoy = new Date(ahora);
  const hora = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const diaDe = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((diaDe(hoy) - diaDe(d)) / DIA);
  if (dif === 0) return `Último respaldo: hoy ${hora}`;
  if (dif === 1) return `Último respaldo: ayer ${hora}`;
  const anio = d.getFullYear() === hoy.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `Último respaldo: ${d.getDate()} ${MESES[d.getMonth()]}${anio} ${hora}`;
}

/**
 * ¿Esta petición al gateway es alguien OPERANDO la caja?
 *
 * No basta "hubo tráfico": el POS abierto consulta solo cada 10–20 s (cuentas abiertas, pedidos de
 * apps, estado de la conexión) y el KDS igual; con eso la caja nunca estaría "quieta". Lo que
 * delata a una persona es ESCRIBIR: abrir un ticket, cobrar, entrar con PIN. Todo eso viaja como
 * POST/PATCH/DELETE; los sondeos son GET. El refresco de sesión también es POST pero lo lanza la
 * app sola, así que no cuenta.
 */
export function esActividadDeOperacion(metodo, ruta, busqueda = "") {
  const m = String(metodo ?? "").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  if (ruta === "/auth/v1/logout") return false;
  if (ruta === "/auth/v1/token" && /grant_type=refresh_token/.test(busqueda)) return false;
  return ruta.startsWith("/rest/v1/") || ruta.startsWith("/functions/v1/") || ruta.startsWith("/auth/v1/");
}

// ── Estado en disco ──────────────────────────────────────────────────────────────────────────

/** Vive junto a los respaldos; la rotación solo toca carpetas `pgdata-*`, así que no lo borra. */
export const ARCHIVO_ESTADO = "ultimo-respaldo.json";

/** `pgdata-2026-09-30_03-12-05` → ISO de esa hora LOCAL (así nombra `backup.mjs` sus carpetas). */
export function fechaDeCarpeta(nombre) {
  const m = /^pgdata-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/.exec(nombre);
  if (!m) return null;
  const [, a, me, d, h, mi, s] = m.map(Number);
  const f = new Date(a, me - 1, d, h, mi, s);
  return Number.isNaN(f.getTime()) ? null : f.toISOString();
}

/**
 * Lee el estado (`ultimo-respaldo.json` dentro de la carpeta de respaldos).
 *
 * Si el archivo no existe o no dice cuándo fue el último —una caja que se actualiza a esta
 * versión, o alguien lo borró— se deduce de la carpeta de respaldo más nueva. Sin eso, toda caja
 * recién actualizada haría un respaldo de más y avisaría de un atraso que no existe.
 */
export function leerEstado(backupsDir) {
  let e = {};
  try { e = JSON.parse(readFileSync(path.join(backupsDir, ARCHIVO_ESTADO), "utf8")) ?? {}; } catch { /* sin archivo */ }
  if (typeof e !== "object" || Array.isArray(e)) e = {};
  if (!e.ultimoOk) {
    try {
      const fechas = readdirSync(backupsDir).map(fechaDeCarpeta).filter(Boolean).sort();
      if (fechas.length) e.ultimoOk = fechas[fechas.length - 1];
    } catch { /* sin carpeta todavía */ }
  }
  return {
    desde: e.desde ?? null,
    ultimoOk: e.ultimoOk ?? null,
    ultimoFallo: e.ultimoFallo ?? null,
    ultimoError: e.ultimoError ?? null,
    ultimoAviso: e.ultimoAviso ?? null,
    // Cuándo se reportó por última vez cada causa de fallo ({ ENOSPC: iso, … }).
    avisos: e.avisos && typeof e.avisos === "object" && !Array.isArray(e.avisos) ? e.avisos : {},
  };
}

/** Guarda (mezclando) el estado. Nunca lanza: un respaldo hecho no se pierde por no poder anotarlo. */
export function guardarEstado(backupsDir, cambios) {
  try {
    mkdirSync(backupsDir, { recursive: true });
    const nuevo = { ...leerEstado(backupsDir), ...cambios };
    writeFileSync(path.join(backupsDir, ARCHIVO_ESTADO), JSON.stringify(nuevo, null, 2));
    return nuevo;
  } catch {
    return null;
  }
}

/**
 * La CAUSA de un fallo, para no reportar lo mismo en cada reintento: el código del sistema
 * (`ENOSPC`, `EPERM`, `EBUSY`) si el mensaje empieza por uno, o la que diga quien falló.
 */
export function causaDe(resultado) {
  if (resultado?.causa) return String(resultado.causa);
  return /^([A-Z][A-Z0-9_]{2,})\b/.exec(String(resultado?.error ?? ""))?.[1] ?? "otro";
}

// ── El temporizador ──────────────────────────────────────────────────────────────────────────

/**
 * Crea el respaldo diario. Todo lo que toca el mundo se inyecta:
 *
 * @param {object} o
 * @param {() => Promise<{turnoAbierto: boolean|null, ultimaActividad: number|null, ocupado: boolean}>} o.contexto
 * @param {() => Promise<{ok: boolean, error?: string}>} o.respaldar  hace la copia en frío Y anota
 *        el resultado en el estado (lo hace main.mjs: es la misma rutina de "Respaldar ahora")
 * @param {() => object} o.leerEstado
 * @param {(cambios: object) => void} o.guardarEstado
 * @param {(mensaje: string, contexto: object) => Promise<void>|void} o.reportar  a la bitácora que
 *        VIM ve (`errores_app`)
 * @param {() => void} [o.alCambiar]  para refrescar el menú de la bandeja
 */
export function crearRespaldoDiario({
  contexto, respaldar, leerEstado: leer, guardarEstado: guardar, reportar = () => {}, alCambiar = () => {},
  log = () => {}, cadaMs = REVISAR_CADA_MS, ahora = () => Date.now(),
}) {
  let timer = null;
  let enCurso = false;
  // Cuándo se reportó cada cosa, TAMBIÉN en memoria. El estado en disco manda entre reinicios, pero
  // si el disco está lleno —justo cuando hay algo que reportar— no se puede escribir, y sin esta
  // copia el mismo aviso saldría en cada revisión, cada 15 minutos.
  const avisosMem = new Map();
  const ultimoAvisoDe = (clave, enDisco) => {
    const a = ms(enDisco), b = avisosMem.get(clave) ?? null;
    return a === null ? b : b === null ? a : Math.max(a, b);
  };

  /** Una revisión. Devuelve qué decidió (para las pruebas y para el log). */
  async function revisar() {
    if (enCurso) return { respaldar: false, motivo: "revision-en-curso" };
    enCurso = true;
    try {
      const t = ahora();
      let estado = leer();
      // Primera vez en esta caja: se anota desde cuándo se cuenta el atraso.
      if (!estado.desde) { guardar({ desde: new Date(t).toISOString() }); estado = leer(); }

      let ctx;
      try { ctx = await contexto(); } catch { ctx = { turnoAbierto: null, ultimaActividad: null, ocupado: false }; }
      const d = debeRespaldar({ ahora: t, ultimoOk: estado.ultimoOk, ultimoFallo: estado.ultimoFallo, ...ctx });

      if (d.respaldar) {
        log("la caja está quieta y toca respaldo: empezando");
        let r;
        try { r = await respaldar(); } catch (e) { r = { ok: false, error: e?.message ?? String(e) }; }
        if (r?.ok) {
          log("respaldo diario hecho");
        } else {
          const error = r?.error ?? "motivo desconocido";
          const causa = causaDe(r);
          log(`respaldo diario FALLÓ: ${error}`);
          // Una vez cada 24 h por causa: el reintento es cada hora y el disco lleno no se arregla
          // solo; quince reportes iguales al día entierran el que importa.
          const clave = `fallo:${causa}`;
          const previo = ultimoAvisoDe(clave, leer().avisos?.[causa]);
          if (previo === null || t - previo >= DIA) {
            avisosMem.set(clave, t);
            guardar({ avisos: { ...(leer().avisos ?? {}), [causa]: new Date(t).toISOString() } });
            try { await reportar(`Respaldo diario de la caja falló: ${error}`, { origen: "respaldo-diario", tipo: "fallo", causa }); } catch { /* */ }
          }
        }
        estado = leer();
      }

      // Atraso: se mira SIEMPRE, también cuando no se pudo respaldar por turno abierto. Es el caso
      // que importa — el negocio que nunca cierra turno y por eso nunca respalda.
      const avisoAtraso = ultimoAvisoDe("atraso", estado.ultimoAviso);
      const dias = diasSinRespaldo({
        ahora: ahora(), ultimoOk: estado.ultimoOk, desde: estado.desde,
        ultimoAviso: avisoAtraso === null ? null : new Date(avisoAtraso).toISOString(),
      });
      if (dias !== null) {
        avisosMem.set("atraso", ahora());
        const porque = d.motivo === "turno-abierto" ? " (hay un turno abierto desde entonces)" : "";
        log(`la caja lleva ${dias} días sin respaldo local${porque}`);
        try {
          await reportar(`La caja lleva ${dias} días sin respaldo local${porque}`, { origen: "respaldo-diario", tipo: "atraso", dias, motivo: d.motivo });
        } catch { /* */ }
        guardar({ ultimoAviso: new Date(ahora()).toISOString() });
      }
      try { alCambiar(); } catch { /* */ }
      return d;
    } finally {
      enCurso = false;
    }
  }

  return {
    revisar,
    iniciar() {
      if (timer) return;
      timer = setInterval(() => { revisar().catch((e) => log(`revisión falló: ${e?.message ?? e}`)); }, cadaMs);
      timer.unref?.();
    },
    detener() { if (timer) { clearInterval(timer); timer = null; } },
  };
}
