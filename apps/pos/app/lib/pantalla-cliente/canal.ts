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
/**
 * Lo más que dura «¡Gracias!» de cara al cliente. Con impresora, la caja cierra sola su «Cobro
 * completado» a los 5 s y publica lo que sigue. Sin impresora ese diálogo se queda abierto con el
 * recibo en pantalla (y también al imprimir una copia, con un aviso de reparto o con un recibo que
 * falló): sin este tope la pantalla del cliente decía «¡Gracias!» hasta que el cajero lo cerrara.
 */
export const PAGADO_MAX_MS = 8000;

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
  let topePagado: ReturnType<typeof setTimeout> | undefined;
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
    publicar(vista: VistaCliente) {
      clearTimeout(topePagado);
      topePagado = undefined;
      ultima = vista;
      enviarEstado();
      if (vista.fase !== "pagado") return;
      // El tope vive aquí, junto a `ultima`: al vencer, el latido deja de repetir «pagado» y una
      // pantalla que salude después recibe reposo. El latido no lo alarga; solo otro `publicar`.
      topePagado = setTimeout(() => {
        topePagado = undefined;
        ultima = { fase: "reposo" };
        enviarEstado();
      }, PAGADO_MAX_MS);
    },
    latir() { if (ultima.fase !== "reposo") enviarEstado(); },
    cerrar() {
      clearTimeout(topePagado);
      topePagado = undefined;
      ultima = { fase: "reposo" };
      enviarEstado();
      canal.onmessage = null;
      try { canal.close(); } catch { /* ya estaba cerrado */ }
    },
  };
}

/**
 * El lado de la pantalla del cliente: escucha a la caja y avisa qué dibujar.
 *
 * Es el espejo de `crearPublicador` y vive aquí, fuera del componente, para poder probar con un
 * canal y un reloj de mentira la regla que más importa: si la caja calla, la cuenta no se queda.
 */
export function crearReceptor(
  canal: Canal,
  { alCambiarVista, alNegocio }: { alCambiarVista: (vista: VistaCliente) => void; alNegocio: (negocio: Negocio) => void },
) {
  let silencio: ReturnType<typeof setTimeout> | undefined;

  canal.onmessage = (e) => {
    const m = leerMensaje(e.data);
    if (!m) return; // lo que no se entiende se ignora; queda lo último válido
    if (m.tipo === "negocio") { alNegocio({ nombre: m.nombre, logoUrl: m.logoUrl }); return; }
    if (m.tipo !== "estado") return;
    alCambiarVista(m.vista);
    clearTimeout(silencio);
    silencio = undefined;
    // Si la caja se cuelga o se recarga a media cuenta, deja de latir: a los 15 s se vuelve a
    // reposo para no dejarle la cuenta de un cliente al siguiente. En reposo no hay nada que quitar.
    if (m.vista.fase !== "reposo") {
      silencio = setTimeout(() => { silencio = undefined; alCambiarVista({ fase: "reposo" }); }, SILENCIO_MS);
    }
  };
  // Saluda: la caja contesta con el negocio y con lo que tenga en la venta.
  try { canal.postMessage({ tipo: "hola", v: 1 }); } catch { /* sin caja que conteste, se queda en reposo */ }

  return {
    cerrar() {
      clearTimeout(silencio);
      silencio = undefined;
      canal.onmessage = null;
      try { canal.close(); } catch { /* ya estaba cerrado */ }
    },
  };
}
