// Fase 1 · Sync PUSH — sube a la nube las ventas que la caja generó offline.
// En el desktop las ventas se escriben directo al Postgres LOCAL (no al outbox de Dexie del POS
// web), así que el push LEE las filas operativas locales aún no subidas y las replica VERBATIM
// a la nube vía la RPC sync_push_snapshot (modo réplica → conserva folio/totales/PAGADO exactos).
// Solo sube tickets terminales (PAGADO/FACTURADO/CANCELADO): no cambian, así que subir una vez basta.
// Idempotente por id en el servidor; el device marca lo subido en _vim_push_ok para no re-trabajar.
//
// POR QUÉ VA EN LOTES Y NO DE UN JALÓN.
//
// Antes el push armaba TODO lo pendiente en un solo snapshot y lo mandaba en una sola petición.
// Con la caja al corriente eso son dos o tres ventas y no se nota. Pero el pendiente no tiene
// techo: una caja sin internet una semana acumula ~1,000 ventas, y un local que dejó de pagar el
// internet un mes acumula ~4,500 — con sus renglones, son decenas de MB en UNA petición.
//
// Eso no es "lento": es un fallo permanente. La Edge Function rechaza el cuerpo por tamaño, el
// device no marca nada como subido, y al ciclo siguiente vuelve a armar el MISMO paquete gigante
// y a fallar igual. La caja queda atorada para siempre, en silencio, y justo el cliente que peor
// conexión tiene es el que nunca vuelve a subir una venta. Es la misma forma del incidente del 17
// de agosto (ver el comentario de `construirSnapshotPush`): un push que falla entero deja el
// rastro solo en un log dentro de la máquina del cliente.
//
// Ahora se parte: N ventas por petición, cada lote con los turnos que sus tickets referencian
// (si el turno no viaja con ellos, la FK los rechaza). Y sobre todo, cada lote se marca como
// subido en cuanto la nube lo confirma. Si el lote 7 falla, los 6 primeros YA quedaron arriba y
// el siguiente ciclo retoma donde se quedó, en vez de repetir el trabajo desde cero.
import { Buffer } from "node:buffer";

const TERMINALES = ["PAGADO", "FACTURADO", "CANCELADO"];

/**
 * Cuántas ventas caben en una petición.
 *
 * 100 ventas con sus renglones rondan los 500 KB: cómodamente por debajo de lo que acepta una
 * Edge Function, y con margen para tickets gordos. El costo de equivocarse hacia abajo es una
 * petición de más —que a este ritmo (6 por hora por caja) no le cuesta nada a nadie—; el de
 * equivocarse hacia arriba es dejar una caja atorada.
 */
export const MAX_VENTAS_POR_LOTE = 100;

/** Techo duro por petición. Un lote que lo cruce se parte en dos, sin importar cuántas ventas trae. */
export const MAX_BYTES_POR_LOTE = 2 * 1024 * 1024;

async function asegurarTabla(pool) {
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_push_ok (ticket_id uuid PRIMARY KEY, pushed_at timestamptz DEFAULT now())");
  // Los turnos se rastrean por HUELLA, no por "ya lo mandé": un ticket terminal nunca cambia,
  // pero un turno sí —se abre, se cierra, se le cuenta el efectivo— y cada cambio tiene que
  // volver a viajar. Ver el porqué en el comentario de `construirSnapshotPush`.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_turnos_ok (turno_id uuid PRIMARY KEY, huella text NOT NULL, pushed_at timestamptz DEFAULT now())");
}

/** Parte una lista en trozos de a lo más `tamano`. */
export function trocear(lista, tamano) {
  const trozos = [];
  for (let i = 0; i < lista.length; i += tamano) trozos.push(lista.slice(i, i + tamano));
  return trozos;
}

