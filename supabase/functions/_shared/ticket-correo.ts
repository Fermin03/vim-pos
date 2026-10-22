// El ticket por correo (cobro a pantalla completa, 21 oct 2026): la caja manda los MISMOS renglones
// que imprimiría (`construirTicketJob` en apps/pos) y aquí se vuelven un correo. Así el correo sale
// igual que el papel sin duplicar la lógica del ticket, y la caja instalada —cuyo ticket puede no
// haber subido aún a la nube— funciona igual que la web.
//
// Lo que manda la caja se trata como de un desconocido: forma estricta, tamaños con tope, todo
// escapado, y el único enlace posible es el de VIM (el QR para facturar). Puro: se prueba con
// node --test (ticket-correo.test.ts).
import { esc } from "./correo.ts";
import type { Cupo } from "./limite.ts";

export type BloqueCorreo =
  | { t: "texto"; valor: string; align?: "izq" | "centro" | "der"; size?: number; bold?: boolean }
  | { t: "fila"; izq: string; der: string; bold?: boolean }
  | { t: "separador" }
  | { t: "qr"; valor: string };

export type EnvioTicket = { correo: string; ticket_id: string; bloques: BloqueCorreo[] };

// 200 y no más: el gateway de la caja instalada corta los cuerpos en 64 KB.
const MAX_BLOQUES = 200;
const MAX_TEXTO = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Lo que solo sirve en papel: se ignora, no rechaza. */
const SOLO_PAPEL = new Set(["raster", "corte"]);

const texto = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_TEXTO;
/** Sin caracteres de control ni invisibles (U+202E y compañía disfrazan texto en un phishing). */
const limpio = (v: string) => v.replace(/[\p{Cc}\p{Cf}]/gu, "");
const alineacion = (v: unknown) => (v === "centro" || v === "der" || v === "izq" ? v : undefined);

function bloque(b: unknown): BloqueCorreo | null | "papel" {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  if (typeof o.t === "string" && SOLO_PAPEL.has(o.t)) return "papel";
  switch (o.t) {
    case "texto":
      return texto(o.valor) ? { t: "texto", valor: limpio(o.valor), align: alineacion(o.align), size: typeof o.size === "number" ? o.size : 1, bold: o.bold === true } : null;
    case "fila":
      return texto(o.izq) && texto(o.der) ? { t: "fila", izq: limpio(o.izq), der: limpio(o.der), bold: o.bold === true } : null;
    case "separador":
      return { t: "separador" };
    case "qr":
      return texto(o.valor) ? { t: "qr", valor: o.valor } : null;
    default:
      return null;
  }
}

export function validarEnvioTicket(c: unknown): { ok: true; cuerpo: EnvioTicket } | { ok: false; error: string } {
  const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
  const correo = typeof o.correo === "string" ? o.correo.trim().toLowerCase() : "";
  if (correo.length > 254 || !CORREO.test(correo)) return { ok: false, error: "CORREO_INVALIDO" };
  if (typeof o.ticket_id !== "string" || !UUID.test(o.ticket_id)) return { ok: false, error: "TICKET_INVALIDO" };
  if (!Array.isArray(o.bloques) || o.bloques.length === 0 || o.bloques.length > MAX_BLOQUES) return { ok: false, error: "BLOQUES_INVALIDOS" };
  const bloques: BloqueCorreo[] = [];
  for (const b of o.bloques) {
    const v = bloque(b);
    if (v === null) return { ok: false, error: "BLOQUES_INVALIDOS" };
    if (v !== "papel") bloques.push(v);
  }
  if (bloques.length === 0) return { ok: false, error: "BLOQUES_INVALIDOS" };
  return { ok: true, cuerpo: { correo, ticket_id: o.ticket_id, bloques } };
}

/** El único enlace que puede llevar el correo: el portal de facturación de VIM. Otros subdominios
 *  (la tienda en línea, la demo) muestran contenido de cada negocio: no sirven de anzuelo. */
