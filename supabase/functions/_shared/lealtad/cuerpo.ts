// Validación del cuerpo de lealtad-canje y guarda del módulo. Sin Deno ni red, para poder probarla
// con node --test igual que _shared/delivery/modulo.ts.

export type Accion = "saldo" | "canjear" | "asentar";

export type Cuerpo = {
  accion: Accion;
  cliente_id?: string;
  telefono?: string;
  canje_id?: string;
  puntos?: number;
  premio_id?: string;
  ticket_id?: string;
  ticket_item_id?: string;
  sucursal_id?: string;
  /** Solo lo manda el puente de la caja (el empleado no viaja en el token de dispositivo). Desde la web se ignora. */
  usuario_id?: string;
};

export type Validado = { ok: true; cuerpo: Cuerpo } | { ok: false; error: "ACCION_INVALIDA" | "FALTAN_CAMPOS" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCIONES: readonly Accion[] = ["saldo", "canjear", "asentar"];
const CAMPOS_UUID = ["cliente_id", "canje_id", "premio_id", "ticket_id", "ticket_item_id", "sucursal_id", "usuario_id"] as const;

/**
 * Los códigos que lealtad_asentar_canje (supabase/migrations/0156_lealtad.sql) lanza con
 * RAISE EXCEPTION '<CODIGO>'. Son errores de negocio: se contestan 409 con el código. Cualquier otro
 * mensaje es un fallo interno y NO llega al navegador. Hay una copia en desktop/src/lealtad-puente.mjs
 * (otro runtime); las dos pruebas comparan su lista con el SQL, así que si la función gana un código,
 * ambas pruebas fallan hasta que se actualicen.
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
] as const;

/** El código de negocio si el mensaje ES exactamente uno de ellos; si no, null (error interno). */
export function codigoDeAsentar(mensaje: unknown): string | null {
  const m = typeof mensaje === "string" ? mensaje.trim() : "";
  return (ERRORES_DE_ASENTAR as readonly string[]).includes(m) ? m : null;
}

/** Fail-closed y sobre `efectivos`: el add-on concedido pero apagado no canjea. */
export function moduloLealtadActivo(mod: unknown): boolean {
  const efectivos = (mod as { efectivos?: Record<string, boolean> } | null | undefined)?.efectivos;
  return efectivos?.lealtad === true;
}

export function validarCuerpo(entrada: unknown): Validado {
  const b = (entrada ?? {}) as Record<string, unknown>;
  if (typeof b.accion !== "string" || !ACCIONES.includes(b.accion as Accion)) {
    return { ok: false, error: "ACCION_INVALIDA" };
  }
  const falta: Validado = { ok: false, error: "FALTAN_CAMPOS" };

  const cuerpo: Cuerpo = { accion: b.accion as Accion };
  for (const campo of CAMPOS_UUID) {
    const v = b[campo];
    if (v == null || v === "") continue;
    if (typeof v !== "string" || !UUID.test(v)) return falta;
    cuerpo[campo] = v.toLowerCase();
  }
  if (typeof b.telefono === "string" && b.telefono.replace(/\D/g, "") !== "") {
    cuerpo.telefono = b.telefono.replace(/\D/g, "");
  }
  if (b.puntos != null) {
    if (typeof b.puntos !== "number" || !Number.isInteger(b.puntos) || b.puntos <= 0) return falta;
    cuerpo.puntos = b.puntos;
  }

  const hayCliente = cuerpo.cliente_id != null || cuerpo.telefono != null;
  if (cuerpo.accion === "saldo" && !hayCliente) return falta;
  if (cuerpo.accion === "canjear") {
    // Un canje nace atado a una cuenta (ticket_id): asentar comprueba después que sea esa y no otra.
    if (!cuerpo.canje_id || !cuerpo.ticket_id || !hayCliente) return falta;
    const conPuntos = cuerpo.puntos != null;
    const conPremio = cuerpo.premio_id != null;
    if (conPuntos === conPremio) return falta; // ni ninguno ni ambos
  }
  if (cuerpo.accion === "asentar" && (!cuerpo.canje_id || !cuerpo.ticket_id)) return falta;
  return { ok: true, cuerpo };
}

/**
 * El empleado al que se atribuye el movimiento. Desde la web es SIEMPRE quien se autenticó: el
 * `usuario_id` del cuerpo se ignora. Desde una caja lo manda su puente (que lo sacó de la sesión local);
 * solo vale si es un empleado activo de ESTE negocio, y si no se anota sin empleado en vez de
 * atribuirlo a quien diga el cuerpo.
 */
export function usuarioDelCanje(
  a: { esDispositivo: boolean; autenticadoId: string; delCuerpo?: string; delCuerpoEsDelNegocio: boolean },
): string | null {
  if (!a.esDispositivo) return a.autenticadoId;
  return a.delCuerpo && a.delCuerpoEsDelNegocio ? a.delCuerpo : null;
}

/**
 * Lo que recibe lealtad_asentar_canje en la nube (POS web). Puntos, monto, cliente, teléfono, premio y
 * versión del programa son los de lealtad_canje_datos; del navegador solo vienen el ticket y el renglón.
 * Tenant y usuario los pone el servidor. Lo que `canje` traiga de más (saldo, vence_el...) no pasa.
 */
export function payloadAsentar(
  canje: Record<string, unknown>,
  a: { tenantId: string; ticketId: string; ticketItemId?: string | null; usuarioId: string | null },
): Record<string, unknown> {
  return {
    canje_id: canje.canje_id, cliente_id: canje.cliente_id, telefono: canje.telefono ?? null,
    puntos: canje.puntos, monto_mxn: canje.monto_mxn, premio_id: canje.premio_id ?? null,
    programa_version: canje.programa_version,
    tenant_id: a.tenantId, usuario_id: a.usuarioId,
    ticket_id: a.ticketId, ticket_item_id: a.ticketItemId ?? null,
  };
}

/**
 * Un canje queda atado a UNA cuenta y a UNA caja desde que se autoriza (el movimiento guarda ticket_id y
 * caja_id; lealtad_canje_datos los devuelve). Sin esto, el canje de la caja A podía asentarse también en la
 * caja B contra otra cuenta del mismo cliente: dos descuentos por un solo cobro de puntos. Aquí se decide;
 * los códigos son de la Edge Function, no de lealtad_asentar_canje (no van en ERRORES_DE_ASENTAR).
 *   · la cuenta pedida debe ser la del movimiento (uno sin ticket_id no sirve),
 *   · desde una caja, el canje debe ser de esa caja; desde la web (sin caja), no debe ser de ninguna.
 */
export function validarVinculoDelCanje(
  a: { canje: Record<string, unknown>; ticketIdPedido: string; cajaDispositivoId: string | null },
): { ok: true } | { ok: false; error: "CANJE_DE_OTRA_CUENTA" | "CANJE_DE_OTRA_CAJA" } {
  const norm = (v: unknown) => (typeof v === "string" && v !== "" ? v.toLowerCase() : null);
  const ticketCanje = norm(a.canje.ticket_id);
  if (ticketCanje === null || ticketCanje !== norm(a.ticketIdPedido)) return { ok: false, error: "CANJE_DE_OTRA_CUENTA" };
  if (norm(a.canje.caja_id) !== norm(a.cajaDispositivoId)) return { ok: false, error: "CANJE_DE_OTRA_CAJA" };
  return { ok: true };
}
