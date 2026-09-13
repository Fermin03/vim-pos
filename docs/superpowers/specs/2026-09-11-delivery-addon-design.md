# Las apps de delivery son un add-on de pago

**Fecha:** 11 sep 2026
**Estado:** diseño aprobado, pendiente de plan
**Antecedentes:** ADR 0011 (integración de apps de delivery), ADR 0014 (el panel manda a la caja
por latido), migración 0081 (el add-on de CFDI), migración 0103 (`modulos_efectivos`), migración
0105 (`resolver_directivas`).

## 1. El problema

`delivery_apps` ya existe como módulo en `modulos_efectivos` (0103) y hoy vale `true` en **todos**
los planes. Nadie lo comprueba en ningún sitio: es una llave que nunca se usó. Eso tiene dos
consecuencias.

**Comercial.** La integración con Uber Eats costó una entrega entera de construir y dos de pulir, y
se regala con cualquier plan, incluido el Esencial. No hay forma de cobrarla ni de decidir quién la
tiene.

**De carga.** El espejo de pedidos arranca en toda caja vinculada a la nube (`desktop/src/main.mjs:792`),
use el cliente delivery o no.

Sobre la carga conviene ser exacto, porque el problema grande **ya se resolvió**. Hasta el 9 sep
2026 el espejo sondeaba cada 10 s siempre: 8 640 llamadas por caja al día, casi todas para que la
nube contestara que no hay nada. `_shared/delivery/espejo.ts` corrigió eso poniendo a las cajas sin
conexiones vivas en reposo de 5 minutos. Lo que queda es:

| | Hoy | Con el add-on |
|---|---|---|
| Caja sin delivery | 288 llamadas/día | **0** |
| A 200 cajas | 57 600/día | **0** |

Un ahorro real, pero un orden de magnitud menor que antes del arreglo de septiembre. **El motivo
que manda en este diseño es el comercial**; la carga es una consecuencia agradable, no la urgencia.

## 2. Alcance

**Entra:** que `delivery_apps` se resuelva como add-on de pago que concede VIM; un interruptor del
dueño para encenderlo; que retirar el add-on le diga a Uber que deje de mandar pedidos; que la caja
deje de sondear cuando no está encendido; que las superficies del admin y del POS desaparezcan sin
permiso; y un lector de módulos para el admin, que hoy no tiene.

**No entra:** DiDi y Rappi
(no existen todavía, pero el módulo es uno solo para "apps de delivery", no uno por app); cambiar
la cadencia del espejo, que ya está bien; y cualquier cambio al flujo de pedidos en sí.

## 3. Decisiones tomadas

1. **Lo enciende VIM por cliente, desde `/platform`.** Nunca el plan y nunca el dueño. El plan solo
   decide **cuánto cuesta**: incluido (sin cargo) desde Negocio ($999) y Cadena ($1,999), y **$100
   al mes** para Esencial ($699), que así paga $799 — por debajo de los $999 de subir de plan.
2. **Al apagarse, se le avisa a Uber.** `integration_enabled = false`, para que Uber deje de
   mandar pedidos y los maneje por su tablero. Es la única opción en la que ningún cliente final
   paga por comida que nadie va a preparar.
3. **Dos capas: VIM permite, el dueño enciende.** Es la forma que ya usa `recetas` (ADR 0013).
   Fermín concede el add-on desde `/platform`; el dueño lo activa en "Apps de delivery" cuando lo
   vaya a usar. Sin el add-on, la sección **desaparece por completo** del admin y del POS.

## 4. El add-on

Una fila en `addons` con código `DELIVERY`, hermana de la de `CFDI` (0081:26), con
`precio_mensual_mxn = 100.00` — el precio de lista, que es el que paga un Esencial.

Encenderlo a un cliente es insertar en `tenant_addons`, igual que el CFDI. Lo que hace que un solo
mecanismo cubra los dos casos es que **`tenant_addons.precio_mensual_mxn` es por fila**
(`0002_nucleo_comercial.sql:234`):

| Plan | La fila lleva | El cliente paga |
|---|---|---|
| Esencial $699 | `100.00` | $799 |
| Negocio $999 | `0.00`, `notas = 'incluido en el plan'` | $999 |
| Cadena $1,999 | `0.00`, `notas = 'incluido en el plan'` | $1,999 |

