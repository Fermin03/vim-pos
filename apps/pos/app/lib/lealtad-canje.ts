"use client";
// El canje de lealtad, paso a paso y reanudable (ADR 0030, plan 1B).
//
// Un canje toca dos sistemas —la nube, que descuenta, y la base donde vive la cuenta, que lo
// asienta— y cualquiera de los pasos puede fallar a la mitad. Lo que no puede pasar es que el
// cliente pierda puntos sin que quien cobra lo sepa. Por eso:
//   · el id del canje nace AQUÍ, antes de llamar: reintentar con el mismo id no descuenta dos veces;
//   · cada avance se guarda en localStorage por cuenta: cerrar el modal o la app no lo pierde;
//   · el orden deja para el final lo único que no se puede deshacer desde la caja.
import { z } from "zod";
import { nuevoClientId } from "./carrito";
import { cancelarItem } from "./cancelacion";
import {
  agregarRenglonPremio, asentar, canjear,
  type CanjeAutorizado, type ClienteLealtad, type RespuestaLealtad,
} from "./lealtad";
import { cantidad, esFalloAmbiguo, mensajeErrorLealtad, type Mecanica, type Premio } from "./lealtad-reglas";

const LLAVE = "vim_lealtad_pendiente";

const esquemaPendiente = z.object({
  ticketId: z.string().min(1),
  canjeId: z.string().min(1),
  sucursalId: z.string().min(1),
  clienteId: z.string().min(1),
  telefono: z.string().nullable(),
  mecanica: z.enum(["PUNTOS_DINERO", "SELLOS", "PUNTOS_PREMIOS"]),
  puntos: z.number().int().positive(),
  /** null = canje de dinero sobre la cuenta. */
  premio: z.object({
    id: z.string().min(1),
    productoId: z.string().min(1),
    nombre: z.string(),
    /** `client_id_local` del renglón: con él, agregarlo dos veces no lo duplica. */
    renglonClientId: z.string().min(1),
    /** null mientras el renglón no ha entrado a la cuenta. */
    ticketItemId: z.string().nullable(),
  }).nullable(),
  /** Qué sigue: pedirle el canje a la nube, o pegarlo a la cuenta. */
  paso: z.enum(["CANJEAR", "ASENTAR"]),
});
export type Pendiente = z.infer<typeof esquemaPendiente>;

/** Lo mínimo de `Storage`, para poder probar con uno de memoria. */
export type Almacen = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** `localStorage`, o uno de memoria si el navegador lo niega: el canje funciona igual, sin sobrevivir a un cierre. */
export function almacenLocal(): Almacen {
  try {
    const ls = window.localStorage;
    ls.getItem(LLAVE);
    return ls;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
  }
}

