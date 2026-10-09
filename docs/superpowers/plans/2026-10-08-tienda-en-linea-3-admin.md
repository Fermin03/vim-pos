# Tienda en línea · Entrega 3: el apartado del admin — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado: PENDIENTE DE REVISIÓN DE FERMÍN. No se ejecuta nada de este plan hasta que él lo apruebe.**

**Goal:** Que el dueño pueda configurar su tienda en línea desde un apartado propio del admin —dirección, apariencia, aceptación, pagos, sucursales y horarios—, subir fotos a sus productos, ver qué le falta antes de encenderla y encenderla.

**Architecture:** Un apartado nuevo `/tienda` en `apps/admin`, calcado del de Lealtad (complemento + interruptor del dueño + formulario con escrituras directas bajo RLS). La lógica que se puede equivocar —normalizar la dirección, validar el horario, la lista de revisión, traducir errores de la base— vive en una librería pura con pruebas; las pantallas solo la pintan. Una migración pequeña añade lo que la base todavía no tiene: logo de la tienda, guardas del interruptor y más direcciones reservadas.

**Tech Stack:** Next.js 15 (client components), supabase-js bajo RLS, zod, vitest, Tailwind con los tokens de `@vim/ui`, `qrcode.react`; una migración SQL con su smoke.

**Spec:** `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md` (§9 y §5.3, §5.7). Notas que la entrega 2 dejó para esta: final de `docs/superpowers/plans/2026-10-08-tienda-en-linea-2-funcion.md`, «Entrega 3».

**Anexo obligatorio:** `docs/superpowers/plans/anexos/2026-10-08-tienda-3-hechos-del-admin.md` — cómo está hecho hoy el admin, con `archivo:línea`: menú y permisos, Lealtad de punta a punta, subida de imágenes, formulario de producto, sucursales y zonas, componentes disponibles, pruebas y CI. Las tareas lo citan como «Anexo §N».

Plan 3 de 7.

---

## Para revisar antes de aprobar (Fermín)

Lo que el dueño va a ver, y las decisiones que tomé donde el diseño no decía nada. Si algo no te gusta, se cambia aquí antes de construir.

**Lo que verá el dueño**

- Un apartado **«Tienda en línea»** en el menú principal, debajo de Lealtad. Lo ven dueño y administradores.
- Sin el complemento: la invitación a contratarlo por WhatsApp, igual que Lealtad. **Sin precios en pantalla**, como en Lealtad.
- Con el complemento, **una sola página** con cuatro bloques, en este orden:
  1. **Estado**: el interruptor de la tienda y la lista de lo que falta para poder encenderla.
  2. **Tu tienda**: dirección (`pedidos.vimpos.com.mx/tu-negocio`), logo, color y una descripción corta.
  3. **Pedidos**: aceptar a mano o en automático, minutos de espera, y formas de pago al recibir.
  4. **Sucursales**: por cada una, si participa, si ofrece recoger y domicilio, y su horario por día.
- Un bloque **«Compartir»** con el enlace, un botón para copiarlo y el QR para descargar. Aparece cuando ya hay dirección guardada.
- En la ficha de cada producto del catálogo, un campo nuevo para **subir su foto**.

**Decisiones que tomé**

| # | Decisión | Por qué | Alternativa |
|---|---|---|---|
| 1 | **El logo de la tienda se sube aparte**, en este apartado. | El logo que el negocio ya tiene se guarda incrustado y pesa hasta 512 KB; mandarlo en cada carga de la tienda la haría lenta. | Reusar el logo actual tal cual (más simple para el dueño, tienda más lenta). |
| 2 | **Una sola página**, no pestañas. | Son pocos campos y el dueño los llena una vez. | Pestañas como Lealtad. |
| 3 | **La tienda no se puede encender si la lista de revisión tiene bloqueos**: sucursal participante sin horario o sin teléfono, domicilio sin zonas de envío, o ninguna sucursal participando. | Es lo que dice el diseño, y evita una tienda publicada que no puede recibir pedidos. | Dejar encender y solo advertir. |
| 4 | **Cambiar la dirección pide confirmación** y avisa que dejan de servir los QR impresos **y los enlaces de seguimiento de pedidos en curso**. | La revisión de la entrega 2 encontró que también se rompen los seguimientos. | — |
| 5 | **El horario se captura por día con apertura y cierre**, más un botón «Copiar a todos los días». Un cierre menor que la apertura se muestra como «cierra al día siguiente». | Un solo rango por día, como quedó en el diseño. | — |
| 6 | **Apagar la tienda pide confirmación**; encenderla no. | Igual que Lealtad. | — |
| 7 | **La foto del producto se recorta al subirla** a un máximo de 1200 px y menos de 1 MB. | El dueño sube fotos del celular de varios megas. | — |
| 8 | **Se amplían las direcciones reservadas**: `vim`, `vimpos`, `soporte`, `login`, `pago`, `ayuda`, `www`, `tienda`. | Nota de la entrega 2: evitar que alguien tome una dirección que parezca oficial. | — |
| 9 | **El complemento sigue sin poder contratarse desde el panel de VIM.** Para probar esta entrega se concede a mano al negocio de pruebas. | Abrirlo a clientes es la entrega 7. | — |

**Lo que NO trae:** la tienda pública (entrega 5), la caja (entrega 4), reportes de ventas en línea, ocultar productos solo en la tienda, compra mínima.

