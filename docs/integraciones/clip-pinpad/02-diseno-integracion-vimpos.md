# Cómo entra Clip PinPad en el cobro con terminal de VIM POS

**Estado:** propuesta de diseño (8 oct 2026) con las decisiones del dueño de ese día ya
incorporadas (documento 03 §B). Nada está construido. Este documento **no repite**
el diseño general: la arquitectura, las tablas, el flujo en la caja y las decisiones del dueño
están en [`../mercado-pago-point/02-diseno-integracion-vimpos.md`](../mercado-pago-point/02-diseno-integracion-vimpos.md).
Aquí va solo lo que Clip cambia.

## 0. Los dos proveedores lado a lado

| | Mercado Pago Point | Clip PinPad |
|---|---|---|
| Cómo se conecta el restaurante | OAuth: autoriza en su cuenta | **Pega su API key y su clave secreta** |
| Qué guardamos | Access Token + refresh token (180 días, se renueva) | API key + clave secreta (no caducan) |
| Preparar la terminal | El dueño la liga con su app y elige sucursal y caja | **Clip instala la app PinPad** a petición por correo |
| Hay que crear sucursales y cajas en el proveedor | Sí | No: basta el número de serie |
| Identificador de la terminal | `tipo__serie` | Número de serie |
| Propina en la terminal | Sin confirmar en modo integrado | **Sí**, por cobro, hasta 3 porcentajes |
| Meses sin intereses | En la cuenta del restaurante | Por cobro |
| Dividir en varias tarjetas en la terminal | No | Sí (`is_split_payment_enabled`) |
| Saber si la terminal está lista | No | Sí (`devices/status`, latido de 20 s) |
| Aviso de resultado | Firmado; trae el resultado | **Sin firma; solo trae el id** |
| Cancelar con el cobro ya en la terminal | Sí (asíncrono) | No: solo en la terminal |
| Vencimiento del cobro | Por cobro (30 s a 3 h) | Por lector (`timeout_seg` + 1 min fijo) |
| Protección contra duplicados | `X-Idempotency-Key` | **Ninguna documentada** |
| Impresión en la terminal | Por cobro | Por cobro (`is_auto_print_receipt_enabled`) |
| Devoluciones | 90 días | 180 días; exige saldo del día |
| Ambiente de pruebas | Simulador y terminal virtual | **No hay** |
| Requisito de salida | Medición de calidad (73 puntos) | Ninguno documentado |

## 1. Lo que se comparte tal cual

- La interfaz del adaptador (`crearCobro`, `cancelarCobro`, `reembolsar`, `consultar`,
  `listarTerminales`, `normalizarAviso`): Clip es `_shared/pagos-terminal/clip.ts`.
- Las tablas `terminal_conexiones`, `terminal_credenciales`, `terminal_dispositivos`,
  `terminal_config_sucursal`, `terminal_cobros`, `terminal_eventos`. `proveedor` pasa a aceptar
  `CLIP`.
- La función `terminal-cobro` y **todo lo que ve la caja**: el paso «cobra en la terminal», los
  estados (`EN_TERMINAL`, `APROBADO`, `RECHAZADO`, `CANCELADO`, `VENCIDO`, `REVISAR`, `DEVUELTO`),
  la recuperación tras un apagón, la salida manual sin internet, el PIN para aceptar un cobro
  dudoso. **La caja no sabe qué proveedor hay detrás.**
- Quién aplica el pago: la caja, con `aplicar_pago`, igual.

## 2. Lo que cambia

### 2.1 Conexión: una clave pegada, no una autorización

Admin → Integraciones → Terminal de tarjetas → **Clip**.

1. La pantalla explica, con pasos, cómo crear la credencial en el panel de Clip
   (*Panel de Desarrollador > Credenciales > Crear credencial*) y pide pegar **API key** y
   **clave secreta**. Avisa que la clave secreta solo se ve una vez.
2. `terminal-clip-conexion` las recibe por HTTPS, **las prueba** llamando a `devices/status`, y
   solo si responde las guarda en `terminal_credenciales`. Nunca regresan al navegador: después
   de guardarlas, el admin solo ve «conectado» y los últimos 4 caracteres de la API key.
3. Con esa misma respuesta se listan los lectores de la cuenta; el dueño asigna cada uno a una
   caja. Si la lista viene vacía, la pantalla dice que falta pedirle a Clip la app PinPad y da el
   texto del correo ya redactado con el número de serie.
4. Cobro de prueba de $1 que se devuelve solo.

No hay tokens que renovar ni tarea programada. Tampoco hay aviso de «el restaurante revocó»: si
borra la credencial en Clip, el siguiente cobro falla con 401 y la conexión pasa a `ERROR`.

### 2.2 Antes de cobrar: preguntar si el lector está listo

Al abrir el modal de cobro (no en cada tecla), `terminal-cobro` consulta `devices/status`:

- `active` → «Tarjeta» cobra por la terminal.
- cualquier otro → el botón dice **«Terminal no disponible: enciéndela y abre Clip PinPad»** y
  queda el registro manual. Evita el error `ERR10_04` a medio cobro.

### 2.3 Crear el cobro

- `reference` = id del cobro (uuid), `serial_number_pos` = el lector de la caja,
  `webhook_url` = `…/terminal-webhook-clip?c=<id del cobro>`.
- **Sin llave de idempotencia:** la fila de `terminal_cobros` se inserta **antes** de llamar a
  Clip. Si la llamada se queda sin respuesta, no se reintenta a ciegas: se cancela por número de
  serie (devuelve si había algo en curso) y se crea otro cobro con otro id.
