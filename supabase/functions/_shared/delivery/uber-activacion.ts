// Lógica pura de la activación de tiendas de Uber (spec F1b). Sin I/O: se prueba con node --test.
// Doc: docs/integraciones/delivery/03-uber-eats-resumen.md §3-4.

const AUTH = { sandbox: "https://sandbox-login.uber.com", produccion: "https://auth.uber.com" } as const;

/** URL a la que se manda al dueño para que autorice a VIM (grant authorization_code, scope eats.pos_provisioning). */
export function urlAutorizacionUber(cfg: { entorno: "sandbox" | "produccion"; clientId: string; redirectUri: string; state: string }): string {
  const u = new URL("/oauth/v2/authorize", AUTH[cfg.entorno]);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", "eats.pos_provisioning");
  u.searchParams.set("state", cfg.state);
  return u.toString();
}

export type TiendaUber = { id: string; nombre: string; direccion: string; ciudad: string };

type Dict = Record<string, unknown>;
const obj = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Respuesta de GET /v1/delivery/stores → lista plana. Las tiendas sin id se descartan. */
export function normalizarTiendasUber(respuesta: unknown): TiendaUber[] {
  const stores = obj(respuesta).stores;
  if (!Array.isArray(stores)) return [];
  const out: TiendaUber[] = [];
  for (const s of stores) {
    const t = obj(s);
    const id = str(t.id);
    if (!id) continue;
    const loc = obj(t.location);
    const direccion = [str(loc.street_address_line_one), str(loc.unit_number)].filter((x) => x !== "").join(", ");
    out.push({ id, nombre: str(t.name) || id, direccion, ciudad: str(loc.city) });
  }
  return out;
}

/** Cuerpo de POST /v1/eats/stores/{id}/pos_data. integrator_store_id = uuid de la sucursal en VIM. */
export function cuerpoPosData(cfg: { sucursalId: string; autoAceptar: boolean }): Record<string, unknown> {
  return {
    integrator_store_id: cfg.sucursalId,
    integrator_brand_id: "vimpos",
    is_order_manager: true,
    require_manual_acceptance: !cfg.autoAceptar,
    allowed_customer_requests: { allow_special_instruction_requests: true, allow_single_use_items_requests: false },
    webhooks_config: {
      webhooks_version: "1.0.0",
      order_release_webhooks: { is_enabled: false },
      schedule_order_webhooks: { is_enabled: true },
      delivery_status_webhooks: { is_enabled: true },
    },
  };
}

export type EstadoConexion = "SIN_CONECTAR" | "PENDIENTE" | "ACTIVA" | "PAUSADA" | "ERROR" | "DESCONECTADA";
export type AccionConexion = "activar" | "pausar" | "reanudar" | "desconectar";

const REGLAS: Record<AccionConexion, { desde: (EstadoConexion | null)[]; a: EstadoConexion }> = {
  activar: { desde: [null, "SIN_CONECTAR", "DESCONECTADA", "ERROR"], a: "ACTIVA" },
  pausar: { desde: ["ACTIVA"], a: "PAUSADA" },
  reanudar: { desde: ["PAUSADA"], a: "ACTIVA" },
  desconectar: { desde: ["ACTIVA", "PAUSADA", "ERROR"], a: "DESCONECTADA" },
};

/** Estado al que pasa una conexión tras la acción, o lanza TRANSICION_INVALIDA:<actual>:<accion>. */
export function transicionConexion(actual: EstadoConexion | null, accion: AccionConexion): EstadoConexion {
  const regla = REGLAS[accion];
  if (!regla.desde.includes(actual)) throw new Error(`TRANSICION_INVALIDA:${actual ?? "null"}:${accion}`);
  return regla.a;
}