**Lo que toca en producción** (con tu visto bueno, al final): una migración pequeña. Nada visible para ningún cliente: ningún negocio tiene el complemento.

---

## Global Constraints

- **Cargar la skill `ponytail` antes de escribir código**, y antes de escribir CSS o componentes las de diseño que usa el proyecto: `ui-ux-pro-max`, `frontend-design` y `emil-design-eng`.
- **Manda `docs/diseno/nucleo.md` + `docs/diseno/admin.md` + `packages/ui/tokens.css`.** No inventar estilos. Escala tipográfica `text-11…40` únicamente: `pnpm tipografia` falla en CI con `text-[Npx]`.
- **Controles de 44 px** (`h-11`) en esta página: es de las que el dueño abre desde el celular.
- **RLS sagrado.** `apps/admin` no usa `service_role`. Todo va con la sesión del usuario.
- **Sin `any`.** Validación con zod en la librería, no en el componente.
- **Español en el dominio**, archivos `kebab-case`, componentes `PascalCase`.
- **Los textos son para un dueño de restaurante**: sin palabras internas (nada de «slug», «RLS», «módulo», «add-on»). «Dirección de tu tienda», «complemento».
- **Sin precios del complemento en pantalla** (igual que Lealtad).
- **Un UPDATE que RLS niega no da error, afecta 0 filas** (Anexo §3): toda escritura comprueba que afectó una fila y, si no, dice «Solo el dueño o un administrador puede cambiar esto».
- **El bucket `productos` no tiene política de UPDATE** (Anexo §4): cada foto nueva es una ruta nueva `<tenant_id>/<uuid>.<ext>`, y la anterior se borra después.
- **Migración:** número tentativo **0163**; confirmar contra `origin/main` y las ramas vivas antes de crearla. Corre también en la caja: nada de `storage.*` sin guarda.
- **Pruebas del admin:** vitest, solo `*.test.ts` en entorno node (Anexo §9). No hay pruebas de componentes: por eso la lógica va en librerías puras.
- **Verificación visual obligatoria** de cada pantalla en el navegador (Task 8), en ancho de escritorio y de celular. Nunca `next build` (rompe el servidor de desarrollo): `tsc --noEmit`.
- **No se toca** `desktop/`, `apps/pos`, `apps/platform` ni las funciones de `supabase/functions`.
- **Nada se aplica a producción sin el visto bueno explícito de Fermín.**
- Commits en español con el pie `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| Crear `supabase/migrations/0163_tienda_admin.sql` | Logo, direcciones reservadas, guardas del interruptor, `tienda_negocio` con el logo |
| Crear `supabase/scripts/smoke_tienda_admin.sql` | Smoke de esa migración |
| Crear `apps/admin/app/lib/tienda-reglas.ts` + `__tests__/tienda-reglas.test.ts` | Lógica pura: dirección, horario, lista de revisión, errores |
| Crear `apps/admin/app/lib/tienda-plan.ts` + prueba | Estado del complemento e invitación |
| Crear `apps/admin/app/lib/tienda.ts` + `__tests__/tienda.test.ts` | Lectura y escritura bajo RLS |
| Crear `apps/admin/app/lib/foto-producto.ts` + prueba | Subir, reemplazar y quitar la foto de un producto y el logo |
| Crear `apps/admin/app/(panel)/tienda/layout.tsx`, `page.tsx` | El apartado |
| Crear `apps/admin/app/components/tienda-*.tsx` | Bloques de la página (uno por archivo) |
| Crear `apps/admin/app/components/interruptor.tsx`, `tarjeta.tsx` | El interruptor y la tarjeta que hoy se copian a mano (Anexo §6) |
| Modificar `apps/admin/app/components/admin-shell.tsx`, `lib/acceso.ts` (+ su prueba) | Entrada del menú y permiso |
| Modificar `apps/admin/app/components/producto-form.tsx`, `lib/catalogo.ts` | Foto del producto |
| Modificar `apps/admin/package.json`, `pnpm-lock.yaml` | `qrcode.react` |
| Modificar `docs/diseno/admin.md` | Sección «Tienda en línea» |
| Modificar `packages/db/src/database.types.ts` | Regenerado tras aplicar |

---

### Task 1: la migración — logo, direcciones reservadas y guardas del interruptor

**Files:**
- Create: `supabase/migrations/0163_tienda_admin.sql`
- Test: `supabase/scripts/smoke_tienda_admin.sql`

**Interfaces:**
- Consumes: `tienda_config`, `configuracion_tenant.modulo_tienda_activo`, `tenant_addon_activo`, `tienda_negocio` (0162, definición vigente), el molde de Lealtad `configuracion_tenant_lealtad_guardia` y `tenant_addons_apaga_lealtad` (0156).
- Produces:
  - Columna `tienda_config.logo_ruta text NULL` con `CHECK` de forma: `<tenant_id>/<uuid>.(jpg|png|webp)` y que empiece por el `tenant_id` de la fila.
  - El `CHECK` de `tienda_config.slug` con las reservadas ampliadas: las ocho de hoy más `vim`, `vimpos`, `soporte`, `login`, `pago`, `ayuda`, `www`, `tienda`.
  - Disparador en `configuracion_tenant`: pasar `modulo_tienda_activo` a `true` exige complemento `TIENDA` vigente (`SIN_ADDON_TIENDA`) y una fila en `tienda_config` (`SIN_TIENDA_CONFIGURADA`). Apagar siempre se puede.
  - Disparador en `tenant_addons`: al quedar sin complemento `TIENDA` vigente, `modulo_tienda_activo` pasa a `false`.
  - `tienda_negocio` devuelve `logo_url` = la dirección pública del archivo de `logo_ruta` en el bucket `productos`, o `null`. Deja de leer `tenants.logo_png_url`.

- [ ] **Step 1: Escribir el smoke** con estos casos (fixture sobre la semilla, como `smoke_tienda_estado.sql` y `smoke_tienda_modulo.sql`):

| # | Afirmar |
|---|---|
| 1 | Guardar una dirección reservada nueva (`vimpos`, `soporte`, `www`, `tienda`) falla con `check_violation`; una normal entra |
| 2 | `logo_ruta` con la forma correcta y el `tenant_id` propio entra; con el `tenant_id` de otro negocio, con extensión `.gif`, o con `..` en la ruta, falla con `check_violation` |
| 3 | Encender sin complemento: `SIN_ADDON_TIENDA`. Con complemento pero sin fila en `tienda_config`: `SIN_TIENDA_CONFIGURADA`. Con las dos cosas: enciende |
| 4 | Apagar sin complemento se puede |
| 5 | Con la tienda encendida, dar de baja el complemento (`tenant_addons.activo = false`) apaga `modulo_tienda_activo` |
| 6 | El disparador de Lealtad sigue funcionando igual (encender Lealtad sin complemento sigue dando su propio error) |
| 7 | `tienda_negocio(slug) -> 'publico' ->> 'logo_url'` es `null` sin logo, y con `logo_ruta` termina en `/storage/v1/object/public/productos/<ruta>` |
| 8 | Todo como `authenticated` con la sesión del dueño (no solo como `postgres`): el dueño enciende; un cajero no puede (0 filas o error de permiso, lo que dé la política existente de `configuracion_tenant`) |

- [ ] **Step 2: Rojo.** `cd desktop && npm run smokes -- smoke_tienda_admin.sql`.
- [ ] **Step 3: Escribir la migración.** Leer primero cómo lo hace Lealtad en `0156_lealtad.sql` (los dos disparadores) y copiar el molde. Para `logo_url` hace falta la URL base del proyecto dentro de SQL: ver cómo la resuelve la 0150 o cualquier función existente que arme URLs de Storage; **si no existe forma limpia, `tienda_negocio` devuelve `logo_ruta` tal cual** (clave `logo_ruta`) y la URL la arma quien la consume — decirlo en el informe y ajustar el caso 7. `tienda_negocio` se redefine **completa** desde la 0162, con ese único cambio.
- [ ] **Step 4: Verde**, junto con `smoke_tienda_estado.sql smoke_tienda_modulo.sql smoke_tienda_rls.sql smoke_tienda_pedido.sql smoke_lealtad_rls.sql`.
- [ ] **Step 5: Commit** — `feat(tienda): logo propio, más direcciones reservadas y guardas del interruptor`.

---

### Task 2: las reglas, puras y probadas

**Files:**
- Create: `apps/admin/app/lib/tienda-reglas.ts`, `apps/admin/app/lib/__tests__/tienda-reglas.test.ts`
- Create: `apps/admin/app/lib/tienda-plan.ts`, `apps/admin/app/lib/__tests__/tienda-plan.test.ts`

**Interfaces — Produces** (`tienda-reglas.ts`, sin importar `supabase`):

```ts
export const DIRECCIONES_RESERVADAS: readonly string[];   // las mismas 16 de la migración
export const BASE_TIENDA = "pedidos.vimpos.com.mx";

