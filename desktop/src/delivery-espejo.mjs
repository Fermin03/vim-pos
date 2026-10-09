// Agente de espejo de pedidos de apps (spec 2026-09-03; delta y ritmo 2026-09-09). Con el token
// de dispositivo, al ritmo que le diga la nube:
//   1) delivery-espejo → conexiones y pedidos de la sucursal (y sella el latido de la caja);
//   2) los espeja en la base local (mismas tablas);
//   3) para los pedidos que le tocan a esta caja, crea el ticket LOCAL (folio local, KDS, comanda)
//      y acepta en Uber vía delivery-accion;
//   4) deja aviso si la app canceló un pedido que ya tiene ticket local.
// Sin nube, el ciclo se salta y la pantalla sigue mostrando lo último espejado.
//
// Tienda en línea (entrega 4, canal TIENDA): viaja por el mismo sondeo. La caja declara
// `tienda: true` y si hay turno abierto; el ticket se crea con crear_ticket_desde_tienda (nunca con
// la de apps, ni al revés); y en cada vuelta le reporta a la nube en qué va cada pedido mirando su
// ticket local (impreso o con repartidor → listo; cobrado → entregado; cancelado → cancelado).
import {
  planificarEspejo, cursorDe, estadoAReportar, fallaDeTicket, avisoDeFalla, COLUMNAS_PEDIDO, COLUMNAS_CONEXION,
} from "./delivery-espejo-plan.mjs";
import { cadenciaAceptada, esperaEspejo } from "./delivery-espejo-ritmo.mjs";

// Ritmo de arranque y de respaldo: lo que se usa hasta que la nube diga otra cosa (y para
// siempre si la nube es más vieja que la caja). El ritmo real lo decide el servidor, que es el
// único que sabe si este cliente tiene delivery conectado y si hay pedidos vivos.
export const ESPEJO_CADA_MS = 10_000;
const TOKEN_TTL_MS = 20 * 60_000;

function upsertSql(tabla, columnas, conservar = []) {
  const cols = columnas.map((c) => `"${c}"`).join(", ");
  const vals = columnas.map((_, i) => `$${i + 1}`).join(", ");
  const set = columnas.filter((c) => c !== "id").map((c) =>
    conservar.includes(c) ? `"${c}" = COALESCE(${tabla}."${c}", EXCLUDED."${c}")` : `"${c}" = EXCLUDED."${c}"`).join(", ");
  return `INSERT INTO ${tabla} (${cols}) VALUES (${vals}) ON CONFLICT (id) DO UPDATE SET ${set}`;
}

const SQL_CONEXION = upsertSql("delivery_conexiones", COLUMNAS_CONEXION);
const COLS_PEDIDO_LOCAL = [...COLUMNAS_PEDIDO, "payload_raw", "ticket_id"];
const SQL_PEDIDO = upsertSql("delivery_pedidos", COLS_PEDIDO_LOCAL, ["ticket_id"]);
// ¿Hay turno abierto en la sucursal de ESTA caja? La sucursal sale de la fila local de `cajas`.
const SQL_TURNO = `SELECT 1 FROM turnos t JOIN cajas c ON c.sucursal_id = t.sucursal_id WHERE c.id = $1 AND t.estado = 'ABIERTO' LIMIT 1`;
// Lo que el plan necesita saber de la copia local de un pedido de la tienda y no trae la consulta
// de siempre: la explicación que ya se le dejó al cajero y si su ticket sigue abierto.
const SQL_EXTRAS_TIENDA = `SELECT p.id, p.ultimo_error, t.estado_fiscal AS ticket_estado
  FROM delivery_pedidos p LEFT JOIN tickets t ON t.id = p.ticket_id WHERE p.id = ANY($1::uuid[])`;
// Pedidos de la tienda con ticket en esta caja y todavía vivos, con lo que hace falta de su ticket
// para saber qué reportar (estadoAReportar). Sale de mirar el ticket: sin red no se pierde nada.
const SQL_REPORTE = `SELECT p.id, p.folio_corto, p.estado, t.estado_fiscal AS ticket_estado, t.ticket_impreso_at,
         EXISTS (SELECT 1 FROM delivery_asignaciones a WHERE a.ticket_id = t.id) AS asignado
    FROM delivery_pedidos p JOIN tickets t ON t.id = p.ticket_id
   WHERE p.canal = 'TIENDA' AND p.estado IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO')`;
