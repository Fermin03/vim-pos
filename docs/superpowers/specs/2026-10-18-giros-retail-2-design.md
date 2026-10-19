# Giros de retail, segunda tanda (abarrotes, frutería, ferretería, vinos) — diseño

Fecha: 18 oct 2026. Base: el giro RETAIL de ropa y calzado
(`2026-10-15-giro-retail-design.md`, entregas 1–5 en la rama local `feat/retail-abrir`).

## 1. Para qué

Fermín quiere que VIM POS se pueda vender a más tiendas que restaurantes, y **nada sale a producción
hasta tener todos los giros que eligió**. Los repartió en tres tandas, en este orden:

1. **Retail:** tiendas y supermercados, fruterías, ferreterías, vinos y licores. Este documento cubre esta tanda.
2. **Servicios:** talleres automotrices y similares. Va en un documento aparte.
3. **Belleza:** salón de belleza, spa, peluquería, barbería y tatuajes/piercings. Va en un documento aparte.
   *Pregunté si tatuajes va con belleza; no hubo respuesta todavía.*

Esta tanda reutiliza la caja de tienda que ya existe: escáner, existencias, Panel con barra inferior.
Le agrega tres cosas que la ropa no necesitaba: **vender por kilo, metro o litro**, **crédito** y **cotizaciones**.

## 2. Decisiones de Fermín (18 oct)

- **Giros nuevos y lo que traen encendido al nacer:**

  | Giro en el registro | De inicio |
  |---|---|
  | Tienda de abarrotes o supermercado | existencias, venta por peso |
  | Frutería y verdulería | existencias, venta por peso |
  | Ferretería | existencias, venta por kilo/metro/litro, crédito, cotizaciones |
  | Vinos y licores | existencias |

  (Ropa o calzado sigue como está.)
- **Todos usan la misma caja de tienda.** Vinos y licores no tiene nada propio. Quedan fuera los
  horarios de venta y la ley seca; se agregan si un cliente los pide.
- **Venta por unidad.** Cada producto se vende por pieza, kilo, metro o litro y guarda su precio por esa
  unidad. Al tocarlo o escanearlo, si no es pieza, se abre una ventana de cantidad con su unidad
  («Peso: 0.000 kg», «Metros: 0.00», «Litros: 0.00»). La cajera teclea, da Enter, y el renglón entra con
  cantidad × precio por unidad. Ejemplo: «Jitomate · 1.250 kg × $28 = $35.00».
- **Báscula: primero se teclea.** Nadie la ha pedido y Fermín tendría que comprar una. La ventana de
  cantidad queda lista para que, más adelante, una báscula ponga el peso en vez de teclearlo. Nada de
  hardware hasta que Fermín lo pida (misma regla que la terminal).
- **Pintura:** el galón o la cubeta cerrada es una pieza con su precio; la que se surte por litro es un producto por litro.
- **Crédito** (propuesta aceptada tal cual):
  - El dueño da de alta el crédito **por cliente** en el admin, con **límite en pesos y plazo en días**.
    Solo pueden comprar a crédito los clientes que él autoriza.
  - En la caja, **«A crédito» es una forma de pago más**. Exige un cliente asignado con crédito activo.
    Si la venta pasa del límite o el cliente tiene pagos vencidos, **pide el PIN de un supervisor**.
  - La venta es una venta: folio y existencias descontadas. Su dinero queda **por cobrar** y **no entra al corte**.
  - **Abonos** desde la caja, totales o parciales, en efectivo, tarjeta o transferencia. Cada abono **sí
    entra al corte** del turno en que se recibe.
  - El admin muestra quién debe, cuánto, desde cuándo y qué está vencido.
  - Fuera de esta versión: intereses, recargos y estados de cuenta por correo.
- **Cotizaciones** (propuesta aceptada):
  - Se arman como un ticket, con metros y kilos incluidos, y se guardan como **cotización con folio propio** (COT-…).
  - Llevan los precios del día y una **vigencia que fija el dueño** (por ejemplo, 15 días).
  - Se imprimen en el ticket o **se mandan por WhatsApp como PDF**.
  - No descuentan existencias ni son venta.
  - **«Convertir en venta»** las carga para cobrar. Si venció o cambió algún precio, la caja avisa y cobra con los precios de hoy.
  - El admin muestra las cotizaciones hechas y cuáles se volvieron venta.
