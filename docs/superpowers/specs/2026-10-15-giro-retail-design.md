# Giro RETAIL (tienda de ropa y calzado) — diseño

**Fecha:** 15 de octubre de 2026 · **Estado:** aprobado para planear (sin código)
**Antecedentes:** ADR 0034 (giros y módulos), ADR 0012/0013 (recetas e inventario por insumo),
0101 (sync de inventario con la caja).

## 1. Para qué

Abrir VIM POS a un nicho fuera de restaurantes, al estilo de Square for Retail. El primer nicho es
**ropa, boutique y calzado**. Es una **apuesta de mercado**: no hay tienda piloto, así que se construye
un mínimo de boutique que se pueda enseñar y vender a prospectos, y se valida antes de crecer.

**Éxito:** una boutique con varias sucursales da de alta su catálogo con tallas y colores (a mano o
desde CSV), etiqueta lo que no trae código, vende escaneando, hace cambios de talla en un solo flujo
y sabe cuánto le queda de cada prenda en cada sucursal, también con la caja sin internet.

## 2. Decisiones tomadas (Fermín, 15 oct)

| Tema | Decisión |
|---|---|
| Primer nicho | Ropa / boutique / calzado. Báscula y granel fuera. |
| Existencias | **Stock propio por producto** (tablas nuevas), no insumos ocultos. |
| Plan | El giro no cambia el precio; **las existencias vienen en todos los planes para RETAIL**. |
| Stock en cero | **Se vende con aviso**; la existencia queda negativa y aparece en alertas. |
| Cambio de talla | **En la primera tanda.** |
| Importar CSV | **En la primera tanda.** |
| Etiquetas | **En la primera tanda**, como hoja PDF. |
| Pantalla de venta | Componente propio; forma del boceto del 15 oct. Fermín la ajustará en el camino. |

## 3. Lo que ya existe y se reutiliza

- Giros y `tenants.operacion` (0179–0183): RETAIL entra igual que BAR/CAFETERIA/TAQUERIA.
- Venta directa por `mostrador` / `PARA_LLEVAR`; mesas y KDS no son obligatorios.
- `productos.codigo_barras` y `productos.codigo_interno` (indexados por tenant; hoy sin uso en la app).
- Cajón, impresión ESC/POS, cobro, descuentos, promociones, clientes, lealtad, CFDI, `proveedores`.
- Patrón de sync por movimientos de la 0101 (push de movimientos, la nube recalcula).

## 4. Modelo de datos

### 4.1 Variantes (sobre `productos`)

- `producto_padre_id uuid NULL REFERENCES productos(id)`: la hija apunta al padre. Un nivel, no
  más (CHECK: el padre no tiene padre).
- `variante_ejes text[] NULL` en el padre, p. ej. `{Talla,Color}`.
- `variante_valores jsonb NULL` en la hija, p. ej. `{"Talla":"M","Color":"Negra"}`. Único por
  (padre, valores).
- La hija tiene su propio `codigo_interno`, `codigo_barras` y precio. **Precio vacío = hereda el del
  padre.**
- El padre **no se vende**: es lo que se ve en catálogo y caja. Se vende la hija. Un producto sin
  variantes se vende como hoy.
- `codigo_barras` se vuelve **único por tenant** cuando no es nulo (índice único parcial). Antes de
  crearlo, consultar duplicados en producción.

### 4.2 Costo y control

- `productos.costo_mxn numeric(12,2) NULL`: costo vigente (último de entrada).
- `productos.controla_existencias boolean NOT NULL DEFAULT false`. Un producto de restaurante sigue
  en `false` y usa recetas/insumos como hoy; **los dos motores conviven por producto**, nunca en el
  mismo producto.

### 4.3 Existencias

```
producto_existencias (
  tenant_id, sucursal_id, producto_id,
  cantidad numeric(12,3) NOT NULL DEFAULT 0,   -- puede ser negativa
  minimo   numeric(12,3) NULL,
  actualizado_at timestamptz,
  PRIMARY KEY (sucursal_id, producto_id)
)

movimientos_producto (
  id uuid PRIMARY KEY,               -- generado en el origen (caja o nube): idempotencia
  tenant_id, sucursal_id, producto_id,
  tipo movimiento_producto_tipo,     -- VENTA, DEVOLUCION, ENTRADA, AJUSTE, CONTEO,
                                     -- MERMA, TRASPASO_SALIDA, TRASPASO_ENTRADA
  cantidad numeric(12,3) NOT NULL,   -- con signo
  costo_unitario_mxn numeric(12,2) NULL,
  ticket_id NULL, devolucion_id NULL, traspaso_id NULL, proveedor_id NULL,
  motivo text NULL, usuario_id, creado_at
)
```

