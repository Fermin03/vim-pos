# Servicio rápido y food truck con la caja de tienda: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que en servicio rápido (`QUICK_SERVICE`) y food truck (`FOODTRUCK`) la caja abra directo en Cobrar con la barra de tienda abajo, pregunte «¿Es para llevar o para comer aquí?» al cobrar y mande la orden a cocina e imprima la comanda en el mismo momento. Todo lo demás (pick-up, domicilio, en espera, en línea) se junta en «Pedidos».

**Architecture:**
- **Navegación y cobro, separados.** Nuevo predicado `esComidaRapida(caja)` (giro `QUICK_SERVICE` o `FOODTRUCK`).
  - La **navegación** de tienda (barra abajo, sin pantalla de inicio) se decide con `conBarraAbajo(caja) = comoTienda(caja) || esComidaRapida(caja)`.
  - El **cobro** sigue siendo de restaurante: ticket de restaurante, comanda, combos, modificadores y propina. El flag `tienda` (`comoTienda`), que hoy cambia el ticket a «Venta/SKU» y suprime la comanda, **no** se enciende para comida rápida.
- **La pregunta va antes de guardar el ticket.** En el manejador del botón Cobrar de `home-pos.tsx` (antes de `persistirCarrito`), comida rápida abre `ModalServicioComida`:
  1. Fija `modoServicio` (`PARA_LLEVAR` o `COMER_AQUI`) y `nombreCuenta` (si se pidió nombre).
  2. Guarda el ticket como hoy; el nombre va en `tickets.nombre_cliente`, que ya existe.
  3. Abre `ModalCobro` sin cambios.
- **Cocina al cobrar.** En `cobroTerminado`, para comida rápida:
  1. `enviarACocina(token, ticketId)`, que ya existe: marca los renglones y pone `estado_cocina = 'EN_COCINA'`, así la orden llega a la pantalla de cocina.
  2. Con los ids que devuelve, imprime la comanda **aunque haya una sola impresora**.
  3. Si no devuelve ids (ya se mandó), no imprime: una sola comanda por venta.
- **Sin mesas:** comida rápida ignora los módulos `comedor` y `meseros`. Las cuentas de mesa que ya estén abiertas se pueden terminar desde «Pedidos», pero no se abren nuevas.
- **Configuración** en `configuracion_tenant` (molde `combo_upsell_activo`):
  - `pedir_nombre_cliente` (false por defecto);
  - `tiene_donde_comer` (false por defecto; solo lo lee el food truck);
  - el sync genérico de la caja instalada las baja solas.

**Tech Stack:** PostgreSQL 15 (Supabase), smokes `.sql`, Next.js + Vitest (`apps/pos`, `apps/admin`), escritorio Node (sync), `packages/db`.

**Spec:** `docs/superpowers/specs/2026-10-21-servicio-rapido-caja-tienda-design.md`.

## Global Constraints

- **Todo en local.** Rama `feat/alimentos-rapido` encima de `feat/alimentos-diseno` (a73549d9). 0188–0241 no se editan. Nueva: **0242** (configuración del mostrador), aplicada al Docker local y registrada. Prohibido push, PR, merge, `db push`, desplegar o empaquetar.
- **Giros que cambian:** solo `QUICK_SERVICE` y `FOODTRUCK`. `CAFETERIA`, `FULL_SERVICE`, `BAR`, `TAQUERIA` y los demás restaurantes conservan su pantalla de inicio, mesas y comandas. Tiendas, salones, talleres y consultorios no cambian.
- **Barra:** **Cobrar · Pedidos · Inventario · Transacciones · Más**.
  - Inventario solo con el módulo `existencias`.
  - Pedidos lleva un globo con lo que espera atención: pedidos en línea por aceptar más cuentas en espera.
- **Pregunta:** título exacto «¿Es para llevar o para comer aquí?», botones «Para llevar» y «Comer aquí», de 64 px de alto.
  - En `QUICK_SERVICE` siempre.
  - En `FOODTRUCK` solo con `tiene_donde_comer`; sin él no se pregunta y la venta es `PARA_LLEVAR`.
  - Con `pedir_nombre_cliente`, la misma ventana pide «Nombre del cliente» (obligatorio, máx. 100) para los dos tipos.
- **Etiqueta:** en comida rápida, `COMER_AQUI` se muestra e imprime «Comer aquí», no «Comedor». En los demás giros sigue «Comedor».
- **Comanda:**
  - Encabezado con el tipo de servicio.
  - «Orden #» con los últimos 4 del folio (ya existe), grande.
  - «Cliente» si hay nombre.
  - Sale una vez por venta: con estación de cocina propia, en esa impresora; con una sola impresora, en la misma, después del ticket.
  - Solo comida rápida cambia la regla; `debeImprimirComandaAlCobrar` conserva su resultado para los demás.
