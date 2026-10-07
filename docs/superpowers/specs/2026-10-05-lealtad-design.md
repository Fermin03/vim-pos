# Sistema de lealtad

**Fecha:** 5 oct 2026
**Estado:** diseño aprobado por Fermín sección por sección, pendiente de plan
**Antecedentes:** decisión D20 de la especificación (cliente sin lealtad en el MVP), ADR 0004 (el
offline lo da el escritorio), ADR 0013 (el inventario viaja por movimientos), ADR 0014 (el panel
manda a la caja por latido), ADR 0021 (lo que incluye el plan), ADR 0026 (pantalla del cliente),
migración 0103 (`modulos_efectivos`), migración 0113 (add-on de delivery, el molde de dos capas),
migración 0117 (los clientes suben a la nube), PR #30 (asignar cliente a la cuenta).

## 1. El problema

VIM POS no tiene programa de lealtad. La especificación lo dejó fuera a propósito (D20) como parte
de un add-on "CRM Pro", y el análisis de competencia del 3 sep 2026 lo marcó como brecha frente a
Parrot, Soft Restaurant, Fudo y Wansoft.

La base ya existe: el cliente se identifica por teléfono (solo dígitos, índice único por negocio),
se asigna a la cuenta en Comedor, Para llevar, Pick-up y Domicilio, y sube a la nube. Lo que falta
es todo lo demás: reglas, saldo, canje, y que el cliente exista en todas las sucursales.

## 2. Alcance

**Entra**, en tres entregas, cada una con su propio plan de implementación:

1. **Núcleo.** Programa configurable en el admin, ganar y canjear en el POS (caja y web), saldo en
   el ticket impreso, reporte de movimientos, add-on en el panel de VIM, y clientes que bajan a la
   caja.
2. **Pantalla del cliente.** Nombre, saldo, lo que va a ganar y el canje aplicado.
3. **Página web de consulta.** Un QR en el ticket lleva al saldo y los premios del cliente.

**No entra:** WhatsApp ni ningún mensaje al cliente; niveles, puntos dobles, campañas y regalo de
cumpleaños; referidos entre clientes finales; tarjeta física o QR para identificarse (se identifica
por teléfono); más de un canje por ticket; puntos retroactivos por compras anteriores al encendido;
segmentación de clientes. Todo eso cabe después sobre el mismo libro de movimientos.

## 3. Decisiones de Fermín

| Tema | Decisión |
|---|---|
| Mecánica | El dueño elige **una** de tres: puntos que valen dinero, tarjeta de sellos, o puntos por productos |
| Alcance del saldo | Uno solo por negocio, compartido entre sucursales |
| Dónde ve el cliente su saldo | Ticket impreso, pantalla del cliente y página web |
| Comercial | Add-on de dos capas como delivery; **$100** de lista para Esencial, incluido desde Negocio |
| Canje sin internet | **No.** El canje exige conexión; ganar funciona sin internet |
| Vencimiento | Por inactividad, configurable por el dueño (meses o "nunca") |
| Control del cajero | Sin PIN para canjear; reporte, vista de control y tope diario. El ajuste manual sí queda firmado |
| Cambio de mecánica | Permitido; pone todos los saldos en cero, con doble confirmación |
| Lugar en el admin | Sección propia `/lealtad`, fuera de `/configuracion` |

## 4. Enfoque

**Libro de movimientos; la nube lleva el saldo y es la única que autoriza un canje.** Es el patrón
del ADR 0013 aplicado a puntos.

- **Ganar** funciona sin internet: la misma función SQL corre donde se cobre y escribe un
  movimiento. La caja lo sube en el push y la nube lo suma al saldo.
- **Canjear** es una llamada a la nube en el momento. Como hay una sola autoridad, no existe saldo
  negativo ni doble canje entre sucursales.
- **El saldo baja a la caja** solo para mostrarse. Nunca decide nada.

