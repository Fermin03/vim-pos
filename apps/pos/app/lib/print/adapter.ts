import type { PrintJob, PrintResult } from "./tipos";
import { PreviewAdapter } from "./preview-adapter";

export interface PrinterAdapter {
  nombre: string;
  imprimir(job: PrintJob): Promise<PrintResult>;
  estado(): Promise<"LISTO" | "SIN_PAPEL" | "OFFLINE" | "ERROR">;
  abrirCajon(): Promise<void>;
}

/**
 * Devuelve la impresora activa. Sin config de impresora de red (caso actual, P-174 diferido)
 * → PreviewAdapter (muestra el recibo en pantalla). `onMostrar` lo provee la UI.
 */
export function obtenerImpresora(opts: { onMostrar: (job: PrintJob) => void }): PrinterAdapter {
  return new PreviewAdapter(opts.onMostrar);
}
