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
  /** A nombre de quién va (Pick-up / domicilio). Cocina lo necesita para rotular la bolsa. */
  cliente?: string | null;
  lineas: LineaComanda[];
  ancho: 58 | 80;
};

/** true si el modificador es una quita ("Sin cebolla", "No picante", "Quitar lechuga"),
 *  igual que ModRender en recibo-comanda.tsx. */
function esQuita(m: string): boolean {
  return /^(sin |no |quitar )/i.test(m.trim());
}

/** Construye el PrintJob de la comanda (P-223) — para cocina. Sin precios. Función PURA.
 *  Debe quedar idéntico —contenido y orden— a ReciboComanda (recibo-comanda.tsx). El "grito
 *  visual" (bloque negro con el modo de servicio) se aproxima con video invertido ESC/POS. */
export function construirComandaJob(d: DatosComanda): PrintJob {
  const f = new Date(d.fechaIso);
  const hora = `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
  // Cocina solo necesita los últimos 4 dígitos para identificar el pedido (más rápido de leer).
  const folioCorto = d.folio.slice(-4);

  const b: Bloque[] = [];
  b.push({ t: "texto", valor: d.modoServicio.toUpperCase(), align: "centro", size: 3, bold: true, invertido: true });
  b.push({ t: "separador", estilo: "punteado" });

  b.push({ t: "fila", izq: "Orden", der: `#${folioCorto}`, bold: true });
  b.push({ t: "fila", izq: "Hora", der: hora });
  if (d.cliente) b.push({ t: "fila", izq: "Cliente", der: d.cliente, bold: true });
  b.push({ t: "separador", estilo: "punteado" });

  for (const l of d.lineas) {
    b.push({ t: "texto", valor: `${l.cantidad}x ${l.nombre}`, size: 2, bold: true });
    for (const m of l.modificadores) {
      b.push({ t: "texto", valor: esQuita(m) ? `  ${m.trim().toUpperCase()}` : `  + ${m}`, size: 1, bold: esQuita(m) });
    }
    if (l.notaCocina && l.notaCocina.trim().length > 0) {
      b.push({ t: "texto", valor: `  > ${l.notaCocina.trim()}`, size: 1, bold: true });
    }
  }

  b.push({ t: "separador", estilo: "solido" });
  b.push({ t: "fila", izq: "Cajero", der: d.cajero });
  b.push({ t: "fila", izq: "Caja", der: d.caja });
  b.push({ t: "corte" });

  return { tipo: "TICKET", ancho: d.ancho, destino: "COCINA", abrir_cajon: false, bloques: b };
}