Se descartó que la nube derive los puntos de los tickets (el ticket no podría imprimir lo ganado
sin internet) y que todo fuera en línea (una venta sin internet no sumaría).

### Las tres mecánicas son un solo núcleo

| Mecánica | Cómo se gana | Cómo se canjea |
|---|---|---|
| `PUNTOS_DINERO` | Porcentaje del consumo. **1 punto = $1**, siempre | Descuento en pesos sobre la cuenta |
| `SELLOS` | 1 por visita, con compra mínima opcional | Un premio del catálogo que cuesta N sellos |
| `PUNTOS_PREMIOS` | 1 punto por cada $X | Un premio del catálogo que cuesta N puntos |

El saldo es siempre un entero. El canje entra a la cuenta **como descuento, nunca como forma de
pago**: "monedero electrónico" como forma de pago en el CFDI exige ser emisor autorizado por el
SAT; como descuento no cambia nada de lo que ya se timbra.

## 5. Datos

Tablas nuevas, todas con `tenant_id` y RLS:

| Tabla | Qué guarda | Quién escribe |
|---|---|---|
| `lealtad_programa` | Una fila por negocio: mecánica, versión, parámetros de ganar, compra mínima, meses de vencimiento, tope diario | Dueño o administrador |
| `lealtad_premios` | Producto del catálogo, costo en puntos o sellos, activo | Dueño o administrador |
| `lealtad_movimientos` | El libro. Tipos: `GANADO`, `CANJE`, `REVERSA_GANADO`, `REVERSA_CANJE`, `AJUSTE`, `VENCIMIENTO`. Cantidad con signo, cliente, sucursal, caja, ticket, usuario, versión del programa, saldo visto al escribirlo. Solo se agrega | Caja y nube |
| `lealtad_saldos` | Por cliente: saldo, última actividad, fecha de vencimiento | **Solo la nube** |
| `ticket_canjes_lealtad` | El canje aplicado a un ticket: movimiento que lo autoriza, premio o monto, renglón afectado | Quien cobra (caja o POS web), con la autorización de la nube; sube con el ticket |

Cambios a tablas que existen:

- `tickets.lealtad_mxn numeric(12,2)`, junto a `promociones_mxn` y `descuentos_manuales_mxn`. Lo
  mantiene `recalcular_totales_ticket()`. **Es el cambio de mayor alcance**: recálculo de totales,
  ticket impreso, corte, reportes y el descuento que se manda al CFDI. El plan lo recorre
  consumidor por consumidor.
- `clientes`: un código público inadivinable por cliente (para la entrega 3; se crea desde la 1
  para que baje a las cajas de una vez).
- `configuracion_tenant.modulo_lealtad_activo`: el interruptor del dueño.
- `addons`: fila `LEALTAD`, $100. `planes.features_incluidos.lealtad_incluido` para Negocio y
  Cadena. No se reutiliza `CRM_PRO`: ese nombre prometía además segmentación.
- Una tabla de alias de clientes para la fusión por teléfono (§8.4).

### Reglas

1. **Base del cálculo:** lo que el cliente pagó por comida, después de descuentos, promociones y
   canje; sin propina y sin envío.
2. **Quién gana:** solo cuentas con cliente asignado. Los pedidos de apps de delivery no ganan.
3. **Cuándo:** al quedar pagado el ticket. Cancelar o devolver genera la reversa.
4. **Inscripción automática:** todo cliente con teléfono participa desde el encendido.
5. **Tope:** máximo de compras que suman por cliente al día; 3 por defecto, configurable.
6. **Vencimiento:** cada compra o canje reinicia el reloj. Un proceso diario en la nube escribe los
   movimientos `VENCIMIENTO`, con las fechas en hora de México.
7. **Ajuste manual:** suma o resta desde el admin con motivo obligatorio; queda en el libro con el
   usuario que lo hizo.
