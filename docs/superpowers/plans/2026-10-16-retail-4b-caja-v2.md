# Giro RETAIL · Entrega 4b: la caja de tienda, versión 2 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la caja de una tienda se maneje con una barra inferior (Panel · Inventario · Transacciones ·
Notificaciones · Configuración), que el Panel sea una venta más limpia con tarjetas de foto, y que la caja
pueda consultar existencias y recibir mercancía, **sin que un restaurante note nada**.

**Architecture:** `home-pos.tsx` gana, solo para una tienda (`esTienda`), un estado de sección y la barra
inferior. El Panel es la captura de la entrega 4 (modo `PARA_LLEVAR`) con el ticket simplificado.
Inventario, Transacciones, Notificaciones y Configuración son componentes nuevos que reutilizan lo que ya
existe:
- el selector de talla y color;
- la captura por escáner;
- las búsquedas de devoluciones;
- las pantallas de devolución y de cambio;
- el contenido del menú general.

Una migración, 0197, deja que el push de la caja suba las entradas de mercancía que se reciben en ella.

**Tech Stack:** Next.js, React y Tailwind en `apps/pos` con Vitest; PostgreSQL 15 con smokes `.sql`;
Node en `desktop/`.

**Spec / diseño:** `docs/diseno/pos-retail.md`, sección «Versión 2» (manda), más el resto de ese documento,
`pos.md` y `nucleo.md`. Spec del giro: `docs/superpowers/specs/2026-10-15-giro-retail-design.md`. Hechos
del código: `docs/superpowers/plans/anexos/2026-10-16-retail-4-hechos-del-codigo.md`.

## Global Constraints

- **Todo en local hasta el 100 % (Fermín, 15 oct).** Nada de push, PR, producción, `supabase db push`, `functions deploy` ni instalador. La 0197 se aplica solo al Supabase **local** de Docker.
- **Ningún restaurante cambia.** Todo lo nuevo depende de `esTienda(caja)`. Un restaurante conserva su inicio de mosaicos, su «Menú», su captura y el ticket con «En espera», «Descuento» y «Precios».
- **RLS sagrado; nunca `service_role` en `apps/pos`.**
- **Diseño:** `pos-retail.md` «Versión 2».
  - Controles de 44 px como mínimo. Los destinos de la barra miden 56 px.
  - Una acción azul por pantalla. Solo tamaños de letra de la escala (`pnpm tipografia`).
  - El texto blanco y el degradado oscuro de las tarjetas son la única excepción a los tokens de color: van sobre una foto.
  - Sin hover que revele algo.
- **Escape:** dentro de una sección que no es el Panel, Escape cierra lo que esté encima. Si no hay nada encima, vuelve al Panel. Se declara en la pila de `home-pos`.
- **Sin dependencias nuevas, sin `any`.**
- Cargar `ponytail` antes de escribir código, y `emil-design-eng` antes de escribir marcado.
- **Commits:** solo los archivos de la tarea, por nombre. Mensaje + línea en blanco + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisiones de este plan

1. **Recibir en la caja no toca el costo ni lleva proveedor.**
   - Los productos los manda la nube: un costo cambiado en la caja se perdería en el siguiente pull.
   - Los proveedores no bajan a la caja.
   - El costo y el proveedor se capturan en el admin.
2. **Recibir exige el permiso de productos del usuario en turno** (`recibir_mercancia` lo valida con `_existencias_puede_escribir`). Si el usuario no lo tiene, la pantalla lo dice y ofrece «Cambiar cajero».
3. **El push acepta `ENTRADA` sin ticket** cuando viene de la caja (0197). Con eso la recepción de la caja instalada sube a la nube igual que una venta.
4. **Notificaciones vistas:** se guardan en `localStorage` por caja (`vimpos.notif.vistas.<cajaId>`), con el id de cada aviso y la firma de cada alerta de existencia (`producto:estado:cantidad`). Ni la base ni el escritorio cambian.
5. **Al iniciar turno, una tienda abre en el Panel.** Los diálogos de avisos de VIM al abrir turno siguen igual.

## Review Focus

