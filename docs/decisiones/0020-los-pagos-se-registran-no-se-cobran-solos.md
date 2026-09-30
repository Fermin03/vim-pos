# 0020 — Los pagos a VIM se registran; el cobro automático viene después

**Fecha:** 2026-09-30 · **Estado:** vigente

## Qué había

`suscripciones` (0002) guarda el precio acordado y la `proxima_fecha_cobro`, y el panel alertaba
"cobro vencido". Pero no había dónde asentar un pago: para decir "ya pagó" se movía la fecha a mano,
sin rastro de cuánto, cómo ni quién. Y el dueño del negocio no veía nada de su contrato.

El backlog pedía "billing con Stripe" (F22). Stripe exige una cuenta a nombre de VIM, con sus
llaves y su webhook: no se puede montar ni probar sin esa cuenta, y los pilotos pagan hoy por
transferencia.

## Qué hacemos

**Un libro de pagos, y la fecha de cobro la mueve la base.** La migración `0130_pagos_suscripcion.sql`:

- `pagos_suscripcion`: cada pago con monto, método, referencia, fecha y el **periodo que cubre**.
  No se borra: un pago equivocado se anula con motivo y queda tachado.
- `registrar_pago_suscripcion`: asienta el pago y recorre `proxima_fecha_cobro` en la misma
  transacción, con la suscripción bloqueada. El periodo lo calcula la base desde la fecha que
  tocaba cobrar y el ciclo (mensual o anual), no quien captura: dos pagos no pueden cubrir el
  mismo mes. La fecha siguiente se cuenta desde el día de alta, así que una suscripción del 31 de
  enero cobra el 28 de febrero y el 31 de marzo, no el 28 para siempre.
- `anular_pago_suscripcion`: solo el último pago vigente, y regresa la fecha.
- Las dos RPC son solo de service_role (0003 las vigila). El dueño y los administradores del
  negocio LEEN sus pagos por RLS; un cajero no.

El panel registra y anula desde la ficha del cliente (Contrato → Pagos), a nombre del operador que
entró (ADR 0019). El admin del negocio muestra **Configuración → Plan y pagos**: el plan, si va al
corriente y el historial. "Al corriente / toca pagar / vencido" sale de `@vim/db/cobro`, el mismo
cálculo en las dos apps.

## Qué NO hace, todavía

- **Cobrar con tarjeta.** Cuando haya cuenta de Stripe, su webhook escribe en esta misma tabla
  (`metodo = 'TARJETA'`) llamando a `registrar_pago_suscripcion`: no hay que rehacer nada de lo de
  arriba.
- **Suspender solo.** Un pago vencido no bloquea la caja por sí mismo: la suspensión sigue siendo
  una decisión con motivo y días de gracia en el panel (ADR 0014). Cortarle la venta a un
  restaurante por un retraso de un día no es algo que deba decidir un cron.
- **Facturarle a VIM sus mensualidades** (el CFDI de VIM a sus clientes). Va aparte.