function leerTodos(a: Almacen): Record<string, unknown> {
  try {
    const o: unknown = JSON.parse(a.getItem(LLAVE) ?? "{}");
    return o !== null && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function leerPendiente(a: Almacen, ticketId: string): Pendiente | null {
  const p = esquemaPendiente.safeParse(leerTodos(a)[ticketId]);
  return p.success && p.data.ticketId === ticketId ? p.data : null;
}

export function guardarPendiente(a: Almacen, p: Pendiente): void {
  a.setItem(LLAVE, JSON.stringify({ ...leerTodos(a), [p.ticketId]: p }));
}

export function borrarPendiente(a: Almacen, ticketId: string): void {
  const todos = leerTodos(a);
  delete todos[ticketId];
  a.setItem(LLAVE, JSON.stringify(todos));
}

export function nuevoCanjeDinero(a: {
  ticketId: string; sucursalId: string; cliente: ClienteLealtad; mecanica: Mecanica; puntos: number;
}): Pendiente {
  return {
    ticketId: a.ticketId, canjeId: nuevoClientId(), sucursalId: a.sucursalId,
    clienteId: a.cliente.clienteId, telefono: a.cliente.telefono,
    mecanica: a.mecanica, puntos: a.puntos, premio: null, paso: "CANJEAR",
  };
}

export function nuevoCanjePremio(a: {
  ticketId: string; sucursalId: string; cliente: ClienteLealtad; mecanica: Mecanica; premio: Premio;
}): Pendiente {
  return {
    ticketId: a.ticketId, canjeId: nuevoClientId(), sucursalId: a.sucursalId,
    clienteId: a.cliente.clienteId, telefono: a.cliente.telefono,
    mecanica: a.mecanica, puntos: a.premio.costo,
    premio: { id: a.premio.id, productoId: a.premio.productoId, nombre: a.premio.nombre, renglonClientId: `premio-${nuevoClientId()}`, ticketItemId: null },
    paso: "CANJEAR",
  };
}

/** Las cuatro operaciones que el canje necesita. Van aparte para probar el orden sin red ni base. */
export type OpsCanje = {
  agregarRenglon: (a: { ticketId: string; productoId: string; clientId: string }) => Promise<string>;
  canjear: (a: { canjeId: string; ticketId: string; clienteId: string; telefono: string | null; puntos?: number; premioId?: string; sucursalId: string }) => Promise<RespuestaLealtad<CanjeAutorizado>>;
  asentar: (a: { canjeId: string; ticketId: string; ticketItemId: string | null }) => Promise<RespuestaLealtad<{ canje_id: string }>>;
  cancelarRenglon: (ticketItemId: string) => Promise<void>;
};

export function opsReales(token: string): OpsCanje {
  return {
    agregarRenglon: (a) => agregarRenglonPremio(token, a),
    canjear: (a) => canjear(token, a),
    asentar: (a) => asentar(token, a),
    // Sin PIN: sirve mientras la cuenta no está en cocina. Si la base lo exige, falla, y el renglón
    // se queda en la cuenta para que quien cobra lo cancele por el camino de siempre.
    cancelarRenglon: (id) => cancelarItem(token, { ticketItemId: id, motivo: "Premio de lealtad no canjeado" }),
  };
}

export type ResultadoCanje =
  /** El canje quedó en la cuenta. */
  | { estado: "APLICADO" }
  /** No se descontó nada. */
  | { estado: "RECHAZADO"; mensaje: string }
  /** No se sabe, o falta un paso: se reintenta con el mismo canje. */
  | { estado: "A_MEDIAS"; mensaje: string; pendiente: Pendiente }
  /** La nube descontó y la cuenta lo rechazó para siempre: los puntos vuelven solos en 48 h. */
  | { estado: "PUNTOS_GASTADOS"; mensaje: string };

/** Asentar se puede reintentar también si la caja perdió la nube o la sesión entre un paso y otro. */
function asentarSePuedeReintentar(codigo: string): boolean {
  return esFalloAmbiguo(codigo) || ["FUNCION_REQUIERE_NUBE", "SOLO_EMPLEADO", "NO_AUTH", "AUTH_INVALIDA"].includes(codigo);
}

/**
 * Lleva un canje desde donde esté hasta donde se pueda. Sirve igual para empezarlo que para
 * reanudarlo: lo que ya se hizo va anotado en `inicial` y no se repite.
 */
export async function avanzarCanje(ops: OpsCanje, almacen: Almacen, inicial: Pendiente): Promise<ResultadoCanje> {
  let p = inicial;
  const cuanto = cantidad(p.mecanica, p.puntos);
  const renglonSeQueda = p.premio
    ? ` ${p.premio.nombre} quedó en la cuenta a su precio: quítalo desde la cuenta si el cliente no lo quiere.`
    : "";

  // 0) El premio entra primero a la cuenta como renglón. Si esto falla, la nube no se ha tocado.
  if (p.premio && !p.premio.ticketItemId) {
    const premio = p.premio;
    try {
      const ticketItemId = await ops.agregarRenglon({ ticketId: p.ticketId, productoId: premio.productoId, clientId: premio.renglonClientId });
      p = { ...p, premio: { ...premio, ticketItemId } };
      guardarPendiente(almacen, p);
    } catch (e) {
      borrarPendiente(almacen, p.ticketId);
      const causa = e instanceof Error ? e.message : "error";
      return { estado: "RECHAZADO", mensaje: `No se pudo agregar ${premio.nombre} a la cuenta: ${causa}. No se descontó nada.` };
    }
  }

  // 1) La nube descuenta. El pendiente se anota ANTES de llamar: si la respuesta se pierde, el
  //    reintento usa el mismo canje y la nube contesta lo mismo sin descontar otra vez.
  if (p.paso === "CANJEAR") {
    guardarPendiente(almacen, p);
    const r = await ops.canjear({
      canjeId: p.canjeId, ticketId: p.ticketId, clienteId: p.clienteId, telefono: p.telefono, sucursalId: p.sucursalId,
      ...(p.premio ? { premioId: p.premio.id } : { puntos: p.puntos }),
    });
    if (!r.ok) {
      if (esFalloAmbiguo(r.error)) {
        return {
          estado: "A_MEDIAS", pendiente: p,
          mensaje: `No se pudo confirmar el canje con la nube. ${mensajeErrorLealtad(r.error)} Toca Reintentar.${p.premio ? ` Mientras tanto, ${p.premio.nombre} está en la cuenta a su precio.` : ""}`,
        };
      }
      // Rechazo de negocio: no se descontó nada. El renglón del premio sobra; se intenta cancelar.
      let seQuedo = false;
      if (p.premio?.ticketItemId) {
        try { await ops.cancelarRenglon(p.premio.ticketItemId); } catch { seQuedo = true; }
      }
      borrarPendiente(almacen, p.ticketId);
      return { estado: "RECHAZADO", mensaje: `${mensajeErrorLealtad(r.error)} No se descontó nada.${seQuedo ? renglonSeQueda : ""}` };
    }
    p = { ...p, paso: "ASENTAR" };
    guardarPendiente(almacen, p);
  }

  // 2) El canje autorizado se pega a la cuenta.
  const a = await ops.asentar({ canjeId: p.canjeId, ticketId: p.ticketId, ticketItemId: p.premio?.ticketItemId ?? null });
  if (a.ok) {
    borrarPendiente(almacen, p.ticketId);
    return { estado: "APLICADO" };
  }
  if (asentarSePuedeReintentar(a.error)) {
    return {
      estado: "A_MEDIAS", pendiente: p,
      mensaje: `La nube ya descontó ${cuanto}, pero falta aplicarlos a esta cuenta. ${mensajeErrorLealtad(a.error)} Toca Reintentar: no se descuentan dos veces.`,
    };
  }
  borrarPendiente(almacen, p.ticketId);
  return {
    estado: "PUNTOS_GASTADOS",
    mensaje: `La nube ya descontó ${cuanto} y esta cuenta no los aceptó. ${mensajeErrorLealtad(a.error)} Vuelven solos al cliente en un máximo de 48 horas; desde la caja no se pueden devolver antes. Cobra la cuenta sin el canje.${renglonSeQueda}`,
  };
}
