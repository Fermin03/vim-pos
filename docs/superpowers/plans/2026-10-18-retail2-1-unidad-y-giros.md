# Retail 2 · Entrega 1 (venta por unidad y giros nuevos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una tienda venda por pieza, kilo, metro o litro (peso tecleado), y que existan los giros Abarrotes, Frutería, Ferretería y Vinos usando la caja de tienda de ropa.

**Architecture:** Reutiliza `productos.tipo_venta` (enum `producto_tipo_venta`: UNIDAD/PESO/VOLUMEN, hoy sin uso) y agrega LONGITUD. La unidad del SAT del producto se deriva de su `tipo_venta` en la base, así que el snapshot del renglón (`ticket_items.unidad_sat_snapshot`) ya trae la unidad para el ticket y la factura. «Es tienda» deja de ser `= 'RETAIL'`: pasa a una función SQL y a una lista en TS. Los giros nuevos nacen bloqueados en `cambiar_giro` y fuera del registro; los abre la entrega 4.

**Tech Stack:** PostgreSQL 15 (Supabase), smokes `.sql`, Next.js + Vitest (`apps/pos`, `apps/admin`), `packages/db`, Deno (`supabase/functions/_shared/pac`).

**Spec:** `docs/superpowers/specs/2026-10-18-giros-retail-2-design.md` (y el de ropa, `2026-10-15-giro-retail-design.md`, para el patrón de giros y lanzamiento). Diseño de caja: `docs/diseno/pos-retail.md`.

## Global Constraints

- **Todo en local:** sin push, PR, merge, `supabase db push`, `functions deploy` ni instalador. Nada a producción hasta tener retail, servicios y belleza.
- Rama `feat/retail2-unidad`, encima de `feat/retail-abrir` (HEAD a6d10022), en el worktree `vim-pos-retail`.
- 0188–0204 están aplicadas al Docker local y **no se editan**. Las nuevas (0205–0206) se aplican con `docker exec -i supabase_db_vim-pos psql -U postgres -v ON_ERROR_STOP=1 < <archivo>` y se registran en `supabase_migrations.schema_migrations`.
- Un valor nuevo de enum va en una migración que **solo** hace `ADD VALUE` (la caja aplica cada archivo como una consulta).
- Códigos de giro: `ABARROTES`, `FRUTERIA`, `FERRETERIA`, `VINOS`. **No** `SUPERMERCADO`: `smoke_prospectos_giros.sql:19-20` exige que se rechace. Etiquetas exactas:
  - «Tienda de abarrotes o supermercado»
  - «Frutería y verdulería»
  - «Ferretería»
  - «Vinos y licores»
- Unidades. Una sola tabla de verdad, en TS y en SQL:

  | tipo_venta | unidad SAT | etiqueta CFDI | abreviatura | decimales | título de la ventana |
  |---|---|---|---|---|---|
  | UNIDAD | H87 | Pieza | pz | 0 | — |
  | PESO | KGM | Kilogramo | kg | 3 | Peso |
  | LONGITUD | MTR | Metro | m | 2 | Metros |
  | VOLUMEN | LTR | Litro | l | 2 | Litros |

  E48 → «Servicio» se queda para lo que no tiene unidad (restaurantes).
- **Los restaurantes no cambian:** sus productos siguen en UNIDAD, con `unidad_sat` NULL → E48/«Servicio», y su caja no ve nada nuevo.
- Ponytail antes de programar; dominio en español; sin `any`; dinero nunca en float (los totales usan el `r2` existente).
- Suites que no se rompen: smokes (hoy 98/98), pos/admin/platform test y typecheck, `pnpm tipografia`, prueba `supabase/tests/0040`.

## Review Focus