1. **Un restaurante** abre la caja: ve su inicio de mosaicos, su «Menú» y su ticket con «En espera», «Descuento» y «Precios», idénticos. Prueba en la Tarea 2.
2. **Foto rota o caja sin internet:** la tarjeta cae a la inicial sobre el color de su categoría, sin ícono de imagen rota ni salto de tamaño. Prueba en la Tarea 1.
3. **Cambiar de sección con un cobro o un diálogo abierto:** la barra no navega (queda tapada o inactiva) y no se pierde el ticket. Al volver al Panel, el ticket sigue igual. Prueba en la Tarea 2.
4. **Una recepción hecha en la caja instalada** sube una vez, mueve la existencia de la nube una vez y no se rechaza para siempre. Smoke en la Tarea 6.
5. **Escanear en Inventario o en Transacciones** no agrega nada al ticket del Panel: cada sección decide qué hace con el código. Prueba en las Tareas 4 y 5.

---

### Task 1: Tarjeta con foto

**Files:**
- Modify: `apps/pos/app/lib/catalogo.ts` (el tipo `Producto` y `listarProductosPos` agregan `imagen_url?: string | null`)
- Create: `apps/pos/app/components/tarjeta-producto-foto.tsx`
- Modify: `apps/pos/app/components/venta-retail.tsx` (la cuadrícula usa la tarjeta nueva)
- Modify: `apps/pos/app/lib/tienda.ts` (`etiquetaExistencia`)
- Test: `apps/pos/app/lib/__tests__/tienda.test.ts`

**Interfaces:**
- Produces:
  - `TarjetaProductoFoto(props: { nombre: string; precioTexto: string; imagenUrl: string | null; colorCategoria: string; etiqueta: "pocas" | "agotada" | null; onToque(): void; deshabilitada?: boolean })`
  - `etiquetaExistencia(estado: "normal" | "pocas" | "agotada" | null): "pocas" | "agotada" | null`. Devuelve null también mientras las existencias no han cargado.

- [ ] **Step 1: Prueba que falla.** `etiquetaExistencia("normal")` es null; `("pocas")` es «pocas»; `("agotada")` es «agotada»; `(null)` es null.
- [ ] **Step 2: Ver fallar.** Run: `pnpm --filter @vim/pos test -- tienda`.
- [ ] **Step 3: Implementar** según «Versión 2 · Las tarjetas llevan foto»:
  - La tarjeta es cuadrada y la imagen va con `object-cover` y `loading="lazy"`.
  - `onError` cambia al respaldo: el color de la categoría y la inicial grande. El tamaño no salta.
  - Degradado: `bg-gradient-to-t` de `rgb(var(--ink)/.75)` a transparente al 60 %.
  - Abajo a la izquierda, en blanco: el nombre (`text-14`, seminegrita, `line-clamp-2`) y el precio (`text-13`, `font-display`, bold, `tabular-nums`).
  - Arriba a la derecha, la etiqueta «Pocas» (`bg-warning-soft text-warning`) o «Agotada» (`bg-danger-soft text-danger`).
  - Al presionar, `active:scale-[.97]`.
  - La cuadrícula conserva `calcularRejilla` y el paginador. Si celdas cuadradas no caben en 1024×768, se usa la celda que da la rejilla y la imagen se recorta a ella.
- [ ] **Step 4: Ver pasar**, más typecheck, pruebas del POS y `pnpm tipografia`.
- [ ] **Step 5: Commit**: `feat(retail): tarjetas de producto con foto en la caja de tienda`.

### Task 2: Barra inferior, secciones y Configuración

**Files:**
- Create: `apps/pos/app/components/barra-tienda.tsx`, `apps/pos/app/components/contenido-menu.tsx`
- Modify: `apps/pos/app/components/menu-general.tsx` (su cuerpo pasa a `ContenidoMenu`; el diálogo lo envuelve igual que hoy), `apps/pos/app/components/home-pos.tsx`
- Test: `apps/pos/app/lib/__tests__/tienda.test.ts` o un `seccion-tienda.test.ts` nuevo

**Interfaces:**
- Produces:
  - `type SeccionTienda = "panel" | "inventario" | "transacciones" | "notificaciones" | "configuracion"`
  - `BarraTienda(props: { seccion: SeccionTienda; onCambiar(s: SeccionTienda): void; pendientes: number; bloqueada: boolean })`
  - `ContenidoMenu(props)`: mismas props que hoy recibe `MenuGeneral`, menos las de abrir y cerrar.
  - `puedeCambiarSeccion(capasAbiertas: boolean, cobroAbierto: boolean): boolean`: pura.
  - En `home-pos`, con `esTienda`: el estado `seccionTienda` (empieza en «panel», con el modo `PARA_LLEVAR` ya puesto), sin inicio de mosaicos ni botón «Menú». La sección «configuracion» muestra `ContenidoMenu` en la página, no como diálogo.