- `movimientos_producto` solo se agrega: sin UPDATE ni DELETE (políticas RLS + revocar).
- **La existencia es la suma de movimientos.** Nadie escribe `cantidad` directo; una función la
  recalcula por (sucursal, producto) al insertar movimientos. Un ajuste también es un movimiento.
- `CONTEO` guarda la diferencia (contado − sistema al momento de confirmar).
- Traspaso: `traspasos_producto (id, origen, destino, estado ENVIADO/RECIBIDO, …)`. La salida se
  registra al enviar; la entrada, al recibir. Solo plan Cadena.
- Todo con `tenant_id` + RLS; smoke de aislamiento entre negocios.

### 4.4 Venta y devolución

- La RPC de cobro existente, al pasar el ticket a `PAGADO`, inserta un `VENTA` por cada renglón cuyo
  producto `controla_existencias`. Cancelar un ticket pagado inserta el inverso.
- Devolución: inserta `DEVOLUCION` por lo devuelto.
- **Cambio de talla:** una sola operación que registra la devolución de la prenda y agrega la nueva
  al ticket de cambio; se cobra o regresa solo la diferencia. Genera `DEVOLUCION` + `VENTA`.
- Motivos de devolución genéricos nuevos: `CAMBIO_TALLA`, `DEFECTO`, `NO_LE_GUSTO` (ADD VALUE en su
  propia migración). La caja muestra los de restaurante solo a giros de comida y estos solo a RETAIL.

### 4.5 Giro y módulos

- `RETAIL` en `vertical_tipo` con una migración que **solo** hace `ADD VALUE` (no puede ir con su
  uso en la misma transacción).
- Módulo de operación nuevo `existencias` en `tenants.operacion`. `juego_inicial_de_giro('RETAIL')`:
  `mostrador` y `existencias` encendidos; `comedor`, `meseros`, `kds`, `reservaciones`, `marcas`,
  `eventos`, `cuentas_barra`, `domicilio`, `repartidores` apagados.
- `modulos_efectivos()` enciende `existencias` por el módulo de operación **sin exigir el plan con
  `recetas`**. Negocios existentes: `existencias` apagado.
- `cambiar_giro` y el alta responden `GIRO_NO_DISPONIBLE` para RETAIL hasta la migración que lo
  libera (§7).
- `prospectos.giro`: ensanchar el CHECK para RETAIL.

## 5. Caja (web y escritorio)

### 5.1 Escáner

- Lector USB en modo teclado (HID). Un detector global de teclado distingue **ráfaga + Enter**
  (umbral de tiempo entre teclas, configurable) de tecleo humano. No requiere drivers ni Electron.
- Busca en el catálogo local por `codigo_barras`, luego `codigo_interno`. Mismo producto escaneado
  otra vez = cantidad +1.
- No encontrado: sonido + aviso "Código no encontrado" con acceso a búsqueda manual.
- Debe convivir con el arbitraje de Escape y con los campos de texto enfocados (si hay un campo
  enfocado que no es la barra de búsqueda, el escáner no secuestra la entrada).

### 5.2 Pantalla de venta

- Componente nuevo `venta-retail.tsx`, **no** otra rama en `home-pos.tsx`. Reutiliza ticket, cobro,
  descuentos, clientes, lealtad e impresión.
- Forma (boceto del 15 oct, sujeta a los ajustes de Fermín y al diseño formal): barra de
  escaneo/búsqueda arriba, categorías, cuadrícula de productos padre (paginada, sin scroll), ticket a
  la derecha con variante y SKU por renglón, botones **Cambio de talla** y **Cobrar**.
- Selector de variantes: matriz de ejes (talla × color) con la existencia de la sucursal en cada
  celda; pocas = aviso, cero = peligro pero seleccionable (vende con aviso).
- El ticket nace `PARA_LLEVAR`, `envio_cocina_automatico = false`, sin comanda. En pantalla se llama
  "Venta". No se tocan los enums de tickets.
- Se elige la pantalla por giro (`RETAIL` → `venta-retail`).

### 5.3 Ticket impreso

- Nombre con variante ("Playera Polo M/Negra") y SKU. Sin comanda.

### 5.4 Caja instalada sin internet

- Vende y descuenta de su copia local; los movimientos suben en el push. Existencias de otras
  sucursales se muestran con la hora de la última sincronización.

## 6. Admin

### 6.1 Catálogo

- Alta con "tiene variantes": ejes + valores → matriz. Edición en bloque de precio, costo, SKU,
  código y existencia inicial (la existencia inicial es un movimiento `ENTRADA`). Agregar un valor de
  eje crea solo las hijas que faltan; quitar una hija = desactivarla (soft delete), nunca borrar con
  movimientos.