- **Pedidos** junta, reutilizando las pantallas que ya existen:
  - En espera;
  - Para llevar abiertas;
  - Pick-up;
  - Domicilio (módulo `domicilio`);
  - En línea (si hay tienda en línea o apps);
  - «Cuentas de mesa», solo si hay alguna abierta, y sin abrir nuevas.

  Arriba: «Nuevo para recoger» y «Nuevo a domicilio» (módulo `domicilio`); los dos abren el mismo flujo de cuenta nueva de esas pantallas.
- **Más** agrega «Consultar cuentas» y deja turno, retiro/depósito, corte X (monitor) y salir donde ya están en el menú de tienda.
- **Food truck** conserva el nombre del evento al abrir turno (módulo `eventos`).
- **Sin internet:** todo funciona en la caja instalada. No hay RPC nueva; `enviarACocina` ya funciona bajo el gateway local.
- Ponytail; español; sin `any`; controles de 44 px; `docs/diseno/` + `tokens.css`. Si el disco C: no tiene espacio, `TEMP` y `TMP` van en D:. Suites: smokes, pruebas y typecheck de pos, admin y platform, tipografía, 0040 y escritorio.

## Review Focus

1. **Otros restaurantes intactos.** Café, servicio completo y bar siguen abriendo en su pantalla de inicio, con mesas y «Enviar a cocina»; una venta para llevar suya sigue sin comanda con una sola impresora. → Task 2, Task 4.
2. **Una sola comanda por venta.** Reintentar el cobro, reimprimir el ticket o cobrar una cuenta en espera que ya se mandó a cocina no imprime otra comanda «IMPRESION_INICIAL». → Task 4.
3. **La pregunta no se salta ni se duplica.**
   - Cancelar la ventana deja la venta sin guardar.
   - Elegir y cobrar deja `modo_servicio` correcto en el ticket.
   - Una cuenta en espera retomada vuelve a preguntar solo si aún no tiene modo elegido.

   → Task 3.
4. **Nada se pierde al cambiar de lugar:** pick-up, domicilio con repartidores, en línea/Uber, en espera, para llevar abiertas, cuentas de mesa viejas, propinas, combos, lealtad y factura. → Task 5.
5. **Caja instalada:**
   - las dos columnas nuevas bajan por el sync;
   - una caja sin 0242 (columnas ausentes) se comporta con los valores por defecto;
   - cobrar sin internet manda a cocina e imprime.

   → Task 1, Task 4.

---

### Task 1: Configuración del mostrador (0242 + admin)

- 0242: `ALTER TABLE configuracion_tenant ADD COLUMN IF NOT EXISTS pedir_nombre_cliente boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS tiene_donde_comer boolean NOT NULL DEFAULT false;` con COMMENT. Nada más (RLS y grants de la tabla ya cubren).
- `apps/admin`: en «Configuración › Operación», sección «Mostrador», solo para `QUICK_SERVICE` y `FOODTRUCK`:
  - casilla «Pedir el nombre del cliente al cobrar»;
  - casilla «Tiene dónde comer (pregunta «¿para llevar o para comer aquí?»)», solo en `FOODTRUCK`.

  Molde: `apps/admin/app/lib/combos.ts:57-77` (upsert por `tenant_id`).
- `apps/pos/app/lib/catalogo.ts` (junto a `leerComboUpsellActivo`): `leerConfigMostrador(token): Promise<{ pedirNombre: boolean; tieneDondeComer: boolean }>`. Ante error, fila ausente o columnas ausentes (caja vieja), devuelve `{ pedirNombre: false, tieneDondeComer: false }`.
- Escritorio: confirma que `sync-pull.mjs` baja columnas nuevas de `configuracion_tenant` sin cambios (lee `information_schema`). Agrega una prueba solo si no la hay.
- Pruebas:
  - admin: casillas visibles solo en esos giros; «Tiene dónde comer» solo en food truck; guarda con upsert;
  - pos: `leerConfigMostrador` con fila, sin fila y con error de columna;
  - smoke `smoke_comida_rapida.sql` (nuevo): columnas con sus valores por defecto; otro negocio no las lee.

- [ ] Pruebas → 0242 → aplicar y registrar → tipos → admin y pos test + typecheck, smokes, 0040 → commit `"BD: configuración del mostrador de comida rápida (0242)"`.

### Task 2: La caja de comida rápida con la barra abajo

