// El ticket por correo cuando la caja no tiene impresora (cobro a pantalla completa). La caja manda
// los mismos renglones que imprimiría; la nube (función enviar-ticket) arma el correo y lo manda.
import type { Bloque } from "./print/tipos";
import { encabezadosFuncion, urlFuncion } from "./supabase";

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** La misma regla que la nube: para no mandar algo que va a rebotar. */
export const correoValido = (c: string) => CORREO.test(c.trim());

/** El logo y el corte solo sirven en papel. */
export const bloquesParaCorreo = (bloques: Bloque[]) => bloques.filter((b) => b.t !== "raster" && b.t !== "corte");

/** Lo que ve el cajero, sin códigos internos. */
export function mensajeEnvioTicket(codigo: string): string {
  if (codigo === "SIN_RED" || codigo === "FUNCION_REQUIERE_NUBE") return "No se pudo enviar: la caja no tiene internet.";
  if (codigo === "CORREO_INVALIDO") return "Revisa el correo: parece que está mal escrito.";
  if (codigo === "SIN_CUPO") return "Ya se mandaron muchos tickets por correo. Intenta más tarde.";
  return "No se pudo enviar el correo. Intenta otra vez.";
}

/** Manda el ticket. Lanza un Error con el mensaje para el cajero si no se pudo. */
export async function enviarTicketPorCorreo(token: string, p: { correo: string; ticketId: string; bloques: Bloque[] }): Promise<void> {
  let r: Response;
  try {
    r = await fetch(urlFuncion("enviar-ticket"), {
      method: "POST",
      headers: encabezadosFuncion(token),
      body: JSON.stringify({ correo: p.correo.trim(), ticket_id: p.ticketId, bloques: bloquesParaCorreo(p.bloques) }),
    });
  } catch {
    throw new Error(mensajeEnvioTicket("SIN_RED"));
  }
  if (r.ok) return;
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  throw new Error(mensajeEnvioTicket(j.error ?? `HTTP_${r.status}`));
}
