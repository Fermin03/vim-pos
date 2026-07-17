import type { PrinterAdapter } from "./adapter";
import type { PrintJob, PrintResult } from "./tipos";
import { jobAEscpos, bytesCajon } from "./escpos";
import { PUERTO_RAW } from "./config";

/**
 * Impresora ESC/POS genérica por el puerto RAW 9100 (Soluciones MyPOS, Xprinter, 3nStar, etc.).
 *
 * El navegador NO puede abrir sockets TCP, así que esta clase no habla directo con la impresora:
 * arma los bytes ESC/POS (jobAEscpos, ya soporta corte y QR) y se los pasa al proceso de Electron
 * por el relay local `/__imprimir`. El main abre el socket a ip:9100 y escribe los bytes. Mismo
 * patrón que "Buscar actualizaciones": la UI le pide a Electron lo que ella no puede hacer.
 *
 * Solo funciona dentro de la app de escritorio (donde existe el relay). En un navegador normal el
 * fetch a /__imprimir falla y el resultado es OFFLINE.
 */
export class RawSocketAdapter implements PrinterAdapter {
  nombre = "Impresora de red (ESC/POS 9100)";
  constructor(private ip: string, private puerto: number = PUERTO_RAW, private ancho: 58 | 80 = 80) {}

  private async enviar(datos: Uint8Array, soloConectar = false): Promise<PrintResult> {
    // base64 sin depender de Buffer (esto corre en el renderer).
    let bin = "";
    for (const b of datos) bin += String.fromCharCode(b);
    const datosB64 = typeof btoa === "function" ? btoa(bin) : "";
    try {
      const res = await fetch("/__imprimir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: this.ip, puerto: this.puerto, datosB64, soloConectar }),
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
    // El puerto 9100 crudo no devuelve estado fiable: la prueba real es si se puede abrir el socket.
    const r = await this.enviar(new Uint8Array(), true);
    return r.ok ? "LISTO" : r.motivo === "OFFLINE" ? "OFFLINE" : "ERROR";
  }

  async abrirCajon(): Promise<void> {
    await this.enviar(bytesCajon());
  }
}