El panel **pre-llena ese precio según el plan del cliente** al dar de alta el add-on: $100 si es
Esencial, $0 si es Negocio o Cadena. Fermín puede cambiarlo (una cortesía, una promoción), pero el
valor por defecto es el correcto. Así la política de precios vive en un sitio y no en la memoria de
quien rellena el formulario.

**"Incluido desde $999" es política de cobro, no un permiso automático.** El plan NO concede el
módulo: si lo concediera, la caja de todo cliente de Negocio en adelante sondearía pedidos aunque
nunca conecte una tienda, y se perdería el ahorro que motiva esta entrega. Mecánicamente es idéntico
en los tres planes —Fermín lo enciende— y lo único que cambia es el número en la fila.

En `modulos_efectivos` (0103), `delivery_apps` **sale del bucle** de `tenant_feature_flags`/plan y
pasa a resolverse como el CFDI:

```sql
v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
v_enc  := COALESCE(v_del, false);   -- configuracion_tenant.modulo_delivery_activo
v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', (v_perm AND v_enc));
```

Aquí `permitidos` y `efectivos` **no** coinciden, a diferencia del CFDI: el add-on da el permiso y
el dueño da el encendido. Ver §4b.

La migración **quita `delivery_apps` de `planes.features_incluidos->'modulos'`** en los nueve
planes donde 0103 lo puso. Si no se quita, queda una llave muerta que confundirá al siguiente que
lea la tabla.

**Nadie pierde nada al aplicarla:** ningún restaurante real usa apps de delivery hoy (confirmado
por Fermín el 11 sep 2026); la integración solo la ejercita el tenant de pruebas. El tenant
`vim-pruebas` recibe su fila en `tenant_addons` dentro de la misma migración, para no quedarse sin
su propio banco de pruebas.

## 4b. Los tres estados

El interruptor del dueño vive en `configuracion_tenant.modulo_delivery_activo` (boolean, por
defecto **false**), hermano de `modulo_inventario_activo`, que es como ya se enciende `recetas`
(ADR 0013, `apps/admin/app/lib/inventario.ts:166-183`).

| Estado | Cuándo | Admin | POS | ¿La caja sondea? |
|---|---|---|---|---|
| **No permitido** | Fermín no dio el add-on | la sección no existe | nada | no |
| **Permitido, apagado** | lo dio; el dueño no lo activó | sección con interruptor y una línea de qué hace | nada | **no** |
| **Permitido, encendido** | el dueño lo activó | sección completa | pantalla de pedidos | sí |

El estado de en medio es el que hace que el interruptor valga la pena. **No es burocracia: es lo
que conserva el ahorro.** Sin él, a todo cliente con el add-on concedido le sondearía la caja
aunque nunca conecte una tienda, y volveríamos a las 288 llamadas diarias por caja.

De ahí sale una asimetría que el plan debe respetar: **el admin se guía por `permitidos`** (para
poder mostrar el interruptor apagado) y **el POS y la caja por `efectivos`** (la pantalla y el
sondeo solo existen cuando está encendido de verdad). `modulos_efectivos` devuelve los dos;
`resolver_directivas` manda solo `efectivos`, que es justo lo que la caja necesita.

Apagar el interruptor **no** avisa a Uber: es una decisión del dueño, no un corte comercial, y el
dueño puede volver a encenderlo. Lo que sí avisa a Uber es retirar el add-on (§5). Pero mientras
esté apagado, los guards de §6 rechazan igual, así que un pedido que llegue no se cuela.

## 5. Apagar de verdad

Apagar es quitar la vigencia en `tenant_addons`. Eso cambia `modulos_efectivos` al instante, pero
Uber no lee nuestra base: hay que decírselo.

La acción ya existe. `delivery-uber-conexion` tiene `case "pausar"` (`index.ts:195-208`), que llama
`uber.posData(tienda).actualizar({ integration_enabled: false })` y registra el evento. **Se
reutiliza tal cual**: al retirar el add-on, cada conexión del tenant en estado vivo pasa por ese
mismo camino.

