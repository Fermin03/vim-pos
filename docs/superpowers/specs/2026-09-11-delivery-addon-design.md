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

**Entra:** que `delivery_apps` se resuelva como add-on de pago; que apagarlo le diga a Uber que
deje de mandar pedidos; que la caja deje de sondear; que las superficies del admin y del POS
desaparezcan; y un lector de módulos para el admin, que hoy no tiene.

**No entra:** el precio del add-on (es un dato, lo decide Fermín al darlo de alta); DiDi y Rappi
(no existen todavía, pero el módulo es uno solo para "apps de delivery", no uno por app); cambiar
la cadencia del espejo, que ya está bien; y cualquier cambio al flujo de pedidos en sí.

## 3. Decisiones tomadas

1. **De pago, como el CFDI.** Lo permite VIM por cliente, no el plan.
2. **Al apagarse, se le avisa a Uber.** `integration_enabled = false`, para que Uber deje de
   mandar pedidos y los maneje por su tablero. Es la única opción en la que ningún cliente final
   paga por comida que nadie va a preparar.
3. **Sin el add-on, desaparece por completo.** Ni sección en el admin ni pantalla en el POS.

## 4. El add-on

Una fila en `addons` con código `DELIVERY`, hermana de la de `CFDI` (0081:26). La tabla es de
`0002_nucleo_comercial.sql:105` y trae `precio_mensual_mxn`, `visible_publico` y `activo`.

El precio lo fija Fermín, así que la migración inserta la fila con `precio_mensual_mxn = 0.00` y
**`visible_publico = false`**: el add-on existe y se puede asignar a mano, pero no aparece como
contratable hasta que alguien le ponga precio. Darlo de alta a un cliente es insertar en
`tenant_addons`, igual que el CFDI.

En `modulos_efectivos` (0103), `delivery_apps` **sale del bucle** de `tenant_feature_flags`/plan y
pasa a resolverse como el CFDI:

```sql
v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', v_perm);
```

`permitidos` y `efectivos` coinciden porque el dueño no tiene interruptor propio: o lo contrató o
no. Es la misma forma que el CFDI.

La migración **quita `delivery_apps` de `planes.features_incluidos->'modulos'`** en los nueve
planes donde 0103 lo puso. Si no se quita, queda una llave muerta que confundirá al siguiente que
lea la tabla.

**Nadie pierde nada al aplicarla:** ningún restaurante real usa apps de delivery hoy (confirmado
por Fermín el 11 sep 2026); la integración solo la ejercita el tenant de pruebas. El tenant
`vim-pruebas` recibe su fila en `tenant_addons` dentro de la misma migración, para no quedarse sin
su propio banco de pruebas.

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

Cuatro sitios, y el orden importa: los **tres primeros son la barrera**; el último es cortesía.

**El webhook (`delivery-webhook-uber`).** Antes de procesar, comprueba el módulo del tenant de la
conexión. Sin módulo: registra el evento con un motivo claro y **no crea pedido**. Es la barrera
que impide que entre trabajo de un cliente que no paga, y la que cubre el caso de que la llamada a
Uber de §5 haya fallado.

**El espejo (`delivery-espejo`).** Sin módulo, contesta sin datos y con la cadencia de reposo. Esto
es lo que hace que una caja que todavía no se enteró —o que no se actualice nunca— deje de pesar,
sin publicar un instalador. Es la propiedad que hace que este diseño funcione en caliente.

**`delivery-uber-conexion`.** Sin módulo, todas sus acciones responden 403. Si no, el dueño podría
reconectar su tienda por OAuth y recuperar el servicio sin pagarlo.

**El admin y el POS** esconden sus superficies. Es cortesía, no seguridad: quien se salte la
interfaz choca con los tres guards de arriba.

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
cuando el módulo está apagado, y la ruta `/configuracion/integraciones` redirige. Hace falta un
lector de módulos que **hoy no existe**: el admin lee el de inventario a pelo desde
`configuracion_tenant` (`apps/admin/app/lib/inventario.ts:166-171`) y no tiene nada genérico. Se
añade `apps/admin/app/lib/modulos.ts` que llama al RPC `modulos_efectivos`, que ya tiene
`GRANT EXECUTE ... TO authenticated` (0103:115).

**POS.** `apps/pos/app/lib/directivas.ts` ya expone `modulos: Record<string, boolean>`. `home-pos.tsx`
deja de montar `PantallaPedidosApps` y su badge cuando `modulos.delivery_apps` es falso.

## 9. Pruebas

- `modulos_efectivos` devuelve `delivery_apps: false` sin `tenant_addons`, `true` con uno vigente, y
  `false` de nuevo cuando la vigencia caduca. Es la prueba que fija el cambio de fuente.
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

**Una caja vieja que nunca se actualiza.** Sigue arrancando su espejo. La cubre el guard del
espejo: contesta vacío y en reposo. Pesa 288 llamadas al día en vez de 0 — el mismo número que hoy,
así que no empeora nada.

**El módulo es uno solo para todas las apps.** Cuando entren DiDi o Rappi, contratar delivery las
habilita todas. Es lo correcto hoy (no existen) y el día que se quiera cobrar por app, el cambio es
partir el add-on, no rehacer el mecanismo.

**Confundir "está en producción" con "está en uso".** Pasó el 11 sep 2026 al evaluar el riesgo de
esta misma integración. Aquí importa: el diseño se apoya en que nadie usa delivery para migrar sin
red. Si eso deja de ser cierto antes de implementar, hay que revisar §4.