- **Código interno:** si no hay código de barras, se genera un EAN-13 con prefijo `2` (rango de uso
  interno) con dígito verificador, único por tenant.
- **Clave SAT** por producto con buscador; para RETAIL no se sugieren las claves de alimentos
  (`90101500…`).
- **Importar CSV:** plantilla descargable (padre, ejes, valores, SKU, código, precio, costo,
  existencia por sucursal). Vista previa con errores por renglón antes de aplicar; aplicar es
  todo-o-nada. Reimportar el mismo SKU actualiza, no duplica.
- **Etiquetas:** hoja PDF desde el navegador con nombre, variante, precio y código de barras.
  Formatos: hoja carta de etiquetas adhesivas y tamaño de etiqueta configurable para etiquetadora.
  Se eligen productos y cuántas por variante (por defecto, la existencia). Sin ZPL ni drivers.

### 6.2 Existencias (página nueva, módulo `existencias`)

- Tabla por sucursal: existencia, mínimo, costo, valor. Filtros "bajo mínimo" y "negativos".
- Ajuste (motivo + cantidad), conteo físico (captura o escaneo, resumen de diferencias antes de
  confirmar), recibir mercancía (proveedor de `proveedores`, cantidad y costo; XML opcional, no
  obligatorio), traspaso entre sucursales (Cadena).
- Alertas: bajo mínimo y negativos (reutilizar el canal de alertas existente si encaja).

### 6.3 Reportes

- Ventas por variante (talla y color), margen por producto (precio − `costo_mxn`), existencias
  valorizadas.

## 7. Sync con la caja instalada y lanzamiento

- **Pull:** columnas nuevas de `productos`, `producto_existencias` de su sucursal (y de las demás,
  solo lectura).
- **Push:** `movimientos_producto` creados en la caja, idempotente por `id`.
- La nube recalcula existencias. Dos cajas que venden la última pieza a la vez = existencia negativa
  + alerta; no hay conflicto de sync.
- El esquema local de la caja recibe las mismas tablas y funciones.
- **El pull nunca falla por un dato nuevo** (lección del ADR 0034): RETAIL no se asigna a nadie hasta
  que el `ADD VALUE` haya viajado en un instalador que tengan todas las cajas.

**Orden de lanzamiento:**

1. Migraciones a mano, cada una en su transacción; los `ADD VALUE` solos. Usar
   `npx supabase db push --linked --include-all` si hay migraciones más nuevas aplicadas.
2. Publicar como la más reciente el instalador que las trae (martes, `docs/operacion/actualizaciones.md`).
3. Migración que libera RETAIL en `cambiar_giro` y el alta.
4. Desplegar `provisionar-tenant`, `signup-tenant`, `solicitar-demo`.
5. Merge.

Los números de migración se asignan al planear (hoy la última en `main` es la 0187).

## 8. Pruebas

- **Smokes SQL** (bloquean el merge): cobrar descuenta; cancelar y devolver regresan; cambio de talla
  cuadra existencias y dinero; push repetido no duplica; conteo genera la diferencia correcta;
  traspaso cuadra entre sucursales; existencia = suma de movimientos; RLS entre negocios en todas las
  tablas nuevas; producto de restaurante sin cambios (recetas siguen descontando insumos).
- **Vitest:** detector del escáner (ráfaga vs. tecleo, campo enfocado), armado de matriz, parser y
  validación de CSV, EAN-13 interno y su dígito verificador.
- **E2E (Playwright):** alta de prenda con 6 variantes → escanear → cobrar → cambio de talla → ver
  existencia en el admin.

## 9. Entregas

| # | Entrega | Contenido |
|---|---|---|
| 1 | Núcleo en la base | Enum RETAIL y motivos, módulo `existencias`, columnas de variantes/costo, tablas de existencias/movimientos/traspasos, cobro y devolución con movimientos, smokes |
| 2 | Admin de catálogo | Matriz de variantes, códigos internos, importar CSV, etiquetas PDF, clave SAT |
| 3 | Admin de existencias | Tabla, ajuste, conteo, recibir, traspaso, reportes |
| — | **Diseño de la caja retail** | `docs/diseno/pos-retail.md` con las skills de diseño, aprobado por Fermín **antes** de la entrega 4 |
| 4 | Caja RETAIL + sync | `venta-retail`, escáner, selector de variantes, cambio de talla, motivos, sync, instalador |
| 5 | Abrir a la venta | Liberar el giro, registro "Tienda de ropa / calzado", página del sitio, PDF de prospectos |

Cada entrega lleva su propio plan (`docs/superpowers/plans/`) y su PR. Al cerrar la 1 se escribe el
ADR del giro RETAIL y del stock por producto.

## 10. Fuera de alcance (por ahora)