- **Crédito y cotizaciones son interruptores** de módulo: se pueden encender en cualquier giro de esta
  tanda, no solo en ferretería. La venta por unidad se define en cada producto, así que cualquier tienda
  puede tener algo a granel.
- **Barra inferior de la caja de tienda, con nombres nuevos:** **Cobrar** (lo que hoy se llama Panel) ·
  Inventario · Transacciones · Notificaciones · **Más**.
  - «Más» reemplaza a Configuración.
  - Adentro de «Más» van **Cotizaciones** (vigentes y vencidas; buscar por folio o cliente; reimprimir o
    mandar por WhatsApp; «Convertir en venta»; «Nueva cotización») y **Créditos** (quién debe, cuánto,
    qué está vencido, «Registrar abono»).
  - Fermín pidió un menú específico para cotizaciones; por eso tienen su lugar en «Más», además de
    «Guardar como cotización» en el menú «⋯» de Cobrar.

- **Facturación del crédito:** una venta a crédito **solo se factura cuando queda liquidada**. Mientras
  deba algo no se puede facturar: ni el cliente en el portal de autofactura ni la caja. Al liquidarse
  se factura como cualquier venta pagada. No hay complemento de pago en esta versión.
- **Cancelar o devolver una venta a crédito con abonos:** el **dueño elige** si lo abonado se le regresa
  al cliente **en efectivo** (sale del corte del turno) o se le queda como **saldo a favor** para su
  siguiente compra. Sin abonos, la deuda simplemente desaparece.
- **Crédito y cotizaciones los enciende el dueño en su admin**, sin costo, en cualquier plan.
- **Existencias van incluidas** en todos los planes para estos cuatro giros, como en ropa.

## 3. Lo que decidí yo (Fermín puede corregirlo)

- **«El dueño elige» lo leí como una opción del negocio en el admin:** «Al cancelar o devolver una
  venta a crédito con abonos: regresar en efectivo / dejar saldo a favor», con «saldo a favor» por
  omisión. Ese saldo a favor se usa en la caja como forma de pago («Saldo a favor») del mismo cliente.

- Lo que hoy está en Configuración pasa a «Más» (retiro/depósito, corte X, cambiar cajero, cerrar turno, salir).
- Los nombres nuevos de la barra aplican también a la caja de ropa: todas las tiendas se ven igual.
- **Decimales:**
  - kilo con 3 decimales (gramos);
  - metro y litro con 2;
  - pieza entera, salvo que el producto diga lo contrario.

  La base ya guarda `ticket_items.cantidad` y las existencias como `numeric(12,3)`.
- **En el ticket impreso** un renglón a granel dice cantidad, unidad y precio por unidad
  («1.250 kg × $28.00/kg»).
- **Escanear dos veces un producto a granel no suma en el mismo renglón:** cada pesada es un renglón.
  Hoy el carrito junta renglones iguales (`carrito.ts`, al agregar).
- **Facturación:** la unidad del SAT sale de la unidad del producto:
  - pieza → H87
  - kilo → KGM
  - metro → MTR
  - litro → LTR

  Hoy el concepto usa `unidad_sat_snapshot` con E48 por omisión y la etiqueta fija «Servicio»
  (`supabase/functions/_shared/pac/conceptos.ts`); la etiqueta debe salir de la unidad.
- **Cambio de talla** sigue siendo de ropa. En estos giros, «Devolver» cubre las devoluciones.
- **El crédito vive en `clientes`** (límite, plazo, activo). Una venta a crédito es un **pago con método
  `CREDITO`** que no cuenta como efectivo en el corte. El saldo deudor es la suma de las ventas a
  crédito menos sus abonos. Cómo modelarlo exactamente le toca al plan; la regla es que el corte no lo
  cuente y que cada abono cuente en el turno en que entra.

- **La venta por unidad no es un módulo.** En los giros de tienda (ropa incluida), el formulario de
  producto siempre deja elegir la unidad. En la tabla de §2, «venta por peso» solo indica qué unidad
  sugiere el alta del producto y qué explica la primera vez del admin. No se agrega ninguna bandera en `operacion`.
- **Ropa también puede encender crédito y cotizaciones.** Todas las tiendas son una familia: lo que hoy
  se decide con `vertical_principal = 'RETAIL'` pasa a «es giro de tienda».
