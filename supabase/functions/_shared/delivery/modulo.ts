// Guard del módulo de apps de delivery para `delivery-accion` (spec 2026-09-11, add-on).
//
// POR QUÉ EXISTE, Y TARDE. La entrega del add-on puso el guard en tres funciones —el webhook, el
// espejo y la de conexión— y se dejó fuera esta cuarta, que resultó ser la que más habla con Uber:
// la pantalla "Pedidos de apps" del POS le pregunta por el estado de la tienda CADA 60 s
// (`REFRESCO_TIENDA_MS`). Con el módulo apagado eso seguía saliendo a Uber una vez por minuto —
// justo la carga que la entrega venía a quitar. Se descubrió el 13 sep 2026 probando en
// producción: 56 de los últimos 60 eventos de salida eran ese sondeo, y siguieron entrando después
// de apagar el módulo.
//
// Esconder la pantalla en el POS no basta: eso depende de que el cliente esté actualizado y de que
// nadie tenga una pestaña vieja abierta. La puerta se cierra donde se cobra el trabajo, que es en
// la función.

/**
 * Acciones de TIENDA (spec A6): estado, pausa, reanudación y tiempo de preparación de la tienda de
 * Uber de una sucursal. Van por sucursal, no por pedido. La lista vive aquí y no en el handler
 * para que el guard y el despacho no puedan discrepar.
 */
export const ACCIONES_TIENDA = ["tienda_estado", "tienda_pausar", "tienda_reanudar", "tienda_prep"];

/**
 * ¿Esta acción necesita el módulo?
 *
 * Solo las de tienda. Las de PEDIDO (aceptar, rechazar, listo, reclamar…) quedan fuera a
 * propósito, por la misma razón que `desconectar` en `delivery-uber-conexion`: a un cliente al que
 * se le retira el módulo con pedidos vivos hay que dejarlo despachar comida que el cliente final
 * ya pagó. Pedidos NUEVOS no entran —el webhook los descarta antes de pedírselos a Uber—, así que
 * lo único que esta puerta abierta permite es terminar lo empezado.
 */
export function accionExigeModulo(accion: string | undefined): boolean {
  return ACCIONES_TIENDA.includes(String(accion ?? ""));
}

/**
 * Lee `efectivos.delivery_apps` de lo que devuelve el RPC `modulos_efectivos`.
 *
 * `efectivos`, no `permitidos`: la asimetría de ADR 0014 dice que el admin se guía por lo que VIM
 * concedió (para poder enseñar el interruptor apagado) y el POS y la caja, por lo que además el
 * dueño encendió.
 *
 * Fail-closed: si el RPC falla o no devuelve fila, supabase-js deja `data` en null y esto responde
 * `false`. Dejar pasar por un error de lectura sería servir gratis justo lo que se quiere cobrar.
 */
export function moduloDeliveryActivo(mod: unknown): boolean {
  const efectivos = (mod as { efectivos?: Record<string, boolean> } | null | undefined)?.efectivos;
  return efectivos?.delivery_apps === true;
}
