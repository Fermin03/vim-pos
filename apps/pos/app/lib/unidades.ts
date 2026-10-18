import { TIPOS_VENTA, UNIDADES_VENTA, type TipoVenta } from "@vim/db/operacion";

export type { TipoVenta };

/** La unidad con que se vende un producto. Sin tipo (un producto de antes, la caché vieja) es pieza. */
export const unidadDeVenta = (t: TipoVenta | null | undefined) => UNIDADES_VENTA[t ?? "UNIDAD"];

/** El tipo desde la clave SAT del renglón (`unidad_sat_snapshot`). E48 de los restaurantes, o nada: undefined (pieza). */
export const tipoDesdeSat = (clave: string | null | undefined): TipoVenta | undefined => TIPOS_VENTA.find((t) => UNIDADES_VENTA[t].sat === clave);

/** Desde la clave SAT del renglón. Lo que no tiene unidad (E48 de los restaurantes, o nada) se ve como pieza. */
export const unidadDesdeSat = (clave: string | null) => unidadDeVenta(tipoDesdeSat(clave));

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

/** La cantidad al frente de un renglón: «2×» como siempre; a granel, «1.250 kg». */
export const cantidadRenglon = (cantidad: number, t: TipoVenta | null | undefined): string =>
  aGranel(t) ? fmtCantidad(cantidad, t) : `${cantidad}×`;

/** «N productos»: cada pesada cuenta 1 (1.25 kg no son 1.25 productos); las piezas suman su cantidad. */
export const contarProductos = (lineas: { cantidad: number; tipo: TipoVenta | null | undefined }[]): number =>
  lineas.reduce((s, l) => s + (aGranel(l.tipo) ? 1 : l.cantidad), 0);
