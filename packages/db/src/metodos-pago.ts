/** Nombres legibles de los métodos de pago, para TODAS las apps.
 *
 * Había seis listas a mano (cierre, monitor de ventas, ticket impreso, conciliación, integraciones
 * y pedidos de apps) y no coincidían: "DiDi" en una, "DiDi Food" en otra; "Transferencia / SPEI" y
 * "Transferencia"; "App externa", "Otra" y "Otra app". El monitor de ventas buscaba `APP_UBER`
 * —que no existe— y los pagos de Uber Eats le salían como `APP_UBEREATS` (revisión de diseño,
 * sep 2026).
 *
 * Las apps de reparto se nombran igual que como modo de servicio (`ETIQUETA_MODO`): es la misma
 * app, y el cajero no tiene por qué ver dos nombres para ella. `Record<MetodoPago, …>` obliga a que
 * estén todos: un método nuevo en el enum no compila hasta tener nombre.
 */
import type { Database } from "./database.types";
import { ETIQUETA_MODO } from "./modos-servicio";

export type MetodoPago = Database["public"]["Enums"]["metodo_pago"];

export const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CREDITO: "Tarjeta de crédito",
  TARJETA_DEBITO: "Tarjeta de débito",
  TRANSFERENCIA: "Transferencia",
  VALES_DESPENSA: "Vales de despensa",
  CUPON: "Cupón",
  CUENTA_INTERNA: "Cuenta interna",
  APP_RAPPI: ETIQUETA_MODO.APP_RAPPI,
  APP_UBEREATS: ETIQUETA_MODO.APP_UBEREATS,
  APP_DIDI: ETIQUETA_MODO.APP_DIDI,
  APP_IFOOD: ETIQUETA_MODO.APP_IFOOD,
  APP_OTRO: ETIQUETA_MODO.APP_OTRO,
  PAGO_AL_RECIBIR: "Pago al recibir",
  OTRO: "Otro",
};

/** El nombre de un método de pago; si llega un valor que no está en el enum, se enseña tal cual. */
export function etiquetaMetodoPago(metodo: string): string {
  return (ETIQUETA_METODO_PAGO as Record<string, string>)[metodo] ?? metodo;
}

export type AppReparto = "APP_RAPPI" | "APP_UBEREATS" | "APP_DIDI" | "APP_IFOOD" | "APP_OTRO";

/** El nombre de una app de reparto: el mismo que como modo de servicio. */
export function etiquetaApp(app: AppReparto): string {
  return ETIQUETA_MODO[app];
}