- [ ] **Step 1: Prueba que falla.** `puedeCambiarSeccion(false,false)` es true; `(true,false)` es false; `(false,true)` es false.
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** según «Versión 2»:
  - La barra va fija abajo: cinco botones de 56 px con icono de `Icono` y texto. El elegido va en `text-accent`; Notificaciones lleva su globo.
  - Con `bloqueada`, la barra no responde (hay un cobro o un diálogo encima).
  - Escape fuera del Panel vuelve al Panel.
  - Mientras otra sección está abierta, el ticket se conserva sin desmontarse: queda oculto, no se reinicia.
  - **Restaurante:** `MenuGeneral` se ve igual que hoy. Agregar una prueba de que su lista de opciones es la misma, si es práctico; si no, verificarlo a mano y dejarlo en el reporte.
- [ ] **Step 4: Ver pasar**, más typecheck, pruebas y tipografía.
- [ ] **Step 5: Commit**: `feat(retail): barra inferior de la caja de tienda y Configuración en pagina`.

### Task 3: Panel simplificado

**Files:**
- Modify: `apps/pos/app/components/sidebar-ticket.tsx`, `apps/pos/app/components/home-pos.tsx` (la cabecera de la captura en tienda)

**Interfaces:**
- Consumes: Tarea 2.
- Produces: `SidebarTicket` recibe por `tienda` un `simple: true` que oculta «En espera», «Descuento» y «Precios», y pone «Asignar cliente» y «Limpiar» como texto pequeño arriba del ticket. En tienda, la captura no tiene la fila de arriba (`Volver`, «Cuentas abiertas», «Cuentas en espera», «Cambio de talla»). El botón grande «Cambio de talla» del ticket vacío se queda.

- [ ] **Step 1: Implementar** según «Versión 2 · Panel».
- [ ] **Step 2: Verificar**: typecheck, pruebas y tipografía. Un restaurante conserva sus botones: no pasa `simple`.
- [ ] **Step 3: Commit**: `feat(retail): panel de cobro simplificado en la tienda`.

### Task 4: Transacciones

**Files:**
- Create: `apps/pos/app/components/seccion-transacciones.tsx`
- Modify: `apps/pos/app/components/home-pos.tsx` (montarla; sus acciones abren Devolver y Cambio de talla con la venta ya elegida)
- Modify: `apps/pos/app/components/pantalla-devoluciones.tsx` y `pantalla-cambio-talla.tsx`, solo para aceptar una venta inicial (`ventaInicial?: string`, el id del ticket) y saltarse el paso de buscarla.

**Interfaces:**
- Consumes:
  - de la entrega 4: `buscarVentaPorFolio`, `buscarVentasConProducto`, `leerVentaDevolvible` (`lib/devoluciones.ts`);
  - el listado de cuentas abiertas de Para llevar que ya usa «Cuentas abiertas» (búscalo en `home-pos` / `lib/cuentas-abiertas.ts`);
  - `reimprimirCuenta`;
  - `useEscaner`.
- Produces: `SeccionTransacciones(props: { caja; token; escaneoIgnorado: boolean; onAbrirCuenta(ticketId): void; onDevolver(ticketId): void; onCambio(ticketId): void; onReimprimir(ticketId): void })`

- [ ] **Step 1: Implementar** según «Versión 2 · Transacciones»:
  - Arriba, las cuentas abiertas de esta caja. Al tocar una, se carga en el Panel.
  - Luego las ventas del turno.
  - Búsqueda por folio. Escanear busca las ventas de 30 días que llevan esa prenda; aquí el escaneo nunca agrega al ticket.
  - Detalle de la venta con sus renglones y las acciones Reimprimir, Devolver y Cambio de talla. Una venta facturada no ofrece «Cambio de talla» y lo dice con el texto del diseño.
- [ ] **Step 2: Verificar**: typecheck, pruebas y tipografía. Agregar una prueba si sale una función pura (p. ej., agrupar abiertas y del turno).
- [ ] **Step 3: Commit**: `feat(retail): transacciones con reimprimir, devolver y cambio de talla`.

