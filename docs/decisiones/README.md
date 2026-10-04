# Decisiones que superaron al plan original

Cada archivo dice **qué decía el plan, qué hacemos hoy y por qué**. Manda lo que esté aquí.

| # | Decisión | Fecha |
|---|---|---|
| [0001](0001-los-mockups-dejan-de-mandar.md) | Los mockups dejan de ser fuente de verdad | 30/08/2026 |
| [0002](0002-precios-por-paquete-no-por-vertical.md) | El precio lo fija el paquete, no la vertical | 08/2026 |
| [0003](0003-la-marca-es-azul.md) | La marca es azul, no naranja | 23/08/2026 |
| [0004](0004-el-offline-lo-da-el-escritorio.md) | El offline lo da el escritorio, no un outbox en la web | 2026 |
| [0005](0005-comedor-entra-por-lista-de-cuentas.md) | Comedor entra por lista; el mapa de mesas es consulta | 08/2026 |
| [0006](0006-agregar-productos-usa-la-pantalla-de-venta.md) | Agregar productos usa la misma pantalla de venta | 30/08/2026 |
| [0007](0007-movimientos-de-caja-dos-no-cuatro.md) | Movimientos de caja: dos, no cuatro | 30/08/2026 |
| [0008](0008-una-sola-fuente-de-tokens.md) | Los tokens tienen una sola fuente | 31/08/2026 |
| [0009](0009-el-cfdi-esta-construido-pero-no-activado.md) | El CFDI está construido y NO está activado | 31/08/2026 |
| [0010](0010-el-demo-estatico-se-retira.md) | El demo estático se retira; la demo es el producto real | 02/09/2026 |
| [0011](0011-integracion-apps-de-delivery.md) | Apps de delivery: VIM es el integrador, el comercio solo autoriza su tienda | 02/09/2026 |
| [0012](0012-compras-y-proveedores.md) | Compras con proveedores y recetas con pantalla; supera D26 y D31 | 03/09/2026 |
| [0013](0013-el-inventario-viaja-por-movimientos.md) | El inventario viaja por movimientos: la caja los sube, la nube recalcula | 04/09/2026 |
| [0014](0014-el-panel-manda-a-la-caja-por-latido.md) | El panel manda a la caja por latido: bloqueo con gracia, módulos, avisos y versiones | 04/09/2026 |
| [0015](0015-los-combos-son-un-producto-con-slots.md) | Los combos son un producto con slots: el padre cobra, los hijos cocinan y descuentan | 08/09/2026 |
| [0016](0016-un-viaje-es-una-columna-no-una-tabla.md) | Un viaje es una columna, no una tabla: y asignar ES salir | 20/09/2026 |
| [0017](0017-el-envio-es-un-renglon.md) | El envío es un renglón, no una columna | 22/09/2026 |
| [0018](0018-listo-por-estacion.md) | Cada estación marca LISTO lo suyo | 24/09/2026 |
| [0019](0019-una-cuenta-por-operador.md) | Una cuenta por operador del panel, con segundo factor | 30/09/2026 |
| [0020](0020-los-pagos-se-registran-no-se-cobran-solos.md) | Los pagos a VIM se registran; el cobro automático viene después | 30/09/2026 |
| [0021](0021-precio-vigente-y-lo-que-incluye-el-plan.md) | El precio vigente sale de una regla, y cambiar de plan ajusta lo que el plan incluye | 30/09/2026 |
| [0022](0022-llegada-del-cliente-registro-y-soporte.md) | El registro es público y verificado, y el soporte viaja a la caja por el latido | 30/09/2026 |
| [0023](0023-eliminar-un-cliente-es-el-segundo-paso-de-la-baja.md) | Eliminar un cliente es el segundo paso de la baja, y la base decide si se puede | 01/10/2026 |
| [0024](0024-los-extras-suben-el-limite-y-se-suman-a-la-excepcion.md) | La sucursal y la caja adicional son extras por cantidad; la caja adicional es UNA caja, no una por sucursal | 01/10/2026 |
| [0025](0025-el-inventario-se-cierra-por-plan-sin-tocar-la-venta.md) | El inventario se cierra por plan sin tocar la venta, y en la caja manda la nube | 01/10/2026 |
| [0026](0026-la-pantalla-del-cliente-se-enciende-sola.md) | La pantalla del cliente se enciende sola y la caja le publica la cuenta | 02/10/2026 |
| [0027](0027-el-menu-se-ajusta-por-sucursal.md) | El menú se ajusta por sucursal: una fila guarda solo lo que cambia | 02/10/2026 |
| [0028](0028-eliminar-a-un-empleado-libera-el-correo-y-conserva-el-historial.md) | Eliminar a un empleado libera su correo y conserva el historial: la cuenta se vacía, no se borra | 04/10/2026 |

## Pendientes de escribir

Decisiones que ya se tomaron en los hechos pero que nadie ha registrado. Si trabajas en alguna,
escribe el ADR de paso:

- **La sincronización es de escritorio único.** Está explicado dentro de 0004, pero merece el
  suyo si algún día se intenta multi-dispositivo.
