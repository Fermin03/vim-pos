# Recetas con costeo, proveedores y compras — diseño

**Fecha:** 2026-09-03 · **Decisión:** `docs/decisiones/0012-compras-y-proveedores.md` ·
**Alcance aprobado:** panel primero; el descuento por venta desde la caja instalada es un ciclo
aparte.

## 1. Problema

El plan Negocio vende inventario y mermas. El esquema de inventario (migración 0007) tiene
insumos, existencias, movimientos, recetas y funciones de descuento por venta, pero:

- **No hay pantalla de recetas.** Sin recetas, `descontar_inventario_por_venta` no descuenta nada.
- **No hay proveedores ni compras.** La entrada actual (`ModalMovimiento` en
  `apps/admin/app/(panel)/inventario/page.tsx`) captura un insumo a la vez, sin proveedor ni
  referencia de factura, aunque el RPC los acepta.
- **El costo de receta se desactualiza** cuando el costo del insumo se edita a mano, porque
  `recalcular_costo_recetas` solo corre en `ENTRADA_COMPRA`.

## 2. Alcance

**Entra:**

1. Catálogo de proveedores.
2. Compra como documento (cabecera + líneas) que genera entradas de inventario, con anulación.
3. Captura de compra desde el XML del CFDI 4.0 del proveedor, con emparejamiento de conceptos a
   insumos que se aprende por proveedor.
4. Lista de recetas con costo, precio y margen, y editor de receta por producto con unidades
   convertidas.
5. Trigger que recalcula el costo de recetas al editar el costo de un insumo.
6. Pruebas: unitarias del lector de XML y del cálculo de margen; SQL de humo de compra, anulación
   y receta; RLS de las tablas nuevas.

**No entra** (queda anotado en el ADR 0012): sincronización de inventario con la caja instalada,
órdenes de compra y recepción parcial, sub-recetas, recetas por sucursal, guardar el XML en
Storage, componentes de modificadores extra, historial de movimientos filtrable (P-149), reporte
de costo de ventas y margen por periodo (P-150), ocultar Inventario a los planes que no lo
incluyen.

## 3. Datos (migración `0099_compras_proveedores_recetas.sql`; las funciones de compras van en `0100_registrar_anular_compra.sql`)

Todas las tablas nuevas llevan `tenant_id`, `created_at`, `updated_at`, RLS `FOR ALL` con
`tenant_id = current_tenant_id()` en USING y WITH CHECK, e índice por `tenant_id`. La prueba
`supabase/tests/0002_rls_cobertura.test.sql` las recorre automáticamente.

### 3.1 `proveedores`

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid NOT NULL | |
| nombre | varchar(200) NOT NULL | |
| rfc | varchar(13) NULL | mayúsculas; UNIQUE parcial `(tenant_id, rfc)` donde no es NULL y `deleted_at IS NULL` |
| telefono | varchar(30) NULL | |
| email | varchar(200) NULL | |
| notas | text NULL | |
| activo | boolean NOT NULL DEFAULT true | |
| deleted_at, deleted_by | | baja lógica, como `insumos` |

### 3.2 `compras`

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| tenant_id, sucursal_id | uuid NOT NULL | la sucursal que recibe |
| proveedor_id | uuid NOT NULL → proveedores | |
| folio_completo, folio_consecutivo | | trigger `BEFORE INSERT` con `generar_folio(sucursal_id, 'COMPRA')`, igual que `trg_cuenta_folio` |
| fecha | date NOT NULL | fecha de la compra (del CFDI si viene de XML) |
| referencia_documento | varchar(100) NULL | serie + folio del proveedor, o número de nota |
| cfdi_uuid | uuid NULL | UNIQUE parcial `(tenant_id, cfdi_uuid)` donde no es NULL |
| origen | enum `compra_origen` (MANUAL, XML) | |
| subtotal_mxn, iva_mxn, total_mxn | numeric(12,2) NOT NULL | total = subtotal + iva (CHECK) |
| notas | text NULL | |
| estado | enum `compra_estado` (CONFIRMADA, ANULADA) NOT NULL DEFAULT 'CONFIRMADA' | |
| usuario_id | uuid NOT NULL | quien registró |
| anulada_at, anulada_por, motivo_anulacion | | |
| dia_contable | date NOT NULL | `calcular_dia_contable(tenant_id, now())` al registrar |

