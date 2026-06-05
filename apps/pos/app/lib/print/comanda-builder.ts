import type { Bloque, PrintJob } from "./tipos";

export type LineaComanda = {
  cantidad: number;
  nombre: string;
  modificadores: string[];
  notaCocina: string | null;
};

export type DatosComanda = {
  folio: string;
  modoServicio: string; // "PARA LLEVAR" / "COMER AQUÍ" / "DRIVE-THRU"
  cajero: string;
  caja: string;
  fechaIso: string;
  lineas: LineaComanda[];
  ancho: 58 | 80;
};

/** Construye el PrintJob de la comanda (P-223) — para cocina. Sin precios. Función PURA. */
export function construirComandaJob(d: DatosComanda): PrintJob {
  const f = new Date(d.fechaIso);
  const hora = `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;

  const b: Bloque[] = [];
  b.push({ t: "texto", valor: "COMANDA", align: "centro", size: 3, bold: true });
  b.push({ t: "texto", valor: d.modoServicio.toUpperCase(), align: "centro", size: 2, bold: true });
  b.push({ t: "separador", estilo: "punteado" });

  b.push({ t: "fila", izq: "Orden", der: d.folio });
  b.push({ t: "fila", izq: "Hora", der: hora });
  b.push({ t: "separador", estilo: "punteado" });

  for (const l of d.lineas) {
    b.push({ t: "texto", valor: `${l.cantidad}x ${l.nombre}`, size: 2, bold: true });
    for (const m of l.modificadores) b.push({ t: "texto", valor: `  - ${m}`, size: 1 });
    if (l.notaCocina && l.notaCocina.trim().length > 0) {
      b.push({ t: "texto", valor: `  Nota: ${l.notaCocina.trim()}`, size: 1, bold: true });
    }
  }

  b.push({ t: "separador", estilo: "solido" });
  b.push({ t: "fila", izq: "Cajero", der: d.cajero });
  b.push({ t: "fila", izq: "Caja", der: d.caja });
  b.push({ t: "corte" });

  return { tipo: "TICKET", ancho: d.ancho, destino: "CAJA", abrir_cajon: false, bloques: b };
}
