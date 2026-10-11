// Reglas puras del pago en línea de la tienda en el admin: qué cuenta de Mercado Pago cobra en cada
// sucursal, cuándo hay que avisar y cómo se le dice al dueño el estado de un pago. Sin supabase ni
// efectos. Quien decide de verdad es la base (`tienda_conexion_cobro`, 0172); esto solo lo enseña.
//
// TEXTOS PROVISIONALES: todo lo que aquí lee el dueño lo revisa James antes de publicar.
import type { Caja } from "./configuracion";
import { versionMenor } from "./menu-sucursal";
import type { ConexionTerminal } from "./terminal";
import type { SucursalTienda } from "./tienda-reglas";

type Cuenta = Pick<ConexionTerminal, "id" | "cuenta_nombre" | "estado">;
type Sucursal = Pick<SucursalTienda, "nombre" | "participa" | "conexionId">;

/** La primera versión de la caja instalada que atiende un pedido ya pagado. La misma de `_tienda_caja_en_linea_viva` (0172): si cambia allá, cambia aquí. */
export const CAJA_CON_PAGO_EN_LINEA = "0.9.0";

/**
 * Las sucursales que venden en la tienda donde el pago en línea no aparece porque su caja instalada
 * no está actualizada: tienen cajas en uso (activas, con latido) y ninguna llega a la versión.
 * Una sucursal sin caja instalada (solo POS web) no sale: ahí no hay nada que actualizar.
 * ponytail: mira «alguna vez mandó latido», como el aviso de menús; la base mira los últimos 90 s.
 */
export function sucursalesConCajaSinActualizar(
  sucursales: Pick<SucursalTienda, "id" | "nombre" | "participa">[],
  cajas: Pick<Caja, "sucursal_id" | "activa" | "ultimoLatido" | "versionApp">[],
): string[] {
  return sucursales.filter((s) => {
    const enUso = cajas.filter((c) => c.sucursal_id === s.id && c.activa && c.ultimoLatido !== null);
    return s.participa && enUso.length > 0 && enUso.every((c) => c.versionApp === null || versionMenor(c.versionApp, CAJA_CON_PAGO_EN_LINEA));
  }).map((s) => s.nombre);
}

export const cuentasActivas = <C extends Cuenta>(cuentas: C[]): C[] => cuentas.filter((c) => c.estado === "ACTIVA");

/**
 * Las cuentas como las ve la tienda en línea. Una cuenta conectada antes de que se guardara su
 * public key sirve para la terminal, pero no para cobrar en línea (sin esa clave la tienda no puede
 * leer la tarjeta): aquí cuenta como «hay que volver a conectarla», que es justo lo que la arregla.
 */
export const cuentasParaLaTienda = <C extends Cuenta & { public_key?: string | null }>(cuentas: C[]): C[] =>
  cuentas.map((c) => (c.estado === "ACTIVA" && !c.public_key ? { ...c, estado: "ERROR" as const } : c));

export const nombreDeCuenta = (c: Pick<Cuenta, "cuenta_nombre">): string => c.cuenta_nombre ?? "Cuenta de Mercado Pago";

/**
 * La cuenta que cobra en una sucursal, igual que `tienda_conexion_cobro`: la elegida si sigue
 * activa; sin elegir, la única activa. Con varias y sin elegir, ninguna (no se adivina a quién le
 * cae el dinero); si la elegida dejó de servir tampoco se usa otra.
 */
export function cuentaQueCobra<C extends Cuenta>(cuentas: C[], elegida: string | null): C | null {
  const vivas = cuentasActivas(cuentas);
  if (elegida) return vivas.find((c) => c.id === elegida) ?? null;
  return vivas.length === 1 ? vivas[0]! : null;
}

/** ¿Hay que enseñar el selector por sucursal? Con varias cuentas, o si alguna sucursal apunta a otra que la única. */
export function hayQueElegir(cuentas: Cuenta[], sucursales: Sucursal[]): boolean {
  const vivas = cuentasActivas(cuentas);
  if (vivas.length > 1) return true;
  return vivas.length === 1 && sucursales.some((s) => s.participa && s.conexionId !== null && s.conexionId !== vivas[0]!.id);
}

/**
 * Lo que se avisa arriba de la página cuando el dueño ofrece pago en línea y la tienda no lo está
 * ofreciendo: en todo el negocio (`sucursales` vacío) o solo en las sucursales nombradas.
 */
export type AvisoCobro = { tipo: "RECONECTAR" | "CONECTAR" | "ELEGIR"; sucursales: string[] };

export function avisoDeCobro(pagoEnLinea: boolean, cuentas: Cuenta[], sucursales: Sucursal[]): AvisoCobro | null {
  if (!pagoEnLinea) return null;
  // Las desconectadas no se leen: sin ninguna en la lista, la cuenta se desconectó (o nunca hubo).
  if (cuentasActivas(cuentas).length === 0) return { tipo: cuentas.length > 0 ? "RECONECTAR" : "CONECTAR", sucursales: [] };
  const sin = sucursales.filter((s) => s.participa && !cuentaQueCobra(cuentas, s.conexionId));
  if (sin.length === 0) return null;
  const enError = sin.filter((s) => cuentas.some((c) => c.id === s.conexionId && c.estado === "ERROR"));
  return enError.length > 0
    ? { tipo: "RECONECTAR", sucursales: enError.map((s) => s.nombre) }
    : { tipo: "ELEGIR", sucursales: sin.map((s) => s.nombre) };
}

export const lista = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export function textoDeAviso(a: AvisoCobro): string {
  const donde = a.sucursales.length > 0 ? `En ${lista(a.sucursales)} tu` : "Tu";
  const inicio = `${donde} tienda no está ofreciendo el pago en línea`;
  if (a.tipo === "CONECTAR") return `${inicio}: ya no hay una cuenta de Mercado Pago conectada. Conéctala para que tus clientes puedan volver a pagar en línea.`;
  if (a.tipo === "RECONECTAR") return `${inicio}: Mercado Pago pide volver a conectar tu cuenta. Reconéctala para que tus clientes puedan volver a pagar en línea.`;
  return `${inicio}: falta elegir qué cuenta de Mercado Pago cobra ahí. Elígela abajo, en «Pago en línea».`;
}

/** El estado de un pago en palabras del dueño. Lo que no se cobró (sin pagar, rechazado o vencido) es «No completado». */
export function estadoDePago(estado: string): "Pagado" | "Devuelto" | "Devolución en proceso" | "No completado" {
  if (estado === "APROBADO") return "Pagado";
  if (estado === "DEVUELTO") return "Devuelto";
  if (estado === "POR_DEVOLVER" || estado === "DEVOLUCION_FALLIDA") return "Devolución en proceso";
  return "No completado";
}