/** "Knock-Out Burger León" → "knock-out-burger-leon". Minúsculas, sin acentos, espacios y símbolos a guion, sin guiones repetidos ni en los extremos, máximo 40. */
export function sugerirDireccion(nombreNegocio: string): string;
/** null = válida. Si no, el motivo en palabras del dueño. */
export function errorDeDireccion(d: string): string | null;

export type Dia = "1" | "2" | "3" | "4" | "5" | "6" | "7";            // 1 = lunes
export type Horario = Partial<Record<Dia, [string, string]>>;          // ["13:00","22:00"]
export const DIAS: readonly { dia: Dia; nombre: string }[];            // Lunes … Domingo
/** Lee lo que venga de la base. Lo que no tenga la forma exacta se descarta (ese día queda cerrado). */
export function leerHorario(x: unknown): Horario;
/** null = válido. Exige "HH:MM" de 00:00 a 23:59 en ambos extremos. Apertura = cierre se permite (abre todo el día). */
export function errorDeHorario(h: Horario): string | null;
export function cruzaMedianoche(rango: [string, string]): boolean;     // cierre < apertura
export function copiarATodos(h: Horario, desde: Dia): Horario;

export type SucursalTienda = {
  id: string; nombre: string; telefono: string; activa: boolean;
  participa: boolean; recoger: boolean; domicilio: boolean; horario: Horario; zonasActivas: number;
};
export type Revision = { nivel: "bloquea" | "advierte"; texto: string; enlace?: { href: string; etiqueta: string } };
/** Lo que falta para poder encender. Vacío de bloqueos = se puede encender. */
export function revisar(d: {
  hayDireccion: boolean; sucursales: SucursalTienda[];
  productosSinFoto: number; productosSinDescripcion: number; productosEnCategoriaInactiva: number;
}): Revision[];
export function puedeEncender(r: Revision[]): boolean;

