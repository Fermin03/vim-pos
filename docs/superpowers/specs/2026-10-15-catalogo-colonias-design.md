# Catálogo de colonias con zona de envío — diseño

**Fecha:** 2026-10-15 · **Pedido por:** Fermín («como lo hace Soft Restaurant») ·
**Decisión:** ADR 0036 «la colonia sugiere la zona; el domicilio la guarda» — se escribe durante
la implementación, en `docs/decisiones/`. ·
**Antecedentes:** zonas de envío (`0116_zonas_envio.sql`, ADR 0017), repreciado con PIN
(`0139_override_precio_y_zonas.sql`), envío por distancia (`0185_tienda_envio_por_distancia.sql`,
ADR 0035), pin en direcciones (`0186`), CRM de domicilios
(`apps/pos/app/lib/clientes-domicilio.ts`, `apps/pos/app/components/modal-cliente-domicilio.tsx`),
sync (`desktop/src/sync-pull.mjs`, `desktop/src/sync-push.mjs`).

## 1. Problema

La colonia de un domicilio es **texto libre** y la zona de envío se elige **aparte**, de memoria.
Cada pedido a domicilio obliga al cajero a saber en qué zona cae la colonia que le dictan, y el
mismo cliente puede quedar en zonas distintas según quién lo capture. Además el CP se guarda como
«00000» cuando nadie lo sabe.

Soft Restaurant lo resuelve con un catálogo: cada colonia tiene su zona; al escribirla, el sistema
la sugiere y la zona sale sola.

## 2. Alcance

**Entra:**

1. Migración `0187_catalogo_colonias.sql` (§3): tabla nacional `sepomex_asentamientos`, tabla por
   sucursal `colonias`, `sembrar_colonias`, `asignar_zona_colonia`, sync en los dos sentidos, y
   los cambios de `tienda_negocio` / `tienda_cotizar` / `crear_ticket_desde_tienda` (§6).
   *(El número se vuelve a comprobar contra `origin/main` y las ramas abiertas antes de aplicar.)*
2. Script de carga única de SEPOMEX (`scripts/sepomex/cargar.mjs`) (§3.1).
3. Caja (POS web y escritorio): buscador de colonia en el modal de domicilio (§4).
4. Admin: pestaña **Colonias** en Configuración → Envíos (§5).
5. Tienda en línea: colonia con sugerencias en el formulario de dirección y en la cuenta; la zona
   de la colonia decide el envío (§6).
6. Instalador de la caja (0.12.0) con la lista de lo que incluye, para el OK de Fermín.

**No entra:**

- Calles, números ni geocodificación por colonia (el pin del mapa ya existe).
- Volver a calcular la zona de domicilios ya guardados cuando cambia la de su colonia.
- Que el cliente de la tienda escriba en el catálogo.
- Polígonos de zona en el mapa.

## 3. Datos

### 3.1 `sepomex_asentamientos` (nube, nacional, solo lectura)

| columna | tipo | nota |
|---|---|---|
| `id` | bigint identity | |
| `codigo_postal` | varchar(5) | `d_codigo` |
| `nombre` | varchar(150) | `d_asenta` |
| `tipo` | varchar(50) | `d_tipo_asenta` (Colonia, Fraccionamiento…) |
| `municipio` | varchar(100) | `D_mnpio` |
| `estado` | varchar(50) | `d_estado` |
| `clave_municipio` | varchar(8) | `c_estado` + `c_mnpio`; la llave para sembrar |

- Fuente: archivo de exportación de Correos de México (`CPdescarga.txt`, ~145 mil filas). Datos
  públicos de gobierno.
- `scripts/sepomex/cargar.mjs` lee el archivo (latin1, separado por `|`), lo normaliza y lo sube
  con la llave de servicio en lotes. Es idempotente: vacía y recarga dentro de una transacción.
  El archivo **no** se versiona en el repo.
- RLS encendida: `SELECT` para `authenticated`; nadie escribe salvo `service_role`.
- **No baja a la caja** ni viaja en ningún instalador.
- Índice por `codigo_postal` y por `clave_municipio`.

### 3.2 `colonias` (por sucursal; baja y sube con el sync)

