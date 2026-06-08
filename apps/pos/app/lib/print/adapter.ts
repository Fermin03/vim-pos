import type { PrintJob, PrintResult } from "./tipos";
import { PreviewAdapter } from "./preview-adapter";
import { EpsonEposAdapter } from "./epson-epos-adapter";
import { leerConfigImpresora } from "./config";

export interface PrinterAdapter {
  nombre: string;
  imprimir(job: PrintJob): Promise<PrintResult>;
  estado(): Promise<"LISTO" | "SIN_PAPEL" | "OFFLINE" | "ERROR">;
  abrirCajon(): Promise<void>;
}

/**
 * Devuelve la impresora activa según la config del dispositivo (C3):
 *  - tipo 'epson' + IP → EpsonEposAdapter (imprime al hardware de red).
 *  - en cualquier otro caso → PreviewAdapter (muestra el recibo en pantalla); `onMostrar` lo da la UI.
 * Sin config, sigue siendo Preview (comportamiento previo).
 */
export function obtenerImpresora(opts: { onMostrar: (job: PrintJob) => void }): PrinterAdapter {
  const cfg = leerConfigImpresora();
  if (cfg.tipo === "epson" && cfg.ip) return new EpsonEposAdapter(cfg.ip, cfg.ancho ?? 80);
  return new PreviewAdapter(opts.onMostrar);
}