/** Traduce un error de la base a palabras del dueño. */
export function mensajeTienda(e: { message?: string; code?: string } | null | undefined, porDefecto: string): string;
```

`tienda-plan.ts`: `estadoTienda(m)` → `"cargando" | "sin_contratar" | "permitida"`, `TIENDA_INCLUYE` y `mensajeQuieroTienda`, calcados de `lealtad-plan.ts` (Anexo §2 y §7).

**Reglas de `revisar`** (cada una es un caso de prueba):

| Situación | Nivel | Texto |
|---|---|---|
| No hay dirección guardada | bloquea | «Elige la dirección de tu tienda.» |
| Ninguna sucursal participa | bloquea | «Elige al menos una sucursal que venda en la tienda.» |
| Sucursal participante sin recoger ni domicilio | bloquea | «{Sucursal}: elige si ofrece recoger, domicilio o ambos.» |
| Sucursal participante sin ningún día con horario | bloquea | «{Sucursal}: ponle horario.» |
| Sucursal participante sin teléfono | bloquea | «{Sucursal}: le falta teléfono.» con enlace a `/configuracion/sucursales` |
| Sucursal participante con domicilio y 0 zonas activas | bloquea | «{Sucursal}: para domicilio necesita al menos una zona de envío.» con enlace a `/configuracion/envios` |
| Sucursal participante inactiva | bloquea | «{Sucursal} está inactiva.» |
| Productos sin foto (> 0) | advierte | «{n} productos no tienen foto. Se venden igual, pero con foto se piden más.» con enlace al catálogo |
| Productos sin descripción (> 0) | advierte | «{n} productos no tienen descripción.» |
| Productos en una categoría inactiva (> 0) | advierte | «{n} productos están en una categoría inactiva y no aparecen en la tienda.» |

Singular y plural correctos («1 producto no tiene foto»). Una sucursal que **no** participa no genera nada.

**Reglas de `mensajeTienda`** (por nombre de restricción o código; Anexo §8):

| Llega | Dice |
|---|---|
| `tienda_config_slug_key` (23505) | «Esa dirección ya la usa otro negocio. Prueba con otra.» |
| `tienda_config_slug_check` | «La dirección solo puede llevar letras, números y guiones, de 3 a 40 caracteres, y no puede ser una palabra reservada.» |
| `tienda_config_color_check` | «El color no es válido.» |
| `tienda_config_algun_pago` | «Deja activa al menos una forma de pago.» |
| `SIN_ADDON_TIENDA` | «Tu plan no incluye la tienda en línea.» |
| `SIN_TIENDA_CONFIGURADA` | «Primero guarda la dirección de tu tienda.» |
| `row-level security` / `permission denied` / `SOLO_ADMIN` | «Solo el dueño o un administrador puede cambiar esto.» |
| otro | el texto por defecto que se le pasó |

- [ ] **Step 1: Escribir las pruebas** (`tienda-reglas.test.ts`): cada fila de las dos tablas de arriba, más:
  - `sugerirDireccion`: «Knock-Out Burger León» → `knock-out-burger-leon`; «  Tacos   El Güero!! » → `tacos-el-guero`; un nombre de 60 letras se corta a 40 sin terminar en guion; un nombre que da una reservada (`VIM`) o queda vacío devuelve `""`.
  - `errorDeDireccion`: 2 caracteres, 41, mayúsculas, espacio, guion al inicio, cada reservada → mensaje; `knock-out` → `null`.
  - `leerHorario`: `null`, un arreglo, `{"1":"siempre"}`, `{"8":["10:00","12:00"]}`, `{"1":["25:00","12:00"]}`, `{"1":["10:00"]}` → ese día fuera; uno bueno se conserva.
  - `errorDeHorario`: `"9:00"`, `"24:00"`, `"12:60"` → mensaje; `["18:00","02:00"]` válido y `cruzaMedianoche` true; `["00:00","00:00"]` válido.
  - `copiarATodos`: copia el rango del día dado a los siete; si ese día está cerrado, cierra todos.
  - `puedeEncender`: falso con algún `bloquea`, verdadero con solo `advierte` o vacío.
  - Las reservadas de TS son exactamente las de la migración (leer el archivo `.sql` en la prueba y comparar la lista, para que no se separen).
- [ ] **Step 2: Rojo** — `pnpm --filter ./apps/admin test`.
- [ ] **Step 3: Implementar** las dos librerías.
- [ ] **Step 4: Verde** y `pnpm --filter ./apps/admin exec tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(tienda): reglas del apartado del admin — dirección, horario y lista de revisión`.

---

### Task 3: leer y guardar

**Files:**
- Create: `apps/admin/app/lib/tienda.ts`, `apps/admin/app/lib/__tests__/tienda.test.ts`

**Interfaces — Produces:**

```ts
export type ConfigTienda = {
  direccion: string; color: string; descripcion: string; logoRuta: string | null; logoUrl: string | null;
  aceptacion: "MANUAL" | "AUTO"; minutosAceptacion: number; pagoEfectivo: boolean; pagoTarjeta: boolean;
};
/** null = todavía no hay tienda configurada. */
export async function leerConfigTienda(): Promise<ConfigTienda | null>;
/** Crea la fila la primera vez; después la actualiza. Valida con zod antes de ir a la base. */
export async function guardarConfigTienda(d: Omit<ConfigTienda, "logoRuta" | "logoUrl">): Promise<void>;
export async function leerSucursalesTienda(): Promise<SucursalTienda[]>;      // todas las sucursales vivas, participen o no
export async function guardarSucursalTienda(id: string, d: Pick<SucursalTienda, "participa" | "recoger" | "domicilio" | "horario">): Promise<void>;
export async function leerTiendaEncendida(): Promise<boolean>;
export async function encenderTienda(encendida: boolean): Promise<void>;
export async function contarPendientesDeCatalogo(): Promise<{ sinFoto: number; sinDescripcion: number; enCategoriaInactiva: number }>;
```

**Reglas:**
- Molde: `apps/admin/app/lib/lealtad.ts` (Anexo §2). `tenantId()` de `lib/datos.ts`. Errores con `mensajeTienda`.
- `guardarConfigTienda`: zod (`direccion` con `errorDeDireccion`, color `^#[0-9a-fA-F]{6}$`, descripción ≤ 200, minutos 3–15 enteros, al menos una forma de pago). Usa `upsert` por `tenant_id`; si `upsert` denegado da error de RLS → «Solo el dueño…».
- `guardarSucursalTienda`: valida con `errorDeHorario`; `upsert` por `sucursal_id` con `tenant_id`. No toca `pausa_hasta` (es de la caja).
- `leerSucursalesTienda`: `sucursales` vivas + su fila de `tienda_sucursales` (si no hay: no participa, recoger sí, domicilio no, horario vacío) + el conteo de zonas activas y sin borrar por sucursal en **una** consulta agrupada, no una por sucursal (Anexo §5).
- `encenderTienda`: `upsert` en `configuracion_tenant` como `activarModuloLealtad`.
- `contarPendientesDeCatalogo`: productos vivos, visibles y no pausados; sin `imagen_url`; sin `descripcion`; en categoría inactiva o borrada. Con `count: "exact", head: true`.
- Un `update` que afecta 0 filas lanza «Solo el dueño o un administrador puede cambiar esto.»

