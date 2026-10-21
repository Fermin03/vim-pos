import type { PrinterAdapter } from "./adapter";
import type { PrintJob, PrintResult } from "./tipos";
import { jobAEscpos, bytesCajon } from "./escpos";
import { PUERTO_RAW } from "./config";

/**
 * Impresora a la que el navegador no llega solo: arma los bytes ESC/POS (jobAEscpos, ya soporta
 * corte y QR) y se los pasa al proceso de Electron por el relay local `/__imprimir`, que los
 * entrega a `destino`. Mismo patrón que "Buscar actualizaciones": la UI le pide a Electron lo que
 * ella no puede hacer.
 *
 * Solo funciona dentro de la app de escritorio (donde existe el relay). En un navegador normal el
 * fetch a /__imprimir falla y el resultado es OFFLINE.
 */
export class RelayAdapter implements PrinterAdapter {
  constructor(public nombre: string, private destino: Record<string, unknown>, private ancho: 58 | 80) {}

  private async enviar(datos: Uint8Array, soloConectar = false): Promise<PrintResult> {
    // base64 sin depender de Buffer (esto corre en el renderer).
    let bin = "";
    for (const b of datos) bin += String.fromCharCode(b);
    const datosB64 = typeof btoa === "function" ? btoa(bin) : "";
    try {
      const res = await fetch("/__imprimir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...this.destino, datosB64, soloConectar }),
      });
      const j: unknown = await res.json().catch(() => ({}));
      const o = (typeof j === "object" && j !== null ? j : {}) as Record<string, unknown>;
      if (o.ok === true) return { ok: true };
      // El main clasifica: sin ruta/timeout = OFFLINE; conexión rechazada = OFFLINE; otro = ERROR.
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
    // El relay no devuelve estado fiable: la prueba real es si acepta el trabajo.
    const r = await this.enviar(new Uint8Array(), true);
    return r.ok ? "LISTO" : r.motivo === "OFFLINE" ? "OFFLINE" : "ERROR";
  }

  async abrirCajon(): Promise<PrintResult> {
    return this.enviar(bytesCajon());
  }
}

/**
 * Impresora ESC/POS genérica por el puerto RAW 9100 (Soluciones MyPOS, Xprinter, 3nStar, etc.):
 * el main abre el socket a ip:9100 y escribe los bytes.
 */
export class RawSocketAdapter extends RelayAdapter {
  constructor(ip: string, puerto: number = PUERTO_RAW, ancho: 58 | 80 = 80) {
    super("Impresora de red (ESC/POS 9100)", { ip, puerto }, ancho);
  }
}