- `packages/db/src/operacion.ts`: `GIROS_COMIDA_RAPIDA = ["QUICK_SERVICE","FOODTRUCK"]` y `esGiroComidaRapida`.
- `apps/pos/app/lib/tienda.ts`:
  - `esComidaRapida(caja)` y `conBarraAbajo(caja)`;
  - `SeccionTienda` agrega `"pedidos"`;
  - `DESTINOS_COMIDA` = Cobrar (`caja`, sección `"panel"`) · Pedidos (`bolsa` o el icono de para llevar) · Inventario (`etiqueta`, solo con `existencias`) · Transacciones (`recibo`) · Más (`menu`);
  - `destinosDe` y `seccionInicial` («panel») con su rama.
- `home-pos.tsx`:
  - donde hoy decide navegación con `comoTienda` (`enInicio` l.216, `BarraTienda` ~3702, secciones ~3415/3629), usa `conBarraAbajo`;
  - donde decide **ticket y cobro de tienda** (`tienda` l.633 y sus usos: ticket «Venta/SKU», `!datos.tienda` en la comanda 1692, `capturaTienda` 787, `PanelVentaRetail`), deja `comoTienda`;
  - comida rápida captura con el catálogo de restaurante (`CatalogoProductos` + `SidebarTicket`), sin «Volver» ni la cabecera de modos;
  - el carrito arranca en `PARA_LLEVAR`;
  - los accesos de comedor y mesas no se ofrecen en comida rápida, aunque los módulos `comedor` y `meseros` estén encendidos.
- Más (`contenido-menu.tsx`): agrega «Consultar cuentas» (abre `pantalla-consulta-cuentas.tsx`) en comida rápida; lo demás de tienda ya está.
- Pruebas (`lib/__tests__/barra-tienda.test.ts`, `tienda.test.ts`):
  - destinos e inicio en comida rápida, con y sin `existencias`;
  - café, servicio completo, bar y taquería siguen con pantalla de inicio (`conBarraAbajo` false);
  - comida rápida no es `comoTienda` (ticket de restaurante);
  - «Consultar cuentas» en Más.

- [ ] Pruebas → implementar → pos test, typecheck y tipografía → commit `"Caja de comida rápida: barra abajo y sin pantalla de inicio"`.

### Task 3: «¿Para llevar o para comer aquí?» al cobrar

- `apps/pos/app/components/modal-servicio-comida.tsx` (nuevo):
  - props `{ pedirNombre: boolean; nombreInicial: string; onElegir(modo: "PARA_LLEVAR" | "COMER_AQUI", nombre: string | null): void; onCancelar(): void }`;
  - título, botones y nombre como en Global Constraints;
  - con nombre, los botones se habilitan solo con texto;
  - Escape cancela (declara su capa en la pila compartida de Escape).
- `home-pos.tsx`, en el manejador del botón Cobrar (antes de `persistirCarrito`, ~1740–1830):
  - si `esComidaRapida(caja)` y la pregunta aplica (`QUICK_SERVICE`, o `FOODTRUCK` con `tieneDondeComer`), y el carrito no viene ya de pick-up, domicilio o en línea, abre la ventana;
  - al elegir, `dispatch({tipo:"modo", modo})` y después fija `nombreCuenta`. El reducer borra el nombre al cambiar de modo (`carrito.ts:189`), así que el orden importa; si conviene, agrega un parámetro opcional `nombre` a esa acción;
  - luego sigue el flujo actual;
  - si la pregunta no aplica, queda `PARA_LLEVAR` y, con `pedirNombre`, la ventana solo pide el nombre.
- Etiqueta: `etiquetaModo` (ticket, comanda, pantallas) recibe el giro o un flag. Para comida rápida, `COMER_AQUI` es «Comer aquí»; para los demás, sigue `ETIQUETA_MODO` («Comedor»).
- Pruebas:
  - decisión «pregunta o no» por giro y config (función pura `preguntaServicio(giro, cfg, modoActual)`);
  - etiqueta por giro;
  - carrito: modo + nombre sobreviven;
  - payload de `persistirTicket` con `COMER_AQUI` y `nombre_cliente`;
  - café y servicio completo no ven la ventana.

- [ ] Pruebas → implementar → pos test, typecheck y tipografía → commit `"Comida rápida: pregunta para llevar o comer aquí al cobrar"`.

### Task 4: A cocina y comanda al cobrar

- `lib/print/comanda-builder.ts`: `debeImprimirComandaAlCobrar(modo, hayEstacionDedicada, comidaRapida = false)`.
  - Con `comidaRapida`, es verdadero para `PARA_LLEVAR` y `COMER_AQUI` con o sin estación propia.
  - Sin `comidaRapida`, mismo resultado que hoy (las pruebas actuales siguen verdes).