Báscula y granel; tienda en línea con existencias (y sus textos neutros); apartados y saldo a favor;
órdenes de compra a proveedor; etiquetadora por ZPL; otros nichos retail (abarrotes, ferretería).

## 11. Riesgos

- **Segunda sync con la caja.** Es la zona del incidente de septiembre. Mitigación: copiar el patrón
  de la 0101 sin inventar, smokes de idempotencia y probar con caja real antes de publicar.
- **Enum nuevo en `tenants`.** Un valor que la caja no conoce tumba su pull. Mitigación: §7.
- **Índice único de `codigo_barras`.** Puede fallar si hoy hay duplicados en producción; consultar
  antes.
- **Escáner vs. teclado.** Falsos positivos al teclear rápido o en campos de texto; cubrir con
  pruebas y umbral configurable.
- **Pantalla nueva.** Duplicar lógica de `home-pos.tsx`; extraer lo compartido (ticket, cobro) en vez
  de copiarlo.

## 12. Ajustes al planear la entrega 1 (15 oct)

- Defecto y "no le gustó" reutilizan `PRODUCTO_DEFECTUOSO` y `CLIENTE_NO_SATISFECHO`; solo se agrega
  `CAMBIO_TALLA`.
- La hija siempre tiene precio propio (`precio_base_mxn` es `NOT NULL` y lo lee todo el cobro); el
  admin lo prellena con el del padre.
- El cambio de talla en un solo flujo (con el dinero) va en la entrega 4; en la base son una
  devolución parcial y una venta, y se prueban juntas en la entrega 1.
- SKU y código de barras únicos solo entre productos con existencias (así la migración no puede fallar en ninguna base existente).
- Venta, reabrir, cancelación y devolución mueven existencias con una sola función idempotente, para
  que cancelar con devolución de dinero no regrese dos veces.

Plan: `docs/superpowers/plans/2026-10-15-retail-1-nucleo.md`.

Al construir la entrega 3 (16 oct):

- El margen del reporte por talla y color se calcula sobre `total_mxn − iva_mxn` de
  `vw_ventas_por_producto`: su `subtotal_mxn` es bruto, con IVA incluido y antes del descuento por
  renglón. Los descuentos a toda la cuenta no están en la vista y no se restan.
- `/existencias` (y el reporte) son de nivel 4, dueño y administrador: enseñan costos y valor.
- `_existencias_validar` rechaza las sucursales borradas (suave): no reciben movimientos ni mínimos.

## 13. Pendientes que la entrega 1 deja a las siguientes (revisión final, 15 oct)

**Antes de que el admin pueda editar prendas (entrega 2, requisito para lanzar):**
- La sincronización de la caja baja `productos` renglón por renglón en modo réplica, y los índices únicos
  nuevos (variante, SKU y código de barras con existencias) sí aplican ahí. Si el dueño intercambia los
  códigos de dos variantes, o borra y vuelve a crear una variante, el pull choca y se queda atorado en
  cada ciclo. Arreglo: en `desktop/src/sync-pull.mjs`, antes de bajar `productos`, neutralizar las copias
  locales de los renglones del snapshot (`controla_existencias = false`, `deleted_at`) y dejar que el
  upsert ponga los valores de la nube. Con prueba del intercambio en `sync-pull.test.mjs`.
- Ejes del padre: rechazar duplicados, NULL o vacíos; no colgar una hija de un padre borrado.
- Mensajes limpios para cantidades con más de 3 decimales y para uuids repetidos en mayúsculas.
- La caja y el admin no deben permitir cambiar el producto de un renglón ya cobrado (la función de
  existencias no lo concilia).
- Dónde quedaron los dos que la entrega 2 no cubrió: «Mensajes limpios para >3 decimales y uuids en
  mayúsculas en conteo y traspaso → entrega 3» y «No permitir cambiar el producto de un renglón ya
  cobrado → entrega 4».

**Entrega 3 (admin de existencias):** cancelar o revertir un traspaso en camino; decidir si recibir exige
pertenecer a la sucursal destino; conteos concurrentes (ordenar por producto, bloquear la primera fila).

**Entrega 4 (sincronización):** `movimientos_producto_validar` debe comprobar que `ticket_id`,
`ticket_item_id`, `devolucion_id` y `proveedor_id` sean del mismo negocio antes de que el push de la caja
escriba movimientos; revisar el orden de bloqueos (renglón→ticket); una cancelación o devolución hecha en
la nube sobre un ticket de la caja no mueve existencias en la nube hasta que esta entrega lo resuelva.

**Fuera del giro, para Fermín:** al cancelar un ticket pagado devolviendo el dinero, el inventario por
insumos de los restaurantes parece regresar dos veces (devolución y cancelación lo regresan por su cuenta).