- [ ] **Step 1: Pruebas** con el doble de PostgREST de `lealtad.test.ts` (ampliarlo si hace falta `.select()` tras escribir o `count`): la primera vez inserta con `tenant_id`; la segunda actualiza; una dirección tomada dice «ya la usa otro negocio»; un rechazo de RLS dice «Solo el dueño…»; sin fila de `tienda_sucursales` salen los valores por omisión; el conteo de zonas se agrupa por sucursal; `encenderTienda(true)` hace `upsert` de `modulo_tienda_activo`; `SIN_TIENDA_CONFIGURADA` se traduce; una configuración inválida (minutos 2, sin formas de pago) **no llega a la base**.
- [ ] **Step 2: Rojo.** **Step 3: Implementar.** **Step 4: Verde** + `tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(tienda): lectura y guardado de la tienda desde el admin`.

---

### Task 4: la entrada del menú, el permiso y la invitación

**Files:**
- Modify: `apps/admin/app/components/admin-shell.tsx` (constante `NAV` e iconos), `apps/admin/app/lib/acceso.ts`, `apps/admin/app/lib/__tests__/acceso.test.ts`
- Create: `apps/admin/app/(panel)/tienda/layout.tsx`, `apps/admin/app/components/tienda-sin-contratar.tsx`

- [ ] **Step 1: Prueba que falla** en `acceso.test.ts`: un supervisor (jerarquía 3) no puede ver `/tienda`; un administrador (4) y un dueño (5) sí.
- [ ] **Step 2:** añadir `{ prefijo: "/tienda", min: 4 }` a `MIN_JERARQUIA`, junto a la de Lealtad.
- [ ] **Step 3:** entrada `{ label: "Tienda en línea", href: "/tienda", icon: I.tienda }` en la sección «Operación» de `NAV`, justo debajo de Lealtad, con un icono nuevo `I.tienda` (SVG en línea del mismo trazo y tamaño que los demás; una bolsa de compra).
- [ ] **Step 4:** `tienda/layout.tsx` calcado de `lealtad/layout.tsx`: `estadoTienda(useModulos())` → cargando / `<TiendaSinContratar />` / hijos.
- [ ] **Step 5:** `TiendaSinContratar` con `PedirModulo` (Anexo §2). Textos:
  - Título: «Tu propia tienda en línea»
  - Texto: «Tus clientes piden desde su teléfono, para recoger o a domicilio, y el pedido cae en tu caja. Sin comisión por pedido.»
  - Incluye: «Tu menú, siempre al día» / «El mismo que vendes en caja, con sus precios y lo agotado.» · «Pago al recibir» / «Efectivo o tarjeta, como tú decidas.» · «Tus horarios» / «Solo recibe pedidos cuando tu caja está abierta.» · «Sin comisión» / «Una cuota fija, no un porcentaje de cada venta.»
  - Cierre: «Escríbenos y la activamos.» Botón: «Quiero mi tienda en línea». Mensaje de WhatsApp: «Quiero activar la tienda en línea.»