- **Lealtad:** una venta a crédito **no genera puntos**. Es lo más sencillo y evita regalar puntos por
  dinero que nunca se cobró. Si Fermín quiere que los genere al liquidarse, se agrega después.
- **Permisos:**
  - Dar o cambiar el crédito de un cliente: dueño o administrador, en el admin.
  - Registrar un abono: cualquier cajero.
  - Crear o convertir una cotización: cualquier cajero.
  - Pasar del límite o vender con pagos vencidos: el mismo PIN de supervisor de un solo uso que ya
    existe (autorizaciones de la 0134), con su permiso nuevo en la matriz (doc 09).
- **Límite con la caja sin internet:** cada caja revisa el límite con el saldo que conoce: lo último que
  bajó de la nube más lo que ella misma vendió y cobró. Dos cajas pueden pasar juntas el límite sin
  darse cuenta. Se acepta, porque el PIN es el respaldo y el admin muestra el saldo real. El POS web
  revisa contra la nube.

## 4. Metas, no-metas y lo que lo haría fracasar

- **Meta:** que una frutería, una ferretería, una tiendita o una vinatería puedan operar su día completo
  con la caja de tienda, sin báscula conectada, y que el dueño controle su crédito.
- **No-metas de esta tanda:**
  - báscula conectada;
  - código de barras de peso variable (etiquetas de báscula con precio dentro);
  - intereses y recargos;
  - precios de mayoreo;
  - controles de alcohol;
  - tienda en línea para estos giros;
  - servicios y belleza.
- **Fracaso aunque funcione:**
  - Que el corte de caja cuente como efectivo lo vendido a crédito o lo que solo se cotizó.
  - Que un error de decimales cobre de más o de menos: 1.250 kg no puede volverse 1 ni 1250.
  - Que los restaurantes noten cualquier cambio.

## 5. Restricciones

- **Todo en local:** sin push, PR, producción ni instalador hasta tener los tres grupos de giros (servicios y belleza incluidos).
- **Lanzamiento** como el de ropa (spec de ropa §7): un `ADD VALUE` de cada giro nuevo por migración propia, el
  instalador antes de liberar los giros y una migración final que los libera.
- **Los restaurantes no cambian.**
- La caja instalada (escritorio, sync por snapshot) recibe las mismas migraciones, y lo nuevo (créditos,
  abonos, cotizaciones) sube y baja en el sync.

## 6. Lo que queda al constructor

- Nombres de tablas, columnas y RPC.
- El orden de las entregas. Sugerencia:
  1. venta por unidad y giros nuevos;
  2. crédito;
  3. cotizaciones;
  4. barra Cobrar/Más y liberar.
- El diseño visual de la ventana de cantidad, de «Más», «Cotizaciones» y «Créditos», siguiendo
  `docs/diseno/pos-retail.md` (se actualiza ese documento, no se crea otro).
- El PDF de la cotización y cómo se manda por WhatsApp. El mecanismo de compartir que ya exista en la
  caja tiene prioridad.
- Si «A crédito» cobra todo el ticket o se puede combinar con otro pago en un cobro dividido.

## Entrega 1, hecha (18 oct)

Venta por kilo, metro y litro, y los cuatro giros nuevos en la base. Todo en local.

**Migraciones**

- **0205:** solo `ADD VALUE`: los 4 giros y la unidad LONGITUD. Va aparte porque Postgres no deja usar un
  valor de enum en la misma transacción que lo crea.
- **0206:** `es_giro_tienda` (una sola lista de giros de tienda en lugar de RETAIL), el juego inicial de
  los giros nuevos, los giros nuevos bloqueados en `cambiar_giro`, la unidad SAT derivada de `tipo_venta`
  (el admin no muestra campo aparte), la herencia de unidad a las variantes y la columna «Unidad» del CSV
  de importación.
- **Caja:** ventana de cantidad, renglones con unidad en pantalla, ticket, devolución y factura. Detalle
  en `docs/diseno/pos-retail.md`.

**Para el lanzamiento**

- **La 0205 debe ir en un instalador ANTES de que cualquier negocio use los giros nuevos o venda por
  metro.** Un valor de enum que la caja no conoce rompe su pull.
- BAR, CAFETERIA y TAQUERIA siguen bloqueados para negocios existentes. Los giros nuevos también, hasta
  la entrega 4.