- Preferencias desde `terminal_config_sucursal`:
  - **Propina** (decisión del dueño: que el cliente la elija en la terminal): `is_tip_enabled`
    y `tip_options` con los porcentajes que **el dueño configura en el admin** para la terminal
    (de 1 a 3, enteros entre 1 y 100; se guardan en `terminal_config_sucursal` y arrancan con los
    de `sucursal_propinas_config`). La caja manda el total sin propina y no la pregunta.
  - `is_auto_print_receipt_enabled` según lo que el cliente eligió para «qué imprime la terminal».
  - `is_split_payment_enabled: false` (decidido): el pago dividido ya lo maneja VIM; dos lugares
    para dividir es pedir descuadres.
  - `is_msi_enabled` / `is_mci_enabled`: apagados (decidido).
  - `is_retry_enabled: true`: que el cliente reintente con otra tarjeta sin volver a la caja.

### 2.4 El aviso no se cree: se confirma

`terminal-webhook-clip` es pública y **no puede autenticar** lo que recibe. Por eso:

1. Toma el `id` (`pinpad-…`), busca el cobro por ese id. Si no existe, responde 200 y no hace nada.
2. **Consulta a Clip** con la credencial del restaurante (`GET /payment` con
   `Pinpad-Include-Detail: true`) y actualiza el cobro con lo que Clip diga, no con el aviso.
3. Responde 200 rápido.

Así un aviso falso solo provoca una consulta de más. Límite de frecuencia por cobro para que nadie
la use para martillar a Clip. Y, como con Mercado Pago, si pasan ~15 s sin aviso la función
consulta una vez por su cuenta.

### 2.5 Leer el resultado

- `status` de la intención + `detail.results[]`. Con `is_split_payment_enabled` apagado se espera
  **una** transacción; si llegan varias, se suman las `approved`.
- El pago que se aplica: `paid_amount`. La propina: `tip_amount`, que el POS registra con
  `establecer_propina_ticket` **antes** de `aplicar_pago`.
- Método: `payment_method.type` → `TARJETA_CREDITO` / `TARJETA_DEBITO`.
- `pagos.referencia`: últimos 4 dígitos (`card.last_digits`), que es justo para lo que la columna
  se pensó. `terminal_aprobacion`: el `transaction_id`.
- **Mapa de estados por confirmar:** solo se conoce `COMPLETED`. Todo estado que el adaptador no
  reconozca cae en `REVISAR` (pide PIN), nunca en aprobado.

### 2.6 Cancelar y vencer

- Cancelar desde la caja funciona **solo si el lector aún no tomó el cobro**. Si ya lo tomó, la
  caja dice «Cancélalo en la terminal» y sigue esperando el resultado.
- El «cuánto espera la caja» que el cliente configura se traduce a `timeout_seg` del lector
  (`POST /devices`) al guardar la configuración, no por cobro. Hay un minuto fijo de Clip que no
  se puede quitar: el mínimo real es 60 s.

### 2.7 Devoluciones

`POST /refunds` con `reference: { type: "transaction", id: <transaction_id> }`.

- Dos mensajes propios de Clip: «pasaron más de 180 días» y **«no hay ventas de hoy suficientes
  para devolver; inténtalo más tarde o hazlo desde el panel de Clip»**.
- Antes de construirlo hay que confirmar con un cobro real que la API de reembolsos acepta
  transacciones de PinPad.

## 3. Seguridad

- La clave secreta de Clip no caduca y da acceso a **todas** las API de la cuenta (cobrar,
  devolver, ver transacciones y depósitos). Es más delicada que el token de Mercado Pago, que al
  menos se puede revocar con un clic y vence solo. Mismas reglas: tabla sin lectura para clientes,
  solo `service_role`, y cifrado en reposo si el ADR lo adopta.
- Se pide al restaurante una credencial **dedicada a VIM** (tienen hasta 6), para que revocarla
  no rompa otra cosa suya.
- El formulario que recibe la clave no la guarda en el estado del navegador ni la registra en
  bitácoras; `registrarError` no debe incluir el cuerpo de esa petición.
- Webhook sin firma: §2.4.

## 4. Pruebas

- Unitarias del adaptador con los ejemplos del OpenAPI de `referencia-api/`.
- RLS: las mismas tablas, ya cubiertas.
- **No hay forma de probar el flujo sin lector.** La primera prueba de punta a punta es un cobro
  real de $1 con devolución. Los estados de rechazo, cancelación y vencimiento hay que provocarlos
  a mano y **anotar qué devuelve Clip en cada uno**: de ahí sale el mapa de estados que falta.

## 5. Entregas propuestas (segundo proveedor, justo después de Mercado Pago)

1. **Con el lector en la mano, antes de programar:** recorrer a mano con `curl` crear, consultar,
   cancelar, rechazar, dejar vencer y devolver, y escribir el resultado en una skill `clip-pinpad`.
   Sin esto el adaptador se escribe a ciegas.
2. Adaptador + `terminal-clip-conexion` + pantalla del admin.
3. `terminal-webhook-clip` y el aviso «terminal no disponible» en la caja.
4. Devoluciones.
5. Guía para el restaurante: cómo pedir la app PinPad a Clip, crear la credencial y dejar el
   lector encendido con la app abierta.

El trabajo de caja es casi nulo si Mercado Pago ya está construido: lo nuevo es el aviso de
disponibilidad y el mensaje de «cancélalo en la terminal».
