import type { PrinterAdapter } from "./adapter";
import type { PrintJob, PrintResult } from "./tipos";

/**
 * Adapter activo en F5.3 (sin hardware): "imprimir" = mostrar el recibo en pantalla.
 * Cuando exista la impresora de red, se reemplaza por EpsonEposAdapter sin tocar la UI.
 */
export class PreviewAdapter implements PrinterAdapter {
  nombre = "Vista previa";
  constructor(private onMostrar: (job: PrintJob) => void) {}

  async imprimir(job: PrintJob): Promise<PrintResult> {
    this.onMostrar(job);
    return { ok: true };
  }
  async estado() {
    return "LISTO" as const;
  }
  async abrirCajon() {
    /* cajón diferido (cuelga de la impresora física) */
  }
}
