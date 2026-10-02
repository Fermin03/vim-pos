import type { PrinterAdapter } from "./adapter";
import type { PrintJob, PrintResult } from "./tipos";
import { jobAEscpos, bytesCajon } from "./escpos";

export type ImpresoraWindows = { nombre: string; predeterminada: boolean };

/**
 * Impresora instalada en Windows (USB, serial, o de red con su driver). Para el negocio que ya
 * tiene sus impresoras dadas de alta en el sistema y no hay IP que capturar.
 *
 * Manda los mismos bytes ESC/POS que la genérica de red, pero el relay `/__imprimir` los entrega a
 * la cola de Windows en crudo (`impresoraWindows` en el cuerpo) en vez de abrir un socket.
 *
 * OJO: aquí `ok` significa que la COLA aceptó el trabajo. Con la impresora apagada Windows lo deja
 * encolado y no avisa — no hay forma de saber desde aquí si salió papel.
 */
export class ColaWindowsAdapter implements PrinterAdapter {
  nombre = "Impresora de Windows";
  constructor(private impresora: string, private ancho: 58 | 80 = 80) {}

  private async enviar(datos: Uint8Array, soloConectar = false): Promise<PrintResult> {
    let bin = "";
    for (const b of datos) bin += String.fromCharCode(b);
    const datosB64 = typeof btoa === "function" ? btoa(bin) : "";
    try {
      const res = await fetch("/__imprimir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impresoraWindows: this.impresora, datosB64, soloConectar }),
      });
      const j: unknown = await res.json().catch(() => ({}));
      const o = (typeof j === "object" && j !== null ? j : {}) as Record<string, unknown>;
      if (o.ok === true) return { ok: true };
      return { ok: false, motivo: o.motivo === "OFFLINE" ? "OFFLINE" : "ERROR" };
    } catch {
      // No hay relay (navegador normal) o el ui-server no respondió.
      return { ok: false, motivo: "OFFLINE" };
    }
  }

  async imprimir(job: PrintJob): Promise<PrintResult> {
    return this.enviar(jobAEscpos({ ...job, ancho: this.ancho }));
  }

  async estado(): Promise<"LISTO" | "SIN_PAPEL" | "OFFLINE" | "ERROR"> {
    const r = await this.enviar(new Uint8Array(), true);
    return r.ok ? "LISTO" : r.motivo === "OFFLINE" ? "OFFLINE" : "ERROR";
  }

  async abrirCajon(): Promise<PrintResult> {
    return this.enviar(bytesCajon());
  }
}

/** Impresoras instaladas en esta computadora. `null` = no se pudo saber (fuera de la app de la
 *  caja no existe el relay), que no es lo mismo que una lista vacía. */
export async function listarImpresorasWindows(): Promise<ImpresoraWindows[] | null> {
  try {
    const res = await fetch("/__impresoras", { cache: "no-store" });
    const j: unknown = await res.json();
    if (typeof j !== "object" || j === null) return null;
    const o = j as Record<string, unknown>;
    if (o.ok !== true || !Array.isArray(o.impresoras)) return null;
    return o.impresoras.flatMap((p: unknown) => {
      if (typeof p !== "object" || p === null) return [];
      const r = p as Record<string, unknown>;
      return typeof r.nombre === "string" && r.nombre ? [{ nombre: r.nombre, predeterminada: r.predeterminada === true }] : [];
    });
  } catch {
    return null;
  }
}