8. **Cambio de mecánica:** sube la versión del programa y escribe un `AJUSTE` que deja cada saldo
   en cero. Doble confirmación mostrando cuántos clientes pierden saldo.
9. **Módulo apagado** (por el dueño o por VIM): los saldos se conservan congelados, nadie gana ni
   canjea, y nada vence. Al reencender, el reloj de vencimiento arranca de ese día.

La regla de "cuánto gana" vive en SQL (la que escribe el movimiento) y en TS (la que muestra "gana
X" mientras se captura). Como en el ADR 0021: cada lado apunta al otro y los casos de prueba son
los mismos.

## 6. Flujo en el POS

**Asignar cliente.** Con el módulo efectivo, la barra de la cuenta muestra nombre y saldo, y bajo
el total aparece lo que gana con esta compra.

**Canjear.** Botón en la cuenta, activo solo con conexión y saldo. El modal depende de la mecánica:

- `PUNTOS_DINERO`: cuánto usar, prellenado con el menor entre el saldo y el total.
- `SELLOS` y `PUNTOS_PREMIOS`: lista de premios; los alcanzables se eligen, los demás salen en gris
  con lo que falta.

Al confirmar, la caja llama a la nube (§8.3), recibe la autorización, escribe
`ticket_canjes_lealtad` y recalcula. **Un premio de producto entra como renglón normal a su precio
con descuento del 100%**, para que cocina reciba la comanda, el inventario se descuente y las
ventas reflejen lo que salió.

**Sin conexión:** el botón dice "Canje no disponible sin conexión". La venta, lo ganado y el ticket
siguen igual.

**Deshacer.** Quitar el canje antes de cobrar o cancelar el ticket genera `REVERSA_CANJE`. Una
reversa solo devuelve saldo, así que es segura sin internet y sube en el push. Con un canje
aplicado no se puede cambiar el cliente de la cuenta.

**Llamada a medias** (la nube descontó y la caja no recibió respuesta):

1. La caja genera el id del canje antes de llamar; reintentar con el mismo id devuelve el mismo
   resultado.
2. El proceso diario de la nube revierte todo canje cuyo ticket llegó cancelado o no llegó pagado
   en 48 horas.

**Ticket impreso**, al pie: lo ganado, el saldo y la fecha de vencimiento. Sin internet el saldo es
el último bajado más los movimientos locales sin subir. El movimiento guarda ese saldo, así que la
reimpresión sale idéntica.

**Límites:** un canje por ticket; en cuentas divididas va al ticket del cliente asignado; sin PIN.
El POS web hace lo mismo directo contra la nube. El modal nuevo declara su capa en la pila de
Escape y respeta los controles de 44 px; lo visual se resuelve contra `docs/diseno/` y los tokens.

## 7. Admin y panel

### `/lealtad` en el admin

Sección propia, al nivel de Clientes y Reportes. Aparece si el módulo está **permitido**; adentro
está el interruptor (el admin se guía por permitidos, el POS y la caja por efectivos).

- **Programa:** elegir mecánica con un ejemplo que se actualiza en vivo; parámetros; vencimiento;
  tope. Avisa si la caja reporta una versión que aún no conoce el módulo.
- **Premios:** se eligen del catálogo y se les pone costo. Un producto dado de baja apaga su premio.
- **Movimientos:** cuatro cifras (emitido, canjeado, saldo vivo, clientes con saldo; el saldo vivo
  en pesos cuando la mecánica es `PUNTOS_DINERO`), el libro filtrable por sucursal, cajero, cliente
  y fecha, y la vista de control: clientes que llegan seguido al tope y cajeros con canjes
  concentrados en pocos clientes.

En **Clientes**, la lista gana la columna de saldo y la ficha muestra saldo, vencimiento, historial
y el ajuste manual.

**Permisos:** configura dueño o administrador; el encargado de sucursal ve los movimientos de la
suya.

### `/platform`

Add-on `LEALTAD` con el mecanismo de `tenant_addons`. `cambiar_plan_tenant()` lo da a $0 al subir a
Negocio o Cadena y lo retira al bajar si estaba marcado como incluido en el plan.

## 8. Sincronización

### 8.1 Baja a la caja

`lealtad_programa`, `lealtad_premios`, `lealtad_saldos` y **`clientes`**, que hoy no baja. Clientes
y saldos bajan de forma incremental.

### 8.2 Sube de la caja

`lealtad_movimientos`: la nube inserta cada uno solo si su id es nuevo y, por cada uno que entra,
lo aplica a `lealtad_saldos` y recalcula la fecha de vencimiento. `ticket_canjes_lealtad` viaja
con su ticket y entra en su huella. La caja nunca sube saldos.

Saldo que muestra la caja = saldo de la nube + movimientos locales pendientes de push.

### 8.3 El canje

Edge Function `lealtad-canje` con tres acciones: canjear, revertir y consultar saldo. Acepta sesión
de empleado o token de dispositivo (el puente del gateway local que ya usa `delivery-accion`) y
exige el módulo efectivo. Por dentro llama una función SQL que bloquea la fila del saldo, valida y
escribe el movimiento en una transacción. El POS web llama esa función SQL por RPC bajo RLS.

### 8.4 El mismo teléfono en dos sucursales

Dos cajas pueden registrar al mismo teléfono antes de sincronizar; el índice único de la nube
rechazaría al segundo. **El teléfono es la identidad y la nube decide:** cuando llega un cliente
cuyo teléfono ya existe con otro id, la nube lo anota como alias del existente y redirige a él los
tickets y movimientos que traía. En el siguiente pull la caja recibe la corrección, repunta sus
tickets y elimina el duplicado.

Es la pieza con más riesgo: toca la tabla de clientes de negocios que ya operan.

### 8.5 Casos borde

- **Tope entre sucursales:** cada caja lo aplica con lo que conoce. La nube acepta lo que llegue,
  porque el ticket ya lo imprimió; el exceso se ve en la vista de control.
- **Movimientos de una versión anterior del programa:** se registran y no suman.
- **Caja sin actualizar:** ignora el módulo y vende normal.

### 8.6 Orden de salida

1. Migración a producción y función desplegada, **antes** de mezclar.
2. Mezclar (admin y panel).
3. Instalador, con la lista "Antes de empaquetar" del RUNBOOK.

Al revés, una caja nueva contra una nube vieja anotaría como subidos movimientos que la nube
ignoró, y esos puntos se perderían sin aviso (la trampa de la 0117).

## 9. Entrega 2 — Pantalla del cliente

Sin migración. Con cliente asignado: nombre de pila, saldo y lo que gana. El canje aplicado se ve
como renglón, para que el cliente confirme lo que el cajero hizo. En el agradecimiento, lo ganado y
el saldo nuevo. Solo nombre de pila: nunca teléfono ni apellido.

## 10. Entrega 3 — Página web de consulta

Un QR al pie del ticket lleva a una página pública de solo lectura: logo del negocio, saldo,
vencimiento, premios con lo que falta para cada uno, y los últimos movimientos (fecha y cantidad,
sin montos).

- **No se consulta por teléfono.** Se entra con el código público del cliente, que viaja en el QR
  y ya está en la caja, así que el QR se imprime sin internet.
- La sirve una función pública con límite de peticiones, desplegada con `verify_jwt=false`.
- Enlace al aviso de privacidad. Eliminar al cliente invalida el código.

Dónde vive (app nueva o junto al portal de autofactura) se decide al planear esta entrega.

## 11. Pruebas

| Qué | Cómo |
|---|---|
| Aislamiento entre negocios en las tablas nuevas | Pruebas RLS; bloquean el merge |
| Ganar en cada mecánica: redondeo, base, compra mínima, tope | Smokes `.sql` |
| Dos canjes simultáneos del mismo saldo: solo uno pasa | Smoke con dos sesiones |
| Reintento del mismo canje no descuenta dos veces | Smoke |
| Reversas por quitar, cancelar y devolver | Smokes |
| Vencimiento en hora de México | Smoke; sin `CURRENT_DATE` contra fechas de negocio |
| Cambio de mecánica y movimientos de versión anterior | Smoke |
| Módulo apagado: nada se gana, canjea ni vence | Smoke |
| Fusión de clientes por teléfono | Smoke en la nube y prueba del pull en la caja |
| Movimientos suben; saldo local correcto | Pruebas del escritorio con Postgres embebido |
| "Gana X" coincide entre TS y SQL | Los mismos casos en los dos lados |
| Totales con `lealtad_mxn`, corte y reportes | Smokes de dinero |
| Ticket con canje timbra bien, individual y en factura global | Sandbox de Facturama |
| Cliente → venta → canje → cobro → ticket | E2E |
| Ticket impreso | Epson simulada en Playwright |

Antes de Knock-Out: prueba en el negocio de pruebas con dos sucursales, incluido el registro del
mismo teléfono en ambas.

## 12. Documentación y publicación

- **ADR 0030:** la lealtad viaja por movimientos y el canje lo autoriza la nube. Supera D20 y
  amplía la lista de tablas del ADR 0004.
- La página de precios y las promesas del sitio cambian solo cuando la entrega 1 esté publicada,
  con la lista de lo que incluye aprobada antes por Fermín.

## 13. Correcciones al planear (5 oct 2026)

Al leer el código para el plan 1A, seis puntos de este documento resultaron distintos. Manda lo de
aquí sobre las secciones de arriba:

1. **El pull no es incremental (§8.1).** Baja el negocio completo, cada hora. Un cliente o un saldo
   de otra sucursal tarda hasta una hora en verse en la caja. El canje no depende de eso: pregunta
   a la nube en el momento y resuelve al cliente por teléfono.
2. **El POS web también canjea por la Edge Function (§8.3)**, no por RPC directa. Una sola entrada
   para web y caja, en dos pasos: canjear (la nube descuenta) y asentar (se pega al ticket donde
   viva).
3. **No hay permisos por sucursal (§7).** El proyecto no tiene RLS por sucursal; que el encargado
   vea "solo su sucursal" es un filtro del admin, como en los demás reportes. Y el rol `ADMIN` ya
   es "gerente o encargado": configura dueño o admin.
4. **No existen pruebas E2E con Playwright ni "Epson simulada" (§11).** El ticket impreso se prueba
   con las pruebas de `ticket-builder` y `escpos`; la ruta completa, con los scripts `verify:*` del
   escritorio.
5. **Una caja sin actualizar dejaría de subir ventas** en cuanto la migración esté en producción,
   porque las columnas nuevas son obligatorias y la nube inserta NULL en lo que no recibe. El plan
   añade un relleno en el push. No estaba en el diseño.
6. **Al actualizar, cada caja vuelve a subir 60 días de ventas y sus clientes**, una vez. Es el
   mismo efecto que tuvo la 0122 en Knock-Out.

De los pendientes del punto 14: `CRM_PRO` nunca se sembró (no hay nada que limpiar); el proceso
diario corre con `pg_cron`, como `delivery-retencion`; un cliente con teléfono repetido hoy se
rechaza y se reintenta para siempre, ocupando cupo del techo de 500 por corrida (lo arregla la
fusión).

## 14. Por verificar al planear

- Todos los consumidores de los totales del ticket que deben conocer `lealtad_mxn`.
- Cómo trata hoy `sync_push_snapshot` un cliente con teléfono repetido (0117).
- Con qué mecanismo corre el proceso diario en la nube.
- Si la fila `CRM_PRO` existe en `addons` de producción y qué hacer con ella.
