# 0030 — La lealtad viaja por movimientos y el canje lo autoriza la nube

**Fecha:** 2026-10-05 · **Estado:** vigente · **Supera:** D20 de la especificación (cliente sin
lealtad en el MVP). **Amplía:** ADR 0004 (lista de tablas que se sincronizan) con el patrón del
ADR 0013.

## Qué decía el plan

- **D20:** `clientes` es una tabla simple, sin lealtad ni puntos; "CRM Pro" sería un add-on de $399
  que extendería el esquema cuando se contratara.
- **ADR 0004:** la sincronización replica una lista **explícita** de tablas; ampliarla cuesta una
  migración a propósito. **ADR 0013** describe esa lista como disjunta hasta entonces: la operación
  sube, el catálogo baja. Que `clientes` solo subía viene de la migración 0117.

## Qué hacemos ahora (migración 0156)

1. **Un libro que solo se agrega.** `lealtad_movimientos` registra lo ganado, lo canjeado, las
   reversas, los ajustes y los vencimientos. El saldo (`lealtad_saldos`) se deriva de él. Los puntos
   solo se mueven a través de una función, `lealtad_registrar_movimiento`, idempotente por id; el
   reinicio por cambio de mecánica y el recálculo de la fecha de vencimiento escriben el saldo
   directamente. Eso describe la nube y el libro de cada base: en la caja el pull también escribe
   saldos (una copia de los de la nube más lo que aún está pendiente de subir).
2. **Ganar corre donde se cobra.** Un trigger en `tickets` escribe el movimiento al quedar pagado:
   en la caja para la caja, en la nube para el POS web. Solo gana al pasar a pagado desde abierto
   (`BORRADOR` o `ABIERTO`): cancelar una factura (`FACTURADO` → `PAGADO`) no da puntos, ni a una
   venta que no los ganó entonces (módulo apagado, tope diario, devolución total) ni a una que ya los
   tenía. Reabrir una cuenta y volver a cobrarla sí gana en el segundo cobro. Los tickets de una caja
   entran a la nube en modo réplica, así que allá el trigger no corre y lo ganado llega como
   movimiento por el push.
   Un ticket cancelado o reabierto deshace lo que ganó. Una devolución lo deshace **en proporción a
   lo que el ticket ganó**, no a lo que queda, de modo que devoluciones parciales sucesivas suman
   el total.
3. **Canjear lo autoriza solo la nube.** La Edge Function `lealtad-canje` bloquea el saldo, valida y
   descuenta. Sin internet no hay canje. El POS llama igual en web y en caja; en la caja el gateway
   reenvía con el token del dispositivo y asienta el canje en el ticket local con los datos que
   devuelve la nube; del navegador solo se toman el ticket, el renglón y el id del canje. En la caja solo canjea una sesión de **empleado**,
   no la cuenta del dispositivo.
4. **Un canje nace atado a UNA cuenta y a UNA caja.** `canjear` exige el id del ticket y la nube lo
   guarda en el movimiento junto con la caja. Al asentar, la nube se niega a pegarlo a otra cuenta,
   a asentarlo desde otra caja, o desde la web si lo autorizó una caja.
5. **El canje es un descuento, no una forma de pago.** Vive en `ticket_canjes_lealtad` y en
   `tickets.lealtad_mxn`. Un premio de producto entra como renglón propio, de una pieza, a su precio
   y con el descuento completo. El renglón debe ser del mismo producto que el premio, no ser parte
   de un combo, no ser un cargo y valer más de cero. Hoy un premio que sea combo no se puede canjear (`RENGLON_NO_ES_PREMIO`), pero
   nada impide darlo de alta: el admin (1C) no debe ofrecerlo. Cancelar o borrar el renglón premiado devuelve los puntos, y solo mientras la cuenta sigue abierta.
6. **Los totales solo se recalculan en una cuenta abierta.** Cuando un canje cambia, se recalcula el
   ticket únicamente si está en `BORRADOR` o `ABIERTO`. Un ticket cancelado conserva los totales con
   los que se vendió; la reversa queda en el libro de movimientos, no en el ticket.
7. **Los clientes bajan a la caja** junto con el programa, los premios y los saldos. La caja
   muestra saldo de la nube + lo suyo que aún no sube.