/** Un reporte que la nube no tomó no se repite en cada vuelta: se vuelve a intentar pasado esto. */
const REPORTE_SIN_EFECTO_MS = 5 * 60_000;
const json = (v) => (v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : v);

/** Vigencia y sesión de un JWT, para el log. Nunca devuelve el token ni sus claims sensibles. */
export function resumenToken(jwt, ahora = Date.now()) {
  try {
    const carga = JSON.parse(Buffer.from(String(jwt).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const exp = Number(carga.exp) * 1000;
    const iat = Number(carga.iat) * 1000;
    const restante = Number.isFinite(exp) ? Math.round((exp - ahora) / 1000) : null;
    const edad = Number.isFinite(iat) ? Math.round((ahora - iat) / 1000) : null;
    return `emitido hace ${edad ?? "?"}s, ${restante === null ? "sin exp" : restante >= 0 ? `vence en ${restante}s` : `venció hace ${-restante}s`}, sesión ${String(carga.session_id ?? "?").slice(0, 8)}`;
  } catch {
    return "token ilegible";
  }
}

// Errores de crear_ticket_desde_app (0112_combos_uber.sql) que ya vienen con su código como
// prefijo ("CODIGO: resto del mensaje"), la misma convención que ya usaba PEDIDO_NO_EXISTE (fuera
// del alcance de esta traducción). Se comprueban anclados al INICIO del mensaje (no con un
// `includes` suelto): un `includes` dispararía el código equivocado si el nombre de un producto
// contuviera esa cadena por casualidad (p. ej. un combo llamado "ITEM_SIN_MAPEAR especial" que sí
// se pudo mapear, pero está agotado).
const PREFIJOS_DE_ERROR = [
  "SIN_TURNO_ABIERTO", "ITEM_SIN_MAPEAR", "COMBO_ELECCION_SIN_MAPEAR", "COMBO_ELECCION_AMBIGUA",
  // crear_ticket_desde_tienda y _delivery_items_a_ticket (0161_tienda_en_linea_base.sql).
  "TOTAL_NO_COINCIDE", "ENVIO_NO_COINCIDE", "DIRECCION_INVALIDA", "CLIENTE_BLOQUEADO",
  "PRODUCTO_DE_OTRO_NEGOCIO", "OPCION_DE_OTRO_NEGOCIO", "SUCURSAL_DE_OTRO_NEGOCIO",
];

/**
 * Traduce el error de la RPC crear_ticket_desde_app a un código corto que la caja le muestra al
 * cajero. Lo que no se reconoce se deja TAL CUAL: es preferible un mensaje feo de Postgres que
 * esconder un fallo que nadie previó.
 */
export function codigoDeError(m) {
  for (const codigo of PREFIJOS_DE_ERROR) if (m.startsWith(`${codigo}:`)) return codigo;
  // Texto libre de agregar_combo_a_ticket (0111_combos.sql): no trae prefijo, se reconoce por
  // una frase estable de cada RAISE EXCEPTION.
  if (m.includes("requiere entre") && m.includes("selecciones")) return "COMBO_INCOMPLETO";
  if (m.includes("está agotado o pausado")) return "PRODUCTO_AGOTADO";
  // 0152: el componente existe pero esta sucursal no lo vende (productos_sucursal.disponible = false).
  if (m.includes("no se vende en esta sucursal")) return "PRODUCTO_NO_SE_VENDE";
  if (m.includes("no es opción del slot")) return "COMBO_OPCION_INVALIDA";
  // Se dispara cuando alguien desactiva una opción de un slot en el admin (combo_opciones.activa =
  // false) mientras Uber sigue vendiendo la carta vieja que la ofrecía.
  if (m.includes("está excluido del slot")) return "COMBO_OPCION_EXCLUIDA";
  return m;
}

/**
 * crearEspejo({ pool, nube, cajaId, log, cadaMs, fetchFn }) → { iniciar, detener, tick }
 *  - pool: pg.Pool de la base local.
 *  - nube: ({ forzar }) => Promise<{ cloudUrl, anonKey, deviceToken } | null>  (token de dispositivo;
 *          con `forzar: true` debe hacer login nuevo, sin caché: se pide tras un 401).
 *  - cajaId: uuid de esta caja (del correo del dispositivo).
 */
export function crearEspejo({
  pool, nube, cajaId, log = () => {}, cadaMs = ESPEJO_CADA_MS, fetchFn = fetch,
  setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, aleatorio = Math.random,
}) {
  let timer = null;
  let corriendo = false;
  let detenido = false;
  let tokenCache = null; // { opts, at }
  let forzarLogin = false; // tras un 401: el siguiente token se pide sin caché, también arriba (main.mjs)
  // Hasta dónde llegó el último delta. Vive SOLO en memoria a propósito: el trigger
  // set_updated_at pisa updated_at con el reloj local en cada UPDATE, así que la copia espejada
  // no sirve para preguntarle a la nube "¿qué cambió desde…?". Un reinicio hace arranque en frío
  // (la nube manda entonces la ventana de 24 h completa), que es una consulta cara UNA vez.
  let cursor = null;
  let cadencia = cadenciaAceptada(cadaMs, cadaMs);
  let fallos = 0;
  let pendiente = false; // quedó trabajo local a medias: no dormirse aunque la nube diga reposo
  // Reportes de estado que la nube contestó sin tomarlos: pedido → { clave: "reportado|quedó", at }.
  // Mientras nada cambie (ni lo que hay que decir ni cómo quedó el pedido) no se repite la llamada
  // hasta pasado REPORTE_SIN_EFECTO_MS. Solo en memoria: un reinicio vuelve a intentarlo una vez.
  const sinEfecto = new Map();

  async function opcionesNube() {
    if (!forzarLogin && tokenCache && Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache.opts;
    const opts = await nube({ forzar: forzarLogin });
    forzarLogin = false;
    if (!opts) return null;
    tokenCache = { opts, at: Date.now() };
    return opts;
  }

  async function llamar(opts, funcion, cuerpo) {
    const r = await fetchFn(`${opts.cloudUrl}/functions/v1/${funcion}`, {
      method: "POST",
      headers: { apikey: opts.anonKey, Authorization: `Bearer ${opts.deviceToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo ?? {}),
      signal: AbortSignal.timeout(15_000),
    });
    const texto = await r.text();
    let body = {};
    try { body = texto ? JSON.parse(texto) : {}; } catch { body = { error: "RESPUESTA_NO_JSON", detalle: texto.slice(0, 200) }; }
    if (r.status === 401) {
      // Token rechazado. Se tira la caché de aquí Y se pide arriba un login nuevo: el 6 sep 2026 la
      // caché de main.mjs devolvía el mismo token muerto durante 20 minutos y la caja se quedaba en
      // «Uber: sin datos». Se deja rastro de qué token era (vigencia y sesión, nunca el token).
      tokenCache = null;
      forzarLogin = true;
      log(`token rechazado (${body?.detalle ?? "sin detalle"}) · ${resumenToken(opts.deviceToken)}`);
    }
    return { status: r.status, ok: r.ok, body };
  }

  async function tick() {
    if (corriendo) return { omitido: "en curso" };
    corriendo = true;
    try {
      const opts = await opcionesNube();
      if (!opts) { fallos++; return { omitido: "sin nube" }; }
      // `desde` es el cursor del delta: la nube manda solo lo que cambió después de ese instante.
      // Sin cursor (arranque) pide la ventana completa, como siempre.
      // El turno se consulta ANTES de llamar y en cada vuelta: con él la nube decide si la tienda
      // de esta sucursal recibe pedidos ahora mismo.
      const turnoAbierto = (await pool.query(SQL_TURNO, [cajaId])).rows.length > 0;
      const r = await llamar(opts, "delivery-espejo", { desde: cursor ?? undefined, tienda: true, turno_abierto: turnoAbierto });
      if (!r.ok) { fallos++; log(`espejo HTTP ${r.status} ${r.body?.error ?? ""}`); return { error: r.status }; }
      fallos = 0;
      // `tienda` solo viene de una nube que ya conoce la tienda en línea, y solo si el cliente la tiene.
      const { conexiones = [], pedidos = [], siguiente_en_ms: siguiente, tienda = null } = r.body;
      cadencia = cadenciaAceptada(siguiente, cadaMs);

      // Con el delta vacío no hay nada que planear ni que consultar de la copia local. Esa es la
      // vuelta normal de un cliente sin pedidos, y tiene que salir casi gratis.
      let plan = { upserts: [], aCrear: [], aAceptar: [], avisos: [] };
      if (pedidos.length) {
        const { rows: localPedidos } = await pool.query(
          `SELECT id, ticket_id, estado FROM delivery_pedidos WHERE id = ANY($1::uuid[])`, [pedidos.map((p) => p.id)]);
        const idsTienda = pedidos.filter((p) => p.canal === "TIENDA").map((p) => p.id);
        const extras = new Map(idsTienda.length ? (await pool.query(SQL_EXTRAS_TIENDA, [idsTienda])).rows.map((x) => [x.id, x]) : []);
        plan = planificarEspejo({
          conexiones, pedidos, turnoAbierto, cajaId, tienda,
          localPedidos: extras.size ? localPedidos.map((l) => ({ ...l, ...extras.get(l.id) })) : localPedidos,
        });
      }

      // Espejo en una transacción.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const c of conexiones) await client.query(SQL_CONEXION, COLUMNAS_CONEXION.map((k) => json(c[k] ?? null)));
        for (const f of plan.upserts) await client.query(SQL_PEDIDO, COLS_PEDIDO_LOCAL.map((k) => json(f[k] ?? null)));
        for (const a of plan.avisos) await client.query(`UPDATE delivery_pedidos SET ultimo_error = $2 WHERE id = $1`, [a.pedidoId, a.motivo]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally { client.release(); }

      // El cursor avanza SOLO cuando la copia local ya cuajó. Si se adelantara y la transacción
      // fallara, el siguiente delta empezaría después de esas filas y el pedido no volvería a
      // llegar nunca: los vivos sí se remandan siempre, pero uno recién cancelado no.
      cursor = cursorDe(pedidos, cursor);

      // Tickets que le tocan a esta caja.
      let creados = 0, aceptados = 0, reintentables = 0;
      for (const id of plan.aCrear) {
        const pedido = pedidos.find((p) => p.id === id);
        const conexion = conexiones.find((c) => c.id === pedido?.conexion_id);
        const rec = await llamar(opts, "delivery-accion", { accion: "reclamar", pedido_id: id });
        if (!rec.ok) { log(`pedido ${pedido?.folio_corto ?? id}: ${rec.body?.error ?? rec.status} (no es de esta caja)`); continue; }
        const esTienda = pedido?.canal === "TIENDA";
        try {
          await pool.query(esTienda ? `SELECT crear_ticket_desde_tienda($1)` : `SELECT crear_ticket_desde_app($1)`, [id]);
          creados++;
        } catch (e) {
          const m = String(e?.message ?? e);
          const falla = esTienda ? fallaDeTicket(m, e?.code) : null;
          if (falla && !falla.reintentable) {
            // Lo que el cliente pidió ya no se puede vender como se le cotizó: el pedido se cancela
            // solo y el cajero lee por qué. Si la nube no toma la baja, la vuelta siguiente vuelve a
            // pasar por aquí (el pedido sigue sin ticket) y lo reintenta.
            await pool.query(`UPDATE delivery_pedidos SET ultimo_error = $2 WHERE id = $1`, [id, avisoDeFalla(falla.codigo)]).catch(() => {});
            const baja = await llamar(opts, "delivery-accion", pedido.estado === "RECIBIDO"
              ? { accion: "rechazar", pedido_id: id, motivo: "OTRO" }
              : { accion: "estado", pedido_id: id, estado: "CANCELADO", motivo: "OTRO" });
            const hecho = baja.ok || baja.body?.error === "ACCION_INVALIDA";
            if (!hecho) reintentables++;
            log(`pedido ${pedido.folio_corto ?? id}: no se puede pasar a caja (${falla.codigo}); ${hecho ? "se canceló" : `la nube no tomó la cancelación (${baja.body?.error ?? baja.status}); se reintenta`}`);
            continue;
          }
          const codigo = codigoDeError(m);
          await pool.query(`UPDATE delivery_pedidos SET ultimo_error = $2 WHERE id = $1`, [id, codigo]).catch(() => {});
          log(`pedido ${pedido?.folio_corto ?? id}: no se pudo crear el ticket local (${codigo})`);
          reintentables++;
          continue;
        }
        if (pedido?.estado === "RECIBIDO") {
          const ac = await llamar(opts, "delivery-accion", { accion: "aceptar", pedido_id: id, tiempo_prep_min: esTienda ? undefined : conexion?.tiempo_prep_min ?? 15 });
          if (ac.ok || ac.body?.error === "ACCION_INVALIDA") aceptados++;
          else { reintentables++; log(`pedido ${pedido?.folio_corto ?? id}: accept en ${esTienda ? "la nube" : "Uber"} falló (${ac.body?.error ?? ac.status}); se reintenta`); }
        }
      }
      // Accept pendiente de una vuelta anterior: el ticket local ya existe (la cocina ya lo tiene),
      // pero en la nube el pedido sigue RECIBIDO. Sin este reintento, Uber lo cancelaba por no
      // aceptado mientras la cocina lo preparaba (D7).
      for (const id of plan.aAceptar ?? []) {
        const pedido = pedidos.find((p) => p.id === id);
        const conexion = conexiones.find((c) => c.id === pedido?.conexion_id);
        const esTienda = pedido?.canal === "TIENDA";
        const ac = await llamar(opts, "delivery-accion", { accion: "aceptar", pedido_id: id, tiempo_prep_min: esTienda ? undefined : conexion?.tiempo_prep_min ?? 15 });
        if (ac.ok || ac.body?.error === "ACCION_INVALIDA") aceptados++;
        else { reintentables++; log(`pedido ${pedido?.folio_corto ?? id}: accept en ${esTienda ? "la nube" : "Uber"} sigue fallando (${ac.body?.error ?? ac.status}); se reintenta`); }
      }

      // Reporte de estado de los pedidos de la tienda. La nube responde en qué estado QUEDÓ el
      // pedido, y eso es lo que se guarda en la copia local (puede no ser lo reportado: solo avanza).
      const { rows: porReportar } = await pool.query(SQL_REPORTE);
      for (const f of porReportar) {
        const reportar = estadoAReportar(f);
        if (!reportar || reportar === f.estado) { sinEfecto.delete(f.id); continue; }
        const previo = sinEfecto.get(f.id);
        if (previo?.clave === `${reportar}|${f.estado}` && Date.now() - previo.at < REPORTE_SIN_EFECTO_MS) continue;
        const rep = await llamar(opts, "delivery-accion", { accion: "estado", pedido_id: f.id, estado: reportar });
        let quedo = f.estado;
        if (rep.ok && typeof rep.body?.estado === "string") {
          quedo = rep.body.estado;
          await pool.query(`UPDATE delivery_pedidos SET estado = $2 WHERE id = $1`, [f.id, quedo]);
        }
        if (quedo === reportar) { sinEfecto.delete(f.id); continue; }
        const porque = rep.ok ? `quedó ${quedo}` : rep.body?.error ?? rep.status;
        if (rep.status >= 500 || rep.status === 401) {
          // Nube caída o token vencido: eso sí se arregla volviendo pronto.
          reintentables++;
          log(`pedido ${f.folio_corto ?? f.id}: no se pudo reportar ${reportar} (${porque}); se reintenta`);
        } else {
          // La nube contestó y no lo tomó. Repetirlo cada 10 s no cambia la respuesta: se anota y
          // se vuelve a intentar cuando cambie el ticket o el pedido, o pasados unos minutos.
          sinEfecto.set(f.id, { clave: `${reportar}|${quedo}`, at: Date.now() });
          log(`pedido ${f.folio_corto ?? f.id}: la nube no tomó el estado ${reportar} (${porque}); se reintenta en ${REPORTE_SIN_EFECTO_MS / 60_000} min`);
        }
      }
      // Un reclamo que otra caja ganó NO cuenta: ese pedido ya no es de aquí y volver pronto no
      // lo arregla. Solo cuenta lo que este equipo puede reintentar con provecho.
      pendiente = reintentables > 0;
      if (creados || aceptados || plan.avisos.length) log(`${pedidos.length} pedidos espejados · ${creados} tickets creados · ${aceptados} aceptados · ${plan.avisos.length} avisos`);
      return { espejados: pedidos.length, creados, aceptados, avisos: plan.avisos.length };
    } catch (e) {
      fallos++;
      log(`tick falló: ${e?.message ?? e}`);
      return { error: String(e?.message ?? e) };
    } finally {
      corriendo = false;
    }
  }

  function programar(ms) {
    if (timer) clearTimeoutFn(timer);
    timer = null;
    if (detenido) return;
    timer = setTimeoutFn(() => { vuelta().catch(() => {}); }, ms);
    timer?.unref?.(); // un temporizador pendiente no debe impedir que la app cierre
  }

  /** Una vuelta completa: sondear y dejar programada la siguiente. */
  async function vuelta() {
    try {
      await tick();
    } finally {
      programar(esperaEspejo({ cadencia, fallos, pendiente, aleatorio }));
    }
  }

  return {
    tick,
    vuelta,
    /** Para diagnóstico: a qué ritmo va y por qué. */
    estado() { return { cadencia, fallos, pendiente, cursor, armado: timer !== null }; },
    iniciar() { if (timer) return; detenido = false; vuelta().catch(() => {}); log("agente iniciado"); },
    detener() { detenido = true; if (timer) clearTimeoutFn(timer); timer = null; },
  };
}