Quién lo dispara: el panel `/platform`, en la ficha del cliente, al retirar el add-on. No un
trigger de base de datos — la llamada a Uber es I/O de red y no tiene nada que hacer dentro de una
transacción.

**Si la llamada a Uber falla**, el add-on se retira igual (el cliente dejó de pagar) y queda un
evento de error en `delivery_eventos` más el aviso en la conexión. La consecuencia es acotada y
visible: Uber seguiría mandando pedidos, pero el webhook los rechaza por el guard de §6 y el
restaurante los ve en el tablero de Uber. El panel muestra el fallo para que alguien reintente.

## 6. Dónde se hace cumplir

Cinco sitios, y el orden importa: los **cuatro primeros son la barrera**; el último es cortesía.

**El webhook (`delivery-webhook-uber`).** Antes de procesar, comprueba el módulo del tenant de la
conexión. Sin módulo: registra el evento con un motivo claro y **no crea pedido**. Es la barrera
que impide que entre trabajo de un cliente que no paga, y la que cubre el caso de que la llamada a
Uber de §5 haya fallado.

**El espejo (`delivery-espejo`).** Sin módulo, contesta sin datos y con la cadencia de reposo. Esto
es lo que hace que una caja que todavía no se enteró —o que no se actualice nunca— deje de pesar,
sin publicar un instalador. Es la propiedad que hace que este diseño funcione en caliente.

**`delivery-uber-conexion`.** Sin módulo, todas sus acciones responden 403. Si no, el dueño podría
reconectar su tienda por OAuth y recuperar el servicio sin pagarlo.

**`delivery-accion`** (añadido el 13 sep 2026, después de probar en producción). Sin módulo, sus
acciones de **tienda** —`tienda_estado`, `tienda_pausar`, `tienda_reanudar`, `tienda_prep`—
responden 403. Sus acciones de **pedido** (aceptar, rechazar, listo, reclamar…) pasan igual, por la
misma razón por la que §5 exime `desconectar`: a un cliente al que se le retira el módulo con
pedidos vivos hay que dejarlo despachar comida que el cliente final ya pagó. Pedidos nuevos no
entran, porque el webhook los descarta antes.

> **Esta función faltaba en la primera versión de este spec, y era la peor de olvidar.** La
> pantalla "Pedidos de apps" del POS le pregunta el estado de la tienda **cada 60 s**
> (`REFRESCO_TIENDA_MS`), y eso sale a Uber. Con el módulo apagado seguía saliendo: 56 de los
> últimos 60 eventos de salida en producción eran ese sondeo. Esconder la pantalla no basta —
> depende de que el cliente esté actualizado y de que nadie tenga una pestaña abierta desde antes.

Los cuatro miran **`efectivos`**: sin add-on o con el interruptor del dueño apagado, rechazan igual.

**El admin y el POS** esconden sus superficies —el admin por `permitidos`, el POS por `efectivos`
(§4b)—. Es cortesía, no seguridad: quien se salte la interfaz choca con los cuatro guards de arriba.

## 7. La caja deja de preguntar

Es donde desaparece la carga.

`resolver_directivas` (0105:59) **ya manda los módulos efectivos** a la caja en cada latido, cada 10
minutos. La caja los recibe y los ignora. El cambio es que `main.mjs` condicione el arranque del
espejo a `modulos.delivery_apps`, y que lo detenga si el latido deja de traerlo.

Dos detalles que el plan no puede saltarse:

- **Al arrancar, la caja todavía no tiene latido.** Se guarda el último conocido, como ya se hace
  con el acceso; si no hay ninguno, el espejo **no** arranca y el primer latido decide. Arrancar
  por defecto contradiría el propósito.
- **La falta de datos nunca bloquea la venta.** Es el invariante duro de ADR 0014 y aquí no se
  toca: sin latido la caja sigue vendiendo; lo único que no hace es sondear pedidos de apps.

## 8. Las superficies

**Admin.** `apps/admin/app/components/config-sidenav.tsx:18` deja de pintar "Apps de delivery"
cuando el módulo **no está permitido**, y la ruta `/configuracion/integraciones` redirige.