- `home-pos.tsx` `cobroTerminado` (~1600–1700), para comida rápida:
  1. `const enviados = await enviarACocina(token, ticketId)`.
  2. Si `enviados.length > 0`, imprime la comanda con `imprimirComandaPorAreas` (o `imprimirComandaCocina` si así lo hace hoy el modo correspondiente), `evento: "IMPRESION_INICIAL"`, solo con esos renglones, pasando `cliente: nombre_cliente`.
  3. Con una sola impresora (`!hayEstacionDeCocinaDedicada()`), la comanda va a la misma impresora después del ticket. Revisa que la asignación de destino `COCINA` caiga en la impresora de caja cuando son la misma.
  4. Un error de impresión no deshace el cobro; avisa como hoy.
  5. La condición actual `!datos.tienda && …` queda para los demás giros.
- `DatosComanda.cliente`: lo llena desde el ticket para comida rápida.
- Pruebas:
  - `debeImprimirComandaAlCobrar` (tabla nueva + las actuales);
  - con un solo destino, la comanda se encola en la impresora de caja;
  - `enviarACocina` sin pendientes → no comanda (una sola por venta);
  - café: venta para llevar con una impresora → sin comanda (igual que hoy);
  - smoke en `smoke_comida_rapida.sql`: un ticket pagado con `estado_cocina` EN_COCINA aparece en la consulta del KDS (`estado_cocina in (EN_COCINA, LISTO)`).

- [ ] Pruebas → implementar → pos test y typecheck, smokes → commit `"Comida rápida: a cocina y comanda al cobrar, también con una impresora"`.

### Task 5: Sección «Pedidos»

- `apps/pos/app/components/seccion-pedidos.tsx` (nuevo): tarjetas con su conteo que abren lo que ya existe:
  - «En espera» → `ModalListaEspera`;
  - «Para llevar abiertas» → `ModalCuentasParaLlevar`;
  - «Pick-up» → `PantallaCuentasModo` modo `DRIVE_THRU`;
  - «Domicilio» → modo `DELIVERY_PROPIO` (módulo `domicilio`);
  - «En línea» → `PantallaPedidosApps` (con `hayEnLinea`), con el aviso de vencidos que hoy da la pantalla de inicio;
  - «Cuentas de mesa» → modo `COMER_AQUI`, sin opción de abrir cuenta nueva, solo si hay alguna abierta.

  Arriba, «Nuevo para recoger» y «Nuevo a domicilio» (módulo `domicilio`) abren el flujo de cuenta nueva de esa pantalla (el mismo `onAbrirCuenta` que usa hoy).
- `home-pos.tsx`:
  - monta la sección cuando `seccionTienda === "pedidos"`;
  - los estados de pantalla completa (`enPickup`, `enDelivery`, `enPedidosApps`, `llevarListaAbierta`, `esperaListaAbierta`) ya existen; al salir de ellos se vuelve a «Pedidos»;
  - globo de la barra: `nPedidosApps` + por aceptar de la tienda + `nEnEspera`.
- Pruebas:
  - tarjetas según módulos y conteos;
  - «Cuentas de mesa» solo con cuentas;
  - «Nuevo a domicilio» solo con módulo;
  - la suma del globo;
  - salir de una pantalla regresa a «Pedidos».

- [ ] Pruebas → implementar → pos test, typecheck y tipografía → navegador (controlador): con permiso de Fermín, pasar un negocio local a `QUICK_SERVICE` y vender con las dos respuestas y con nombre, ver la comanda simulada, el KDS y «Pedidos»; después regresarlo → commit `"Comida rápida: sección Pedidos"`.

### Task 6: Documentos y revisión final

- `docs/diseno/pos-comida-rapida.md` (nuevo), ADR `0044-comida-rapida-con-caja-de-tienda.md` (navegación de tienda con cobro de restaurante; comanda al cobrar con una impresora; sin mesas).
- El spec: «Hecho» con la 0242 y el lugar en el lanzamiento conjunto (instalador con 0242; los negocios cambian solos al actualizar).
- Suites completas, revisión de toda la rama y commit.

## Rulings de este plan (Fermín puede corregirlos)

- **Comida rápida usa la navegación de tienda, pero el ticket y el cobro de restaurante** (comanda, combos, propina).
- **La pregunta sale antes de guardar la venta.** Cancelar no deja nada guardado.
- **«Comer aquí» se llama así solo en comida rápida;** en los demás restaurantes sigue «Comedor».
- **Los ajustes «Pedir el nombre del cliente» y «Tiene dónde comer»** van en Configuración › Operación, por negocio (no por caja).
- **Los pedidos para recoger y a domicilio** conservan su flujo de hoy (se mandan a cocina antes de cobrar); la pregunta y la comanda al cobrar son solo para la venta de mostrador.
