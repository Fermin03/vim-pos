// El correo que confirma un pedido de la tienda. Puro, para probarlo sin SMTP. No menciona tiempos
// de entrega: es decisión del diseño (§3), el restaurante no promete un tiempo que no controla.
import type { Modo } from "./validar.ts";

const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
/** El asunto viaja por SMTP: sin acentos ni símbolos raros, como exige _shared/correo.ts. */
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "").slice(0, 160);

export function correoDePedido(d: {
  negocio: string; folio: string; total: string; modo: Modo;
  renglones: { nombre: string; cantidad: number; detalle: string | null }[]; enlace: string;
}): { subject: string; html: string } {
  const filas = d.renglones.map((r) =>
    `<tr><td style="padding:6px 0">${r.cantidad} × ${esc(r.nombre)}${r.detalle ? `<br><span style="color:#666;font-size:13px">${esc(r.detalle)}</span>` : ""}</td></tr>`
  ).join("");
  const como = d.modo === "DOMICILIO" ? "Te lo llevamos a domicilio." : "Pasas a recogerlo a la sucursal.";
  return {
    subject: ascii(`Recibimos tu pedido ${d.folio} - ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#111">
<h1 style="font-size:20px;margin:0 0 4px">${esc(d.negocio)}</h1>
<p style="margin:0 0 16px">Recibimos tu pedido <strong>${esc(d.folio)}</strong>. ${como} Pagas al recibir.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #ddd;border-bottom:1px solid #ddd">${filas}</table>
<p style="font-size:18px;margin:16px 0"><strong>Total: $${esc(d.total)}</strong></p>
<p style="margin:0 0 24px"><a href="${esc(d.enlace)}" style="background:#111;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ver cómo va mi pedido</a></p>
<p style="color:#666;font-size:13px;margin:0">Si no hiciste este pedido, ignora este correo.</p>
</div>`,
  };
}
