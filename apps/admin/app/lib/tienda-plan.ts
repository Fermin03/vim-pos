// La tienda en línea es un complemento que VIM concede (add-on TIENDA) y el dueño enciende. Lógica
// pura de qué enseña el admin; el candado de verdad está en la base (`configuracion_tenant_tienda_guardia`, 0163).
import { mensajeAyudaAdmin } from "@vim/db/soporte";

export type ModulosLeidos = { permitidos: Record<string, boolean>; efectivos: Record<string, boolean> };
export type EstadoTienda = "cargando" | "permitida" | "sin_contratar";

/** Qué pantalla toca. Si la lectura de módulos falló se enseña la sección: la base igual impide encender lo que no se contrató. */
export function estadoTienda(m: ModulosLeidos | "error" | null): EstadoTienda {
  if (m === null) return "cargando";
  if (m === "error") return "permitida";
  return m.permitidos.tienda === true ? "permitida" : "sin_contratar";
}

/**
 * La foto del producto solo le sirve a quien tiene la tienda: sin el complemento concedido, la ficha
 * de producto queda como siempre. Mientras los módulos cargan o si no se pudieron leer, tampoco se
 * ofrece (al revés que `estadoTienda`: aquí lo prudente es no enseñar nada de más).
 */
export function ofreceFotoDeProducto(m: ModulosLeidos | "error" | null): boolean {
  return m !== null && m !== "error" && m.permitidos.tienda === true;
}

/** Lo que la tienda hace, para la tarjeta de quien todavía no la tiene. */
export const TIENDA_INCLUYE: { titulo: string; detalle: string }[] = [
  { titulo: "Tu menú, siempre al día", detalle: "El mismo que vendes en caja, con sus precios y lo agotado." },
  { titulo: "Pago al recibir", detalle: "Efectivo o tarjeta, como tú decidas." },
  { titulo: "Tus horarios", detalle: "Solo recibe pedidos cuando tu caja está abierta." },
  { titulo: "Sin comisión", detalle: "Una cuota fija, no un porcentaje de cada venta." },
];

/**
 * El cierre y el botón de la invitación. Hoy el complemento todavía no se puede conceder y la tienda
 * pública no existe, así que la invitación no promete activarla: pide que le avisen.
 *
 * ENTREGA 7 (salida a clientes): vuelven los textos de contratación —
 *   cierre «Escríbenos y la activamos.» · botón «Quiero mi tienda en línea» ·
 *   mensaje de WhatsApp «Quiero activar la tienda en línea.»
 */
export const TIENDA_INVITACION = {
  cierre: "Estamos por lanzarla. Escríbenos y te avisamos en cuanto esté lista.",
  boton: "Avísenme cuando esté lista",
} as const;

/** El mensaje de WhatsApp ya escrito: quién es, de qué negocio y qué quiere. */
export function mensajeQuieroTienda(d: { usuario?: string | null; negocio?: string | null; codigo?: string | null }): string {
  return mensajeAyudaAdmin(d).replace(/Necesito ayuda con VIM POS\.$/, "Quiero la tienda en línea. Avísenme cuando esté lista.");
}