### 3.3 `compra_lineas`

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| tenant_id, compra_id | uuid NOT NULL | |
| insumo_id | uuid NOT NULL → insumos | |
| descripcion_origen | varchar(500) NULL | texto del concepto del XML |
| cantidad_capturada | numeric(14,3) CHECK > 0 | como se tecleó o vino en el XML |
| unidad_capturada_id | uuid NOT NULL → unidades_medida | |
| cantidad | numeric(14,3) CHECK > 0 | ya en la unidad del insumo |
| costo_unitario_mxn | numeric(14,6) CHECK >= 0 | por unidad del insumo, con descuento del concepto aplicado, sin IVA |
| importe_mxn | numeric(12,2) | cantidad × costo, sin IVA |
| movimiento_id | uuid NULL → movimientos_inventario | la entrada que generó |
| movimiento_reversa_id | uuid NULL → movimientos_inventario | la devolución si se anuló |
| orden | integer | |

### 3.4 `proveedor_insumo_alias`

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| tenant_id, proveedor_id | uuid NOT NULL | |
| clave_origen | varchar(120) NOT NULL | `NoIdentificacion` del concepto; si no viene, `ClaveProdServ` + `\|` + descripción normalizada (minúsculas, sin acentos, espacios colapsados) |
| descripcion_origen | varchar(500) | último texto visto, para mostrar |
| insumo_id | uuid NOT NULL → insumos | |
| unidad_id | uuid NOT NULL → unidades_medida | unidad en que el proveedor vende |
| factor | numeric(20,10) CHECK > 0 | cuántas unidades del insumo hay en una unidad del proveedor (CAJA 12 PZ → 12) |
| UNIQUE | (proveedor_id, clave_origen) | upsert al confirmar |

### 3.5 Cambios a tablas existentes

- `movimientos_inventario.compra_id uuid NULL → compras`, índice.
- `receta_componentes.cantidad_capturada numeric(14,3) NULL` y
  `unidad_capturada_id uuid NULL → unidades_medida`. NULL significa "en la unidad del insumo".
  **`cantidad` sigue siendo la unidad del insumo y no cambia de semántica.**
- `contadores_folio.tipo_documento` ya admite 'COMPRA' (varchar(40) desde 0032).

### 3.6 Trigger de costo

`trg_insumo_costo_recalcula_recetas`: `AFTER UPDATE OF costo_unitario_mxn ON insumos`, cuando el
valor cambia, `PERFORM recalcular_costo_recetas(NEW.id)`. Cierra el hueco conocido.

## 4. Funciones SQL

Las tres son `SECURITY INVOKER` (corren bajo RLS del usuario, como `aplicar_movimiento_inventario`),
toman el usuario de `auth.uid()` y el negocio de `current_tenant_id()`, y reciben JSON validado con
Zod en el panel antes de llamar. `iva_mxn` viene en el JSON solo cuando la compra sale de un XML. Errores con `RAISE EXCEPTION` y
mensaje en español; el panel los muestra con `mensajeError`.

### 4.1 `registrar_compra(p_compra jsonb) RETURNS uuid`

Entrada:

```json
{
  "sucursal_id": "…", "proveedor_id": "…", "fecha": "2026-09-03",
  "referencia_documento": "A 1234", "cfdi_uuid": "…|null", "origen": "XML|MANUAL",
  "notas": "…|null", "iva_mxn": 48.00,
  "lineas": [
    { "insumo_id": "…", "descripcion_origen": "…|null",
      "cantidad_capturada": 2, "unidad_capturada_id": "…",
      "cantidad": 24, "costo_unitario_mxn": 12.5, "importe_mxn": 300.00 }
  ],
  "aliases": [
    { "clave_origen": "…", "descripcion_origen": "…",
      "insumo_id": "…", "unidad_id": "…", "factor": 12 }
  ]
}
```

Pasos, en una transacción:

1. Valida que haya al menos una línea, que `cfdi_uuid` no exista ya para el tenant (mensaje:
   "Esta factura ya está registrada como la compra K-2026-000012"), que proveedor y sucursal
   sean del tenant.
2. Calcula `subtotal_mxn = SUM(importe_mxn)`, `iva_mxn = round(subtotal × 0.16, 2)` salvo que el
   JSON traiga `iva_mxn` explícito (del XML), `total = subtotal + iva`.
3. Inserta `compras` (folio por trigger) y `compra_lineas`.
4. Por cada línea llama `aplicar_movimiento_inventario(tenant, sucursal, insumo, 'ENTRADA_COMPRA',
   cantidad, costo_unitario_mxn, usuario, motivo := 'Compra ' || folio,
   descripcion := descripcion_origen, proveedor_texto := nombre del proveedor,
   factura_referencia := referencia_documento)`, guarda el `movimiento_id` en la línea y escribe
   `compra_id` en el movimiento. Con eso el costo promedio, las alertas y el costo de recetas se
   recalculan como hoy.