/**
 * Qué está pendiente de subir, sin armar todavía el contenido.
 *
 * Va aparte del armado porque el armado ahora es POR LOTE: primero hay que saber cuántas ventas
 * hay para repartirlas, y traer los ids es barato mientras que traer las filas completas de un
 * mes de operación son decenas de MB que ni siquiera caben en una petición.
 */
export async function listarPendientes(pool) {
  await asegurarTabla(pool);
  const { rows } = await pool.query(`
    SELECT
      -- En orden cronológico: si el envío se corta a media lista, lo que quedó arriba es un
      -- prefijo del historial y no un revoltijo.
      (SELECT array_agg(id ORDER BY fecha_apertura)
         FROM tickets
        WHERE estado_fiscal = ANY($1)
          AND id NOT IN (SELECT ticket_id FROM _vim_push_ok)) AS ids,
      -- Turnos que cambiaron (o que nunca viajaron) aunque no arrastren ventas nuevas.
      (SELECT array_agg(x.id)
         FROM turnos x
         LEFT JOIN _vim_turnos_ok o ON o.turno_id = x.id
        WHERE o.turno_id IS NULL
           OR o.huella IS DISTINCT FROM md5(to_jsonb(x)::text)) AS turnos
  `, [TERMINALES]);
  return { ids: rows[0].ids ?? [], turnosCambiados: rows[0].turnos ?? [] };
}

/**
 * Arma el snapshot: ventas terminales no subidas, sus hijos, y los turnos que cambiaron.
 *
 * Sin argumentos arma TODO lo pendiente (es como lo usan las verificaciones). Con `ticketIds`
 * arma solo ese lote, y con `turnoIds` fuerza además esos turnos — los que cambiaron sin ventas,
 * que viajan pegados al primer lote.
 *
 * Los turnos que los tickets del lote REFERENCIAN entran siempre, se pidan o no: `tickets.turno_id`
 * es una FK, así que un ticket cuyo turno no viaja en la misma petición es una fila rechazada.
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
export async function construirSnapshotPush(pool, { ticketIds = null, turnoIds = null } = {}) {
  await asegurarTabla(pool);
  const { rows } = await pool.query(`
    WITH tk AS (
      -- Con lista: exactamente ese lote. Sin lista: todo lo pendiente (comportamiento original).
      SELECT id, turno_id FROM tickets
       WHERE ($2::uuid[] IS NOT NULL AND id = ANY($2::uuid[]))
          OR ($2::uuid[] IS NULL
              AND estado_fiscal = ANY($1)
              AND id NOT IN (SELECT ticket_id FROM _vim_push_ok))
    ),
    tn AS (
      SELECT x.id, md5(to_jsonb(x)::text) AS huella
        FROM turnos x
        LEFT JOIN _vim_turnos_ok o ON o.turno_id = x.id
       WHERE x.id IN (SELECT turno_id FROM tk)                       -- los que la FK exige
          OR ($3::uuid[] IS NOT NULL AND x.id = ANY($3::uuid[]))     -- los que pidió el llamador
          OR ($3::uuid[] IS NULL AND $2::uuid[] IS NULL              -- modo completo: los cambiados
              AND (o.turno_id IS NULL OR o.huella IS DISTINCT FROM md5(to_jsonb(x)::text)))
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
        'movimientos_caja',          (SELECT jsonb_agg(to_jsonb(x)) FROM movimientos_caja x WHERE x.turno_id IN (SELECT id FROM tn)),
        -- Quién repartió cada domicilio. Viaja con su ticket: la asignación se anota al marcar la
        -- salida, antes de cobrar, así que para cuando el ticket entra en esta rebanada ya está
        -- liquidada y sube completa.
        'delivery_asignaciones',     (SELECT jsonb_agg(to_jsonb(x)) FROM delivery_asignaciones x WHERE x.ticket_id IN (SELECT id FROM tk)),

        -- EL CIERRE DEL TURNO. Se quedaba en la caja.
        --
        -- El corte y el reporte Z los generan RPCs que en el escritorio corren contra ESTE
        -- Postgres local, así que nacían aquí y no salían nunca: el dueño abría «Cortes Z
        -- históricos» en el panel y lo veía vacío para siempre. Trece turnos cerrados sin un
        -- solo corte en la nube antes de detectarlo.
        --
        -- Van colgados de tn (los turnos de esta rebanada), igual que los movimientos: si el
        -- turno sube, su cierre sube con él. El detalle cuelga del corte, no del turno.
        'cortes_parciales',          (SELECT jsonb_agg(to_jsonb(x)) FROM cortes_parciales x WHERE x.turno_id IN (SELECT id FROM tn)),
        'cortes_caja',               (SELECT jsonb_agg(to_jsonb(x)) FROM cortes_caja x WHERE x.turno_id IN (SELECT id FROM tn)),
        'cortes_caja_detalle',       (SELECT jsonb_agg(to_jsonb(x)) FROM cortes_caja_detalle x WHERE x.corte_caja_id IN (SELECT id FROM cortes_caja WHERE turno_id IN (SELECT id FROM tn))),
        'reportes_z_historico',      (SELECT jsonb_agg(to_jsonb(x)) FROM reportes_z_historico x WHERE x.turno_id IN (SELECT id FROM tn))
      )) AS snapshot
  `, [TERMINALES, ticketIds, turnoIds]);
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
    } else if (e.tabla === "delivery_asignaciones") {
      // Que no suba quién repartió no invalida la venta. Retener el ticket por esto lo dejaría
      // reintentándose para siempre si la asignación nunca puede aplicarse.
      continue;
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
 * Envía UN lote y marca lo que la nube aceptó.
 *
 * Se parte solo si hace falta: primero por tamaño medido antes de salir, y también si la nube
 * contesta 413 (el techo real puede ser más bajo que el nuestro, y ese error nunca se arregla
 * reintentando lo mismo). Partir a la mitad en vez de recalcular un tamaño "correcto" converge
 * en pocas vueltas y no necesita saber cuál es el límite del otro lado.
 */