1. **Decimales en el borde:** 1.250 kg debe quedar 1.250, no 1 ni 1250. Ni el modal, ni el carrito, ni `agregar_item_a_ticket`, ni el ticket impreso pueden redondear a entero. El total es `r2(precio × cantidad)`. → Task 5 (pruebas del modal y del carrito) y Task 6 (impresión).
2. **Escanear un producto a granel** abre la ventana de cantidad, no agrega 1. Dos pesadas del mismo producto son dos renglones. → Task 5.
3. **«Quitar» en un renglón a granel** quita el renglón completo. Hoy, con cantidad > 1, resta 1: con 1.25 dejaría 0.25. → Task 5.
4. **Devolver una venta a granel:** el contador ±1 de `pantalla-devoluciones.tsx:766-769` no sirve para 1.25. → Task 6: los renglones que no son pieza se devuelven completos o nada.
5. **Una variante hereda la unidad de su padre**, como hereda la clave SAT. Si no la hereda, una playera vendida por kilo factura «Pieza» en una talla y «Kilogramo» en otra. → Task 2.

---

### Task 1: Valores nuevos de enum (0205)

**Files:**
- Create: `supabase/migrations/0205_retail2_valores.sql`, con solo esto:
  - `ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS` para ABARROTES, FRUTERIA, FERRETERIA y VINOS;
  - `ALTER TYPE producto_tipo_venta ADD VALUE IF NOT EXISTS 'LONGITUD'`.
  - Encabezado al estilo de la 0188: por qué van solos y que la caja debe recibirlos en un instalador antes de que alguien los use.
- Modify: `supabase/scripts/smoke_existencias_producto.sql` (o un smoke nuevo `smoke_retail2.sql`): comprobar que los 5 valores existen en sus enums.

- [ ] Step 1: escribir la aserción del smoke y verla fallar (`cd desktop && npm run smokes -- <smoke>`).
- [ ] Step 2: escribir la 0205, aplicarla al Docker local y registrarla.
- [ ] Step 3: correr ese smoke más `smoke_giros_operacion.sql` y `smoke_prospectos_giros.sql`. Expected: en verde.
- [ ] Step 4: commit `"BD: valores de giro y unidad para la segunda tanda de retail (0205)"`.

### Task 2: Giro de tienda y unidad del producto en la base (0206)

**Files:**
- Create: `supabase/migrations/0206_giro_tienda_y_unidad.sql`:
  - **`es_giro_tienda(p vertical_tipo) RETURNS boolean`**, IMMUTABLE. Verdadero para RETAIL, ABARROTES, FRUTERIA, FERRETERIA y VINOS. EXECUTE para authenticated y service_role.
  - **`juego_inicial_de_giro`:** cuerpo vigente (0189:15-30) más los 4 giros nuevos con el mismo juego que RETAIL (mostrador y existencias en true, lo demás en false).
  - **`trg_tickets_tienda_sin_cocina`** (vigente en 0196:355-364): `= 'RETAIL'` pasa a `es_giro_tienda(...)`.
  - **`cambiar_giro`:** cuerpo vigente (0203:6-46). La lista de no disponibles gana `'ABARROTES','FRUTERIA','FERRETERIA','VINOS'`; la entrega 4 los libera. Mismos grants.
  - **Unidad SAT desde `tipo_venta`:** disparador `BEFORE INSERT OR UPDATE OF tipo_venta, controla_existencias ON productos`.
    - Si `tipo_venta <> 'UNIDAD'`: pone `unidad_sat` según la tabla de Global Constraints.
    - Si es `UNIDAD` y `controla_existencias` está encendido y `unidad_sat` es NULL: pone `'H87'`.
    - En otro caso no toca nada; así los restaurantes no cambian.
    - Backfill en la misma migración: productos con `controla_existencias` y `unidad_sat` NULL pasan a `'H87'`.
  - **Herencia a variantes:** `productos_heredar_a_variantes` y `_guardar_variante` (0190:61-78 y :163-166) copian también `tipo_venta`, igual que `clave_sat` y `unidad_sat`.
  - **`importar_catalogo_tienda`** (0190:255-373) acepta en cada fila un campo opcional `"unidad"` con valor `pieza|kg|m|l` (sin acentos ni mayúsculas que importen). Lo traduce a `tipo_venta` y rechaza otro valor con un mensaje claro por fila, siguiendo su patrón de errores. Sin el campo queda UNIDAD.
