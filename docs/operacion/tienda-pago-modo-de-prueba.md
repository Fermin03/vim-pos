# Pago en línea de la tienda: modo de prueba

Para probar el pago con tarjeta de punta a punta (pedir, cobro, verificación del banco, aviso,
confirmación, POS, «Listo», cancelar, devolución, correos) **sin dinero real y sin tocar ninguna
cuenta real**. Es por negocio y solo lo enciende VIM. Hoy el negocio es «VIM Pruebas».

Diseño: [`02-diseno.md`](../integraciones/mercado-pago-checkout-pro/02-diseno.md), sección «Modo de
prueba». Migración: `0178_tienda_modo_de_prueba_y_freno.sql`.

## Por qué existe

El antifraude de Mercado Pago rechaza en producción (`high_risk`) los cobros hechos con tarjetas de
personas vinculadas al negocio y los intentos seguidos por montos parecidos (confirmado por su
soporte). Y no deja mezclar cuentas reales y de prueba en un cobro: la aplicación real
(«VIM POS Tienda») con un vendedor de prueba conectado por OAuth y una tarjeta de prueba **no
funciona** («Invalid users involved»; con Orders, 422 sin detalle).

Lo que sí funciona es cobrar **directo con las credenciales de la aplicación gemela de prueba**: su
public key y su access token de prueba. Ese token no es de OAuth: no tiene refresh token ni vence.

## Qué cambia en un negocio en modo de prueba

| | Negocio normal | Negocio en modo de prueba |
|---|---|---|
| Quién cobra | Su conexión real (la elegida, o la única activa). **Nunca** una de prueba | **Solo** su conexión de prueba (la única activa con `de_prueba`). **Nunca** una real |
| Pagador que se manda a Mercado Pago | El correo del cliente | El usuario de prueba (`MP_TIENDA_PAGADOR_DE_PRUEBA`). El correo del cliente sigue siendo el de nuestros correos |
| Topes de tarjetas rechazadas (motivo escondido, IP bloqueada, pausa del negocio y su correo) | Cuentan | No cuentan |
| Cupos de `pedir` por IP y restaurante (8/h) y por negocio (60/h) | Cuentan | No cuentan en un pago en línea. Sigue el de 40/h por IP y el antirobot |
| Pausa de la sucursal y correo a VIM si Mercado Pago rechaza las credenciales (401) | Sí | No: queda en el log (`PAGO_DE_PRUEBA_SIN_PERMISO`) |
| Freno de 30 minutos tras un rechazo por riesgo (mismo teléfono desde la misma IP) | Sí | Sí (es el mismo código) |
| Correos a VIM por devolución fallida, cobro sin pedido o reto sin cerrar | Sí | Sí, con `[PRUEBA]` en el asunto |
| Renovación del permiso | Cada día, si vence pronto | No aplica: la conexión de prueba no vence |

Todo lo demás es el mismo camino: la orden se verifica igual (referencia, monto, moneda y que la
cuenta vendedora sea la de la conexión del pago), el aviso entra por la misma función, y la caja y
el POS ven el pedido igual. Cada pago guarda la conexión con la que nació: encender o apagar el modo
no cambia con qué token se consulta o se devuelve un pago que ya existe.

Se nota en tres sitios: una franja azul en la pantalla de la tarjeta de la tienda («Modo de prueba:
los pagos no son reales.»), la misma franja en la página de cada pedido pagado así, y un aviso en
Admin › Tienda en línea › «Pago en línea», que además deja de ofrecer «Conectar Mercado Pago».

## Encenderlo

Antes: la migración 0178 aplicada, y la web y las funciones `tienda` y `tienda-webhook-mp`
desplegadas (orden en la cabecera de la migración).

**1. Secretos de las funciones** (una vez; los valores no van en ningún archivo):

```
supabase secrets set MP_TIENDA_PAGADOR_DE_PRUEBA=test_user_3753760462@testuser.com
supabase secrets set MP_TIENDA_WEBHOOK_SECRET_PRUEBA=<clave de firma de los avisos de la aplicación gemela>
```

- `MP_TIENDA_PAGADOR_DE_PRUEBA` solo vale si termina en `@testuser.com`. Sin él, el cobro de prueba
  sale con el correo que escriba quien prueba (y entonces hay que escribir el del usuario de prueba).
- `MP_TIENDA_WEBHOOK_SECRET_PRUEBA`: en el panel de la aplicación gemela, «Webhooks» tiene que
  apuntar a la misma dirección que la real (`…/functions/v1/tienda-webhook-mp`), con el mismo
  tópico que la real; su clave secreta es este valor. Sin él los avisos de prueba dan «firma inválida» y cada
  pago se confirma por el respaldo (la página del pedido y el barrido), más lento.

**2. La marca y la conexión**, por SQL con un rol de servicio (el dueño no puede: `authenticated` no
tiene permiso sobre la columna ni sobre la función):

