/** Nombres legibles de los modos de servicio, para los reportes del panel.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * El enum `modo_servicio` de la base tiene DOCE valores. Los reportes traían cada
 * uno su propia lista a mano: el de modo de servicio cubría tres y el de tiempos
 * de cocina cinco. El resto caía en un `?? f.modo` que imprime el valor crudo,
 * así que el dueño de un restaurante con Rappi veía literalmente `APP_RAPPI`
 * como título de una tarjeta, y uno con mesas habría visto `EVENTO_PRIVADO`.
 *
 * Dos listas parciales no se sostienen: cada vez que se añade un modo hay que
 * acordarse de tocar los dos archivos, y olvidarlo no rompe nada —solo saca un
 * nombre feo en producción, que es justo el tipo de fallo que nadie reporta.
 *
 * `Record<ModoServicio, string>` obliga a que estén los doce: si mañana se
 * agrega un valor al enum y se regeneran los tipos, esto deja de compilar y el
 * hueco aparece en el build, no en la pantalla de un cliente.
 */
import type { Database } from "@vim/db/types";

export type ModoServicio = Database["public"]["Enums"]["modo_servicio"];

const ETIQUETA: Record<ModoServicio, string> = {
  COMER_AQUI: "Comer aquí",
  MESA: "Mesa",
  BARRA: "Barra",
  PARA_LLEVAR: "Para llevar",
  DRIVE_THRU: "Drive-thru",
  DELIVERY_PROPIO: "Domicilio propio",
  APP_RAPPI: "Rappi",
  APP_UBEREATS: "Uber Eats",
  APP_DIDI: "DiDi Food",
  APP_IFOOD: "iFood",
  APP_OTRO: "Otra app",
  EVENTO_PRIVADO: "Evento privado",
};

/** Nombre legible de un modo. Acepta `string` porque las vistas SQL lo devuelven
 *  sin tipar; un valor desconocido se devuelve tal cual antes que romper la página. */
export function etiquetaModo(modo: string): string {
  return ETIQUETA[modo as ModoServicio] ?? modo;
}