**Quedó para después**

- Hallazgo de lanzamiento: un producto de restaurante con `tipo_venta` PESO o VOLUMEN pasaría a facturar
  KGM o LTR al crearse o cambiar. Revisar en producción si existe alguno antes de lanzar.
- Backfill de 0206 pone H87 aunque el producto sea granel (falta `AND tipo_venta='UNIDAD'` o pasar por el
  disparador).
- El disparador no corrige un UPDATE directo de `unidad_sat` en un producto granel.
- Smoke de importación sin kg, l ni SKU existente sin unidad.
- Comentarios «giro RETAIL» desactualizados; un cast innecesario en `ticket-datos.ts`.
- La suma de «Existencia» mezcla unidades; segunda consulta de productos en existencias (mejor
  `tipo_venta` en `vw_existencias`); el select de unidad aparece también en combos y padres de variantes.
- Ventana de cantidad: escanear con ella abierta deja colar el primer dígito; sin tope de cantidad;
  doble toque rápido en «Agregar» podría agregar dos pesadas.
- CSS `whitespace-nowrap` en renglones también en restaurante; la prueba CFDI no comprueba 1.25; la
  prueba de devolución es de lib, no de pantalla; falta marcador «ya devuelto» en cambio de talla para
  granel; «completo o nada» solo se exige en la caja.
- Pantallas aún con «1.25×»: descuento por producto, cancelar renglón(es), devolución de restaurante,
  cuentas por modo, comanda. «Recibir» suma 1 a un producto a granel.

## Entrega 2 (crédito), hecha (18 oct)

Crédito por cliente, venta a crédito, abonos, saldo a favor y corte. Todo en local, rama
`feat/retail2-credito`.

**Migraciones**

- **0207:** solo `ADD VALUE` `CREDITO` y `SALDO_FAVOR` en el enum de métodos de pago (aparte, por la
  misma razón que la 0205).
- **0208:** módulo de crédito apagado por defecto, `clientes_credito`, `abonos_credito`, venta a
  crédito (`pagar_a_credito`), `registrar_abono` y el corte (`calcular_efectivo_esperado`, `reporte_x`).
- **0209:** reglas: sin puntos en ventas a crédito, sin factura con saldo, saldo a favor, cancelar o
  devolver una venta a crédito, y `arquear_caja` cuenta los abonos no efectivo.
- **0210:** sync: la caja baja crédito, abonos y saldo a favor, sube abonos y movimientos de saldo, y
  baja un resumen de deuda de otras cajas para el límite y lo vencido.

**Para el lanzamiento**

- **La 0207 debe ir en un instalador ANTES de que alguien venda a crédito.** Un valor de enum que la
  caja no conoce rompe su pull.
- La 0208–0210 se aplican a producción a mano, con las demás, ANTES de desplegar las apps.

**Rulings** (Fermín puede corregirlos)

- Todo el ticket va a crédito; solo «Saldo a favor» se combina con otro método.
- Sin comprobante impreso del abono; la caja muestra el aviso y el admin el historial.
- El crédito vive en `clientes_credito`, no en `clientes`, para que el sync no lo pise.
- Un abono se reparte de la venta más vieja a la más nueva.
- «Vencido» usa la zona horaria del negocio. Un abono se acepta aunque el módulo o el crédito estén
  apagados (una deuda siempre se puede pagar).
- Cancelar por completo una venta a crédito salda toda su deuda, propina incluida; lo pagado con saldo
  a favor vuelve a saldo a favor, no a efectivo.
- Otros medios (cortesía, vale, nota de crédito) solo bajan la deuda.
- La caja revisa el límite con el resumen de deuda de otras cajas que bajó de la nube más lo propio.
- El interruptor de crédito solo se ve en tiendas o con el crédito ya encendido.
- «Saldo a favor» se ofrece solo con el módulo encendido.

**Quedó para después**

- Abonar en una caja una venta hecha en otra (se hace en la caja de origen, en el POS web, o se ve en
  el admin).
- Comprobante impreso del abono; el Z impreso no trae las líneas de crédito ni de saldo a favor.
- `registrar_abono` recorre todos los tickets del cliente; cualquier empleado puede abonar; sin prueba
  de concurrencia; el desempate del reparto es por uuid (agregar folio).
