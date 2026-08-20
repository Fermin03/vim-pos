// Fase 1 · Sync PUSH — sube a la nube las ventas que la caja generó offline.
// En el desktop las ventas se escriben directo al Postgres LOCAL (no al outbox de Dexie del POS
// web), así que el push LEE las filas operativas locales aún no subidas y las replica VERBATIM
// a la nube vía la RPC sync_push_snapshot (modo réplica → conserva folio/totales/PAGADO exactos).
// Solo sube tickets terminales (PAGADO/FACTURADO/CANCELADO): no cambian, así que subir una vez basta.
// Idempotente por id en el servidor; el device marca lo subido en _vim_push_ok para no re-trabajar.

const TERMINALES = ["PAGADO", "FACTURADO", "CANCELADO"];

async function asegurarTabla(pool) {
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_push_ok (ticket_id uuid PRIMARY KEY, pushed_at timestamptz DEFAULT now())");
  // Los turnos se rastrean por HUELLA, no por "ya lo mandé": un ticket terminal nunca cambia,
  // pero un turno sí —se abre, se cierra, se le cuenta el efectivo— y cada cambio tiene que
  // volver a viajar. Ver el porqué en el comentario de `construirSnapshotPush`.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_turnos_ok (turno_id uuid PRIMARY KEY, huella text NOT NULL, pushed_at timestamptz DEFAULT now())");
}

/**
 * Arma el snapshot pendiente: ventas terminales no subidas, sus hijos, y los turnos que cambiaron.
 *
 * POR QUÉ LOS TURNOS VAN POR HUELLA Y NO POR "YA SE MANDÓ".
 *
 * Antes los turnos solo viajaban si arrastraban una venta pendiente. Un turno cuyas ventas ya
 * estaban subidas nunca volvía a mandarse — y como el CIERRE ocurre después de la última venta,
 * el turno se quedaba ABIERTO en la nube PARA SIEMPRE. El siguiente turno de esa caja chocaba
 * entonces contra `idx_turno_unico_activo_por_caja` (un solo turno activo por caja) y el push
 * completo empezaba a fallar: no volvía a subir ni una venta más.
 *
 * No es teórico. En el piloto un turno del 17 de agosto quedó abierto en la nube, y del 18 en
 * adelante NADA subió: 27 ventas retenidas, 16 reintentos, y el panel mostrando cifras de días
 * atrás como si fueran de hoy. Se descubrió leyendo el log de la caja a mano.
 *
 * La huella es el md5 de la fila completa, no una lista de campos elegidos: así cualquier cambio
 * viaja —cierre, arqueo, justificación de diferencia, decisión del admin— sin que haya que
 * acordarse de añadir cada columna nueva a una lista que nadie va a mantener.
 *
 * `movimientos_caja` sigue a los mismos turnos y no solo a los de las ventas: un turno con puras
 * entradas y salidas de efectivo, sin vender nada, tampoco subía jamás.
 */
export async function construirSnapshotPush(pool) {
  await asegurarTabla(pool);
  const { rows } = await pool.query(`
    WITH tk AS (
      SELECT id, turno_id FROM tickets
       WHERE estado_fiscal = ANY($1)
         AND id NOT IN (SELECT ticket_id FROM _vim_push_ok)
    ),
    tn AS (
      SELECT x.id, md5(to_jsonb(x)::text) AS huella
        FROM turnos x
        LEFT JOIN _vim_turnos_ok o ON o.turno_id = x.id
       WHERE x.id IN (SELECT turno_id FROM tk)
          OR o.turno_id IS NULL
          OR o.huella IS DISTINCT FROM md5(to_jsonb(x)::text)
    )
    SELECT
      (SELECT array_agg(id) FROM tk) AS ids,
      (SELECT jsonb_agg(jsonb_build_object('id', id, 'huella', huella)) FROM tn) AS turnos,
      jsonb_strip_nulls(jsonb_build_object(
        'turnos',                    (SELECT jsonb_agg(to_jsonb(x)) FROM turnos x WHERE x.id IN (SELECT id FROM tn)),
        'tickets',                   (SELECT jsonb_agg(to_jsonb(x)) FROM tickets x WHERE x.id IN (SELECT id FROM tk)),
        'ticket_items',              (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_items x WHERE x.ticket_id IN (SELECT id FROM tk)),
        'ticket_item_modificadores', (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_item_modificadores x WHERE x.ticket_item_id IN (SELECT id FROM ticket_items WHERE ticket_id IN (SELECT id FROM tk))),
        'pagos',                     (SELECT jsonb_agg(to_jsonb(x)) FROM pagos x WHERE x.ticket_id IN (SELECT id FROM tk)),
        'movimientos_caja',          (SELECT jsonb_agg(to_jsonb(x)) FROM movimientos_caja x WHERE x.turno_id IN (SELECT id FROM tn))
      )) AS snapshot
  `, [TERMINALES]);
  return { snapshot: rows[0].snapshot ?? {}, ids: rows[0].ids ?? [], turnos: rows[0].turnos ?? [] };
}

