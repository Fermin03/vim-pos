// Puerta del espejo de pedidos de apps: si el módulo de delivery está encendido de verdad.
//
// Vive fuera de main.mjs (igual que directivas.mjs y delivery-espejo-ritmo.mjs) para poder
// probarse sin Electron. Es la pieza que hace desaparecer la carga: hoy la caja arranca el
// espejo para TODA caja vinculada a la nube, use o no el cliente delivery. Con esto, solo
// arranca cuando el latido dice que el módulo está encendido.

/**
 * ¿Esta caja debe sondear pedidos de apps?
 *
 * Solo si el latido dice que el módulo está encendido. Sin directivas guardadas todavía NO
 * arranca: es un cliente que puede no tener delivery, y arrancar "por si acaso" es exactamente
 * el sondeo que esta entrega vino a quitar. El primer latido decide, y llega en minutos.
 *
 * Ojo con el invariante de ADR 0014: la falta de datos no bloquea la VENTA. Aquí no se bloquea
 * nada de vender; lo único que no se hace es preguntar por pedidos de apps.
 */
export function debeSondearApps(directivas) {
  return directivas?.modulos?.delivery_apps === true;
}
