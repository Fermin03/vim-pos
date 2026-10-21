// Combos que la tienda en línea no puede vender. Lógica pura; la lectura vive en tienda.ts.

export type ComboParaRevisar = {
  nombre: string;
  slots: { nombre: string; obligatorio: boolean; opciones: { productoId: string; nombre: string }[] }[];
};

/** Un producto que dos pasos obligatorios del mismo combo tienen como única opción. */
export type ComboNoComprable = { combo: string; producto: string; pasos: string[] };

/**
 * La tienda rechaza el mismo producto elegido dos veces en un combo (0162, COMBO_INVALIDO). Si dos
 * pasos obligatorios solo admiten ese mismo producto, nadie puede completar el combo. En la caja no
 * pasa: ahí sí se puede repetir. Solo detecta ese caso (un paso con una única opción); no calcula
 * si, en general, alcanzan productos distintos para llenar todos los pasos.
 */
export function combosNoComprables(combos: ComboParaRevisar[]): ComboNoComprable[] {
  return combos.flatMap((c) => {
    const porProducto = new Map<string, { nombre: string; pasos: string[] }>();
    for (const s of c.slots) {
      const unica = s.opciones.length === 1 ? s.opciones[0] : undefined;
      if (!s.obligatorio || !unica) continue;
      const previo = porProducto.get(unica.productoId) ?? { nombre: unica.nombre, pasos: [] };
      previo.pasos.push(s.nombre);
      porProducto.set(unica.productoId, previo);
    }
    return [...porProducto.values()].filter((p) => p.pasos.length >= 2).map((p) => ({ combo: c.nombre, producto: p.nombre, pasos: p.pasos }));
  });
}