async function enviarLote(pool, { cloudUrl, anonKey, deviceToken }, { ticketIds, turnoIds, maxBytes }, log) {
  const { snapshot, ids, turnos } = await construirSnapshotPush(pool, { ticketIds, turnoIds });
  const cuerpo = JSON.stringify({ snapshot });
  const bytes = Buffer.byteLength(cuerpo);

  const partir = async (motivo) => {
    const mitad = Math.ceil(ticketIds.length / 2);
    log(`${motivo}: se parte en ${mitad} + ${ticketIds.length - mitad} ventas`);
    // Los turnos forzados van con la primera mitad; la segunda ya solo carga los suyos por FK.
    const a = await enviarLote(pool, { cloudUrl, anonKey, deviceToken }, { ticketIds: ticketIds.slice(0, mitad), turnoIds, maxBytes }, log);
    const b = await enviarLote(pool, { cloudUrl, anonKey, deviceToken }, { ticketIds: ticketIds.slice(mitad), turnoIds: [], maxBytes }, log);
    return { subidos: a.subidos + b.subidos, turnos: a.turnos + b.turnos, rechazados: a.rechazados + b.rechazados };
  };

  if (bytes > maxBytes && ticketIds.length > 1) {
    return partir(`lote de ${(bytes / 1048576).toFixed(1)} MB`);
  }

  const res = await fetch(`${cloudUrl}/functions/v1/sync-push`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${deviceToken}`, "Content-Type": "application/json" },
    body: cuerpo,
  });
  if (res.status === 413 && ticketIds.length > 1) {
    return partir("la nube rechazó el lote por tamaño");
  }
  if (!res.ok) throw new Error(`sync-push HTTP ${res.status}: ${await res.text().catch(() => "")}`);

  // La nube aísla las filas conflictivas en vez de rechazar el paquete entero (migración 0074) y
  // devuelve cuáles se quedaron fuera. Marcarlas como subidas sería peor que el fallo original:
  // se perderían en silencio, sin reintento y sin nadie mirando.
  const respuesta = await res.json().catch(() => ({}));
  const errores = respuesta?.resultado?._errores ?? [];
  const fuera = rechazadosPorTicket(errores, snapshot);
  await marcarPushed(pool, ids.filter((id) => !fuera.has(id)));
  await marcarTurnosPushed(pool, turnos.filter((t) => !fuera.has(t.id)));
  if (errores.length) {
    const muestra = errores.slice(0, 3).map((e) => `${e.tabla}/${String(e.id).slice(0, 8)}: ${e.error}`).join(" · ");
    log(`la nube rechazó ${errores.length} fila(s), se reintentarán: ${muestra}`);
  }
  return { subidos: ids.length - fuera.size, turnos: turnos.length, rechazados: errores.length };
}

/**
 * PUSH a la nube: manda lo pendiente en lotes a la Edge Function sync-push (autenticada como el
 * dispositivo), marcando cada lote en cuanto la nube lo confirma.
 *
 * Si un lote falla, LANZA — el ciclo lo cuenta como fallo y aplica su backoff, que es lo correcto
 * cuando la nube no está. La diferencia con antes es que lo ya subido queda marcado: el reintento
 * arranca donde se quedó en vez de rearmar el paquete completo y volver a estrellarse.
 */
export async function pushToCloud(pool, opts, log = () => {}, cfg = {}) {
  const maxVentas = cfg.maxVentasPorLote ?? MAX_VENTAS_POR_LOTE;
  const maxBytes = cfg.maxBytesPorLote ?? MAX_BYTES_POR_LOTE;

  const { ids, turnosCambiados } = await listarPendientes(pool);
  // Un cierre de turno SIN ventas nuevas también es algo que subir. Cuando esta condición solo
  // miraba los tickets, el cierre se quedaba en la caja y la nube nunca se enteraba.
  if (!ids.length && !turnosCambiados.length) { log("nada pendiente por subir"); return { subidos: 0, turnos: 0, rechazados: 0, lotes: 0 }; }

  const parte = [
    ids.length ? `${ids.length} venta${ids.length === 1 ? "" : "s"}` : null,
    turnosCambiados.length ? `${turnosCambiados.length} turno${turnosCambiados.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" y ");

  // Sin ventas queda un solo lote vacío: el que lleva los turnos que cambiaron.
  const lotes = ids.length ? trocear(ids, maxVentas) : [[]];
  log(`subiendo ${parte}${lotes.length > 1 ? ` en ${lotes.length} lotes` : ""}…`);

  let subidos = 0;
  let turnos = 0;
  let rechazados = 0;
  let n = 0;

  for (const lote of lotes) {
    // Los turnos que cambiaron sin arrastrar ventas viajan pegados al primer lote; los demás
    // lotes ya cargan por FK los turnos de sus propios tickets.
    const turnoIds = n === 0 ? turnosCambiados : [];
    n++;
    try {
      const r = await enviarLote(pool, opts, { ticketIds: lote, turnoIds, maxBytes }, log);
      subidos += r.subidos;
      turnos += r.turnos;
      rechazados += r.rechazados;
    } catch (e) {
      // El mensaje dice cuánto SÍ quedó arriba: sin eso, el log de la caja (que es el único
      // testimonio que hay) haría pensar que no subió nada y se volvería a diagnosticar de cero.
      throw new Error(`${e.message} · lote ${n}/${lotes.length}, ${subidos} de ${ids.length} ventas ya quedaron en la nube`);
    }
    if (lotes.length > 1) log(`lote ${n}/${lotes.length} · ${subidos}/${ids.length} ventas arriba`);
  }

  return { subidos, turnos, rechazados, lotes: n };
}
