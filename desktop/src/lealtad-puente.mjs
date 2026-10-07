// Puente de lealtad de la caja (ADR 0030). El POS llama a /functions/v1/lealtad-canje igual que en
// la web; el gateway valida la sesión LOCAL y este módulo decide qué hacer:
//
//   saldo, canjear → se reenvían a la nube con el token de DISPOSITIVO. El empleado no viaja en ese
//                    token, así que se añade al cuerpo desde la sesión local (nunca desde lo que
//                    mande el navegador). La sucursal y la caja las pone la nube con la identidad del
//                    dispositivo: aquí no se reenvía nada que diga otra cosa, ni un tenant.
//   asentar        → el ticket vive en ESTE Postgres. Se le pregunta a la nube por el canje y se
//                    asienta en local con lo que ella diga: puntos, monto, cliente, teléfono, premio y
//                    versión. Del navegador solo se toman el ticket y el renglón.
//
// Va aparte de gateway.mjs para poder probarlo sin red y sin base (lealtad-puente.test.mjs).
import { marcarLealtadSubidos } from "./sync-push.mjs";

/**
 * Los códigos que lealtad_asentar_canje (supabase/migrations/0156_lealtad.sql) lanza con
 * RAISE EXCEPTION '<CODIGO>': errores de negocio, se contestan 409. Cualquier otro mensaje es un
 * fallo interno y no llega al navegador. Copia de ERRORES_DE_ASENTAR en
 * supabase/functions/_shared/lealtad/cuerpo.ts (otro runtime); las dos pruebas comparan su lista con
 * el SQL, así que si la función gana un código ambas fallan hasta actualizarlas.
 */
export const ERRORES_DE_ASENTAR = [
  "TICKET_NO_EXISTE",
  "TICKET_NO_ABIERTO",
  "PUNTOS_INVALIDOS",
  "CANJE_REVERTIDO",
  "CANJE_NO_COINCIDE",
  "CANJE_YA_ASENTADO",
  "TICKET_YA_TIENE_CANJE",
  "TICKET_SIN_CLIENTE",
  "CLIENTE_NO_COINCIDE",
  "PREMIO_INVALIDO",
  "PREMIO_SIN_RENGLON",
  "RENGLON_NO_EXISTE",
  "RENGLON_NO_ES_PREMIO",
  "RENGLON_NO_APLICA",
  "MONTO_INVALIDO",
];

/** Qué campos del navegador viajan a la nube, por acción. Todo lo demás se descarta. */
const CAMPOS_POR_ACCION = {
  saldo: ["cliente_id", "telefono"],
  canjear: ["canje_id", "cliente_id", "telefono", "puntos", "premio_id", "ticket_id"],
  asentar: ["canje_id", "ticket_id", "ticket_item_id"],
};

