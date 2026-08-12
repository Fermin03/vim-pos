import type { PrintJob, PrintResult } from "./tipos";
import { PreviewAdapter } from "./preview-adapter";
import { EpsonEposAdapter } from "./epson-epos-adapter";
import { RawSocketAdapter } from "./raw-socket-adapter";
import { leerConfigParaDestino, PUERTO_RAW, type Destino } from "./config";

export interface PrinterAdapter {
  nombre: string;
  imprimir(job: PrintJob): Promise<PrintResult>;
  estado(): Promise<"LISTO" | "SIN_PAPEL" | "OFFLINE" | "ERROR">;
  /** Pulso al cajón de dinero. Devuelve si de verdad llegó — nunca lo des por hecho en silencio,
   *  es dinero: el cajero necesita saber si la impresora no respondió. */
  abrirCajon(): Promise<PrintResult>;
}

/**
 * Devuelve la impresora activa para un destino (CAJA o COCINA) según la config del dispositivo
 * (C3, dos estaciones): cada destino está asignado a una estación con su propia config.
 *  - tipo 'epson' + IP → EpsonEposAdapter (imprime al hardware de red).
 *  - tipo 'generica' + IP → RawSocketAdapter (puerto 9100).
 *  - en cualquier otro caso → PreviewAdapter (muestra el recibo en pantalla); `onMostrar` lo da la UI.
 * Sin config, sigue siendo Preview (comportamiento previo).
 */
export function obtenerImpresora(destino: Destino, opts: { onMostrar: (job: PrintJob) => void }): PrinterAdapter {
  const cfg = leerConfigParaDestino(destino);
  if (cfg.tipo === "generica" && cfg.ip) return new RawSocketAdapter(cfg.ip, cfg.puerto ?? PUERTO_RAW, cfg.ancho ?? 80);
  if (cfg.tipo === "epson" && cfg.ip) return new EpsonEposAdapter(cfg.ip, cfg.ancho ?? 80);
  return new PreviewAdapter(opts.onMostrar);
}