- El push no revalida reglas de dinero; un abono que la nube rechaza se reintenta para siempre.
- `usuario_id` del abono sin validar contra el negocio; `clientes_credito` sin aislamiento por fila en
  el pull; costo de `credito_saldo_ticket` por renglón y de `tickets_de_periodo_global` en periodos
  largos.
- La llave de idempotencia de la devolución solo se escribe si hubo renglón; un `cliente_id` NULL en un
  ticket pagado con saldo a favor abortaría la cancelación.
- Fecha del resumen distinta entre nube y caja; `cliente_id` del resumen sin remapeo por alias.
- UI: `fmt` local en `creditos/page.tsx`, lista de liquidadas sin tope, config de crédito sin candado
  de rol en pantalla (la base lo rechaza), sin pruebas de UI del modal de abono, el recibo ofrece
  factura (QR) aunque no se pueda facturar hasta liquidar.

**Notas para Fermín**

- **Fiscal.** Una venta a crédito se factura solo al liquidarse, y si se liquida en un periodo
  posterior solo se factura individual desde el admin. No hay PPD ni complemento de pago.
- **Hallazgo de seguridad previo a esta rama.** La RLS de `devoluciones` solo revisa el negocio: un
  cajero con acceso directo a la tabla podría insertar o confirmar una devolución inventada (ya podía
  forjar DEVOLUCION_EFECTIVO). Se propone como sesión aparte.

## Entrega 3 (cotizaciones), hecha (18 oct)

Cotizar desde el carrito, mandarla por WhatsApp y convertirla en venta. Todo en local, rama
`feat/retail2-cotizaciones`.

**Migraciones**

- **0212:** módulo de cotizaciones apagado por defecto, tablas de cotizaciones y renglones, RPCs para
  guardar, convertir y cancelar, folio `COT-…`, vigencia, y la RPC pública por token
  (`cotizacion_publica`).
- **0213:** sync: la caja sube sus cotizaciones (push). No hay pull: la cotización de otra caja no se
  ve en esta.

**Página pública:** `/c/<token>` en el portal de factura (`apps/factura`), con «Guardar como PDF».
Título de pestaña «Cotización · VIM POS» y `noindex`.

**Para el lanzamiento**

- La 0212–0213 se aplican a producción a mano, con las demás, ANTES de desplegar las apps.
- El portal de factura debe estar desplegado para que los enlaces de WhatsApp funcionen.

**Rulings** (Fermín puede corregirlos)

- «Por WhatsApp como PDF» es un enlace que el cliente abre y guarda como PDF: WhatsApp no adjunta
  archivos por enlace y el repo no genera PDF.
- Sin combos en cotizaciones.
- La cotización de otra caja no se ve ni se convierte en esta; sí en el admin. En la caja (web o instalada) solo salen las de esa caja.
- Cancelar la puede hacer cualquier cajero (no mueve dinero).
- Una cotización cancelada se ve en el enlace público como «no existe o ya no está disponible».
- `caja_id` obligatorio: el admin no crea cotizaciones.
- «Nueva cotización» solo regresa a Cobrar con el carrito vacío y un aviso; no hay modo especial.
- «Vencida» en la caja usa la fecha de Ciudad de México (el POS no conoce la zona del negocio), igual
  que el crédito.
- Para las cotizaciones se corrigió `cotizacion_publica` editando la 0212 en su lugar (solo vive en la
  rama y el Docker local).

**Quedó para después**

- Idempotencia SELECT-luego-INSERT (una carrera da `unique_violation`); un ticket puede ligarse a
  varias cotizaciones; el enlace muestra el nombre de un cliente borrado.
- La nube acepta cualquier transición de estado (no regresar de CONVERTIDA) y no exige PAGADO para
  CONVERTIDA; la caja no se valida contra la sucursal; el tope de cotizaciones no deja log; el token
  es único global.
- Se puede abrir la configuración de cotizaciones por URL en un restaurante; el límite de 500 afecta
  los totales del mes; la cuadrícula del admin es de 4 columnas con 2 tarjetas.
- Sin prueba de render de ⋯ ni de la baldosa con el módulo; sin prueba de `buscarCotizacion` con fetch
  simulado.
- Tipos de BD escritos a mano, fuera de orden.
- Sitio web y PDF de prospectos: pendientes hasta el final de todos los giros retail.