5. Upsert de `proveedor_insumo_alias` por `(proveedor_id, clave_origen)`.
6. Devuelve el id de la compra.

### 4.2 `anular_compra(p_compra_id uuid, p_motivo text) RETURNS void`

1. Bloquea la compra (`FOR UPDATE`); si ya está ANULADA, error "Esta compra ya está anulada".
2. Por cada línea, `aplicar_movimiento_inventario(…, 'DEVOLUCION_PROVEEDOR', cantidad,
   costo_unitario_mxn, usuario, motivo := 'Anulación de compra ' || folio || ': ' || p_motivo)` y
   guarda `movimiento_reversa_id`. `DEVOLUCION_PROVEEDOR` ya resta existencias en el mapa de signos
   de la función.
3. Marca `estado = 'ANULADA'`, `anulada_at`, `anulada_por`, `motivo_anulacion`.
4. **No revierte el costo promedio** (documentado en el ADR y en la pantalla de confirmación).

### 4.3 `guardar_receta(p_producto_id uuid, p_activa boolean, p_notas text, p_componentes jsonb) RETURNS uuid`

`p_componentes`: `[{ insumo_id, cantidad, cantidad_capturada, unidad_capturada_id, es_critico,
notas, orden }]` con `cantidad` **ya en la unidad del insumo** (el panel convierte).

1. Valida que el producto sea del tenant y que no haya insumos repetidos.
2. Upsert de `recetas` por `producto_id` (`activa`, `notas_preparacion`, `version = version + 1`
   si ya existía).
3. Borra los componentes actuales e inserta los nuevos. El trigger existente
   `trg_componentes_recalcular_costo` deja `costo_total_mxn` al día.
4. Devuelve el id de la receta.

