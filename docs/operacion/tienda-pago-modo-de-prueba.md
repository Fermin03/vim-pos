# Pago en línea de la tienda: modo de prueba

Para probar el pago con tarjeta de punta a punta (pedir, cobro, verificación del banco, aviso,
confirmación, POS, «Listo», cancelar, devolución, correos) **sin dinero real y sin tocar ninguna
cuenta real**. Es por negocio y solo lo enciende VIM. Hoy el negocio es «VIM Pruebas».

Diseño: [`02-diseno.md`](../integraciones/mercado-pago-checkout-pro/02-diseno.md), sección «Modo de
prueba». Migración: `0177_tienda_modo_de_prueba_y_freno.sql`.

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
| Freno de 30 minutos tras un rechazo por riesgo | Sí | Sí (es el mismo código) |
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

Antes: la migración 0177 aplicada, y la web y las funciones `tienda` y `tienda-webhook-mp`
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

-- (Recomendado) Dejar elegida la cuenta REAL en sus sucursales. En modo de prueba esa elección no
-- se mira; sirve para que, al apagarlo, vuelva a cobrar la real sin tener que elegirla.
SELECT id, cuenta_nombre, de_prueba, estado FROM tienda_conexiones WHERE tenant_id = '<tenant_id>';
UPDATE tienda_sucursales SET conexion_id = '<id de la conexión real>' WHERE tenant_id = '<tenant_id>' AND conexion_id IS NULL;

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

La función se niega con `NEGOCIO_NO_ES_DE_PRUEBA` si el negocio no tiene la marca, y con
`CUENTA_REAL` si esa cuenta ya está conectada ahí como real. Llamarla otra vez con otro token lo
reemplaza.

## Apagarlo

```sql
UPDATE tienda_config SET pago_de_prueba = false WHERE tenant_id = '<tenant_id>';
```

Los pagos de prueba que sigan vivos (por confirmar, por devolver) se siguen atendiendo con la
conexión de prueba. La conexión se puede dejar: un negocio normal nunca cobra con ella. **Ojo:** si
la sucursal no tiene elegida la cuenta real y quedan dos conexiones activas (la real y la de
prueba), la tienda no ofrece el pago en línea hasta elegirla en Admin («¿Qué cuenta cobra en…?») o
desconectar la de prueba. Es la regla de siempre: con varias cuentas no se adivina.

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
  de 30 minutos no se dispara solo. Para verlo en la tienda, ponerlo a mano y pedir con ese teléfono:
  `SELECT tienda_pago_frenar('<tenant_id>', '<teléfono de 10 dígitos>');`
  Y para quitarlo: `DELETE FROM limites_cupo WHERE clave LIKE 'tienda:pago-freno:<tenant_id>:%';`
- **La verificación de un banco de verdad** (la página del reto de prueba es de Mercado Pago).
- **Los topes contra la prueba masiva de tarjetas**: aquí están apagados a propósito.
- Comisiones, liquidación y tiempos de una devolución real.