- Modify: un smoke (`smoke_retail2.sql`):
  - (a) `es_giro_tienda` de los 5 giros y de un restaurante;
  - (b) `juego_inicial_de_giro('FERRETERIA')` igual al de RETAIL;
  - (c) `cambiar_giro` a FRUTERIA responde `GIRO_NO_DISPONIBLE`;
  - (d) un ticket abierto en un tenant FERRETERIA nace con `envio_cocina_automatico=false`;
  - (e) un producto PESO tiene `unidad_sat='KGM'`, y su variante hereda PESO y KGM;
  - (f) un producto de restaurante (UNIDAD, sin existencias) queda con `unidad_sat` NULL;
  - (g) `agregar_item_a_ticket(..., 1.250)` guarda 1.250 y total = r2(precio × 1.250), con `unidad_sat_snapshot='KGM'`;
  - (h) importar una fila con `"unidad":"m"` deja LONGITUD/MTR, y con `"unidad":"caja"` la rechaza.
  - Ajustar `smoke_existencias_producto.sql:26-28,34` si su JSON exacto de giros cambia.

- [ ] Step 1: smokes (a)–(h) que fallan.
- [ ] Step 2: escribir la 0206, aplicar, registrar.
- [ ] Step 3: suite completa de smokes y prueba 0040. Expected: en verde.
- [ ] Step 4: commit `"BD: giros de tienda y unidad de venta del producto (0206)"`.

### Task 3: «Es tienda» y los giros en TS

**Interfaces:**
- Produces (en `packages/db/src/operacion.ts`):
  - `GIROS_TIENDA: readonly CodigoGiro[]`, los 5 de arriba;
  - `esGiroTienda(g: string | null | undefined): boolean`;
  - en `GIROS`, los 4 giros nuevos con sus etiquetas y `ofrecido: false`.
- Los usan las Tasks 4 a 6.

**Files:**
- Modify: `packages/db/src/operacion.ts`:
  - `CodigoGiro`, `GIROS`, `GIROS_TIENDA`, `esGiroTienda`;
  - el texto del módulo existencias (:44) deja de hablar solo de prendas: «Existencias por producto: piezas, kilos, metros o litros.».
- Modify: `apps/pos/app/lib/tienda.ts:7`: `esTienda = esGiroTienda(caja?.giro)`.
- Modify: `apps/pos/app/lib/print/ticket-datos.ts:351`: usar `esGiroTienda`.
- Modify: `apps/admin/app/lib/onboarding.ts:68-79`:
  - ropa (RETAIL) conserva sus textos;
  - los otros 4 giros de tienda usan título «Tus productos», descripción «Importa tus productos o captúralos.» y href `/catalogo/importar-tienda`, y el paso equipo «Crea a tus cajeros con su PIN.».
- Tests:
  - `tienda.test.ts`: los 5 giros son tienda y un restaurante no;
  - `onboarding.test.ts`: FERRETERIA;
  - `operacion-catalogo.test.ts`: los ofrecidos no cambian.

- [ ] Step 1: pruebas que fallan. Step 2: implementar. Step 3: `pnpm --filter @vim/pos test`, `@vim/admin test`, typecheck de pos, admin y platform. Step 4: commit `"Giros de tienda: una sola lista en lugar de RETAIL"`.

### Task 4: Unidad de venta en el admin

**Files:**
- Modify: `apps/admin/app/components/producto-form.tsx`:
  - select **«Se vende por»** con las opciones Pieza, Kilo, Metro y Litro, junto al precio (:388-412);
  - se muestra cuando `conExistencias` (el mismo criterio que ya usa el formulario en :131);
  - la etiqueta del precio cambia a «Precio por kilo», «Precio por metro» o «Precio por litro»;
  - el texto de ayuda de la clave SAT (:604) deja de hablar de prendas.