Cuando está permitido pero apagado, la sección se ve con el interruptor de activar y una línea de
qué hace; el asistente de conexión de Uber aparece solo al encenderlo. El interruptor escribe
`configuracion_tenant.modulo_delivery_activo` con el mismo patrón de upsert que ya usa el de
inventario (`apps/admin/app/lib/inventario.ts:183`).

Hace falta además un lector de módulos que **hoy no existe**: el admin lee el de inventario a pelo
desde `configuracion_tenant` y no tiene nada genérico. Se añade `apps/admin/app/lib/modulos.ts` que
llama al RPC `modulos_efectivos` —que ya tiene `GRANT EXECUTE ... TO authenticated` (0103:115)— y
devuelve **las dos capas**, porque el admin necesita `permitidos` para distinguir el estado de en
medio.

**POS.** `apps/pos/app/lib/directivas.ts` ya expone `modulos: Record<string, boolean>`. `home-pos.tsx`
deja de montar `PantallaPedidosApps` y su badge cuando `modulos.delivery_apps` es falso.

## 9. Pruebas

- `modulos_efectivos` y las dos capas: sin `tenant_addons`, `permitido` y `efectivo` en `false`; con
  add-on vigente y el interruptor apagado, `permitido` **true** y `efectivo` **false** (el estado de
  en medio, el que más fácil se implementa mal); con los dos, ambos en `true`; y `false` otra vez
  cuando la vigencia caduca, aunque el interruptor siga encendido.
- Los tres guards de Edge Function: con módulo pasan, sin módulo rechazan **y no escriben nada**.
  Que no escriban es la parte que importa: un guard que rechaza pero deja el pedido creado no sirve.
- La cadencia de reposo para un tenant sin módulo, en `_shared/delivery/espejo.ts`, con `node --test`.
- La caja: el espejo no arranca sin módulo, arranca con él, y se detiene cuando el latido se lo
  quita. Probado con relojes y latidos inyectados, como ya se prueba `delivery-espejo-ritmo.mjs`.
- Un smoke de que quitar el add-on deja las conexiones pausadas.
- **La prueba de no-regresión que más importa:** un tenant CON el add-on se comporta exactamente
  igual que hoy, de punta a punta. Esta entrega no debe cambiar nada para quien sí paga.

## 10. Riesgos

**El que más duele: apagarlo a alguien que está vendiendo.** No hoy —nadie usa delivery— pero sí en
cuanto haya un cliente. Retirar el add-on a media comida corta pedidos en curso. El diseño no lo
impide a propósito: Fermín pidió poder cortar a quien no paga. La mitigación es de operación, no de
código: retirar add-ons fuera de horario de servicio, y que el panel avise de cuántos pedidos vivos
hay antes de confirmar.

**El dueño apaga su interruptor sin querer y deja de recibir pedidos.** Uber sigue ofreciendo la
tienda porque el add-on sigue vigente, así que los pedidos entran a Uber y el POS los rechaza. Es
el mismo modo de fallo que ya tiene `recetas` con su interruptor, pero ahí solo deja de descontar
inventario y aquí se pierden ventas. Mitigación: el interruptor pide confirmación cuando hay
conexiones activas, y decirlo en la confirmación — "Uber seguirá mandando pedidos y no los verás
aquí". No se resuelve avisando a Uber, porque apagar es reversible y el dueño lo reactivará.

**Una caja vieja que nunca se actualiza.** Sigue arrancando su espejo. La cubre el guard del
espejo: contesta vacío y en reposo. Pesa 288 llamadas al día en vez de 0 — el mismo número que hoy,
así que no empeora nada.

**El módulo es uno solo para todas las apps.** Cuando entren DiDi o Rappi, contratar delivery las
habilita todas. Es lo correcto hoy (no existen) y el día que se quiera cobrar por app, el cambio es
partir el add-on, no rehacer el mecanismo.

**Confundir "está en producción" con "está en uso".** Pasó el 11 sep 2026 al evaluar el riesgo de
esta misma integración. Aquí importa: el diseño se apoya en que nadie usa delivery para migrar sin
red. Si eso deja de ser cierto antes de implementar, hay que revisar §4.