8. **El teléfono es la identidad y la nube decide.** Se compara por dígitos en la fusión de la
   nube, en la resolución del cliente al canjear y en la fusión de la caja. Cuando una caja
   sube un cliente cuyo id la nube no conoce y cuyo teléfono ya existe en un cliente vivo del mismo
   negocio, se anota en `clientes_alias` y la nube redirige a ese cliente real lo que ya tenía
   guardado bajo el id viejo (tickets, direcciones, devoluciones, promociones aplicadas y canjes),
   aislado para que un fallo no aborte el push. Si el cliente real se borra, el alias se elimina.
   En la caja, un duplicado local es por definición un id que la nube NO manda; la fusión y el
   upsert de cada cliente ocurren en un solo savepoint, cada cliente se aplica aislado para que una
   fila mala no deshaga el pull, y la dirección principal se degrada si el cliente real ya tiene una.
9. **Una reversa que sube una caja se valida contra su canje.** La nube usa el cliente y los puntos
   exactos del canje; la caja no puede devolver más de lo canjeado ni a otro cliente.
10. **Tres mecánicas, un núcleo.** `PUNTOS_DINERO`, `SELLOS` y `PUNTOS_PREMIOS` son una regla de
    cómo se gana y una de cómo se canjea. Cambiar de mecánica sube la versión del programa y pone
    los saldos en cero (con un ajuste en el libro por cada saldo); un movimiento de una versión
    anterior se registra y no suma.
11. **Dos capas, como delivery:** add-on `LEALTAD` ($100) e interruptor
    `configuracion_tenant.modulo_lealtad_activo`, que enciende el dueño o un administrador. El
    interruptor se apaga por sí solo únicamente cuando un `UPDATE` desactiva el add-on y el negocio se queda sin
    ningún add-on `LEALTAD` vigente; no se apaga si se borra la fila ni cuando un add-on simplemente
    llega a su fecha de fin. Mientras el add-on no esté vigente el módulo no es efectivo de todos
    modos, porque `modulos_efectivos` exige las dos capas. La migración marca los planes con `lealtad_incluido` (todos menos Esencial); quien
    concede el add-on a los planes que lo incluyen es `_sincronizar_addons_del_plan`, que es del
    plan 1C.
12. **El proceso diario** vence saldos y devuelve todo canje de más de 48 horas, que no tenga ya su
    reversa, cuyo ticket no esté `PAGADO` ni `FACTURADO` en la
    nube (incluida una cuenta que sigue abierta). Cada
    fila va aislada (un fallo se cuenta y se avisa, el resto sigue), vence en hora de la Ciudad de
    México y no vence nada mientras el módulo está apagado.

## Por qué

- Replicar saldos entre cajas los pisaría; los movimientos suman en cualquier orden y reintentar
  no duplica. Es el mismo argumento del ADR 0013 y ya está probado en producción con inventario.
- Con saldo único por negocio, canjear sin conexión permite gastar el mismo saldo en dos
  sucursales. Una sola autoridad lo impide: un canje nunca deja el saldo en negativo. El saldo
  negativo solo puede aparecer por una reversa automática o por el cobro de un canje tardío (ver
  Consecuencias). Fermín eligió esto sobre el canje sin conexión el 5 oct 2026 (spec de diseño, §3).
- "Monedero electrónico" como forma de pago en el CFDI exige ser emisor autorizado por el SAT;
  como descuento no cambia nada de lo que ya se timbra.
- **Por qué el premio de producto vive en `ticket_items.promocion_item_mxn`.** No porque el timbrado
  lea esa columna: el código del CFDI deduce el descuento de `total_item_mxn` e `iva_item_mxn`. Es
  la columna que ya existe por renglón para un descuento automático, el que no pide PIN, y agregar
  una columna `NOT NULL` nueva a `ticket_items` rompería el push de las cajas que todavía no se han
  actualizado.
- La caja solo puede saber si el módulo está encendido por `configuracion_tenant`, porque
  `tenant_addons` no baja. Por eso apagar el interruptor al desactivar el add-on (en los casos de arriba) evita dejar dos
  hechos que podrían contradecirse.
- No se reutilizó el código `CRM_PRO`: nunca se sembró, y ese nombre prometía segmentación.
- Una venta, una cancelación o una devolución no se caen por la lealtad: los triggers atrapan el
  error y lo dejan como aviso en el log.

## Consecuencias

- **Orden de salida obligatorio:** migración a producción y función desplegada **antes** de mezclar,
  y el instalador al final. Una caja nueva contra una nube sin la 0156 anotaría como subidos
  movimientos que la nube ignoró (la trampa de la 0117).
- **Una caja sin actualizar sigue subiendo.** `sync_push_snapshot` rellena `lealtad_mxn` y
  `codigo_publico` cuando no vienen (`_vim_compat_0156`). Toda columna `NOT NULL` que se añada en el
  futuro a una tabla que sube necesita lo mismo, porque `_vim_apply_rows_detalle` inserta NULL en
  lo que el JSON no trae. De un cliente que la nube ya tiene, la nube SIEMPRE conserva su propio
  `codigo_publico`: una caja que se actualiza tarde no debe cambiar el enlace público.