| columna | tipo | nota |
|---|---|---|
| `id` | uuid | |
| `tenant_id`, `sucursal_id` | uuid NOT NULL | como `zonas_envio` |
| `nombre` | varchar(150) NOT NULL | como se muestra |
| `codigo_postal` | varchar(5) NULL | NULL en las capturadas sin CP |
| `zona_envio_id` | uuid NULL → `zonas_envio` | NULL = sin zona |
| `origen` | text CHECK IN ('SEPOMEX','CAPTURADA') | |
| `nombre_busqueda` | text GENERATED | `lower(f_unaccent(btrim(nombre)))` (el Postgres de la caja usa locale C y `lower()` no baja la «É») |
| `created_at`, `updated_at`, `deleted_at` | | borrado suave |

- Única entre vivas: `(sucursal_id, nombre_busqueda, coalesce(codigo_postal,''))`. Hay colonias
  homónimas con distinto CP; se distinguen por el CP en la sugerencia.
- Índice GIN `pg_trgm` sobre `nombre_busqueda` (filas vivas), como en `clientes`.
- RLS por tenant, igual que `zonas_envio`. INSERT abierto al personal de la sucursal (la caja da
  de alta colonias, como da de alta zonas, 0139 §2). UPDATE de `zona_envio_id` solo por
  `asignar_zona_colonia` o por quien administra la sucursal; DELETE directo solo admin.
- `zona_envio_id` debe ser una zona viva **de la misma sucursal** y **no** una zona de tramo
  (`tienda_sucursales.tramos_envio`): las de tramo no se eligen a mano (0185). Lo valida un
  trigger.

### 3.3 `sembrar_colonias(p_sucursal uuid) → jsonb {insertadas, heredadas}`

SECURITY DEFINER con guarda de tenant; solo quien administra la sucursal.

1. Saca `clave_municipio` del `codigo_postal` de la sucursal en `sepomex_asentamientos`. Sin CP
   o CP desconocido → error claro («Captura el código postal de la sucursal»).
2. Inserta los asentamientos de ese municipio como `origen='SEPOMEX'`, saltándose los que ya
   existen (misma llave única). No revive colonias borradas.
3. **Herencia de zona:** a cada colonia **sin zona** le pone la zona más usada en
   `direcciones_cliente` vivas de clientes del tenant cuyas direcciones tienen zona de esa
   sucursal, comparando `lower(f_unaccent(btrim(colonia)))` con `nombre_busqueda` (misma llave; `lower()` va afuera porque con locale C no baja la «É»). Si la colonia
   tiene homónimas con distinto CP, solo hereda la que coincide también por CP. Empate → la zona
   más reciente. Nunca pisa una zona ya asignada.
4. Devuelve cuántas colonias insertó y cuántas heredaron zona (el admin lo enseña). Repetirlo es
   seguro.

### 3.4 `asignar_zona_colonia(p_colonia uuid, p_zona uuid, p_autorizacion_pin_id uuid default null)`

SECURITY DEFINER, guarda de tenant, mismo patrón que `cambiar_costo_zona` (0139).

- La colonia **no tenía zona** → se asigna sin PIN.
- **Ya tenía otra zona** → se exige una autorización `descuento.override_precio` vigente, de un
  uso, sobre la entidad colonia; quien administra la sucursal no la necesita.
- `p_zona` NULL (quitar zona) → solo admin.

### 3.5 Domicilios

`direcciones_cliente` **no cambia de forma**: sigue con `colonia` en texto, `codigo_postal` y su
propio `zona_envio_id`. El catálogo solo **sugiere** y **llena** zona y CP. Cambiar la zona de una
colonia no toca domicilios guardados; la nueva vale para domicilios nuevos o cuando se vuelve a
elegir la colonia. (Por qué no un `colonia_id`: el domicilio ya guarda su zona, que es lo único
que el pedido necesita, y el texto sigue siendo la verdad que se imprime en la comanda.)

### 3.6 Sync

Mismo patrón que `zonas_envio`:

- **Pull:** `colonias` entra en `PULL_ORDER` después de `zonas_envio`, y en `sync_pull_snapshot`
  (se redefine la última versión completa, 0184). ~1,000 filas por sucursal de León.