/** Marca tickets como subidos (para no re-enviarlos). */
export async function marcarPushed(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_push_ok(ticket_id) SELECT unnest($1::uuid[]) ON CONFLICT (ticket_id) DO NOTHING", [ids]);
}

/**
 * Guarda la huella de los turnos enviados. Se ACTUALIZA en conflicto, al revés que los tickets:
 * el mismo turno se manda muchas veces a lo largo de su vida y lo que importa es en qué estado
 * quedó la última vez que la nube lo recibió.
 */
export async function marcarTurnosPushed(pool, turnos) {
  if (!turnos?.length) return;
  await pool.query(
    `INSERT INTO _vim_turnos_ok(turno_id, huella)
     SELECT (x->>'id')::uuid, x->>'huella' FROM jsonb_array_elements($1::jsonb) AS x
     ON CONFLICT (turno_id) DO UPDATE SET huella = EXCLUDED.huella, pushed_at = now()`,
    [JSON.stringify(turnos)]);
}

/**
 * Traduce las filas que la nube rechazó a los IDS QUE NO DEBEN MARCARSE COMO SUBIDOS.
 *
 * No basta con excluir el id rechazado: si lo que falló fue un renglón o un pago, el ticket
 * llegó incompleto. Darlo por subido dejaría en la nube una venta a la que le falta la mitad,
 * y nadie volvería a intentarlo. Por eso se sube por la cadena hasta el ticket dueño.
 */
function rechazadosPorTicket(errores, snapshot) {
  const fuera = new Set();
  if (!errores?.length) return fuera;
  const itemATicket = new Map((snapshot.ticket_items ?? []).map((i) => [i.id, i.ticket_id]));
  for (const e of errores) {
    if (!e?.id) continue;
    if (e.tabla === "ticket_item_modificadores") {
      const item = (snapshot.ticket_item_modificadores ?? []).find((m) => m.id === e.id);
      const ticket = item && itemATicket.get(item.ticket_item_id);
      if (ticket) fuera.add(ticket);
    } else if (e.tabla === "ticket_items" || e.tabla === "pagos") {
      const fila = (snapshot[e.tabla] ?? []).find((x) => x.id === e.id);
      if (fila?.ticket_id) fuera.add(fila.ticket_id);
    } else {
      fuera.add(e.id); // tickets, turnos y movimientos_caja: el id ya es el que importa
    }
  }
  return fuera;
}

/**
 * PUSH a la nube: envía el snapshot pendiente a la Edge Function sync-push (autenticada como el
 * dispositivo). Al confirmar, marca los tickets como subidos. Best-effort. Devuelve el resumen.
 */
export async function pushToCloud(pool, { cloudUrl, anonKey, deviceToken }, log = () => {}) {
  const { snapshot, ids, turnos } = await construirSnapshotPush(pool);
  // Un cierre de turno SIN ventas nuevas también es algo que subir. Cuando esta condición solo
  // miraba los tickets, el cierre se quedaba en la caja y la nube nunca se enteraba.
  if (!ids.length && !turnos.length) { log("nada pendiente por subir"); return { subidos: 0 }; }
  const parte = [
    ids.length ? `${ids.length} venta${ids.length === 1 ? "" : "s"}` : null,
    turnos.length ? `${turnos.length} turno${turnos.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" y ");
  log(`subiendo ${parte}…`);
  const res = await fetch(`${cloudUrl}/functions/v1/sync-push`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${deviceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot }),
  });
  if (!res.ok) throw new Error(`sync-push HTTP ${res.status}: ${await res.text().catch(() => "")}`);

  // La nube ahora aísla las filas conflictivas en vez de rechazar el paquete entero (migración
  // 0074) y devuelve cuáles se quedaron fuera. Marcarlas como subidas sería peor que el fallo
  // original: se perderían en silencio, sin reintento y sin nadie mirando.
  const cuerpo = await res.json().catch(() => ({}));
  const errores = cuerpo?.resultado?._errores ?? [];
  const rechazados = rechazadosPorTicket(errores, snapshot);
  await marcarPushed(pool, ids.filter((id) => !rechazados.has(id)));
  await marcarTurnosPushed(pool, turnos.filter((t) => !rechazados.has(t.id)));
  if (errores.length) {
    const muestra = errores.slice(0, 3).map((e) => `${e.tabla}/${String(e.id).slice(0, 8)}: ${e.error}`).join(" · ");
    log(`la nube rechazó ${errores.length} fila(s), se reintentarán: ${muestra}`);
  }
  return { subidos: ids.length - rechazados.size, turnos: turnos.length, rechazados: errores.length, resultado: cuerpo };
}
