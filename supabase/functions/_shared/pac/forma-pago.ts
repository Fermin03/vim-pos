// Forma de pago SAT (c_FormaPago) de un ticket que se pagó en línea en la tienda (Mercado Pago).
// Es el ÚNICO sitio donde se decide. La autofactura mandaba siempre «01» (efectivo); para un pago
// en línea eso es falso.

/** Lo que Mercado Pago dice que se usó (`payment_type_id`, guardado en `tienda_pagos.tipo_tarjeta`). */
export type TipoDePagoEnLinea = string | null | undefined;

// ponytail: FALTA CONFIRMACIÓN DE CONTADOR. Cuando el pago no fue con tarjeta de crédito ni de
// débito (saldo de Mercado Pago, tarjeta de prepago) o no se sabe con qué fue, se manda «31
// Intermediario de pagos»: el cobro lo hizo Mercado Pago y eso es lo único que se puede afirmar.
// No se manda «01» (no fue efectivo) ni «99» (no vale con método PUE). Si el contador dice otra
// clave, se cambia aquí y en ningún otro lado.
export const FORMA_EN_LINEA_POR_OMISION = "31";

export function formaPagoEnLinea(tipo: TipoDePagoEnLinea): string {
  if (tipo === "credit_card") return "04";
  if (tipo === "debit_card") return "28";
  return FORMA_EN_LINEA_POR_OMISION;
}

/** La forma de pago de la autofactura: la de siempre, salvo que el ticket se haya pagado en línea. */
export function formaPagoDeAutofactura(pagadoEnLinea: boolean, tipo: TipoDePagoEnLinea): string {
  return pagadoEnLinea ? formaPagoEnLinea(tipo) : "01";
}