### Task 5: Inventario: consulta

**Files:**
- Create: `apps/pos/app/components/seccion-inventario.tsx`
- Modify: `apps/pos/app/components/selector-variantes.tsx` (`soloConsulta?: boolean`: todas las celdas sin toque y sin «Toca una talla…»), `apps/pos/app/components/home-pos.tsx`

**Interfaces:**
- Consumes: `CapturaProductos`-like búsqueda; si hace falta, extrae la búsqueda del Panel a un componente compartido en vez de copiarla. También `agruparTienda`, `buscarPorCodigo`, existencias, sucursales y `ultimoPull`.
- Produces:
  - `SeccionInventario(props: { productos; existencias; sucursalId; sucursales; actualizadoA; escaneoIgnorado: boolean; puedeRecibir: boolean; onCambiarCajero(): void })`, con dos pestañas: «Existencias» y «Recibir».
  - La pestaña Recibir es de la Tarea 7. Aquí deja el hueco con el aviso de permiso.

- [ ] **Step 1: Implementar.**
  - Buscar o escanear una prenda abre su matriz en `soloConsulta`, con los botones de sucursal.
  - Un producto sin variantes enseña su existencia por sucursal en una lista corta.
  - Escanear aquí nunca agrega al ticket.
- [ ] **Step 2: Verificar**: typecheck, pruebas y tipografía.
- [ ] **Step 3: Commit**: `feat(retail): consulta de existencias en la caja`.

### Task 6: El push acepta entradas de la caja (0197)

**Files:**
- Create: `supabase/migrations/0197_caja_recibe_mercancia.sql`
- Modify: `supabase/scripts/smoke_caja_tienda.sql` (bloque nuevo)

**Interfaces:**
- Produces: `_vim_aplicar_movimientos_producto` redefinida desde su cuerpo vigente (0196). Además de VENTA y DEVOLUCION con ticket, acepta `ENTRADA` sin ticket cuando:
  - la cantidad es mayor que 0;
  - `costo_unitario_mxn` es null (decisión 1);
  - `proveedor_id` es null;
  - `usuario_id` es del negocio.

  Todo lo demás se queda igual: idempotencia por id del mismo negocio, `errores` y `descartados`.

- [ ] **Step 1: Smoke que falla.**
  - Una `ENTRADA` de la caja aplica una vez y mueve la existencia.
  - Reenviada, no duplica.
  - Con costo o con proveedor, cae en `errores`.
- [ ] **Step 2: Ver fallar.** Run: `cd desktop && npm run smokes -- smoke_caja_tienda.sql`.
- [ ] **Step 3: Escribir la 0197.**
- [ ] **Step 4: Ver pasar**, junto con `smoke_existencias_admin.sql` y los `smoke_sync*.sql`.
- [ ] **Step 5: Base local.**
  - `npx supabase migration list --local` debe mostrar solo la 0197 pendiente.
  - Correr `npx supabase migration up --local` y luego `pnpm db:types`, restaurando `__InternalSupabase` si se pierde.
- [ ] **Step 6: Commit**: `feat(retail): la caja sube las entradas de mercancia (0197)`. Los tipos van aparte si cambiaron.

### Task 7: Inventario: recibir

**Files:**
- Modify: `apps/pos/app/components/seccion-inventario.tsx`
- Create, si hace falta: `apps/pos/app/lib/recibir-caja.ts` y su prueba

**Interfaces:**
- Consumes:
  - `recibir_mercancia(p_sucursal, p_proveedor, p_lineas, p_referencia)` (0193), con `p_proveedor` null y renglones `{producto_id, cantidad}` sin costo;
  - `avisoRenglon` del admin no se importa en el POS: se replica la regla con una función pura del POS, o se mueve a `packages/` si es trivial;
  - Tarea 6.
- Produces: la pestaña «Recibir» de Inventario.

- [ ] **Step 1: Prueba que falla** de la validación de renglones del POS:
  - cantidad mayor que 0;
  - máximo 3 decimales;
  - rechaza NaN.