- Modify: `apps/admin/app/lib/catalogo.ts`: `tipo_venta` en `productoSchema` (:151-181), en el select (:223) y en `DatosTienda`/`columnasTienda` (:304-306).
- Modify: `apps/admin/app/lib/importar-tienda.ts`: columna opcional **«Unidad»** (pieza/kg/m/l) después de «Precio». Se pasa como `unidad` al RPC de la Task 2.
- Modify: `apps/admin/app/(panel)/existencias/page.tsx:70` y `traspasos/page.tsx:244`: el encabezado «Piezas» pasa a «Existencia» y cada cantidad sale con su abreviatura.
- Tests:
  - esquema y armado de columnas con PESO;
  - parser del CSV con «Unidad» (válida, vacía, inválida);
  - render del formulario: con existencias muestra «Se vende por»; sin existencias (restaurante) no.

- [ ] Step 1: pruebas. Step 2: implementar. Step 3: `pnpm --filter @vim/admin test` y typecheck. Step 4: verificar en el navegador (config `admin-retail`) con un producto por kilo. Step 5: commit `"Admin: los productos de tienda se venden por pieza, kilo, metro o litro"`.

### Task 5: La caja pide la cantidad

**Interfaces:**
- Produces, en `apps/pos/app/lib/unidades.ts` (nuevo):
  - `type TipoVenta = "UNIDAD" | "PESO" | "LONGITUD" | "VOLUMEN"`;
  - `unidadDeVenta(t: TipoVenta | null | undefined)` → `{ abrev, decimales, titulo }` según la tabla de Global Constraints;
  - `unidadDesdeSat(clave: string | null)` → la misma forma, desde H87/KGM/MTR/LTR;
  - `fmtCantidad(cantidad: number, t)`: «1.250 kg», «7.50 m», «2» para piezas;
  - `aGranel(t): boolean`.
- `Producto` (`apps/pos/app/lib/catalogo.ts:13-34`) gana `tipoVenta?: TipoVenta`, opcional por la caché de Dexie, leído en el select (:63) y en el mapeo (:76-97).

**Files:**
- Create: `apps/pos/app/lib/unidades.ts` y `apps/pos/app/components/modal-cantidad.tsx`.
  - Ventana con el nombre del producto, su precio por unidad y un campo de cantidad.
  - Título y sufijo según la unidad («Peso · kg»), teclado numérico en pantalla con punto decimal y Enter.
  - Admite el teclado físico: números, punto, Backspace, Enter, Escape.
  - Rechaza 0, negativos y más decimales de los de su unidad, con el aviso «Escribe una cantidad mayor a 0».
  - Se registra en la pila de Escape (`useEscape`).
  - `Numpad` de `modal-cobro.tsx:154-221` trabaja en centavos y no se exporta: no se reutiliza, se hace uno pequeño de decimales.
- Modify: `apps/pos/app/components/venta-retail.tsx`: `tocar` (:99-102), `alCodigo` (:105-119) y `onElegir` del selector (:286-296). Si `aGranel(p.tipoVenta)`, abren la ventana y al confirmar llaman `onAgregar(p, cantidad)`; si no, `onAgregar(p)` como hoy.
- Modify: `apps/pos/app/components/home-pos.tsx`:
  - `agregarTienda` (:985-1015) y `agregarSuelto` (:930-940) aceptan `cantidad = 1`;
  - con granel despachan **sin** `sumarSiIgual` y pasan la cantidad a `agregarItemAlTicket`.
- Modify: `apps/pos/app/components/sidebar-ticket.tsx:496-498`: «Quitar» resta 1 solo si el renglón es de pieza y su cantidad es mayor que 1; en granel quita el renglón.
- Modify: `apps/pos/app/components/tarjeta-producto-foto.tsx` vía `venta-retail.tsx:271`: precio con unidad, «$28.00/kg». Una pieza se ve igual que hoy.
- Tests:
  - `unidades.test.ts`: tabla completa y `fmtCantidad`;
  - `modal-cantidad`: 1.250 se acepta y queda 1.250; 1.2505 kg se rechaza; 0 se rechaza; en metros, 7.5 queda 7.50;
  - `carrito`: dos líneas a granel del mismo producto no se juntan, y el total de 1.25 × 28 = 35.00;
  - `sidebar-ticket`: «Quitar» en granel quita el renglón;
  - `venta-retail`: tocar o escanear un producto PESO abre la ventana y no agrega nada hasta confirmar.

