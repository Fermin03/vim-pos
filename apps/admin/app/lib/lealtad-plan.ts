// La lealtad es un programa que VIM concede (add-on LEALTAD, incluido desde el plan Negocio) y el
// dueño enciende (ADR 0030). Lógica pura de qué enseña el admin; el candado de verdad está en la base
// (`configuracion_tenant_lealtad_guardia`, 0156).
import { mensajeAyudaAdmin } from "@vim/db/soporte";

export type ModulosLeidos = { permitidos: Record<string, boolean>; efectivos: Record<string, boolean> };
export type EstadoLealtad = "cargando" | "permitida" | "sin_contratar";

/**
 * Qué pantalla toca. Si la lectura de módulos falló se enseña la sección: esconder de más deja al
 * dueño sin su programa por un fallo de red, y la base igual impide encender lo que no se contrató.
 */
export function estadoLealtad(m: ModulosLeidos | "error" | null): EstadoLealtad {
  if (m === null) return "cargando";
  if (m === "error") return "permitida";
  return m.permitidos.lealtad === true ? "permitida" : "sin_contratar";
}

/** Lo que el programa hace, para la tarjeta de quien todavía no lo tiene. */
export const LEALTAD_INCLUYE: { titulo: string; detalle: string }[] = [
  { titulo: "Tus clientes ganan en cada compra", detalle: "Puntos que valen dinero, sellos por visita o puntos que se cambian por premios: tú eliges." },
  { titulo: "Canjean en la caja", detalle: "Quien cobra ve el saldo del cliente y aplica el canje en la cuenta, sin tarjetas de cartón." },
  { titulo: "Un solo saldo en todas tus sucursales", detalle: "Lo que ganan en una lo pueden usar en otra." },
  { titulo: "Tú ves todo", detalle: "Cuánto se ha repartido, cuánto se ha canjeado y quién lo hizo." },
];

/** El mensaje de WhatsApp ya escrito: quién es, de qué negocio y qué quiere. */
export function mensajeQuieroLealtad(d: { usuario?: string | null; negocio?: string | null; codigo?: string | null }): string {
  return mensajeAyudaAdmin(d).replace(/Necesito ayuda con VIM POS\.$/, "Quiero activar el programa de lealtad.");
}
