# 0040 — La reserva en línea usa la tienda

**Fecha:** 19 de octubre de 2026 · **Estado:** vigente (entrega 3 de 4 del giro de belleza)

## Qué había antes

La tienda en línea (ADR 0032) vendía comida: un pedido, un carrito, un pago. Un salón no tenía cómo
recibir reservas de sus clientas, y la agenda (ADR 0038) solo se alimentaba desde la caja.

## Qué hacemos ahora

- **Misma app, mismo slug.** Las reservas viven en `apps/tienda`, en `online.vimpos.com.mx/<negocio>`.
  Si el negocio tiene reservas activas, esa dirección enseña el sitio de reservas; si no, la tienda de
  siempre. No hay app ni dominio nuevos.
- **Un solo complemento, «En línea».** El add-on TIENDA cubre pedidos y reservas; el panel lo llama
  «En línea (tienda y reservas)». Precios y plan no cambian. El módulo `reservas` es efectivo solo con
  el add-on, el interruptor del negocio (`modulo_reservas_activo`) y la agenda en `operacion`.
- **RPC con negocio explícito, solo `service_role`.** Reservar, ver huecos, ver, mover y cancelar son
  funciones SQL que reciben el `tenant` y solo las llama la función `tienda`. El negocio sale del slug,
  nunca del navegador. Las internas (`_agenda_*`, `_reservas_*`) no se otorgan a nadie.
- **El pago de la cita vive en `tienda_pagos`.** Una fila apunta a `pedido_id` **o** a `cita_id`
  (un `CHECK` exige exactamente uno). Se reusan el cobro con Mercado Pago, el 3DS, el freno por riesgo,
  el webhook y el barrido.
- **El anticipo entra como `PAGO_EN_LINEA`, sin caja ni turno.** Es un anticipo de la cita (ADR 0039)
  con su pago enlazado. No suma al corte de ningún turno.
- **El lugar se aparta 15 minutos** (`citas.pago_hasta`). Un barrido cancela las citas sin pago
  vencidas (`cancelada_por = PAGO_VENCIDO`); un pago aprobado limpia el plazo.
- **Reembolso automático solo si cancela la clienta, en línea y a tiempo** (`cancelada_por =
  CLIENTA_EN_LINEA`, 24 h o más). Si la cancela la recepción, o la clienta lo hace tarde, lo decide la
  recepción con el diálogo de anticipo (devolver o retener).
- **Mercado Pago devuelve solo si el anticipo está entero:** todo el monto aprobado sigue vigente
  (ni aplicado ni devuelto en efectivo) y el pago está aprobado. Si no, lo vigente se devuelve en
  **efectivo desde la caja**, con permiso o PIN. Así nunca se devuelve dos veces.
- **Correos por cola**, como los de pedidos: confirmación, cambio, cancelación y recordatorio, con
  versión por cambio de hora. La función `tienda-correos` los envía; el enlace de la cita lleva un
  código del que solo se guarda el hash.
- **La clienta no tiene cuenta.** Nombre, celular (10 dígitos) y correo; queda en Clientes por su
  teléfono, igual que en la caja. Tope de 3 citas futuras por teléfono, 5 intentos de pago por cita y
  freno por teléfono.

## Por qué

Reusar la tienda evita un segundo cobro, un segundo antirrobot y un segundo dominio, y mantiene la
agenda como única dueña de los horarios: el candado de empalmes (ADR 0038) vale igual para la caja y la
web. Que las RPC reciban el negocio de forma explícita y solo las llame el servidor deja el aislamiento
entre negocios en el mismo lugar que ya usa la tienda. Limitar el reembolso automático al caso sin
ambigüedad evita devolver de más; todo lo demás pasa por una persona con permiso.

## Consecuencias

- **Belleza sale en un solo instalador con 0216–0226.** Una caja con 0222/0223 pero sin 0225 no ve el
  anticipo `PAGO_EN_LINEA` (el pull lo aísla por el `NOT NULL` de `turno_id` y el `CHECK` de método) y
  cobra la cita completa. La migración que libera los giros de belleza (entrega 4) corre solo después de
  publicar ese instalador, así que ningún salón existe con una caja sin 0225.

## Qué queda fuera

- Un reembolso que Mercado Pago no logra (`DEVOLUCION_FALLIDA`) se ve en el panel y se devuelve a mano;
  no hay botón de «resuelto».
- Los textos legales de la reserva son un borrador que Fermín debe revisar
  (`docs/legal/reservas-terminos-para-la-clienta.md`).

Spec: `docs/superpowers/specs/2026-10-18-giros-belleza-design.md`. Diseño: `docs/diseno/tienda.md`.