- [ ] **Step 6:** `pnpm --filter ./apps/admin test` y `tsc --noEmit`.
- [ ] **Step 7: Commit** — `feat(tienda): el apartado Tienda en línea en el menú del admin`.

---

### Task 5: la página — estado, tu tienda, pedidos y compartir

**Files:**
- Create: `apps/admin/app/(panel)/tienda/page.tsx`
- Create: `apps/admin/app/components/interruptor.tsx`, `tarjeta.tsx`
- Create: `apps/admin/app/components/tienda-estado.tsx`, `tienda-datos.tsx`, `tienda-pedidos.tsx`, `tienda-compartir.tsx`
- Modify: `apps/admin/package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: todo lo de las Tasks 2 y 3; `PageHeader`, `PageBody`, `Segmentos`, `BotonCopiar`, `label`/`input` de `campos.ts`; `Aviso`, `Button`, `DialogoPeligro` de `@vim/ui` (Anexo §6); `subirLogoTienda`/`quitarLogoTienda` de la Task 7 (**esta tarea deja el hueco del logo con un texto «El logo se sube en el siguiente paso»; la Task 7 lo conecta**).
- Produces: `Interruptor({ encendido, onCambiar, etiqueta, deshabilitado })` y `Tarjeta({ titulo, descripcion?, children })`, extraídos del marcado que Lealtad repite a mano (Anexo §6: `docs/diseno/admin.md` pide subirlo a componente a la segunda vez). **No se refactoriza Lealtad en esta entrega.**

**Comportamiento de la página** (molde de estados: `lealtad/page.tsx`, Anexo §2):

- Carga todo de una vez: configuración, sucursales, encendido, pendientes del catálogo. Si la lectura falla, **no** pinta el formulario: mensaje y botón «Reintentar».
- Con `useAccesoTenant()` en `bloqueado`, todo queda en solo lectura.
- Mensajes en línea junto a lo que se guardó (`role="alert"` para error, `role="status"` para éxito); sin toasts.
- Una escritura a la vez: mientras algo se guarda, los demás botones de guardar no responden.

**Bloque 1 — Estado** (`tienda-estado.tsx`):
- Interruptor «Tienda en línea» con el estado en palabras: «Encendida: tus clientes ya pueden pedir.» / «Apagada: nadie puede verla.»
- Debajo, la lista de `revisar(...)`: los bloqueos con `Aviso` tono `warning` y su enlace; las advertencias en tono `info`. Sin pendientes: «Todo listo para recibir pedidos.»
- El interruptor está deshabilitado mientras `puedeEncender` sea falso **y la tienda esté apagada** (apagar siempre se puede). Texto de ayuda: «Resuelve lo de abajo para poder encenderla.»
- Apagar pide `DialogoPeligro`: título «¿Apagar tu tienda en línea?», consecuencia «Tus clientes dejarán de poder pedir. Los pedidos que ya entraron se atienden igual.», botón «Apagar».
- Aviso fijo al pie del bloque: «Tu tienda solo recibe pedidos cuando la caja de la sucursal tiene turno abierto y conexión.»

**Bloque 2 — Tu tienda** (`tienda-datos.tsx`):
- **Dirección**: prefijo fijo `pedidos.vimpos.com.mx/` y el campo. Si no hay tienda todavía, viene sugerida con `sugerirDireccion(nombre del negocio)`. El error de `errorDeDireccion` sale junto al campo mientras se escribe.
- Si ya había una dirección guardada y se cambia, al guardar sale `DialogoPeligro`: «¿Cambiar la dirección de tu tienda?», «Dejarán de funcionar los códigos QR que ya imprimiste y los enlaces de seguimiento de los pedidos en curso.», botón «Cambiar dirección».
- **Logo** (hueco para la Task 7), **Color** (`<input type="color">` nativo más su valor en texto), **Descripción** (hasta 200, con contador).
- Un botón «Guardar» para el bloque.

**Bloque 3 — Pedidos** (`tienda-pedidos.tsx`):
- **Aceptación** con `Segmentos`: «A mano» / «Automática». Debajo, en una línea: a mano → «Cada pedido suena en la caja y alguien lo acepta o lo rechaza.»; automática → «Los pedidos entran directo a cocina.»
- **Minutos de espera** (solo visible en «A mano»): número de 3 a 15, con «Si nadie responde en ese tiempo, el pedido se cancela solo y el cliente se entera.»
- **Formas de pago al recibir**: dos casillas, «Efectivo» y «Tarjeta (con terminal al entregar)». No se pueden desmarcar las dos.
- Un botón «Guardar» para el bloque. Los bloques 2 y 3 guardan la misma fila: cada botón manda la configuración completa con sus cambios.
- Bloques 3 y 4 no se pueden guardar hasta que exista la dirección: «Primero guarda la dirección de tu tienda.»

**Bloque 5 — Compartir** (`tienda-compartir.tsx`), solo con dirección guardada:
- El enlace `https://pedidos.vimpos.com.mx/<direccion>` con `BotonCopiar`.
- El QR con `QRCodeCanvas` de `qrcode.react` (tamaño 512 interno, mostrado a 192 px), y un botón «Descargar QR» que baja un PNG llamado `qr-<direccion>.png` desde el `canvas`.
- Con la tienda apagada: «El enlace funciona cuando enciendas tu tienda.»
- **Sin** botón «ver mi tienda» todavía: la tienda pública no existe hasta la entrega 5. Se añade ahí.

