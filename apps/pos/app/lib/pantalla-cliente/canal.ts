/**
 * El canal entre la caja y la pantalla del cliente.
 *
 * Es un `BroadcastChannel`: las dos ventanas son el mismo POS, en la misma computadora y con el
 * mismo origen, así que se hablan directo. No pasa por la base (la cuenta en captura vive solo en
 * memoria) ni por la red.
 */
import { leerMensaje, type Negocio, type VistaCliente } from "./vista";

export const NOMBRE_CANAL = "vim-pantalla-cliente";
/** Cada cuánto repite la caja su estado mientras hay algo en pantalla. */
export const LATIDO_MS = 5000;
/** Silencio tras el que la pantalla vuelve a reposo: una caja colgada no deja una cuenta vieja a la vista. */
export const SILENCIO_MS = 15000;

/** Lo que se usa de `BroadcastChannel`, para poder probar sin navegador. */
export type Canal = {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
};

export function abrirCanal(): Canal | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(NOMBRE_CANAL) as unknown as Canal;
  } catch {
    // La pantalla del cliente es opcional: sin canal la caja sigue vendiendo igual.
    return null;
  }
}

export function crearPublicador(canal: Canal, negocio: () => Negocio) {
  let ultima: VistaCliente = { fase: "reposo" };
  // Todo envío pasa por aquí: la pantalla del cliente es opcional y un canal que falla
  // (`InvalidStateError`, `SecurityError`) nunca debe romper la venta de la caja.
  const enviar = (m: unknown) => {
    try { canal.postMessage(m); } catch { /* sin pantalla del cliente la venta sigue igual */ }
  };
  const enviarEstado = () => enviar({ tipo: "estado", v: 1, vista: ultima });
  const anunciar = () => { const n = negocio(); enviar({ tipo: "negocio", v: 1, nombre: n.nombre, logoUrl: n.logoUrl }); };

  // La pantalla saluda al abrirse (o al recargarse): se le pone al día.
  canal.onmessage = (e) => {
    if (leerMensaje(e.data)?.tipo !== "hola") return;
    anunciar();
    enviarEstado();
  };

  return {
    anunciar,
    publicar(vista: VistaCliente) { ultima = vista; enviarEstado(); },
    latir() { if (ultima.fase !== "reposo") enviarEstado(); },
    cerrar() {
      ultima = { fase: "reposo" };
      enviarEstado();
      canal.onmessage = null;
      try { canal.close(); } catch { /* ya estaba cerrado */ }
    },
  };
}
