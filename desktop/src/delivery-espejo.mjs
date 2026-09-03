// Agente de espejo de pedidos de apps (spec 2026-09-03). Cada 10 s, con el token de dispositivo:
//   1) delivery-espejo → conexiones y pedidos de la sucursal (y sella el latido de la caja);
//   2) los espeja en la base local (mismas tablas);
//   3) para los pedidos que le tocan a esta caja, crea el ticket LOCAL (folio local, KDS, comanda)
//      y acepta en Uber vía delivery-accion;
//   4) deja aviso si la app canceló un pedido que ya tiene ticket local.
// Sin nube, el ciclo se salta y la pantalla sigue mostrando lo último espejado.
import { planificarEspejo, COLUMNAS_PEDIDO, COLUMNAS_CONEXION } from "./delivery-espejo-plan.mjs";

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
const json = (v) => (v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : v);

/**
 * crearEspejo({ pool, nube, cajaId, log, cadaMs, fetchFn }) → { iniciar, detener, tick }
 *  - pool: pg.Pool de la base local.
 *  - nube: () => Promise<{ cloudUrl, anonKey, deviceToken } | null>  (token de dispositivo).
 *  - cajaId: uuid de esta caja (del correo del dispositivo).
 */
export function crearEspejo({ pool, nube, cajaId, log = () => {}, cadaMs = ESPEJO_CADA_MS, fetchFn = fetch }) {
  let timer = null;
  let corriendo = false;
  let tokenCache = null; // { opts, at }

  async function opcionesNube() {
    if (tokenCache && Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache.opts;
    const opts = await nube();
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
    if (r.status === 401) tokenCache = null; // token vencido: el siguiente tick vuelve a pedirlo
    return { status: r.status, ok: r.ok, body };
  }

  async function tick() {
    if (corriendo) return { omitido: "en curso" };
    corriendo = true;
    try {
      const opts = await opcionesNube();
      if (!opts) return { omitido: "sin nube" };
      const r = await llamar(opts, "delivery-espejo", {});
      if (!r.ok) { log(`espejo HTTP ${r.status} ${r.body?.error ?? ""}`); return { error: r.status }; }
      const { conexiones = [], pedidos = [], sucursal_id: sucursalId } = r.body;

      const ids = pedidos.map((p) => p.id);
      const { rows: localPedidos } = ids.length
        ? await pool.query(`SELECT id, ticket_id, estado FROM delivery_pedidos WHERE id = ANY($1::uuid[])`, [ids])
        : { rows: [] };
      const { rows: turnos } = await pool.query(
        `SELECT 1 FROM turnos WHERE sucursal_id = $1 AND estado = 'ABIERTO' LIMIT 1`, [sucursalId]);
      const plan = planificarEspejo({ conexiones, pedidos, localPedidos, turnoAbierto: turnos.length > 0, cajaId });

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

      // Tickets que le tocan a esta caja.
      let creados = 0, aceptados = 0;
      for (const id of plan.aCrear) {
        const pedido = pedidos.find((p) => p.id === id);
        const conexion = conexiones.find((c) => c.id === pedido?.conexion_id);
        const rec = await llamar(opts, "delivery-accion", { accion: "reclamar", pedido_id: id });
        if (!rec.ok) { log(`pedido ${pedido?.folio_corto ?? id}: ${rec.body?.error ?? rec.status} (no es de esta caja)`); continue; }
        try {
          await pool.query(`SELECT crear_ticket_desde_app($1)`, [id]);
          creados++;
        } catch (e) {
          const m = String(e?.message ?? e);
          const codigo = m.includes("SIN_TURNO_ABIERTO") ? "SIN_TURNO_ABIERTO" : m.includes("ITEM_SIN_MAPEAR") ? "ITEM_SIN_MAPEAR" : m;
          await pool.query(`UPDATE delivery_pedidos SET ultimo_error = $2 WHERE id = $1`, [id, codigo]).catch(() => {});
          log(`pedido ${pedido?.folio_corto ?? id}: no se pudo crear el ticket local (${codigo})`);
          continue;
        }
        if (pedido?.estado === "RECIBIDO") {
          const ac = await llamar(opts, "delivery-accion", { accion: "aceptar", pedido_id: id, tiempo_prep_min: conexion?.tiempo_prep_min ?? 15 });
          if (ac.ok || ac.body?.error === "ACCION_INVALIDA") aceptados++;
          else log(`pedido ${pedido?.folio_corto ?? id}: accept en Uber falló (${ac.body?.error ?? ac.status}); se reintenta`);
        }
      }
      if (creados || aceptados || plan.avisos.length) log(`${pedidos.length} pedidos espejados · ${creados} tickets creados · ${aceptados} aceptados · ${plan.avisos.length} avisos`);
      return { espejados: pedidos.length, creados, aceptados, avisos: plan.avisos.length };
    } catch (e) {
      log(`tick falló: ${e?.message ?? e}`);
      return { error: String(e?.message ?? e) };
    } finally {
      corriendo = false;
    }
  }

  return {
    tick,
    iniciar() { if (timer) return; timer = setInterval(() => { tick(); }, cadaMs); tick(); log("agente iniciado"); },
    detener() { if (timer) clearInterval(timer); timer = null; },
  };
}