- [ ] Step 1: pruebas que fallan. Step 2: implementar. Step 3: `pnpm --filter @vim/pos test`, typecheck y `pnpm tipografia`. Step 4: commit `"Caja de tienda: la ventana de cantidad vende por kilo, metro o litro"`.

### Task 6: La cantidad bien escrita en pantalla, ticket, devolución y factura

**Files:**
- Modify, para mostrar `fmtCantidad` en lugar de `{cantidad}×` cuando la unidad no es pieza (las piezas siguen como hoy):
  - `apps/pos/app/components/renglon-item.tsx:43`; recibe una prop opcional `unidad`;
  - `recibo-ticket.tsx:136`;
  - `pantalla-cliente.tsx:265`;
  - `seccion-transacciones.tsx:344`;
  - `selector-variantes.tsx:17`;
  - `seccion-inventario.tsx:445,544`.
- Modify: `apps/pos/app/lib/print/ticket-datos.ts:28-30,227`:
  - leer `precio_unitario_snapshot` y `unidad_sat_snapshot`;
  - `LineaImpresion` (`tipos.ts:27-40`) gana `precioUnitario?` y `unidadSat?`;
  - `ticket-builder.ts:103` imprime un renglón a granel como «1.250 kg x Jitomate» y debajo «$28.00/kg». Las piezas, igual que hoy.
- Modify: `apps/pos/app/components/pantalla-devoluciones.tsx:730-769`: un renglón que no es pieza se devuelve **completo o nada**, con una casilla en vez del ±1, y los textos hablan de su unidad. Lo mismo en el cambio de talla (`pantalla-cambio-talla.tsx:214,405`): un renglón a granel no se ofrece para cambio.
- Modify: `supabase/functions/_shared/pac/conceptos.ts:373-375`: `unidad` sale de la clave (H87 «Pieza», KGM «Kilogramo», MTR «Metro», LTR «Litro», E48 «Servicio»), en vez de «Servicio» fijo. Actualizar `conceptos.test.ts`. Como Deno no está instalado aquí, si no se puede correr, decirlo en el reporte.
- Tests:
  - `ticket-builder`: renglón a granel y renglón de pieza;
  - `pantalla-devoluciones`: un renglón a granel solo se devuelve completo;
  - `renglon-item`: cantidad con unidad.

- [ ] Step 1: pruebas. Step 2: implementar. Step 3: `pnpm --filter @vim/pos test`, typecheck y tipografía. Step 4: verificar en el navegador (`pos-retail`, puerto 3022, sin service worker, tenant de prueba en FERRETERIA con un producto por metro y otro por kilo): escribir 7.5 m y 1.250 kg, cobrar y ver el recibo. Step 5: commit `"Tienda: cantidades con unidad en pantalla, ticket, devolución y factura"`.

### Task 7: Documentos y revisión final

- Modify: `docs/diseno/pos-retail.md`, con la ventana de cantidad, el precio por unidad en la tarjeta, «Quitar» en granel y la devolución completa.
- Modify: el spec de retail 2 (§2 o al final, «Entrega 1, hecha»): migraciones 0205–0206, y que la 0205 va en el instalador **antes** de que cualquier negocio use los giros nuevos o venda por metro.
- Suites completas; revisión de toda la rama; dejar el tenant de prueba como estaba.
- Commit `"Retail 2 entrega 1: documentos"`.

## Rulings de este plan (Fermín puede corregirlos)

- Un renglón a granel no se devuelve por fracción: completo o nada. Devolver «medio kilo» queda para después si alguien lo pide.
- Un producto a granel no entra en «Cambio de talla».
- La unidad SAT se deriva de `tipo_venta` en la base. El admin no muestra un campo «unidad SAT» aparte.
- Los giros nuevos quedan fuera del registro y bloqueados en `cambiar_giro` hasta la entrega 4.
- Un producto que ya existe no cambia de unidad sola: queda en Pieza hasta que el dueño la cambie.
