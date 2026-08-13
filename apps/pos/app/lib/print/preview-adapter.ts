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
  async abrirCajon(): Promise<PrintResult> {
    // Sin impresora física no hay cajón que abrir; decir "listo" sería falso para una acción
    // de efectivo. El cajero necesita ver "no se pudo" y saber que hace falta configurar una.
    return { ok: false, motivo: "OFFLINE" };
  }
}