Una receta sin componentes con `activa = true` es un error ("Una receta activa necesita al menos
un insumo"). Con `activa = false` se permite (producto "sin costeo").

## 5. Lector de XML CFDI 4.0 (`apps/admin/app/lib/cfdi-recibido.ts`)

Función pura, sin red, probada con vitest: `leerCfdiRecibido(xml: string): ResultadoLectura`.
Usa `DOMParser` del navegador (sin dependencia en producción). Las pruebas de vitest corren en
Node, así que el archivo de prueba declara `// @vitest-environment jsdom` y `jsdom` entra como
`devDependency` de `apps/admin`. Tolera los prefijos `cfdi:` y `tfd:` buscando por `localName`.

Extrae:

- Comprobante: `Version` (debe ser "4.0"; "3.3" se acepta con aviso), `Serie`, `Folio`, `Fecha`,
  `SubTotal`, `Descuento`, `Total`, `Moneda` (si no es MXN, error: "Solo se aceptan facturas en
  pesos"), `TipoDeComprobante` (debe ser "I"; si es "E" o "P", error explicando que no es una
  factura de compra).
- Emisor: `Rfc`, `Nombre`. Receptor: `Rfc` (si no coincide con el RFC del negocio en
  `configuracion_tenant`, aviso no bloqueante: "Esta factura no está a nombre de tu negocio").
- Conceptos: `ClaveProdServ`, `NoIdentificacion`, `Cantidad`, `ClaveUnidad`, `Unidad`,
  `Descripcion`, `ValorUnitario`, `Importe`, `Descuento`, y la suma de traslados IVA del concepto.
- Timbre: `UUID`, `FechaTimbrado`. Sin timbre → error "El archivo no está timbrado".

Salida:

```ts
type CfdiRecibido = {
  uuid: string; fecha: string; serie?: string; folio?: string;
  emisor: { rfc: string; nombre: string }; receptorRfc: string;
  subtotal: number; descuento: number; iva: number; total: number;
  conceptos: { claveOrigen: string; claveProdServ: string; noIdentificacion?: string;
    descripcion: string; cantidad: number; claveUnidad: string; unidad?: string;
    valorUnitario: number; descuento: number; importeSinIva: number }[];
  avisos: string[];
};
type ResultadoLectura = { ok: true; cfdi: CfdiRecibido } | { ok: false; motivo: string };
```

`claveOrigen` sigue la regla de §3.4. `importeSinIva = Importe − Descuento`. Los números se leen
con `Number()` y se redondean a 6 decimales para costos y 2 para importes.

## 6. Cálculo de costo y margen (`apps/admin/app/lib/recetas.ts`)

Funciones puras, probadas con vitest:

- `convertirCantidad(cantidad, unidadOrigen, unidadDestino, conversiones)`: misma unidad →
  identidad; busca conversión del negocio directa, luego inversa, y después una tabla fija del
  sistema por código de unidad (kg→g 1000, L→ml 1000, oz→g 28.3495, kg→oz 35.274), porque las
  unidades se siembran por negocio (0035) y `conversiones_unidades` no tiene semillas; dimensión
  distinta o sin conversión → error con mensaje ("No hay conversión de oz a g; captura la
  cantidad en g").
- `costoReceta(componentes, insumos)`: suma de `cantidad × costo_unitario_mxn`.
- `margen(precio, costo)`: `{ pesos: precio − costo, porcentaje: precio > 0 ? (precio − costo)/precio : null }`.
  El precio se toma de `productos.precio_base_mxn`, que es con IVA incluido; el margen que se
  muestra es contra el precio **sin IVA** (`precio / 1.16`), y la pantalla lo dice.

Las conversiones y unidades se leen una vez (`unidades_medida`, `conversiones_unidades`, ambas
de solo lectura por RLS).

## 7. Pantallas (`apps/admin`)

Siguen `docs/diseno/admin.md`: filas de 40 px, números a la derecha con `tabular-nums`,
acciones peligrosas con confirmación que nombra la consecuencia, objetivos de 36–40 px. Los
componentes y constantes de estilo se toman de `(panel)/inventario/page.tsx` (`PageHeader`,
`PageBody`, `Button`, `input`, `label`, toast `okMsg`, `mensajeError`). Lectura y escritura con
el cliente Supabase del navegador, como todo el panel.

### 7.1 Recetas

- **`/catalogo/recetas`** (pestaña nueva en `catalogo-tabs.tsx`): tabla de productos activos con
  columnas Producto · Categoría · Precio (sin IVA) · Costo · Margen $ · Margen % · Estado
  (Con receta / Sin receta / Receta pausada). Buscador y filtro "Solo sin receta". Al hacer clic
  se abre el editor. Paginación en cliente como Inventario.
- **`/catalogo/recetas/[productoId]`**: cabecera con nombre y precio; interruptor "Receta activa";
  tabla de componentes con Insumo (buscador con categoría y unidad del insumo), Cantidad,
  Unidad (las de la misma dimensión que la unidad del insumo, con la del insumo por defecto),
  Costo de la línea, Crítico (marca), y botón quitar. Al pie: costo total, precio sin IVA,
  margen en pesos y porcentaje, en vivo. Notas de preparación. Guardar llama `guardar_receta`.
  Si un insumo cambió de unidad respecto a la `unidad_capturada_id`, la fila se marca "Revisar
  unidad" y no se puede guardar hasta corregirla.
- En **`/catalogo/productos/[id]`** se agrega un enlace "Receta y costo" con el costo actual.

### 7.2 Proveedores

- **`/inventario/proveedores`**: tabla Nombre · RFC · Teléfono · Compras (conteo) · Activo, con
  modal de alta/edición (nombre obligatorio; RFC validado con la expresión de RFC de persona
  física o moral, en mayúsculas). Baja lógica con confirmación "No podrás registrarle compras;
  las anteriores se conservan".

### 7.3 Compras

- **`/inventario/compras`**: tabla Folio · Fecha · Proveedor · Referencia · Sucursal · Total ·
  Estado (Confirmada / Anulada), con filtro de rango de fechas que nunca deja elegir futuro ni
  inicio mayor que fin (regla de `admin.md`), filtro por proveedor y por sucursal. Botón "Nueva
  compra".
- **`/inventario/compras/[id]`**: cabecera, líneas (Insumo · Descripción de origen · Cantidad
  capturada y unidad · Cantidad en unidad del insumo · Costo unitario · Importe), totales, y botón
  "Anular compra" que abre confirmación con motivo obligatorio y el texto: "Se regresarán las
  existencias de N insumos en {sucursal}. El costo promedio no se modifica". Llama `anular_compra`.
- **`/inventario/compras/nueva`**, un solo formulario con dos entradas:
  1. **Zona de archivo** "Arrastra el XML de la factura o haz clic" (`<input type="file"
     accept=".xml,text/xml,application/xml">`). Al leerlo: si falla, muestra el motivo; si va bien,
     llena proveedor (por RFC; si no existe, botón "Crear proveedor {nombre}" que lo crea y lo
     selecciona), fecha, referencia (serie-folio), UUID (solo lectura) y una fila por concepto.
  2. **Captura manual**: mismas filas vacías, se agregan con "Agregar insumo".

  Cada fila: Descripción de origen (solo XML, solo lectura) · Insumo (buscador; si hay alias del
  proveedor viene preseleccionado con una marca "Emparejado") · Cantidad capturada · Unidad del
  proveedor · Factor a unidad del insumo (por defecto 1; editable; si hay conversión de unidades
  conocida se propone) · Cantidad en unidad del insumo (calculada) · Costo unitario (calculado:
  `importeSinIva / cantidad`) · Importe. Una fila puede marcarse "Omitir" (fletes, cargos que no
  son insumo): no se registra, no crea alias.

  Al pie: subtotal, IVA (del XML o 16 %), total; si viene de XML y el total calculado difiere del
  `Total` del comprobante en más de $0.05, aviso "El total no cuadra con la factura por $X; revisa
  las filas omitidas".

  Validación antes de enviar: proveedor y sucursal elegidos, al menos una fila no omitida, cada
  fila con insumo, cantidad > 0 y costo ≥ 0. Si `cfdi_uuid` ya existe (consulta previa), se
  bloquea con enlace a la compra existente. "Registrar compra" llama `registrar_compra` y
  redirige al detalle con toast "Compra K-2026-000012 registrada".

### 7.4 Inventario (página existente)

Se agregan accesos en la cabecera: "Compras" y "Proveedores". El modal de movimiento pierde la
opción `ENTRADA_COMPRA` (ahora se hace por compra) y conserva merma y ajustes.

## 8. Permisos

El panel controla acceso por jerarquía de ruta (`apps/admin/app/lib/acceso.ts`,
`MIN_JERARQUIA`). Se registran las rutas nuevas con el mismo mínimo que `/inventario` y
`/catalogo`; anular una compra requiere el mínimo de `/inventario` (no se agrega PIN en este
ciclo: la anulación queda auditada por usuario y motivo). No se crean permisos nuevos en la tabla
`permisos`.

## 9. Errores

- XML ilegible, sin timbre, en otra moneda o de tipo distinto a ingreso: se muestra el motivo en la
  zona de archivo y no se llena nada.
- UUID repetido: mensaje con el folio de la compra existente y enlace.
- Conversión de unidades imposible: la fila se marca y el botón de guardar se deshabilita con
  el motivo visible.
- Errores del RPC: `mensajeError(e, "No se pudo registrar la compra")` y la pantalla conserva lo
  capturado.

## 10. Pruebas

- **vitest** (`apps/admin/app/lib/__tests__/`): `cfdi-recibido.test.ts` con un CFDI 4.0 de
  ejemplo (con prefijos, con descuento, con concepto sin `NoIdentificacion`, uno de tipo "E", uno
  sin timbre, uno en USD) y `recetas.test.ts` (conversión directa, inversa, dimensión distinta,
  costo y margen, precio cero).
- **SQL de humo** (`supabase/tests/smoke_compras_recetas.sql`, mismo estilo que
  `smoke_devolucion.sql`): crea proveedor, insumo con costo 10 y existencia 0; registra compra de
  24 piezas a 12.50 → existencia 24, costo promedio 12.50, movimiento con `compra_id`; registra
  segunda compra de 24 a 15 → costo promedio 13.75; guarda receta de 2 piezas → costo 27.50;
  edita costo del insumo a 20 → costo de receta 40 (trigger nuevo); anula la segunda compra →
  existencia 24, movimiento `DEVOLUCION_PROVEEDOR`, estado ANULADA, costo promedio sin cambio;
  intenta registrar el mismo `cfdi_uuid` → error.
- **RLS**: `0002_rls_cobertura.test.sql` cubre las cuatro tablas nuevas sin cambios; se agrega
  `0009_compras_rls.test.sql` con casos cross-tenant de `proveedores` y `compras`.
- **Tipos**: `pnpm db:types` tras la migración; `tsc --noEmit` en admin (no `next build` con el
  dev server arriba).

## 11. Orden de construcción sugerido

1. Migración 0099 + funciones + trigger + smoke SQL.
2. `recetas.ts` (cálculo) + pruebas → pantallas de recetas.
3. `cfdi-recibido.ts` + pruebas.
4. Proveedores (lib + pantalla).
5. Compras (lib + lista + detalle + nueva, manual primero y XML después).
6. Ajustes a Inventario y a las pestañas de Catálogo; rutas en `acceso.ts`.
7. Verificación en el navegador contra Supabase local y `tsc --noEmit`.
