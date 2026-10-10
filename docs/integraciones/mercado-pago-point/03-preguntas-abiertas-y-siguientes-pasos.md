# Preguntas abiertas y siguientes pasos

## A. Trámites que solo el dueño puede iniciar

Ninguno tarda semanas (no hay contrato ni aprobación previa, a diferencia de Uber o DiDi), pero
sin el primero no se puede escribir ni una prueba.

1. **Crear la aplicación.** Entrar a <https://www.mercadopago.com.mx/developers/panel/app> con una
   cuenta de Mercado Pago **de VIM** (no personal; propuesta: la de `integraciones@vimpos.com.mx`)
   y crear la aplicación «VIM POS» eligiendo *Mercado Pago Point* con *Orders API*. Guía:
   `guias/create-application.md`.
2. **Guardar en el gestor de contraseñas** (nunca en el chat ni en el repo): `client_id`,
   `client_secret`, Access Token de prueba, y usuario/contraseña de las cuentas de prueba vendedor
   y comprador que se crean solas.
3. **Registrar la URL de redireccionamiento** de OAuth en los detalles de la aplicación. Es
   `https://admin.vimpos.com.mx/integraciones/mercado-pago/callback`. Tiene que ser exacta y estática.
4. **Preguntar a Mercado Pago** (soporte de desarrolladores o un ejecutivo, si se consigue):
   - si hay programa de integradores para puntos de venta y qué da (`integrator_id`,
     `platform_id`, comisión compartida, soporte);
   - comisiones por cobro con tarjeta en Point y plazos de depósito, para decirlo bien al vender;
   - que habiliten la **impresión por API** en la cuenta, si se decide usarla (B.4).
5. **Para la prueba final:** la **Point Smart 2** (pedida; llega el 9 oct 2026) y una cuenta de Mercado Pago real
   donde cobrar y devolver unos pesos. Puede ser la de VIM. Las cuentas de prueba no cobran en una
   terminal física, así que este paso no se puede simular.

### Comunes

- Definir la **URL pública del webhook**. Es una sola para todos los restaurantes y se captura a
  mano en el panel de Mercado Pago; cambiarla después es volver a entrar al panel.
- El piloto es Knock-Out Burger: confirmar con ellos qué cuenta de Mercado Pago van a usar.

## B. Decisiones de producto — tomadas por el dueño el 8 oct 2026

| # | Tema | Decisión |
|---|---|---|
| 1 | ¿Se retoma ya? | Esto queda como **estudio**. La construcción arranca en otra sesión |
| 2 | Cuenta para crear la aplicación | La de VIM: `integraciones@vimpos.com.mx` |
| 3 | Dominio del admin (regreso de OAuth) | `admin.vimpos.com.mx` |
| 4 | Piloto | **Knock-Out Burger** |
| 5 | ¿Add-on o incluido? | **Incluido en todos los paquetes.** No hay add-on |
| 6 | Orden de proveedores | Mercado Pago, luego **Clip**, luego Netpay (cambiado el mismo día: Netpay aún sin contacto comercial; estudio de Clip en `../clip-pinpad/`) |
| 7 | ¿Cuenta de Mercado Pago por restaurante o por sucursal? | **Lo decide el cliente en el admin** |
| 8 | ¿Qué imprime la terminal? | **Lo decide el cliente** (por sucursal): su comprobante o nada |
| 9 | Cuánto espera la caja antes de dar el cobro por vencido | **Configurable** (por sucursal; 3 minutos de inicio, entre 30 s y 3 h) |
| 10 | Cuando no se sabe si el cobro pasó (`REVISAR`) | Aceptarlo pide **PIN de encargado** |
| 11 | Registro manual de tarjeta | **Se queda** visible como segunda opción |
| 12 | Devoluciones desde VIM | Mismo permiso y PIN que la devolución de hoy |
| 13 | Meses sin intereses | No se mencionan en la guía del restaurante |
| 14 | Propina | **Que el cliente la elija en la terminal.** Condicionado a C: la documentación no confirma que la terminal la pregunte en modo PDV. Si no se puede, se sigue capturando en VIM y se manda el total |

Pendientes del dueño: sigue sin contacto en Mercado Pago (A.4). La **Point Smart 2 ya está
pedida y llega el 9 oct 2026**, así que las dudas «con terminal real» de C se pueden resolver desde
el principio y no hasta la entrega 5.

## C. Dudas técnicas que se resuelven probando

En el simulador (sin terminal):

- La plantilla exacta para validar `x-signature` sin SDK (las funciones son Deno; la pestaña no se
  capturó). Punto de partida: la guía general de webhooks de Mercado Pago.
- Si un aviso de otro restaurante llega con el `user_id` del restaurante o con el del integrador.
- Si el simulador (`POST /v1/orders/{id}/events`) dispara los webhooks igual que un cobro real.
- Qué `scope` trae el token del OAuth por defecto y si `offline_access` viene sin pedirlo.
- Si `test_token=true` hace falta para las cuentas de prueba vendedor.
- Si la order acepta ítems de la compra: la medición de calidad los recomienda, pero la referencia
  de crear order de Point no tiene ese campo.
- Para qué sirven `platform_id` e `integrator_id` cuando no se tiene ninguno.

Con terminal real:

- Cuánto tarda la order en aparecer en la terminal y si hay que presionar *Actualizar*.
- Qué pasa si la terminal pierde internet a medio cobro: ¿vence?, ¿queda en `action_required`?
- Con qué frecuencia real aparece `action_required` (dicen ~40 s sin respuesta).
- **(Bloquea la decisión B.14.)** Si la terminal pregunta propina por su cuenta en modo PDV y, si
  lo hace, cómo llega el monto: ¿`total_paid_amount` mayor que el `amount` pedido?, ¿un campo
  aparte? (existe el error `partial_refund_forbidden_with_tips`, así que el concepto existe). Y si
  se activa desde la cuenta del comercio, desde la terminal o no se puede en PDV.
- Monto mínimo y máximo por cobro.
- Si cancelar con el cobro ya en la terminal funciona con el software que traiga la Point Smart 2.
- Si la terminal acepta volver a `STANDALONE` y regresar a `PDV` sin tener que ligarla otra vez.
- Qué trae `reference_id`: ¿es el número de autorización que el banco reconoce en una aclaración?

## D. Siguiente sesión (propuesta)

1. El dueño hace A.1–A.3 (crear la aplicación con `integraciones@vimpos.com.mx`, guardar
   credenciales, registrar la URL de regreso).
2. Con la terminal en la mano, resolver primero la duda de la propina (C): cambia el flujo de cobro.
3. Sesión de código: ADR `00NN-cobro-con-terminal-mercado-pago.md`, y las entregas 1 y 2
   del documento 02 (conexión y cobro) contra el simulador y la terminal virtual, con pruebas de
   RLS y del adaptador usando los ejemplos guardados en `referencia-api/`.
4. Lo que salga al probar se escribe en una skill `mercado-pago-point`, como `facturama-cfdi`.
