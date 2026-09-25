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
//
// Sep 2026: la lista se mudó a `@vim/db/modos-servicio` para que la caja, la cocina y el panel
// digan lo mismo (aquí decía "Drive-thru" y "Comer aquí" donde la caja dice "Pick-up" y
// "Comedor"). Este archivo se queda como reexportación para no tocar los imports.
export { etiquetaModo, type ModoServicio } from "@vim/db/modos-servicio";
