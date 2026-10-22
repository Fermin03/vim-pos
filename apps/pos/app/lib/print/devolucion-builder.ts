// C4 — Comprobante de devolución/reembolso (P-228). Mismo modelo de impresión que el ticket
// (PrintJob de tipos.ts) para que el preview y la Epson compartan fuente.
import type { Bloque, PrintJob } from "./tipos";
import { cantidadRenglon, tipoDesdeSat } from "../unidades";

export type DatosDevolucion = {
  negocio: { nombre: string; rfc: string | null };
  sucursal: { direccion: string | null; telefono: string | null };
  folioOriginal: string;
  fechaIso: string;
  cajero: string;
  caja: string;
  autorizo: string | null;
  /** `unidadSat`: a granel se imprime «1.250 kg Jitomate»; una pieza, «2× Playera». */
  items: { cantidad: number; nombre: string; totalMxn: number; unidadSat?: string | null }[];
  motivo: string;
  medio: string;
  /** Tarjetas a las que regresó el dinero («Mastercard **** 1447»), cuando la devolución fue al mismo método. */
  tarjetas?: string[];
  totalReembolso: number;
  ancho: 58 | 80;
};

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export function construirDevolucionJob(d: DatosDevolucion): PrintJob {
  const f = new Date(d.fechaIso);
  const fecha = `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;

  const bloques: Bloque[] = [
    { t: "texto", valor: d.negocio.nombre, align: "centro", size: 2, bold: true },
    ...(d.sucursal.direccion ? [{ t: "texto", valor: d.sucursal.direccion, align: "centro" } as Bloque] : []),
    ...(d.negocio.rfc ? [{ t: "texto", valor: `RFC ${d.negocio.rfc}`, align: "centro" } as Bloque] : []),
    { t: "separador", estilo: "solido" },
    { t: "texto", valor: "COMPROBANTE DE DEVOLUCIÓN", align: "centro", bold: true },
    { t: "separador", estilo: "punteado" },
    { t: "fila", izq: "Fecha:", der: fecha },
    { t: "fila", izq: "Ticket orig.:", der: d.folioOriginal },
    { t: "fila", izq: "Cajero:", der: d.cajero },
    { t: "fila", izq: "Caja:", der: d.caja },
    ...(d.autorizo ? [{ t: "fila", izq: "Autorizó:", der: d.autorizo } as Bloque] : []),
    { t: "separador", estilo: "punteado" },
    ...d.items.map((i) => ({ t: "fila", izq: `${cantidadRenglon(i.cantidad, tipoDesdeSat(i.unidadSat))} ${i.nombre}`, der: fmt(i.totalMxn) }) as Bloque),
    { t: "separador", estilo: "solido" },
    { t: "fila", izq: "REEMBOLSO", der: fmt(d.totalReembolso) },
    { t: "fila", izq: "Medio:", der: d.medio },
    ...(d.tarjetas ?? []).map((t) => ({ t: "fila", izq: "Devuelto a:", der: t }) as Bloque),
    { t: "fila", izq: "Motivo:", der: d.motivo },
    { t: "separador", estilo: "punteado" },
    { t: "texto", valor: "Conserve este comprobante.", align: "centro" },
    { t: "corte" },
  ];

  return { tipo: "TICKET", ancho: d.ancho, destino: "CAJA", bloques };
}
