# 0017 — El envío es un renglón, no una columna

**Fecha:** 2026-09-22 · **Estado:** vigente

## Qué decía el plan

Ningún documento anterior tenía forma de cobrar el envío a domicilio: el POS entregaba a
domicilio gratis, y `DELIVERY_PROPIO` costaba exactamente lo mismo que un pick-up aunque el
repartidor cruzara la ciudad. Los negocios sí cobran por distancia, expresada en zonas —el centro
sin cargo, la colonia de allá $35—, y la única forma de meter ese dinero al ticket era dar de alta
un producto trucado en el catálogo: ensucia el menú del cajero, se imprime en la comanda como si
fuera un platillo, y cuenta como comida vendida en los reportes de producto.

## Qué hacemos ahora

**El cargo de envío es un renglón de `ticket_items`, no una columna de `tickets`.** La migración
`0116_zonas_envio.sql` agrega `cargo_tipo varchar(20) NULL CHECK (cargo_tipo IN ('ENVIO'))` a
`ticket_items`, con `producto_id = NULL` y un índice único parcial
(`ticket_envio_unico`, `WHERE cargo_tipo = 'ENVIO' AND cancelado = false`) que garantiza a lo sumo
un renglón de envío vivo por ticket. El RPC `fijar_envio_ticket(p_ticket_id, p_zona_id)` es el
único punto de entrada y salida: inserta, actualiza o borra ese renglón según haya o no zona, y
nunca dos a la vez.

## Por qué

**Los totales salen solo de `ticket_items`.** El trigger `AFTER INSERT OR UPDATE OR DELETE ON
ticket_items` (`0008_operacion_venta.sql` §8.1, `recalcular_totales_ticket`) es la única fuente de
`tickets.total_mxn`. Una columna estilo `propina_mxn` viviría fuera de ese cálculo, o duplicaría
la lógica de sumarla en cada lugar que hoy lee `total_mxn` — el ticket impreso, el CFDI, la
factura global, los reportes de cierre.

**`armarConceptos` truena a propósito si los conceptos no cuadran.** El armador del CFDI
(`supabase/functions/_shared/pac/conceptos.ts`) valida que la suma de los conceptos que manda al
PAC coincida con `tickets.total_mxn`, y rechaza el timbrado si no cuadra. Esa validación es
deliberada: existe para atrapar exactamente el escenario de un cargo que entró al total por un
camino que los conceptos no ven. Un envío en una columna aparte sería invisible para
`armarConceptos` — el ticket cobraría de más de lo que el CFDI declara, y quedaría imposible de
facturar sin un parche especial en el armador. Como renglón, el envío entra a la suma como
cualquier otro concepto: cuadra por construcción, sin tocar el armador.

## Alternativas descartadas

- **Columna `envio_mxn` en `tickets`, al estilo de `propina_mxn`.** Habría que sumarla a mano en
  cada lugar que hoy calcula el total desde los renglones: el trigger de totales, el armador de
  conceptos del CFDI, el ticket impreso, los reportes de producto. Cada punto de suma nuevo es un
  punto donde alguien puede olvidar sumarla, y el ticket quedaría descuadrado respecto a lo que
  `ticket_items` dice que se vendió.
- **Prorratear el envío entre los productos del ticket.** Repartir los $35 entre los renglones de
  comida infla el precio unitario facturado de cada platillo sin motivo: el CFDI declararía que
  las hamburguesas cuestan más de lo que el menú dice, y los reportes de producto quedarían
  contaminados con dinero que no es comida.

## Consecuencias

- **El envío aparece en el CFDI como una línea más**, con la clave genérica del giro
  (`CLAVE_SAT_POR_DEFECTO`, `90101500`, servicios de restaurantes) y unidad `E48`. Decisión de
  Fermín: sin clave ni trato fiscal especial, igual que cualquier otro concepto que no tiene una
  clave SAT propia.
- **Hace falta la marca explícita `cargo_tipo`.** `producto_id` ya es `NULL` para los renglones
  cuyo producto se borró del catálogo (FK blanda, `0008_operacion_venta.sql`:547), así que "sin
  producto" no basta para reconocer un cargo; sin `cargo_tipo` un renglón de envío se confundiría
  con un producto huérfano.
- **KDS y comanda filtran por `cargo_tipo`.** `packages/kds-core/src/comandas.ts` y
  `apps/pos/app/lib/print/comanda-builder.ts` descartan los renglones con `cargo_tipo = 'ENVIO'`
  al armar lo que va a cocina: el envío no es comida, no se prepara y no debe llegarle al cocinero
  como si fuera un platillo.
- **El IVA del envío se hereda del primer renglón vivo del ticket**, no de una constante. Un
  cargo con tasa o política de IVA fija rompería a cualquier tenant que facture con IVA por
  afuera; heredar del ticket lo mantiene consistente con el resto de la venta.

## Pendiente abierto

El PIN para repreciar una zona (`ModalAutorizacionPin`, `accion: "editar_zona_envio"`) es un
guardarraíl de interfaz, no está atado del lado del servidor: el RPC de cambio de costo no exige
la autorización, solo la UI la pide antes de llamarlo. Crear una zona es libre por diseño —
cualquier cajero da de alta una colonia nueva a las once de la noche con el cliente esperando—, así
que blindar solo el repreciado del lado del servidor no cerraría una vía real de por sí abierta.
Queda para decisión del dueño.