```sql
-- El negocio.
SELECT c.tenant_id, c.slug, c.pago_en_linea, c.pago_de_prueba FROM tienda_config c WHERE c.slug = '<slug de VIM Pruebas>';

-- La marca.
UPDATE tienda_config SET pago_de_prueba = true WHERE tenant_id = '<tenant_id>' RETURNING slug, pago_de_prueba;

-- La conexión de prueba: cuenta vendedora de prueba, public key de la aplicación gemela (no es
-- secreta) y su access token de prueba. El token solo entra a Vault.
SELECT tienda_conexion_de_prueba(
  '<tenant_id>',
  '3754297554',
  'APP_USR-03738d1c-5060-4d13-9603-05c49a16cd64',
  '<ACCESS TOKEN DE PRUEBA>');

-- Comprobar: cada sucursal de la tienda tiene que dar el id que devolvió la línea anterior.
SELECT ts.sucursal_id, tienda_conexion_cobro(ts.tenant_id, ts.sucursal_id) AS cobra
  FROM tienda_sucursales ts WHERE ts.tenant_id = '<tenant_id>' AND ts.participa;
```

No guardes la consulta con el token en el editor ni la pegues en un chat. Si `tienda_conexion_cobro`
da `NULL`: la casilla «Pago en línea» está apagada, hay una pausa, la caja de esa sucursal no
declara pedidos pagados, o hay más de una conexión de prueba activa.

El dueño no puede quitar la marca: no puede escribir la columna ni borrar la fila de su tienda.

La función se niega con `NEGOCIO_NO_ES_DE_PRUEBA` si el negocio no tiene la marca, y con
`CUENTA_REAL` si esa cuenta ya está conectada ahí como real. Llamarla otra vez con otro token lo
reemplaza.

## Apagarlo

```sql
UPDATE tienda_config SET pago_de_prueba = false WHERE tenant_id = '<tenant_id>';
```

Los pagos de prueba que sigan vivos (por confirmar, por devolver) se siguen atendiendo con la
conexión de prueba. La conexión se puede dejar activa: un negocio normal nunca cobra con ella, y no
cuenta para «la única cuenta activa» (con una real y la de prueba, cobra la real).

La conexión de prueba no se quita desde el admin (no hay «Desconectar» en ella, y el servidor lo
niega). Para quitarla, por SQL con un rol de servicio:

```sql
SELECT tienda_borrar_tokens(id) FROM tienda_conexiones WHERE tenant_id = '<tenant_id>' AND de_prueba;
UPDATE tienda_conexiones SET estado = 'DESCONECTADA' WHERE tenant_id = '<tenant_id>' AND de_prueba;
```

## Con qué se prueba

Verificado contra la cuenta de prueba (documento 04); lo que no está aquí no está probado.

| Tarjeta de prueba | |
|---|---|
| Mastercard crédito | `5474 9254 3267 0366`, 11/30, 123 |
| Mastercard débito | `5579 0534 6148 2647` |

| Titular (el nombre que se escribe en la tarjeta) | Qué pasa |
|---|---|
| `APRO-AUTH` | Aprueba sin pedir la verificación del banco |
| `APRO-CHOK` | Pide la verificación; al confirmar, aprueba |
| `APRO` | Pide la verificación; al confirmar, **falla** (`3ds_challenge_failed`) |
| `FUND`, `OTHE`, `CALL` | Con la verificación encendida ya no rechazan directo: piden la verificación, como `APRO` |
| `CONT` | En revisión (`processing`). Verificado sin la verificación encendida |

Con la verificación del banco encendida **no hay titular verificado para un rechazo directo (402)**.

## Qué NO prueba este modo

- **La conexión por OAuth** de un restaurante («Conectar Mercado Pago») ni su renovación: la
  conexión de prueba no pasa por ahí.
- **El antifraude real**: en el ambiente de prueba no se ha visto un `high_risk`, así que el freno
  de 30 minutos no se dispara solo. La clave del freno la calcula la función (un HMAC del negocio,
  el teléfono y la IP), así que no se puede poner a mano para un teléfono cualquiera. Para verlo en
  la tienda: hacer un pedido en línea y, sin cambiar de red ni de teléfono, frenar con la clave que
  guardó ese pago y volver a pedir:
  `SELECT tienda_pago_frenar(freno_clave) FROM tienda_pagos WHERE tenant_id = '<tenant_id>' AND freno_clave IS NOT NULL ORDER BY created_at DESC LIMIT 1;`
  Y para quitar los frenos (son de todos los negocios: en producción, con cuidado):
  `DELETE FROM limites_cupo WHERE clave LIKE 'tienda:pago-freno:%';`
- **La verificación de un banco de verdad** (la página del reto de prueba es de Mercado Pago).
- **Los topes contra la prueba masiva de tarjetas**: aquí están apagados a propósito.
- Comisiones, liquidación y tiempos de una devolución real.
