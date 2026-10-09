# Clip PinPad — la API en 10 minutos

Resumen de la documentación oficial capturada en esta carpeta (8 oct 2026). **Nada de esto está
probado**: es lo que Clip documenta, y su documentación es más delgada y menos consistente que la
de Mercado Pago. Las inconsistencias detectadas van marcadas con ⚠.

## 1. Qué es y qué no

- Clip ofrece dos caminos para cobrar con su terminal desde otro sistema
  (`referencia-api/introducción-a-la-api-de-pinpad.md`):

  | | **API de PinPad** (la nuestra) | SDK Terminal |
  |---|---|---|
  | Dónde corre el punto de venta | En cualquier lado; habla con Clip desde un servidor | App Android nativa **instalada en el lector** |
  | Requisito | La app *Clip PinPad* instalada en el lector | Clip revisa y aprueba tu APK (InfoSec) |

- El sistema crea una **intención de pago**; el lector «despierta» (*Clip Wakeup*), cobra y Clip
  avisa por webhook (`guias/api-de-pinpad.md`).
- El dinero cae en la cuenta Clip del comercio. El integrador no toca datos de tarjeta.

## 2. Requisitos

`referencia-api/introducción-a-la-api-de-pinpad.md`.

- Una **cuenta Clip** activa con **identidad verificada (KYC)**. El KYC se hace desde la app de
  Clip con INE y selfie; sube el tope a $100,000 por cobro con tarjeta presente y es condición
  para usar las API (`referencia-api/kyc.md`).
- La app **Clip PinPad (APK)** instalada en el lector. **Se pide por correo a `sdk@payclip.com`
  con el número de serie.** No hay autoservicio.
- Lectores compatibles: **Total 3, Ultra, Clip PinPad y Clip Stand 2**.
  ⚠ La página de *Clip Wakeup* habla además de Pro 2, Total y Total 2 (en esos hay que dar a mano
  el permiso «Mostrar sobre otras aplicaciones»). No queda claro si están soportados.
- **WiFi estable de al menos 10 MB/s** en el lector.
- **Solo producción.** «La API PinPad opera únicamente en el ambiente de Producción»; la página
  de pruebas confirma que el modo de prueba solo cubre checkout transparente y reembolsos
  (`referencia-api/pruebas.md`).

## 3. Credenciales

`referencia-api/token-de-autenticacion.md`.

