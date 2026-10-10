# Preguntas abiertas y siguientes pasos

Las decisiones generales del cobro con terminal ya están tomadas (8 oct 2026) y valen también
para Clip: ver [`../mercado-pago-point/03-preguntas-abiertas-y-siguientes-pasos.md`](../mercado-pago-point/03-preguntas-abiertas-y-siguientes-pasos.md) §B.
Aquí va solo lo propio de Clip.

## A. Trámites que solo el dueño puede iniciar

A diferencia de Mercado Pago, aquí **sí hay algo que depende de un tercero** y conviene adelantarlo.

1. **Conseguir un lector compatible:** Total 3, Ultra, Clip PinPad o Clip Stand 2. Sin lector no
   se puede probar nada: no existe ambiente de pruebas.
2. **Cuenta Clip de VIM con identidad verificada** (KYC desde la app de Clip, con INE y selfie).
   Es condición para usar las API. Propuesta: abrirla con `integraciones@vimpos.com.mx`.
3. **Pedir a Clip la app PinPad:** correo a `sdk@payclip.com` con el número de serie del lector.
   Aprovechar ese mismo correo para preguntar todo lo de la sección C que no requiere lector, y:
   - cuánto tardan en instalarla y si se puede pedir por lote cuando haya varios restaurantes;
   - si hay un esquema para integradores (una sola credencial de VIM operando cuentas de
     comercios) o si la única vía es que cada comercio pegue su clave;
   - si los avisos se pueden firmar o al menos restringir por IP de origen.
4. **Crear la credencial** en el panel de desarrollador de Clip y guardarla en el gestor de
   contraseñas. La clave secreta solo se muestra una vez.
5. Saber qué restaurantes (clientes o prospectos) cobran hoy con Clip y con qué modelo de lector:
   muchos tienen modelos viejos que **no** son compatibles.

## B. Decisiones de producto — tomadas por el dueño el 8 oct 2026

| # | Tema | Decisión |
|---|---|---|
| 1 | ¿El restaurante pega su clave de Clip en el admin? | **Sí.** Si Clip ofrece después un esquema para integradores (A.3), se revisa |
| 2 | Dividir la cuenta en el lector | **Apagado.** Solo divide VIM |
| 3 | Meses sin intereses | **Apagados**, igual que con Mercado Pago |
| 4 | Porcentajes de propina que muestra el lector | **Los configura el dueño** en el admin (el lector admite de 1 a 3) |
| 5 | Orden de proveedores | **Mercado Pago → Clip → Netpay.** Netpay pasa al final: el dueño apenas está buscando contacto con su área de ventas |

## C. Dudas técnicas

Se pueden preguntar por correo, sin lector:

- La lista completa de estados de una intención de pago y de una transacción.
- Si mandar dos veces la misma `reference` crea dos cobros o lo rechaza.
- Si el webhook se reintenta, cuántas veces y qué respuesta espera.
- Si la API de reembolsos acepta cobros de PinPad, y con `transaction_id` o con `receipt_no`.
- Si `amount` va como texto o como número (la documentación dice las dos cosas).
- Cómo se filtra `devices/status` por un solo lector.
- Qué modelos están soportados de verdad (Pro 2, Total y Total 2 aparecen en una sola página).

Solo con lector:

- Cuánto tarda el lector en despertar y si despierta estando bloqueado o con la pantalla apagada.
- Qué devuelve la consulta tras un rechazo, una cancelación en el lector y un vencimiento.
- Cómo llega la propina cuando el cliente la elige: ¿`amount_paid` = monto + propina?
- Qué pasa con el cobro si el lector pierde el WiFi a medio pago.
- Si el minuto fijo antes del `timeout_seg` es tal cual lo describen.
- Si una devolución a primera hora, sin ventas del día, se rechaza por falta de saldo.
- Qué imprime el lector con `is_auto_print_receipt_enabled` y si los modelos sin impresora lo ignoran.

## D. Siguiente sesión (propuesta)

1. El dueño hace A.1–A.4. A.3 es lo que más tarda: mandarlo en cuanto haya número de serie.
2. Se construye primero Mercado Pago (su carpeta, documento 03 §D). Clip es el siguiente.
3. Con lector y app instalada: la entrega 1 del documento 02 (recorrer la API a mano y escribir
   la skill `clip-pinpad`). Sus hallazgos corrigen `01-resumen-api.md`.
4. Adaptador de Clip sobre lo ya construido.
