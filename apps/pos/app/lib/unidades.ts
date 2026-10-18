import { TIPOS_VENTA, UNIDADES_VENTA, type TipoVenta } from "@vim/db/operacion";

export type { TipoVenta };

/** La unidad con que se vende un producto. Sin tipo (un producto de antes, la caché vieja) es pieza. */
export const unidadDeVenta = (t: TipoVenta | null | undefined) => UNIDADES_VENTA[t ?? "UNIDAD"];

/** Desde la clave SAT del renglón. Lo que no tiene unidad (E48 de los restaurantes, o nada) se ve como pieza. */
export const unidadDesdeSat = (clave: string | null) => unidadDeVenta(TIPOS_VENTA.find((t) => UNIDADES_VENTA[t].sat === clave));

/** Kilo, metro o litro: se pide la cantidad y cada pesada es su propio renglón. */
export const aGranel = (t: TipoVenta | null | undefined): boolean => !!t && t !== "UNIDAD";

/** «1.250 kg», «7.50 m»; una pieza, el número solo («2»). */
export function fmtCantidad(cantidad: number, t: TipoVenta | null | undefined): string {
  if (!aGranel(t)) return String(cantidad);
  const u = unidadDeVenta(t);
  return `${cantidad.toFixed(u.decimales)} ${u.abrev}`;
}

/** «$28.00/kg». Una pieza, el precio como siempre. */
export const precioConUnidad = (precio: string, t: TipoVenta | null | undefined): string =>
  aGranel(t) ? `${precio}/${unidadDeVenta(t).abrev}` : precio;
