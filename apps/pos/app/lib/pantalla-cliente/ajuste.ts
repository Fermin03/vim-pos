/**
 * Ajuste de la pantalla del cliente, servido por el escritorio en `/__pantalla-cliente`.
 * Se guarda en la computadora de la caja, no en la nube: qué monitor es cuál es cosa de cada equipo.
 */
import { z } from "zod";

const esquema = z.object({
  disponible: z.literal(true),
  modo: z.enum(["auto", "apagada"]),
  displayId: z.number().nullable(),
  abierta: z.boolean(),
  monitores: z.array(z.object({ id: z.number(), etiqueta: z.string(), ancho: z.number(), alto: z.number(), esDeLaCaja: z.boolean() })),
});

export type AjustePantalla = z.infer<typeof esquema>;
/** Lo único que se puede cambiar desde la caja: encenderla o apagarla, y en qué monitor. */
export type CambioPantalla = Pick<AjustePantalla, "modo" | "displayId">;

async function interpretar(r: Response): Promise<AjustePantalla | null> {
  if (!r.ok) return null;
  const p = esquema.safeParse(await r.json());
  return p.success ? p.data : null;
}

/** null = no hay escritorio (POS web, segunda caja de la LAN) o no contestó. */
export async function leerAjustePantalla(): Promise<AjustePantalla | null> {
  try { return await interpretar(await fetch("/__pantalla-cliente", { cache: "no-store" })); } catch { return null; }
}

export async function guardarAjustePantalla(cambio: CambioPantalla): Promise<AjustePantalla | null> {
  try {
    return await interpretar(await fetch("/__pantalla-cliente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambio) }));
  } catch { return null; }
}

export function textoEstadoPantalla(a: AjustePantalla): string {
  if (a.modo === "apagada") return "Apagada.";
  const otros = a.monitores.filter((m) => !m.esDeLaCaja);
  // En «Duplicar», Windows reporta un solo monitor aunque haya dos enchufados, y no se abre nada.
  if (otros.length === 0) return "No hay un segundo monitor conectado. Revisa que Windows esté en «Extender» y no en «Duplicar».";
  if (!a.abierta) return "Hay un segundo monitor, pero la pantalla no se abrió.";
  const m = otros.find((o) => o.id === a.displayId) ?? otros[0]!;
  return `Abierta en ${m.etiqueta} (${m.ancho}×${m.alto}).`;
}
