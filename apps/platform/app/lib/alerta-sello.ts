import { fechaLegible } from "@vim/fecha";
import { estadoSello } from "@vim/db/sello";

/**
 * La alerta "Sello por vencer" de la bandeja de VIM. Pura, para probar los umbrales sin base.
 *
 * Mismas reglas que el aviso del panel del dueño (`@vim/db/sello`): 30 días antes avisa, a 7 sube
 * de tono, y vencido es un cliente que ya no factura. `hoy` en hora de México.
 */
export function alertaDeSello(
  vigenciaHasta: string | null,
  hoy: string,
): { severidad: "alta" | "media"; tipo: string; titulo: string; detalle: string; orden: number } | null {
  const s = estadoSello(vigenciaHasta, hoy);
  const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
  if (s.tipo === "VENCIDO") {
    return {
      severidad: "alta", tipo: "Sello vencido",
      titulo: `Su sello digital venció hace ${dias(s.dias)}`,
      detalle: `Venció el ${fechaLegible(s.hasta)}: no puede facturar hasta que tramite uno nuevo en el SAT y lo suba en su panel.`,
      orden: -s.dias,
    };
  }
  if (s.tipo === "URGENTE" || s.tipo === "POR_VENCER") {
    return {
      severidad: s.tipo === "URGENTE" ? "alta" : "media", tipo: "Sello por vencer",
      titulo: s.dias === 0 ? "Su sello digital vence hoy" : `Su sello digital vence en ${dias(s.dias)}`,
      detalle: `Vence el ${fechaLegible(s.hasta)}. Ya lo ve en su panel; si no lo renueva en el SAT, deja de facturar. Vale un mensaje.`,
      orden: s.dias,
    };
  }
  return null;
}