function enlaceDeVim(v: string): string | null {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname === "factura.vimpos.com.mx" ? u.href : null;
  } catch {
    return null;
  }
}

const ALINEA = { izq: "left", centro: "center", der: "right" } as const;

/** El ticket como correo: una columna angosta en letra de ticket, como el papel. */
export function htmlDeTicket(bloques: BloqueCorreo[], negocio: string): string {
  const filas = bloques.map((b, i) => {
    switch (b.t) {
      case "texto": {
        // El renglón que en papel dice «Escanea el código» va justo antes del QR: en el correo el QR
        // es un enlace, así que no se pide escanear nada.
        if (bloques[i + 1]?.t === "qr") return `<tr><td colspan="2" style="text-align:center;padding:4px 0 0">¿Necesitas factura?</td></tr>`;
        const tam = b.size && b.size > 1 ? 18 : 13;
        return `<tr><td colspan="2" style="text-align:${ALINEA[b.align ?? "izq"]};font-size:${tam}px;${b.bold ? "font-weight:bold;" : ""}padding:1px 0">${esc(b.valor)}</td></tr>`;
      }
      case "fila":
        return `<tr style="${b.bold ? "font-weight:bold;" : ""}"><td style="padding:1px 0">${esc(b.izq)}</td><td style="text-align:right;white-space:nowrap;padding:1px 0 1px 12px">${esc(b.der)}</td></tr>`;
      case "separador":
        return `<tr><td colspan="2" style="border-top:1px dashed #999;padding:0;height:6px"></td></tr>`;
      case "qr": {
        const url = enlaceDeVim(b.valor);
        return url
          ? `<tr><td colspan="2" style="text-align:center;padding:8px 0"><a href="${esc(url)}" style="color:#0078C9;font-weight:bold">Facturar esta compra</a></td></tr>`
          : "";
      }
    }
  }).join("");
  return `<!doctype html><html><body style="margin:0;background:#F6F6F4;padding:24px 12px">
<table role="presentation" align="center" style="max-width:380px;width:100%;background:#fff;border:1px solid #ECECE9;border-radius:8px;padding:20px;font-family:'Courier New',monospace;font-size:13px;color:#16161A;border-collapse:separate">
${filas}
</table>
<p style="text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#6E6E74;margin-top:16px">Ticket de ${esc(negocio)} · enviado con VIM POS</p>
</body></html>`;
}

/**
 * ¿Este negocio puede mandar correos desde el buzón de VIM? Activo o interno, o en prueba vigente,
 * y sin bloqueo por falta de pago. Un negocio dado de baja no.
 */
export function negocioPuedeEnviar(
  t: { estado: string; deleted_at: string | null; bloqueo_desde: string | null; prueba_hasta: string | null } | null,
  ahora: Date,
): boolean {
  if (!t || t.deleted_at) return false;
  if (t.bloqueo_desde && new Date(t.bloqueo_desde) <= ahora) return false;
  if (t.estado === "ACTIVO" || t.estado === "INTERNO") return true;
  return t.estado === "TRIAL" && (!t.prueba_hasta || new Date(t.prueba_hasta) >= ahora);
}

const HORA = 3600;
const DIA = 86400;

/**
 * Topes del envío (auditoría de seguridad, 21 oct 2026): el contenido lo arma la caja y sale del
 * buzón de VIM, por el que también salen las altas y los avisos. Un negocio de prueba se crea
 * gratis: sin tope, sería un relevo de spam que quemaría la reputación de todo el correo de VIM.
 */
export function cuposDeEnvio(tenantId: string, ticketId: string): Cupo[] {
  return [
    { clave: `ticket-correo:ticket:${ticketId}`, ventanaSeg: DIA, max: 3 },
    { clave: `ticket-correo:tenant:${tenantId}:h`, ventanaSeg: HORA, max: 30 },
    { clave: `ticket-correo:tenant:${tenantId}:d`, ventanaSeg: DIA, max: 150 },
    { clave: "ticket-correo:global", ventanaSeg: HORA, max: 300 },
  ];
}
