// Unidad de venta de un producto (columna productos.tipo_venta). La unidad SAT la deriva la base.
export const TIPOS_VENTA = ["UNIDAD", "PESO", "LONGITUD", "VOLUMEN"] as const;
export type TipoVenta = (typeof TIPOS_VENTA)[number];

export const UNIDADES: Record<TipoVenta, { opcion: string; abrev: string; precio: string; csv: string }> = {
  UNIDAD: { opcion: "Pieza", abrev: "pz", precio: "Precio", csv: "pieza" },
  PESO: { opcion: "Kilo", abrev: "kg", precio: "Precio por kilo", csv: "kg" },
  LONGITUD: { opcion: "Metro", abrev: "m", precio: "Precio por metro", csv: "m" },
  VOLUMEN: { opcion: "Litro", abrev: "l", precio: "Precio por litro", csv: "l" },
};

/** «1.5 kg»: la cantidad con la abreviatura de la unidad del producto (sin tipo = pieza). */
export const conUnidad = (cantidad: string, tipo: TipoVenta | null | undefined): string => `${cantidad} ${UNIDADES[tipo ?? "UNIDAD"].abrev}`;

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Lo que admite la columna «Unidad» del CSV (pieza|kg|m|l, como el RPC); "" = no se dijo; null = inválida. */
export function tipoDeUnidadCsv(texto: string): TipoVenta | "" | null {
  const t = sinAcentos(texto);
  if (!t) return "";
  return TIPOS_VENTA.find((k) => UNIDADES[k].csv === t) ?? null;
}
