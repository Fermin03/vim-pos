# Pago en línea en la tienda (Checkout Pro de Mercado Pago) — diseño

Aprobado por Fermín el 11 oct 2026. La API está resumida en [`01-resumen-api.md`](01-resumen-api.md);
la conexión de la cuenta del restaurante es la del cobro con terminal (ADR 0033, migración 0169).

## Qué se construye

El cliente de la tienda en línea puede pagar su pedido con tarjeta antes de enviarlo. Paga en la
página de Mercado Pago (Checkout Pro, Preferences API) y regresa a su seguimiento. El pedido llega a
la caja ya cobrado.

## Decisiones de producto (de Fermín)

| Tema | Decisión |
|---|---|
| A quién le llega el dinero | A la cuenta de Mercado Pago del restaurante, con su token OAuth. VIM no cobra comisión (`marketplace_fee` omitido). |
| Pedido rechazado o cancelado | El pago se devuelve completo, en automático. No hay devolución parcial. |
| Formas de pago de la tienda | El dueño elige en el admin: pago en línea, efectivo al recibir, tarjeta al recibir. Al menos una. |
| Medios dentro del checkout | Crédito, débito y dinero en cuenta. Sin OXXO, sin transferencia, sin meses. |
| Apple Pay y Google Pay | No se prometen: Checkout Pro en México no los documenta. Si el checkout los muestra solo, se informa. |
| En la caja | La cuenta nace cobrada con «Pago en línea». Botón **Listo** en lugar de Cobrar: cierra la cuenta y el cliente ve «Entregado». |
| Propina | Opcional al pagar: sin propina, 10 %, 15 %, 20 %, sobre los productos (sin envío). Entra al reparto de propinas del turno. |
| Pedido sin pagar | Se descarta a los 15 minutos, sin cobro y sin llegar a la caja. |

## Recorrido

1. **Pedir.** La tienda manda `pedir` con `pago: "EN_LINEA"` y `propina_pct`. La función valida como
   hoy, crea el pedido en estado nuevo **`POR_PAGAR`**, crea un renglón en `tienda_pagos` y una
   preferencia en Mercado Pago con el token del restaurante. Devuelve `init_point`.
2. **Pagar.** El navegador va a `init_point` (redirección simple, sin SDK). Al terminar, Mercado Pago
   lo regresa a la página de seguimiento del pedido (`back_urls` + `auto_return: approved`).
3. **Confirmar.** El aviso `payment` llega a la función pública `tienda-webhook-mp`, que valida la
   firma, consulta `GET /v1/payments/{id}` con el token del restaurante y comprueba referencia, monto
   y estado. Con `approved`, el pedido pasa a `RECIBIDO` y ahí empieza su ventana de aceptación.
   La página de seguimiento, mientras vea `POR_PAGAR`, pide a la función `tienda` que confirme: la
   función hace la misma consulta (respaldo si el aviso tarda o no llega). Nunca se confía en los
   parámetros de la URL de regreso.
4. **Atender.** La caja ve el pedido como hoy, marcado «PAGADO EN LÍNEA». Al aceptarlo se crea la
   cuenta con un pago `PAGO_EN_LINEA` por el total y la propina, ya cerrada para cobro.
5. **Listo.** El botón Listo marca el pedido `ENTREGADO` y saca la cuenta de la lista.
6. **Devolver.** Si un pedido con pago aprobado termina en `RECHAZADO`, `EXPIRADO` o `CANCELADO`
   (incluida la cancelación de la cuenta en la caja), su pago queda `POR_DEVOLVER` y un barrido lo
   reembolsa (`POST /v1/payments/{id}/refunds`, con `X-Idempotency-Key`) y reintenta hasta lograrlo.
   El seguimiento dice «Te devolvimos tu pago». Un reembolso que falla tres veces avisa por correo
   a `avisos@`.

`POR_PAGAR` es invisible para la caja, el POS web, el timbre y los contadores. Un `POR_PAGAR` de más
de 15 minutos pasa a `EXPIRADO` sin aviso; si el pago llega aprobado después de eso, se devuelve.

## Piezas

**Base (una migración, aditiva)**
- `delivery_pedidos`: estado `POR_PAGAR`; `pago_al_recibir` acepta `EN_LINEA`; `propina_mxn`.
- `tienda_config.pago_en_linea` (boolean) y, por sucursal de la tienda, `conexion_id` (cuál cuenta
  cobra; si el negocio tiene una sola conexión activa, esa).
