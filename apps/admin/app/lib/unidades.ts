import { TIPOS_VENTA, UNIDADES_VENTA, type TipoVenta } from "@vim/db/operacion";

// La tabla de unidades es la de la caja (@vim/db/operacion); aquí, solo lo que enseña el admin.
export { TIPOS_VENTA, type TipoVenta };

export const UNIDADES: Record<TipoVenta, { opcion: string; precio: string; csv: string }> = {
  UNIDAD: { opcion: "Pieza", precio: "Precio", csv: "pieza" },
  PESO: { opcion: "Kilo", precio: "Precio por kilo", csv: "kg" },
  LONGITUD: { opcion: "Metro", precio: "Precio por metro", csv: "m" },
  VOLUMEN: { opcion: "Litro", precio: "Precio por litro", csv: "l" },
};

/** «1.5 kg»: la cantidad con la abreviatura de la unidad del producto (sin tipo = pieza). */
export const conUnidad = (cantidad: string, tipo: TipoVenta | null | undefined): string => `${cantidad} ${UNIDADES_VENTA[tipo ?? "UNIDAD"].abrev}`;

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Lo que admite la columna «Unidad» del CSV (pieza|kg|m|l, como el RPC); "" = no se dijo; null = inválida. */
export function tipoDeUnidadCsv(texto: string): TipoVenta | "" | null {
  const t = sinAcentos(texto);
  if (!t) return "";
  return TIPOS_VENTA.find((k) => UNIDADES[k].csv === t) ?? null;
}