- [ ] **Step 1:** `pnpm --filter ./apps/admin add qrcode.react@^4` (la misma versión que `apps/pos`); confirmar que `pnpm install --frozen-lockfile` pasa y que `pnpm audit --prod --audit-level=high` sigue limpio.
- [ ] **Step 2:** `Interruptor` y `Tarjeta`.
- [ ] **Step 3:** los cuatro bloques y la página.
- [ ] **Step 4:** `pnpm --filter ./apps/admin test`, `tsc --noEmit`, `pnpm tipografia`.
- [ ] **Step 5: Commit** — `feat(tienda): la página de la tienda en el admin — estado, datos, pedidos y compartir`.

---

### Task 6: las sucursales y sus horarios

**Files:**
- Create: `apps/admin/app/components/tienda-sucursales.tsx`, `tienda-horario.tsx`
- Modify: `apps/admin/app/(panel)/tienda/page.tsx` (montar el bloque 4)

**Bloque 4 — Sucursales:** una tarjeta por sucursal viva.
- Encabezado: nombre de la sucursal e interruptor «Vende en la tienda».
- Apagado: la tarjeta se queda en una línea. Encendido, se abre:
  - Dos casillas: «Para recoger» y «A domicilio». Junto a domicilio: «{n} zonas de envío» con enlace «Administrar zonas» a `/configuracion/envios`; con 0 zonas, en tono de advertencia.
  - **Horario**: siete renglones, uno por día. Cada uno: casilla «Abre», y si abre, dos `<input type="time">` (apertura y cierre). Si el cierre es menor que la apertura: «Cierra al día siguiente». En el primer día abierto, un botón «Copiar a todos los días».
  - El error de `errorDeHorario` junto al renglón.
  - Un «Guardar» por sucursal.
- Sucursal inactiva: se muestra atenuada con «Sucursal inactiva» y sin poder participar.
- Tras guardar una sucursal se vuelve a calcular la lista de revisión del bloque 1.

- [ ] **Step 1:** los dos componentes. `tienda-horario.tsx` es controlado (`valor: Horario`, `onCambiar`) y no sabe nada de sucursales.
- [ ] **Step 2:** montarlo en la página.
- [ ] **Step 3:** pruebas, `tsc --noEmit`, `pnpm tipografia`.
- [ ] **Step 4: Commit** — `feat(tienda): sucursales y horarios de la tienda en el admin`.

---

### Task 7: fotos de productos y logo de la tienda

**Files:**
- Create: `apps/admin/app/lib/foto-producto.ts`, `apps/admin/app/lib/__tests__/foto-producto.test.ts`
- Modify: `apps/admin/app/lib/catalogo.ts` (tipo `Producto`, lectura y guardado con `imagen_url`), `apps/admin/app/components/producto-form.tsx`, `apps/admin/app/components/tienda-datos.tsx`

**Interfaces — Produces:**

```ts
export const FOTO_LADO_MAX = 1200;
export const FOTO_MAX_BYTES = 1_000_000;          // el tope del bucket `productos`
/** Sube la imagen ya reescalada a `<tenant>/<uuid>.<ext>` y devuelve ruta y URL pública. */
export async function subirImagen(archivo: File): Promise<{ ruta: string; url: string }>;
/** Borra un archivo del bucket. No lanza: un huérfano no debe tumbar el guardado. */
export async function quitarImagen(ruta: string): Promise<void>;
export function rutaDeUrl(url: string | null): string | null;   // de la URL pública a la ruta dentro del bucket; null si no es de este bucket
export async function ponerFotoProducto(productoId: string, archivo: File, urlAnterior: string | null): Promise<string>;
export async function quitarFotoProducto(productoId: string, urlAnterior: string): Promise<void>;
export async function ponerLogoTienda(archivo: File, rutaAnterior: string | null): Promise<string>;   // devuelve la ruta nueva
export async function quitarLogoTienda(rutaAnterior: string): Promise<void>;
```

**Reglas** (molde: `apps/admin/app/lib/anuncios-pantalla.ts`, Anexo §4):
- Reescala con `reescalarImagen` de `lib/imagen.ts` y convierte con el mismo patrón que `dataUriAArchivo`. Solo JPG, PNG o WebP.
- Orden al reemplazar: subir la nueva → escribir la fila (`productos.imagen_url` o `tienda_config.logo_ruta`) → borrar la anterior. Si la fila no entra, se borra la recién subida.
- `productos.imagen_url` guarda la **URL pública completa** (es lo que `tienda_menu` ya devuelve tal cual). `tienda_config.logo_ruta` guarda la **ruta**.
- Subir exige ser dueño o administrador de sistema (política del bucket): el rechazo se traduce a «Solo el dueño o un administrador puede subir fotos.»

**En la ficha del producto** (`producto-form.tsx`): un campo «Foto» **fuera** de la sección plegable «Más datos», arriba de ella: miniatura cuadrada de 96 px (`object-cover`), botones «Subir foto» / «Cambiar» y «Quitar». Texto: «La ve tu cliente en la tienda en línea. JPG, PNG o WebP.» En un producto nuevo (sin guardar todavía) el campo dice «Guarda el producto para poder subirle foto.» La foto se sube al momento, sin esperar al botón Guardar del formulario.