- **Push:** colonias pendientes con hash de fila (`_vim_colonias_ok`), en `sync_push_snapshot`.
  Sube lo aprendido en la caja (CAPTURADA) y las zonas asignadas desde la caja.
- **Choque:** una colonia capturada sin internet que ya existe en la nube con la misma llave
  (nombre de búsqueda + CP) se fusiona: gana el id de la nube y, si la de la nube no tenía zona,
  hereda la de la caja. Igual que `sync-pull.mjs` resuelve las zonas homónimas.
- **Caja vieja** (sin la tabla): no la pide ni la recibe; sigue con texto libre más selector.

## 4. Caja

En `modal-cliente-domicilio.tsx` el campo **Colonia** pasa a ser un buscador (componente nuevo
`buscador-colonia.tsx`; consulta en `lib/colonias.ts`):

- Mismo patrón que el teléfono: desde 2 letras, 300 ms de espera, máximo 8, con guarda de
  respuestas viejas (`ultimaBusqueda`, como `modal-cliente-cuenta.tsx`). PostgREST
  `.from("colonias")` filtrado por sucursal y `nombre_busqueda ilike %q%` sin acentos, ordenado
  por coincidencia al inicio y luego por nombre. En el escritorio pega a Postgres local por el
  gateway: funciona sin internet.
- Cada sugerencia: **nombre** · CP · *Zona — $costo* o *Sin zona*.
- **Colonia con zona:** llena zona y CP y marca el `SelectorZona`. El cajero puede cambiar la zona
  **solo para este pedido** sin PIN (como hoy).
- **Colonia sin zona:** se pide la zona con el `SelectorZona` de siempre; al guardar el domicilio
  se llama `asignar_zona_colonia` (sin PIN).
- **No está en el catálogo:** última opción «Agregar "…"». Se inserta como `CAPTURADA` con la zona
  elegida.
- **Cambiar la zona de una colonia que ya tenía una:** casilla «Guardar esta zona para la colonia»
  junto al selector cuando la zona elegida no es la de la colonia; marcada, pide PIN
  (`descuento.override_precio`) y llama `asignar_zona_colonia`. Sin marcar, vale solo para el
  pedido.
- **Domicilios guardados sin zona** (flujo de hoy, `:179-199`): si su colonia está en el catálogo
  con zona, la toman sola (`fijarZonaDireccion`) y no se le pregunta al cajero.
- El CP del domicilio es el de la colonia; sin él, el de la sucursal; «00000» solo si tampoco hay.
- Una colonia escrita igual que una del catálogo cuenta como elegida.
- Si falla actualizar el catálogo, el modal se queda abierto con el aviso y un botón «Continuar».
- Si la sucursal no tiene colonias en el catálogo, el campo se comporta como hoy (texto libre).

## 5. Admin

Configuración → Envíos (`apps/admin/app/(panel)/configuracion/envios/page.tsx`), nueva pestaña
**Colonias** (patrón `Pestanas` de la tienda), por sucursal:

- Vacío: botón «Cargar colonias de {municipio}» → `sembrar_colonias`; aviso con cuántas cargó y
  cuántas heredaron zona.
- Tabla: nombre, CP, tipo/origen, zona. Buscador sin acentos, filtro «Sin zona», paginada.
- Selección múltiple → «Asignar zona…» en bloque (un `update` como admin).
- Alta manual, cambio de zona por fila y borrado suave.
- Las zonas de tramo no aparecen en los selectores.

## 6. Tienda en línea

`apps/tienda/app/components/datos.tsx` (`:719`) y `cuenta.tsx` (`:122`):

- **Colonia** sugiere desde el catálogo de la sucursal y llena el CP. Escribir una que no está se
  permite (texto libre, como hoy) pero **no** la agrega al catálogo.
- La búsqueda pasa por la función pública `tienda` (nueva acción `colonias`: slug, sucursal, q;
  devuelve nombre, CP, id y si tiene zona — **sin** precio ni id de zona). La cotización pública solo dice `por_colonia` (sí/no), nunca la zona ni el precio por colonia. La tabla no se abre a
  `anon`.