- **No hay OAuth.** Cada cuenta Clip crea en su *Panel de Desarrollador*
  (<https://dashboard.clip.mx/dashboard>) una credencial: **API key + clave secreta**.
- El token es `Basic base64(api_key:clave_secreta)` y va en el header `Authorization`.
- Máximo **6 aplicaciones** por cuenta (producción y pruebas juntas).
- La clave secreta **solo se ve una vez**, al crearla. Si se pierde, se genera otra.
- Al crear la credencial se elige el uso; para «Tienda online» pide dominio. Para PinPad no aplica.
- No caduca ni se renueva (no hay nada documentado al respecto).

Consecuencia: para cobrar en nombre de un restaurante hay que tener **su** API key y su clave
secreta. No existe un «conectar» con autorización; el dueño las copia de su panel.

## 4. Cobrar: crear la intención de pago

`POST https://api.payclip.io/f2f/pinpad/v1/payment` — `referencia-api/post_payment-1.md`.

```json
{
  "amount": "348.00",
  "reference": "id-nuestro-del-cobro",
  "serial_number_pos": "P8220724000042",
  "webhook_url": "https://…/terminal-webhook-clip",
  "preferences": {
    "is_tip_enabled": true,
    "tip_options": [10, 15, 20],
    "is_msi_enabled": false,
    "is_mci_enabled": false,
    "is_dcc_enabled": false,
    "is_retry_enabled": true,
    "is_split_payment_enabled": false,
    "is_auto_print_receipt_enabled": false,
    "is_auto_return_enabled": true,
    "is_share_enabled": false
  }
}
```

- Obligatorios: `amount`, `reference`, `serial_number_pos` (el número de serie del lector).
- ⚠ `amount` y `tip_amount`: la tabla dice texto (`"200.50"`), el OpenAPI dice número
  (`200.5`). La respuesta devuelve `amount` como texto.
- `tip_amount`: propina ya decidida por el sistema. Alternativa: `is_tip_enabled` + `tip_options`
  para que **el cliente la elija en el lector**. `tip_options` admite de 1 a 3 enteros entre 1 y 100.
- `webhook_url`: **por cobro**. Si no se manda, usa la configurada en el panel de desarrollador.
- Preferencias (todas booleanas, todas opcionales):

  | Preferencia | Qué hace |
  |---|---|
  | `is_tip_enabled` | Muestra la pantalla de propina en el lector |
  | `is_msi_enabled` / `is_mci_enabled` | Meses sin / con intereses |
  | `is_dcc_enabled` | Conversión de moneda para tarjetas extranjeras |
  | `is_retry_enabled` | Deja reintentar en el lector si el pago falla |
  | `is_split_payment_enabled` | Deja dividir el total en varias tarjetas **en el lector** |
  | `is_auto_print_receipt_enabled` | Imprime el comprobante al terminar |
  | `is_auto_return_enabled` | Qué hace el lector al finalizar (no lo detallan) |
  | `is_share_enabled` | Botones de compartir comprobante |
  | `redirect_package_name` | Abre otra app del lector al terminar. No nos aplica |

- Respuesta 200: `pinpad_request_id` (`pinpad-<uuid>`), `reference`, `amount`, `serial_number_pos`.
  **Hay que guardar el `pinpad_request_id`.**
- **No hay llave de idempotencia documentada.** Si la petición se reintenta, puede crear dos cobros.
- Errores documentados (400):
  - `ERR10_04` «STORING PAYMENT - DEVICE UNAVAILABLE»: lector apagado, sin internet o con la app cerrada.
  - `PINPAD_TERMINAL_TIMEOUT_EXCEPTION`: no se pudo conectar con el lector; revisar internet o
    el número de serie.

### El lector tiene que estar «activo»

`referencia-api/health-check.md`. La intención solo se acepta si el lector está **activo**:

- **Activo:** la app PinPad abierta esperando, o abierta con una transacción ya terminada.
- **Inactivo:** app cerrada; lector apagado o **bloqueado**; o en medio de otro cobro (desde la
  pantalla de propina hasta el procesamiento de la tarjeta).

## 5. Estado de los lectores

`GET https://api.payclip.io/f2f/pinpad/v1/devices/status` —
`referencia-api/get_f2f-pinpad-v1-devices-status.md`.

- Devuelve los lectores del comercio: `serial_number`, `status`, `expires_at`, `updated_at`,
  `version`. ⚠ Dice que se puede filtrar por un lector, pero no documenta con qué parámetro.
- `active` (puede cobrar), `inactive` (desconectado), `expired` (no reportó en los últimos
  **20 segundos**), `unknown` (el comercio no tiene la función activada).
- Un arreglo vacío `[]` es respuesta válida: no hay lectores registrados.
- Sirve de paso para **descubrir los lectores** de una cuenta sin que el dueño teclee series.

## 6. Avisos (webhook)

`referencia-api/webhook.md` y `referencia-api/notificación-de-resultados.md`.

- Clip hace `POST` a la `webhook_url` cuando cambia el estado de la intención.
- El cuerpo **solo trae el identificador**:

  ```json
  { "id": "pinpad-6a40…", "origin": "pinpad-payments-api", "event_type": "PINPAD_INTENT_STATUS_CHANGED" }
  ```

- **No hay firma ni secreto documentados.** El aviso no se puede autenticar: hay que tratarlo como
  un «algo cambió» y confirmar siempre con la consulta (§7), que sí va autenticada.
- No documentan reintentos, tiempo de respuesta esperado ni qué código hay que contestar.
- Existe además el *Postback Webhook* general de la cuenta, configurable en el panel
  (`referencia-api/referencia-postback-webhook.md`). No hace falta si se manda `webhook_url`.

## 7. Consultar el cobro

`GET https://api.payclip.io/f2f/pinpad/v1/payment?pinpadRequestId=pinpad-…` —
`referencia-api/get_payment.md`. Con el header **`Pinpad-Include-Detail: true`** trae el detalle.

- Nivel intención: `pinpad_request_id`, `reference`, `amount`, `amount_paid`, `tip_amount`,
  `create_date`, `status`.
- ⚠ **Los estados no están enumerados.** Aparecen `COMPLETED`, y como ejemplos `PENDING`,
  `FAILED` y `PAYMENT_PENDING`. Falta saber cómo se ve un cobro cancelado, uno rechazado y uno
  pagado a medias.
- `detail.results[]` — **una entrada por tarjeta** (puede haber varias si se dividió el pago):
  `transaction_id`, `status` (`approved`…), `amount`, `tip_amount`, `paid_amount`,
  `amount_refunded`, `installments`, `approved_at`, `entry_mode`,
  `payment_method` (`id`: `master`…; `type`: `credit_card`…; `card`: `bin`, `issuer`,
  `last_digits`, vencimiento) y `device` (serie y fabricante).
- No aparece un número de autorización bancaria como tal; el identificador que Clip usa para
  conciliar es el **número de recibo** (`receipt_no`), que sale de la API de transacciones
  (`guias/conciliacion-de-transacciones-apis-1.md`).

## 8. Cancelar

| Endpoint | Cuándo |
|---|---|
| `DELETE /f2f/pinpad/v1/payment/{pinpad_request_id}` | Se conoce el id |
| `DELETE /f2f/pinpad/v1/payment/serial-number/{serial}` | No se conoce: cancela lo que tenga ese lector |

- **Solo funciona mientras el lector no haya tomado el cobro.** Después, se cancela en el lector
  (botón de cancelar o cerrando la app).
- La cancelación por serie devuelve `current_payment_on_transaction` y `payment_enqueued`: si el
  primero no es nulo, hay un cobro en curso y el nuevo quedó en espera.
- **Timeout de inactividad** (`referencia-api/timeout-de-inactividad-1.md`): preferencia por
  lector (`POST /f2f/pinpad/v1/devices`, `timeout_seg`) que cancela sola la orden si nadie hace
  nada. Se suma al minuto que Clip ya trae: 20 s configurados = 1 min 20 s. Solo antes de
  acercar la tarjeta, y **no aplica a pagos divididos**.

## 9. Preferencias del lector

`POST /f2f/pinpad/v1/devices` (hasta 25 lectores por petición) y
`GET /f2f/pinpad/v1/devices/{serial}/preferences` — `referencia-api/post_devices.md`.

- `is_kiosk_mode_enabled`: modo kiosco (oculta el perfil en la pantalla principal; para cerrar
  sesión hay que borrar los datos de la app). Es para autoservicio; no nos aplica.
- `timeout_seg`: el timeout de arriba; `null` lo desactiva.

## 10. Devoluciones

`referencia-api/introduccion-api-de-reembolsos.md` y `referencia-api/post_refunds.md`.

`POST https://api.payclip.com/refunds` (⚠ otro dominio: `.com`, no `.io`):

```json
{ "reference": { "type": "transaction", "id": "<transaction_id>" }, "amount": 24.00, "reason": "…" }
```

- Total o parcial, hasta **180 días** después del pago. `reference.type`: `transaction` o `receipt`.
- Header opcional `idempotency-key`, que **dura 1 minuto**.
- Respuesta: `status` `approved` o `declined`, `receipt_no`, `amount`.
- Dentro de las primeras 24 h es una **cancelación** (mismo id de la transacción); después es un
  reembolso con id y recibo propios.
- **Requiere «balance»:** ventas del día aún no depositadas, menos lo ya reembolsado ese día,
  mayor o igual a lo que se quiere devolver. Un restaurante que devuelve un cobro de ayer a primera
  hora puede no tenerlo.
- La API está escrita pensando en cobros por internet. Dice servir para «cualquier transacción
  completada con tarjeta», pero **no confirma expresamente** los cobros hechos por PinPad.

## 11. Transacciones, depósitos y conciliación

- `GET` transacción por `receipt_no` y lista por rango de fechas (dominio `api-gw.payclip.com`):
  `referencia-api/transaction.md`, `transactions.md`.
- Depósitos por periodo y desglose (`settlements.md`, `deposit.md`, `api-de-depósitos.md`); el
  periodo no puede pasar de 90 días.
- `guias/conciliacion-de-transacciones-apis-1.md` explica cómo casar cobros con depósitos usando
  el número de recibo. ⚠ Tres dominios distintos según la API: `api.payclip.io` (PinPad),
  `api.payclip.com` (reembolsos), `api-gw.payclip.com` (transacciones y depósitos).

## 12. Probar

- **No hay simulador ni lector virtual.** Todo cobro de prueba es un cobro real, con tarjeta real,
  en un lector real, y se devuelve después.
- Hay un proyecto demo descargable (`guias/demos-técnicos-pinpad.md`); el archivo no se capturó.
- Soporte: correo a `sdk@payclip.com`. No hay proceso de certificación ni medición de calidad
  documentados para la API de PinPad (el SDK Terminal sí exige revisión de seguridad del APK).

## 13. Lo que la documentación **no** dice

- La lista completa de estados de una intención y de una transacción.
- Qué pasa si se manda la misma `reference` dos veces.
- Si el webhook se reintenta y cómo se autentica.
- Cuánto tarda la instalación de la app PinPad tras pedirla por correo.
- Si las devoluciones aplican a cobros de PinPad y con qué identificador.
- Si un integrador puede operar varias cuentas con algo distinto a pegar la clave de cada una.
- Monto mínimo por cobro.
- Qué significa exactamente `is_auto_return_enabled`.