**En «Tu tienda»**: lo mismo para el logo, con miniatura `object-contain` y «Se ve arriba de tu tienda. Mejor si es cuadrado y con fondo transparente.»

- [ ] **Step 1: Pruebas** (`foto-producto.test.ts`, con el almacén simulado como en `anuncios-pantalla-almacen.test.ts`): la ruta es `<tenant>/<uuid>.<ext>`; al reemplazar se sube, se escribe y **después** se borra la anterior; si la escritura de la fila falla se borra la nueva y la anterior sigue; `rutaDeUrl` solo reconoce URLs de este bucket y de este negocio (una URL ajena o externa da `null` y **nunca se intenta borrar**); un tipo no admitido se rechaza antes de subir; el rechazo de la política se traduce.
- [ ] **Step 2: Rojo.** **Step 3: Implementar** librería, formulario y logo.
- [ ] **Step 4:** pruebas, `tsc --noEmit`, `pnpm tipografia`.
- [ ] **Step 5: Commit** — `feat(tienda): fotos de productos y logo de la tienda`.

---

### Task 8: diseño escrito, verificación en el navegador y salida

- [ ] **Step 1: `docs/diseno/admin.md`** — sección nueva «Tienda en línea», con el molde de «Pantalla del cliente»: qué bloques hay y en qué orden, la regla del interruptor y la lista de revisión, el horario por día, los 44 px, y los dos componentes nuevos (`Interruptor`, `Tarjeta`) en «Piezas que se repiten en el panel».

- [ ] **Step 2: Todo en verde**
  - `cd desktop && npm run smokes`
  - `pnpm -r test`, `pnpm test:functions`, `pnpm tipografia`
  - `pnpm --filter ./apps/<app> exec tsc --noEmit` para las cinco apps
  - `pnpm install --frozen-lockfile` y `pnpm audit --prod --audit-level=high`

- [ ] **Step 3: Verificación en el navegador** (obligatoria; el admin local apunta al Supabase **local**, que no se reinicia ni se resetea: lo comparten otras sesiones).
  1. Aplicar la migración 0163 al Supabase local **solo si el local ya tiene 0161 y 0162**; si no, detenerse y decirlo (no usar `db reset`).
  2. En el negocio de desarrollo local, conceder el complemento a mano: una fila en `tenant_addons` para `TIENDA` con fecha de hoy en hora de México.
  3. Levantar el admin con el servidor de vista previa del proyecto (nunca con Bash) y recorrer, con capturas en escritorio (1280) y celular (375):
     - sin complemento → la invitación;
     - con complemento y sin configurar → dirección sugerida, lista de revisión con bloqueos, interruptor deshabilitado;
     - guardar dirección, color y descripción; subir y quitar logo;
     - una dirección reservada y una ya tomada → sus mensajes;
     - cambiar la dirección → la confirmación;
     - activar una sucursal, horario con cierre pasada la medianoche, «Copiar a todos los días»;
     - domicilio sin zonas → el bloqueo y su enlace;
     - encender, apagar (con su confirmación);
     - el QR se ve y se descarga;
     - en el catálogo: subir, cambiar y quitar la foto de un producto;
     - entrar como supervisor → no ve el apartado.
  4. Revisar la consola del navegador: sin errores.

- [ ] **Step 4: PR** contra `main`, con capturas, lo probado y lo pendiente de producción.

- [ ] **Step 5: Producción — DETENERSE y pedir el visto bueno de Fermín.** Con su «sí»: `supabase migration list --linked`; aplicar la 0163 en una transacción con `SET LOCAL lock_timeout = '5s'` (toca `tienda_config` y `configuracion_tenant`, y añade un disparador a `tenant_addons`); `migration repair --status applied 0163`; verificar los dos disparadores y el `CHECK` nuevo; regenerar `database.types.ts` con `--linked`, `tsc` en las cinco apps y confirmarlo en el PR. La función `tienda` **no** se redespliega: lee `tienda_negocio` por RPC y la migración ya cambia lo que devuelve.

- [ ] **Step 6: Mezclar** con squash cuando el CI esté en verde y Fermín lo autorice. El admin se despliega solo desde `main` (Vercel): el apartado aparecerá en producción para todos los negocios, mostrando la invitación a contratar, porque ninguno tiene el complemento.

---

## Lo que esta entrega NO hace

- La tienda pública y el botón «ver mi tienda»: entrega 5.
- Que la caja reciba, suene y acepte pedidos, y la pausa: entrega 4.
- Activar el complemento en el panel de VIM y concederlo por plan: entrega 7.
- Reporte de ventas en línea, ocultar un producto solo en la tienda, compra mínima, horarios distintos para recoger y domicilio.
- Refactorizar Lealtad para usar `Interruptor` y `Tarjeta`.

## Decidido por Fermín (8 oct 2026)

1. **La entrada «Tienda en línea» se ve desde ya para todos los negocios**, tengan o no el complemento, con la invitación a contratarla. Igual que Lealtad: no se esconde.
2. **El aviso de combos que no se pueden comprar en línea** (dos espacios obligatorios que solo admiten el mismo producto) **no entra en la lista de revisión de esta entrega**. Queda para la entrega 5, cuando la tienda exista y se vea el caso real.