- `tienda_pagos`: `id` (es la `external_reference`), pedido, negocio, conexión, monto, propina,
  `preferencia_id`, `pago_id_externo`, tipo y marca de tarjeta, estado (`CREADO`, `APROBADO`,
  `RECHAZADO`, `VENCIDO`, `POR_DEVOLVER`, `DEVUELTO`, `DEVOLUCION_FALLIDA`), intentos y último error.
  Solo la escriben las funciones; el admin la lee.
- `metodo_pago`: valor nuevo `PAGO_EN_LINEA`.
- Las funciones SQL de aceptar pedido crean el pago del ticket cuando el pedido viene pagado.

**Funciones**
- `_shared/tienda/pago-mp.ts`: armar la preferencia, leer un pago, decidir estado, pedir reembolso.
  Puro y con pruebas; reutiliza `firmaValida` de `_shared/terminal/mercado-pago.ts`.
- `tienda`: `pedir` con pago en línea; acción `confirmar_pago`; el seguimiento expone el estado del pago.
- `tienda-webhook-mp` (pública, sin JWT): avisos `payment`.
- Barrido de devoluciones y de vencidos, cada minuto.
- `delivery-accion`: el estado `ENTREGADO` que manda el botón Listo.

**Tienda (`apps/tienda`)**: opción «Pagar en línea», propina, botón «Pagar», estado «Esperando tu
pago» con reintento, «Pago rechazado, intenta de nuevo o elige otra forma», y los textos de devolución.

**Admin**: tres casillas en Tienda en línea → Formas de pago; «Pago en línea» lleva a conectar la
cuenta de Mercado Pago si no hay ninguna, y deja elegir cuenta por sucursal si hay varias.

**Caja y POS**: insignia «PAGADO EN LÍNEA» en aviso, lista, detalle, comanda y ticket; botón Listo;
renglón «Pago en línea» en el corte; el agente de la caja crea la cuenta ya cobrada. Instalador 0.9.0.

Diseño de pantallas: dentro del design system (`docs/diseno/nucleo.md`, tokens), con las skills de
Emil Kowalski cargadas antes de escribir estilos.

## Seguridad

- El token del restaurante no sale de las funciones (Vault, como en 0169).
- El monto de la preferencia lo calcula el servidor; el aviso se cruza contra `tienda_pagos` (monto,
  referencia y cuenta vendedora) antes de mover el pedido.
- Aviso sin firma válida: 401 y rastro con tope por hora, igual que el de la terminal.
- Aplicar dos veces el mismo aviso deja lo mismo. El reembolso lleva llave de idempotencia fija por pago.

## Prueba corta antes de construir

La documentación no confirma estos puntos; se prueban con la cuenta de prueba y, si alguno falla,
se le avisa a Fermín antes de seguir:

1. El token OAuth que ya tenemos crea una preferencia sin cambios en la aplicación.
2. La exclusión deja solo crédito, débito y dinero en cuenta (sin OXXO, SPEI, meses ni vales).
3. El aviso `payment` llega a `notification_url` con `x-signature`, o hay que usar la URL de la aplicación.
4. Consultar y reembolsar con el token del vendedor.
5. Basta redirigir a `init_point`.

## Entregas

1. Servidor: migración, preferencia, aviso, confirmación, devoluciones.
2. Tienda: pagar, propina, regreso, seguimiento.
3. Admin: formas de pago y cuenta.
4. Caja y POS: cuenta cobrada, Listo, corte; instalador 0.9.0.

Se prueba en VIM Pruebas con la cuenta de prueba y se cierra con un cobro real pequeño en Knockout, devuelto.

## Pendiente de decidir o de otra sesión

- **Renovar el token del restaurante** (vence a 180 días): lo construye la sesión de la terminal; el
  pago en línea depende de eso antes de los 180 días de la primera conexión.
- **Forma de pago del CFDI** para un pago en línea con saldo de Mercado Pago: crédito va como 04 y
  débito como 28; el saldo en cuenta hay que confirmarlo con contador.
- **IVA de la comisión** de Mercado Pago (3.49 % + $4, dinero al instante): no está confirmado.