async function llamarNube(nube, cuerpo, fetchFn, log) {
  let up, texto;
  try {
    up = await fetchFn(`${nube.cloudUrl}/functions/v1/lealtad-canje`, {
      method: "POST",
      body: JSON.stringify(cuerpo),
      headers: { apikey: nube.anonKey, Authorization: `Bearer ${nube.deviceToken}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    texto = await up.text(); // un corte a media respuesta también es "sin red"
  } catch (e) {
    log(`[lealtad] sin red hacia la nube: ${String(e?.message ?? e)}`);
    return { status: 503, body: { error: "SIN_RED" } };
  }
  let body;
  try { body = JSON.parse(texto); } catch { body = null; }
  if (body === null || typeof body !== "object") {
    log(`[lealtad] la nube contestó ${up.status} con un cuerpo que no es JSON`);
    return { status: up.status >= 400 ? up.status : 502, body: { error: "RESPUESTA_INVALIDA" } };
  }
  return { status: up.status, body };
}

/**
 * @param {{ pool: { query: Function }, nube: { cloudUrl: string, anonKey: string, deviceToken: string } | null,
 *           usuarioId: string, tenantId: string, tipoIdentidad: string, cuerpo: Record<string, unknown>,
 *           fetchFn?: typeof fetch, log?: (msg: string) => void }} args
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function atenderLealtad({ pool, nube, usuarioId, tenantId, tipoIdentidad, cuerpo, fetchFn = fetch, log = console.error }) {
  // Solo un EMPLEADO canjea. La cuenta de la propia caja (caja-<id>@...) vive en el navegador del POS
  // antes del PIN y en la cocina: con ella el canje quedaría a nombre de la caja, sin persona.
  if (tipoIdentidad !== "EMPLEADO") return { status: 403, body: { error: "SOLO_EMPLEADO" } };
  const accion = cuerpo?.accion;
  const campos = typeof accion === "string" && Object.hasOwn(CAMPOS_POR_ACCION, accion) ? CAMPOS_POR_ACCION[accion] : null;
  if (!campos) return { status: 400, body: { error: "ACCION_INVALIDA" } };
  if (!nube) return { status: 503, body: { error: "FUNCION_REQUIERE_NUBE", funcion: "lealtad-canje" } };

  const saliente = { accion };
  for (const c of campos) if (cuerpo[c] !== undefined) saliente[c] = cuerpo[c];
  saliente.usuario_id = usuarioId; // el de la sesión local, nunca el del navegador

  const consulta = await llamarNube(nube, saliente, fetchFn, log);
  if (accion !== "asentar") return consulta;
  if (consulta.status !== 200 || consulta.body?.ok !== true) return consulta;

  // Desde aquí la nube ya confirmó ESTE canje (lo validó contra su libro). Se asienta con SUS datos.
  const canje = consulta.body;
  const id = (v) => (typeof v === "string" ? v.toLowerCase() : null);
  if (id(canje.canje_id) === null || id(canje.canje_id) !== id(saliente.canje_id)) {
    log(`[lealtad] la nube contestó otro canje (${canje.canje_id}) al pedido ${saliente.canje_id}`);
    return { status: 502, body: { error: "RESPUESTA_INVALIDA" } };
  }
  // Defensa en profundidad: la nube ata el canje a su cuenta y la Edge Function lo comprueba; aquí se
  // vuelve a exigir que sea la cuenta que se va a tocar en local.
  if (id(canje.ticket_id) === null || id(canje.ticket_id) !== id(saliente.ticket_id)) {
    log(`[lealtad] el canje ${canje.canje_id} es de la cuenta ${canje.ticket_id}, no de ${saliente.ticket_id}`);
    return { status: 502, body: { error: "RESPUESTA_INVALIDA" } };
  }
  canje.canje_id = id(canje.canje_id);
  const paraAsentar = {
    canje_id: canje.canje_id, cliente_id: canje.cliente_id, telefono: canje.telefono ?? null,
    puntos: canje.puntos, monto_mxn: canje.monto_mxn, premio_id: canje.premio_id ?? null,
    programa_version: canje.programa_version,
    tenant_id: tenantId, usuario_id: usuarioId,
    ticket_id: id(saliente.ticket_id), ticket_item_id: saliente.ticket_item_id ?? null,
  };
  try {
    await pool.query("SELECT lealtad_asentar_canje($1::jsonb) AS r", [JSON.stringify(paraAsentar)]);
  } catch (e) {
    const m = String(e?.message ?? e).trim();
    if (ERRORES_DE_ASENTAR.includes(m)) return { status: 409, body: { ok: false, error: m } };
    log(`[lealtad] error al asentar el canje ${canje.canje_id} en local: ${m}`);
    return { status: 500, body: { error: "ERROR_INTERNO" } };
  }
  // La nube ya tiene este movimiento: que no cuente como pendiente (ni en el push ni al corregir el
  // saldo que baja en el pull). Solo después de que el asiento local salió bien. Si esto falla, el
  // push lo reenvía y la nube lo trata como repetido: no se pierde nada, así que no se tumba la venta.
  try {
    await marcarLealtadSubidos(pool, [canje.canje_id]);
  } catch (e) {
    log(`[lealtad] no se pudo marcar como subido el canje ${canje.canje_id}: ${String(e?.message ?? e)}`);
  }
  return { status: 200, body: { ok: true, canje_id: canje.canje_id } };
}
