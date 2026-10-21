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

## E. Construido en local (20 oct 2026): lo que falta comprobar

Rama `feat/terminal-clip` (ADR 0050). Nada de esto se ha visto con un lector.

**Con lector:**

- Ver en la consulta los estados que Clip confirmó (§F) y si la transacción dice `approved` o `APPROVED`.
- Que cancelar con 200 deje el cobro en `CANCELADO`.
- Una devolución real, y qué «ID» de la transacción recomienda Clip (el código usa `transaction_id`).
- El cuerpo de `POST /devices`.
- El valor de `payment_method.type` en débito (el código espera `debit_card`).
- Qué guardar como autorización en `terminal_aprobacion`: `receipt_no` o `transaction_id`.
- Dónde llega `ERR10_04` en la respuesta: `code` o `error_code`.
- Que el `id` del aviso sea el `pinpad_request_id` (de eso depende recuperar un cobro creado sin
  respuesta de Clip).
- Qué hace el lector con `timeout_seg: 0` (espera de 1 minuto): ¿vence al instante o nunca?
- Con `is_retry_enabled`, si una intención puede pasar por `FAILED` y luego quedar `COMPLETED`.
- Si un 5xx al crear deja la intención creada en el lector (hoy se trata como sin respuesta).
- Propina en el lector (construida): que `tip_amount` llegue en la consulta de cada transacción
  aprobada y que el lector muestre los porcentajes de `tip_options`.

**Antes de producción (no necesitan lector):**

- `deno check` real de las funciones y prueba con `supabase functions serve`.
- Correr el pgTAP 0039 (escrito, no ejecutado: pide Docker y Vault).
- Regenerar tipos con `pnpm db:types` (hoy están editados a mano).
- Ver el admin y la caja en vivo, con capturas (MP con terminal virtual; Clip con lector apagado).
- Aplicar la migración 0260 con `--include-all` (las ramas locales traen 0188–0250).
- Desplegar `terminal-clip-conexion` junto con el admin (o el admin primero): ahora exige `propina_en_terminal`.
- Volver a asignar una sucursal a Clip apaga la propina en el lector: el dueño la vuelve a encender.

## F. Respuestas de Clip (21 oct 2026)

Por correo, de Amilcar Navarro (Integrations Specialist de Clip). Ya aplicadas en `clip.ts`.

- **Instalación de PinPad:** unos 3 minutos desde que Clip confirma el envío, con el lector encendido
  y buen WiFi. Se puede pedir para muchos lectores a la vez.
- **Integradores:** no hay esquema. Cada comercio crea su cuenta y su API key (así se le deposita a él).
- **Aviso:** no se puede firmar; sí restringir por la IP de origen. Se reintenta 5 veces en 1–5 s y
  luego cada 2–3 min.
- **Estados de la intención** (sin kiosco ni pago dividido): `PENDING` (raro: la API borra sola lo que
  no llegó al lector), `IN_PROCESS`, `CANCELED` (en el lector o por API), `REJECTED` (falló, o el
  operador lo canceló en el lector) y `APPROVED`.
- **`reference` repetida:** no se rechaza y confunde los estados. Mandar siempre una nueva (ya se hace).
- **Devoluciones:** aceptan cobros de PinPad; recomiendan el ID de la transacción sobre `receipt_no`.
- **`amount`:** número.
- **Un solo lector:** `GET /devices/status/?serial_number=<serie>`.
- **Propina en el lector:** llega aparte en `tip_amount`. Con esto ya se puede construir la propina
  elegida en el lector (ya construida: §E).
- **Modelos:** Total 3, Ultra, Clip PinPad y Clip Stand 2.

## G. Pruebas con el lector de Knock-Out (21 oct 2026)

Total 3 `AA61B532662500612` (modelo `K1352`, PinPad 1.27.1), con `prueba.ts` directo a la API (sin VIM).

| Intento | Cómo se pagó | Resultado |
|---|---|---|
| 1 y 2 | Sin contacto, tarjeta que exige chip | `REJECTED`, `error.code` `CD-PROCESS-AS-CHIP` |
| 3 | Chip insertado | `REJECTED`, `error.code` `TX-CANCELLED-BY-PAUSE` (sin causa clara: preguntado a Clip) |
| 4 | Sin contacto, débito Visa Banorte | `PENDING` → `IN_PROCESS` → `APPROVED` en ~15 s |

Lo aprendido, ya en el código:

- El motivo de un rechazo llega en `error.code` y se guarda como `detalle`; la caja tiene mensaje para los dos vistos.
- La transacción aprobada dice `status: "approved"` (minúsculas); `amount_paid` y `paid_amount` = $1, `tip_amount` 0.
- La autorización del banco está en `private_data.psp_data.authorization_id` («000154»): es la que va al ticket.
- Marca de débito: `deb_visa` (la caja quita el prefijo para imprimir «Visa»).
- **Devolución:** con el `id` del resultado → 404 `CL1301`; con `transaction_id` → 201 `approved` («Cancelled», mismo día). El código ya usa `transaction_id`.
- La consulta trae datos personales de más (`private_data`: correo del cajero, dirección, afiliación). No se guardan: `terminal_eventos` solo registra `{id, event_type}` del aviso.

Falta con el lector: cancelar en el lector, propina en el lector, el aviso (webhook) real y el cobro completo desde VIM.