- [ ] **Step 2: Implementar.**
  - Escanear o buscar suma 1 por pieza. La cantidad se puede editar.
  - Referencia opcional: «Remisión o factura», máximo 100 caracteres.
  - El botón dice «Recibir N productos», responde a un solo clic y avisa «Listo: entraron N productos.».
  - Sin el permiso: «Pide a un administrador que entre con su PIN para recibir.» y el botón «Cambiar cajero».
  - Para saber si el usuario tiene el permiso: usa la función de permisos que ya usa el POS. Si no existe, usa el rol (DUENO o ADMINISTRADOR) y la base decide al final.
- [ ] **Step 3: Verificar**: pruebas, typecheck y tipografía.
- [ ] **Step 4: Commit**: `feat(retail): recibir mercancia desde la caja`.

### Task 8: Notificaciones

**Files:**
- Create: `apps/pos/app/components/seccion-notificaciones.tsx`, `apps/pos/app/lib/notificaciones-tienda.ts` y su prueba
- Modify: `apps/pos/app/components/home-pos.tsx` (globo de la barra; tocar una alerta de existencia abre Inventario con esa prenda)

**Interfaces:**
- Consumes: `avisosDe(directivas)` (`lib/directivas.ts`); las existencias y `estadoExistencia`.
- Produces:
  - `type Notificacion = { id: string; tipo: "existencia" | "aviso"; titulo: string; detalle: string; nivel: "warning" | "danger" | "info"; productoId?: string; fecha?: string }`
  - `notificacionesTienda(existencias, productos, sucursalId, avisos): Notificacion[]`: pura. Primero las agotadas o en negativo, luego las de pocas, luego los avisos de VIM.
  - `sinVer(notificaciones, vistas: string[]): number`, también pura.
  - La firma de una alerta de existencia es `producto:estado:cantidad`: si la cantidad cambia, vuelve a contar como nueva.

- [ ] **Step 1: Pruebas que fallan**:
  - el orden de la lista;
  - una existencia normal no genera alerta;
  - `sinVer` cuenta solo lo que no está en `vistas`;
  - al cambiar la cantidad, la alerta vuelve a contar.
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** según «Versión 2 · Notificaciones».
  - Al abrir la pestaña se guardan las vistas en `localStorage` (decisión 4), dentro de try/catch.
- [ ] **Step 4: Ver pasar**, más typecheck y tipografía.
- [ ] **Step 5: Commit**: `feat(retail): notificaciones de existencias y avisos en la caja de tienda`.

### Task 9: Diseño, spec y todo

**Files:**
- Modify: `docs/diseno/pos-retail.md`: fundir la sección «Versión 2» en el resto, describiendo lo construido y borrando lo que ya no aplica. Se quedan «Decidido con Fermín» y «Por decidir».
- Modify: el spec, §12: un bloque «Entrega 4b (16 oct)» con las decisiones 1 a 5.

- [ ] **Step 1: Documentos.**
- [ ] **Step 2: Todo.**

```bash
cd desktop && npm run smokes && cd ..
node --test desktop/src/*.test.mjs
pnpm --filter "./apps/*" -r typecheck
pnpm --filter @vim/pos test
pnpm --filter @vim/admin test
pnpm tipografia
```

- [ ] **Step 3: Commit**: `docs(retail): la caja de tienda version 2 en el diseno y el spec`.

### Task 10: Verificación en el navegador (controlador)

Con la configuración `pos-retail` (puerto 3022) y el negocio de prueba en RETAIL solo mientras se prueba. Si el contenedor de funciones locales está caído, se reinicia.

- [ ] Recorrer las cinco secciones.
- [ ] Tarjetas con foto y sin foto: subir una foto de prueba desde el admin local o poner una `imagen_url` local.
- [ ] Cobrar desde el Panel simplificado.
- [ ] En Transacciones: reimprimir, devolver y cambio de talla.
- [ ] Recibir con y sin permiso.
- [ ] Notificaciones con su globo.
- [ ] Escape vuelve al Panel.
- [ ] Como restaurante, la caja queda igual que en `main`.
- [ ] Limpiar: giro y `existencias` como estaban, y los datos de prueba borrados (suave).

## Lo que esta entrega no hace

- Cambiar el costo o elegir proveedor al recibir en la caja (decisión 1).
- Conteos y traspasos desde la caja: siguen en el admin.
- Notificaciones del servidor o push al celular: es solo la lista de la caja.
- Fotos guardadas para usar sin internet: la caja sin red usa el respaldo con la inicial.
