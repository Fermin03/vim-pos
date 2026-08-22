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
  /**
   * Estación que prepara esta comanda ("Barra", "Cocina"). Se imprime en el encabezado.
   *
   * Cuando un pedido se parte en dos papeles, cada uno lleva solo lo suyo: sin el rótulo, quien
   * lo levanta no sabe si le falta algo o si el resto salió en otra impresora.
   */
  area?: string | null;
  /** true si el pedido ya estaba en cocina y esto es un agregado posterior. */
  esAgregado?: boolean;
  /**
   * true si esta comanda anuncia productos CANCELADOS, no productos a preparar.
   *
   * Es la distinción más peligrosa del papel: si la cocina la lee como una comanda normal,
   * prepara justo lo que se acaba de cancelar. Por eso el aviso va invertido, a tamaño máximo y
   * antes que nada, y cada renglón lleva su propia marca.
   */
  esCancelacion?: boolean;
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
  if (d.esCancelacion) {
    // Lo primero que se ve al arrancar el papel, sin depender de que alguien lea más abajo.
    b.push({ t: "texto", valor: "CANCELADO", align: "centro", size: 3, bold: true, invertido: true });
    b.push({ t: "texto", valor: "NO PREPARAR", align: "centro", size: 3, bold: true, invertido: true });
    b.push({ t: "texto", valor: d.modoServicio.toUpperCase(), align: "centro", size: 1, bold: true });
  } else {
    b.push({ t: "texto", valor: d.modoServicio.toUpperCase(), align: "centro", size: 3, bold: true, invertido: true });
  }
  // Estación, debajo del modo de servicio: el papel se levanta de la impresora sin más contexto.
  if (d.area) b.push({ t: "texto", valor: d.area.toUpperCase(), align: "centro", size: 2, bold: true });
  // Sin este aviso la cocina no distingue una comanda nueva de un agregado y vuelve a preparar
  // el pedido entero. Va pegado al encabezado, antes que cualquier producto.
  if (d.esAgregado && !d.esCancelacion) b.push({ t: "texto", valor: "*** AGREGADO A LA ORDEN ***", align: "centro", size: 2, bold: true });
  b.push({ t: "separador", estilo: "punteado" });

  b.push({ t: "fila", izq: "Orden", der: `#${folioCorto}`, bold: true });
  b.push({ t: "fila", izq: "Hora", der: hora });
  if (d.cliente) b.push({ t: "fila", izq: "Cliente", der: d.cliente, bold: true });
  b.push({ t: "separador", estilo: "punteado" });

  for (const l of d.lineas) {
    // El prefijo por renglón evita el peor caso: que el papel se corte o se lea a medias y la
    // cocina tome la lista por un pedido nuevo.
    const marca = d.esCancelacion ? "CANCELA " : "";
    b.push({ t: "texto", valor: `${marca}${l.cantidad}x ${l.nombre}`, size: 2, bold: true });
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

/**
 * ¿Debe salir la comanda de cocina al COBRAR?
 *
 * Solo en "Para llevar". Es el único modo cuyo pedido va del carrito al cobro sin pasar por
 * "Enviar a cocina", así que si la comanda no sale en ese momento, la cocina no se entera nunca.
 *
 * Comedor (`COMER_AQUI` y `MESA`), Pick-up (`DRIVE_THRU`) y Domicilio (`DELIVERY_PROPIO`) ya
 * mandaron su comanda al enviar el pedido. Repetirla al cobrar le entregaba a la cocina el mismo
 * pedido dos veces, con el riesgo de que se prepare otra vez.
 *
 * La segunda condición es de hardware: si la cocina no tiene impresora propia, la comanda saldría
 * por la de caja, justo detrás del ticket que acaba de imprimirse. Sería papel duplicado, no aviso.
 */
export function debeImprimirComandaAlCobrar(modo: string, hayEstacionDedicada: boolean): boolean {
  return modo === "PARA_LLEVAR" && hayEstacionDedicada;
}

/** Un renglón con la estación que lo prepara (lo mínimo que hace falta para repartir el papel). */
export type LineaConArea = LineaComanda & { areaId?: string | null; areaNombre?: string | null };

/** Un grupo de renglones que van juntos a la misma impresora. */
export type GrupoComanda = { areaId: string | null; areaNombre: string | null; lineas: LineaComanda[] };

/**
 * Reparte los renglones de un pedido por estación de preparación.
 *
 * Las bebidas salían en el mismo papel que la comida y la barra tenía que leer la comanda entera
 * para encontrar lo suyo. Cada grupo se imprime después en la impresora de su estación.
 *
 * Devuelve UN SOLO grupo (sin área) cuando ningún producto tiene estación asignada, que es el caso
 * de un negocio que no ha configurado nada: mismo papel de siempre, sin rótulo de más.
 *
 * El orden de los renglones se conserva dentro de cada grupo, y los grupos salen en el orden en
 * que aparece su primer producto: así el papel se lee en el orden en que se capturó el pedido.
 */
export function agruparComandaPorArea(lineas: LineaConArea[]): GrupoComanda[] {
  const sinArea = lineas.every((l) => !l.areaId);
  if (sinArea) return [{ areaId: null, areaNombre: null, lineas: lineas.map(limpiar) }];

  const grupos = new Map<string, GrupoComanda>();
  for (const l of lineas) {
    const clave = l.areaId ?? "__sin_area__";
    const g = grupos.get(clave);
    if (g) g.lineas.push(limpiar(l));
    else grupos.set(clave, { areaId: l.areaId ?? null, areaNombre: l.areaNombre ?? null, lineas: [limpiar(l)] });
  }
  return [...grupos.values()];
}

function limpiar(l: LineaConArea): LineaComanda {
  return { cantidad: l.cantidad, nombre: l.nombre, modificadores: l.modificadores, notaCocina: l.notaCocina };
}