- **Al actualizar, cada caja vuelve a subir 60 días de ventas, pero no sus clientes**, una vez:
  `tickets` y `clientes` ganaron una columna y eso mueve su huella. En los clientes el primer arranque
  tras actualizar re-anota las huellas (`reanotarHuellasClientes0156UnaVez`: las que solo cambiaron por
  la columna nueva) y el padrón NO se re-sube; sin eso la caja pisaría en la nube lo editado o dado de
  baja en el panel. Un cliente realmente editado en la caja sigue pendiente. Los tickets sí re-suben
  una vez, y es inofensivo: la caja reenvía su propia verdad, nadie edita tickets en el panel y la
  nube conserva lo suyo (la guarda de `FACTURADO`, 0122).
- **El add-on `LEALTAD` nace INACTIVO en el catálogo** (`addons.activo = false`): el panel de
  plataforma lista los add-ons activos con un botón de activar y todavía no hay pantallas detrás. El
  plan 1C lo enciende cuando existan las pantallas y se haya timbrado en sandbox un premio de
  producto. `tenant_addon_activo` no mira `addons.activo`, así que concederlo a mano sigue funcionando.
- **El pull sigue siendo completo y por hora.** Un cliente o un saldo de otra sucursal tarda hasta
  una hora en verse en la caja. El canje no depende de eso: pregunta a la nube en el momento y
  resuelve al cliente por teléfono.
- **`catalogo_version()` mira el programa y los premios, pero no los clientes ni los saldos.** Un
  premio creado en el panel llega a la caja en un minuto y no en una hora. Los clientes y los saldos
  cambian con cada venta: si los mirara, cada venta con cliente dispararía un pull completo en todas
  las cajas del negocio.
- **El tope diario es por caja.** Un cliente que compra en dos sucursales el mismo día puede
  pasarse; la nube acepta esos puntos porque el ticket ya los imprimió.
- **El permiso es por negocio, no por sucursal.** No existe RLS por sucursal en el proyecto; que el
  encargado vea "solo su sucursal" es un filtro del admin, como en el resto de los reportes.
- **La suma de `promocion_item_mxn` por renglón ya no cuadra con `tickets.promociones_mxn`.** El
  descuento de un premio vive en el renglón pero no en `promociones_mxn`; la parte de lealtad se
  reporta en `tickets.lealtad_mxn`. Quien lea esas columnas debe saberlo.
- **Canje tardío.** Una caja sin conexión puede subir una cuenta pagada después de que la red de
  seguridad de 48 horas ya devolvió los puntos de su canje. En ese caso la nube los vuelve a cobrar
  con un `AJUSTE` que se explica solo en el libro. Un canje que ya tiene su reversa no puede volver
  a la vida de otra forma. Consecuencia: ese cliente puede terminar con saldo negativo si ya había
  gastado los puntos devueltos.
- **Saldo negativo.** Solo puede darse por reversas automáticas y por ese recobro tardío. El ajuste
  manual no puede dejar el saldo debajo de cero ni pasar de 100,000 puntos por movimiento.
- **Si la lealtad falla, no se ve.** Como los triggers atrapan el error para no tumbar la venta, un
  fallo significa que el cliente no gana y nadie lo ve en pantalla; queda solo un aviso en el log.

## Lo que cerró el plan 1B y lo que queda para 1C

Cerrado en 1B (POS):

- **La cuenta se guarda antes de canjear** y el id del ticket viaja en `canjear` y en `asentar`.
- **El canje avanza por pasos y se reanuda** (`apps/pos/app/lib/lealtad-canje.ts`): el id nace en la
  caja, cada avance se guarda por cuenta en `localStorage`, y reintentar no descuenta dos veces. El
  premio entra primero como renglón; después la nube descuenta; al final se asienta.
- **Un canje nuevo no pisa a otro que quedó a medias** en la misma cuenta: `avanzarCanje` se niega a empezar si hay otro pendiente guardado.
- **Canje autorizado que la cuenta rechaza:** el POS lo dice con todas sus letras —los puntos
  vuelven solos en un máximo de 48 horas y desde la caja no se pueden devolver antes— y deja cobrar
  sin el canje.
- **Canje de dinero recortado:** antes de cobrar, si la cuenta bajó por debajo de lo canjeado, el
  POS quita el canje completo (los puntos vuelven) y avisa.
- **Antes de cobrar** la revisión del canje recortado corre siempre que el módulo está activo, en la captura y en la lista de cuentas; si quita un canje, avisa y no abre el cobro.
- **Un renglón premiado no se edita** desde el POS; para cambiarlo se quita el canje. Cancelarlo sí
  se puede: la base devuelve los puntos.
