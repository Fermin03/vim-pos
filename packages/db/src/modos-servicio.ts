/** Nombres legibles de los modos de servicio, para TODAS las apps.
 *
 * Había siete listas a mano (caja, KDS, ticket impreso, cierre, consulta de cuentas, monitor y
 * los reportes del admin), casi todas con 4 de los 12 valores del enum. El resto caía en el valor
 * crudo: la cocina leía `APP_UBEREATS` y el monitor de ventas `APP_RAPPI`. Y cuando sí traían el
 * nombre no coincidían: el admin decía "Drive-thru" donde la caja decía "Pick-up" (revisión de
 * diseño, sep 2026).
 *
 * El vocabulario es el de la caja, que es el que el personal ya conoce. `Record<ModoServicio, …>`
 * obliga a que estén los doce: un modo nuevo en el enum no compila hasta tener nombre.
 */
import type { Database } from "./database.types";

export type ModoServicio = Database["public"]["Enums"]["modo_servicio"];

export const ETIQUETA_MODO: Record<ModoServicio, string> = {
  COMER_AQUI: "Comedor",
  MESA: "Mesa",
  BARRA: "Barra",
  PARA_LLEVAR: "Para llevar",
  DRIVE_THRU: "Pick-up",
  DELIVERY_PROPIO: "Domicilio",
  APP_RAPPI: "Rappi",
  APP_UBEREATS: "Uber Eats",
  APP_DIDI: "DiDi Food",
  APP_IFOOD: "iFood",
  APP_OTRO: "Otra app",
  EVENTO_PRIVADO: "Evento privado",
};

/** Nombre legible de un modo. Acepta `string` porque las vistas SQL y los select anidados lo
 *  devuelven sin tipar; un valor que no existe se devuelve tal cual antes que romper la pantalla. */
export function etiquetaModo(modo: string): string {
  return ETIQUETA_MODO[modo as ModoServicio] ?? modo;
}
