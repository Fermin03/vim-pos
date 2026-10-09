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

/** Lo que la tienda hace, para la tarjeta de quien todavía no la tiene. */
export const TIENDA_INCLUYE: { titulo: string; detalle: string }[] = [
  { titulo: "Tu menú, siempre al día", detalle: "El mismo que vendes en caja, con sus precios y lo agotado." },
  { titulo: "Pago al recibir", detalle: "Efectivo o tarjeta, como tú decidas." },
  { titulo: "Tus horarios", detalle: "Solo recibe pedidos cuando tu caja está abierta." },
  { titulo: "Sin comisión", detalle: "Una cuota fija, no un porcentaje de cada venta." },
];

/** El mensaje de WhatsApp ya escrito: quién es, de qué negocio y qué quiere. */
export function mensajeQuieroTienda(d: { usuario?: string | null; negocio?: string | null; codigo?: string | null }): string {
  return mensajeAyudaAdmin(d).replace(/Necesito ayuda con VIM POS\.$/, "Quiero activar la tienda en línea.");
}