- **Con un canje aplicado no se cambia al cliente** de la cuenta.
- **El teléfono se guarda en dígitos** también al registrar un cliente de domicilio. El índice único
  sigue sobre el texto: los clientes capturados antes con formato siguen así.
- **Consumidores de solo lectura:** totales del POS, lista y consulta de cuentas, ticket impreso
  (canje en los totales y pie con lo ganado, el saldo y el vencimiento) y corte X/Z (`reporte_x`,
  migración 0157).
- **Si una lectura de lealtad falla al imprimir, el ticket sale sin pie**, nunca con un saldo en cero que no es verdad.
- **La compuerta de Facturama ya no existe** (decisión de Fermín, 6 oct 2026, migración 0158): el
  producto de regalo sale en $0.00 y **una cuenta con premio no admite factura individual**, ni en
  el portal ni en el admin (candado `trg_tickets_cfdi_sin_premio`); su ticket no imprime el QR de
  factura. **Sí entra en la factura global**, que arma un concepto por ticket y no por producto, y
  así lo que el cliente pagó queda amparado. La cuenta que es solo el premio ($0) queda fuera de la
  global. El canje de puntos por dinero se factura como siempre. Conviene que el contador del
  negocio lo confirme antes de encender premios en un negocio que factura mucho.

Sigue abierto:

- **`timbrar-cfdi` no mira el premio**: acepta un borrador viejo por su id. Si una cuenta con un intento fallido de factura se reabre, gana un premio y se vuelve a cobrar, ese borrador viejo podría timbrarse. El candado de la 0158 solo actúa al crear el borrador.
- **Un canje revertido en una cuenta ya cobrada** (lo puede hacer la conciliación de 48 h) deja de contar como premio para la factura, aunque su renglón siga en $0.
- **No hay ESLint configurado en `apps/pos`**: las dependencias de los hooks nuevos se revisaron a mano.
- **La interfaz no se ha visto funcionar**: no hay pruebas de componentes y la prueba manual de la Tarea 12 del plan 1B está pendiente.
- **Una cuenta con productos de varias tasas de IVA y un premio** puede dejar en cero, dentro de la
  global, el grupo de una tasa (cuando el premio es el único producto de esa tasa en la cuenta).
  Hoy casi todo el catálogo va al 16 %; si un negocio mezcla tasas y regala productos, hay que
  revisarlo antes de encenderle los premios.
- **La factura global con cuentas premiadas no se ha timbrado nunca**: el razonamiento sale del
  código, no de una prueba contra el PAC. La primera global de un negocio con premios hay que mirarla.
- **El premio entra sin modificadores** (el producto base, una pieza). Un producto que exige elegir
  algo —el término de la carne— llega a cocina sin esa elección. Elegir modificadores del premio, y
  decidir si un premio con extras caros sale gratis completo, es decisión de producto.
- **En Domicilio no se canjea desde la captura**, solo desde la lista de Domicilio: al releer la
  cuenta el carrito pierde al cliente de domicilio.
- **El anuncio «gana X» no descuenta las compras revertidas del día** al calcular el tope; es un
  texto, quien otorga los puntos es la base.
- El admin no debe ofrecer combos como premio (el alta no lo impide; solo falla al canjear).
- `_sincronizar_addons_del_plan` y su espejo en TS.
- Los reportes del admin que leen los descuentos del ticket.

## Límites conocidos

- La Edge Function `lealtad-canje` y el manejador del gateway **no se han ejecutado de punta a
  punta**: solo se probaron sus módulos de lógica. Las pruebas pgTAP y el horario de `pg_cron` tampoco
  se han corrido. Solo pgTAP corre en el CI, al abrir el PR; la Edge Function, el manejador del gateway y la
  programación diaria se ejercitan por primera vez al desplegar y en la prueba manual de la entrega,
  antes de usarlos con un negocio real.
- Dos casos de concurrencia no tienen prueba porque piden dos transacciones reales: un reintento
  simultáneo del mismo canje, y dos cuentas disputándose un mismo canje.
- Un token de dispositivo robado puede atribuir canjes a cualquier empleado activo de ese negocio.
- Puede haber un ciclo de bloqueos entre la fusión de un cliente en la caja y una venta en curso de
  un ticket de ese mismo cliente; Postgres aborta uno de los dos lados. Ocurre una vez por
  duplicado.
- Los tipos generados (`packages/db/src/database.types.ts`) no se regeneraron en esta entrega; quedan
  pendientes para el pull request (`pnpm db:types` desde un entorno limpio).

Diseño completo: `docs/superpowers/specs/2026-10-05-lealtad-design.md`.