- **Regla del envío** (decisión de Fermín), en `tienda_cotizar` y `crear_ticket_desde_tienda`, en
  este orden:
  1. La dirección trae `colonia_id` de la sucursal **con zona** → esa zona y su precio, sin
     importar si la sucursal cobra «Por zonas» o «Por distancia».
  2. Si no y la sucursal cobra **«Por distancia»** → el pin del mapa (tramos de 0185).
  3. Si tampoco → `SIN_COBERTURA`: no hay envío a esa dirección.

  **En la tienda el cliente nunca elige la zona** (decisión de Fermín, 15 oct). `p_zona` sigue en la
  firma de `tienda_cotizar` / `tienda_crear_pedido` por los llamadores viejos, pero a domicilio se
  ignora siempre: ni precio ni zona del pedido. Ya no hay selector de zona en la tienda.
- Cuando la colonia decide el envío, el pedido guarda el nombre y el CP del catálogo.
- El servidor resuelve la zona desde `colonia_id`; nunca usa una zona mandada por el navegador.
  Esto cierra el truco de elegir una zona más barata.
- `components/entrega.tsx` muestra «Envío a {colonia}: $X».
- `tienda_estado_sucursal`: a domicilio «Por zonas» abre solo si la sucursal tiene al menos una
  colonia viva con zona válida para la tienda (`_tienda_zona_de_colonia`); si no,
  `MODO_NO_DISPONIBLE`. «Por distancia», igual que en 0185.

## 7. Pruebas

- **Smoke `.sql` de la 0187** (`npm run smokes`, bloquea el merge):
  - `sembrar_colonias` es idempotente y no pisa zonas asignadas.
  - La herencia elige la zona más usada y compara bien con/sin acentos y con homónimas por CP.
  - RLS: un tenant no ve colonias de otro; `authenticated` no escribe en `sepomex_asentamientos`.
  - `asignar_zona_colonia`: sin PIN si no tenía zona; con zona previa sin autorización → error;
    con autorización → pasa y la consume; zona de otra sucursal o de tramo → error.
  - `tienda_cotizar`: colonia con zona gana; sin zona cae a distancia; sin tramos cae a zonas;
    una zona mandada que contradice la colonia se ignora.
- **Sync** (pruebas del escritorio): colonia capturada sin internet sube; choque de llave se
  fusiona con el id de la nube; asignación de zona desde la caja sube.
- **Navegador** (worktree + Crazy Burgers + Playwright de `sitio-web/_capturas`): en la caja
  «san jo» sugiere; elegir con zona la llena; alta de colonia nueva; en el admin, sembrado y
  asignación en bloque; en la tienda, colonia con zona y sin zona (cae al mapa).
- `tsc --noEmit` en pos, admin y tienda (no `next build`: rompe el dev server).

## 8. Riesgos

- **Nombres SEPOMEX ≠ nombres de la calle** («Jardines del Moral» vs «Jardines del Moral 1a
  Secc.»). Mitigación: búsqueda por subcadena sin acentos y alta por el cajero.
- **Herencia equivocada** si el historial tiene colonias mal escritas: solo llena colonias sin
  zona y el admin muestra cuántas heredaron para revisarlas.
- **Carga de SEPOMEX:** ~15 MB, una vez, por script; la descarga oficial es un formulario web, así
  que el archivo se baja a mano y se pasa por ruta.
- **Precio que el cliente ve en la tienda** ahora depende de la colonia: si el dueño asigna mal,
  cobra mal. El admin enseña la zona y el precio por colonia.

## 9. Entrega

1. Spec → plan (`docs/superpowers/plans/2026-10-15-catalogo-colonias.md`) → implementación en el
   worktree `C:/vwtCol`, rama `feat/catalogo-colonias` desde `origin/main` (bd292893).
2. Cargar SEPOMEX en producción con el script.
3. Aplicar 0187 a producción y desplegar la función `tienda` **antes** del merge
   (`--include-all` si alguna rama abierta trae números menores sin aplicar).
4. PR, CI y smokes en verde, merge.
5. Instalador 0.12.0: lista de lo que incluye y **esperar OK de Fermín** antes de publicar.
6. Sembrar colonias de Knock-Out y revisar con Fermín las heredadas.
