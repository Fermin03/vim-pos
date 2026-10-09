# Entrega 3 (admin "Tienda en línea") — hechos del repo

Raíz: `vim-pos-tienda/`. Rutas abreviadas: `A` = `apps/admin/app`.

## 1. Navegación

- Menú: constante `NAV: Seccion[]` DENTRO de `A/components/admin-shell.tsx:47` (client component `AdminShell`). Tipos `Item = { label; href; icon: ReactNode }`, `Seccion = { titulo; items }` (l.41-42). Iconos: objeto `I` (l.44+), SVG inline; no hay icono de tienda (reusar uno o añadir).
```tsx
const NAV: Seccion[] = [
  { titulo: "Operación",
    items: [
      { label: "Panel", href: "/dashboard", icon: I.panel },
      ...
      { label: "Lealtad", href: "/lealtad", icon: I.clientes },
      { label: "Reservaciones", href: "/reservaciones", icon: I.clientes },
      { label: "Conciliación apps", href: "/conciliacion", icon: I.reportes },
  ] },
  { titulo: "Administración", items: [ Usuarios, Facturación, Configuración, Reportes ] },
];
```
- Mostrar/ocultar: SOLO por jerarquía, nunca por módulo. `admin-shell.tsx:327`: `sec.items.filter((it) => puedeVer(jer, it.href))`. Tabla única `MIN_JERARQUIA` en `A/lib/acceso.ts:15-30` (prefijo → min; gana el prefijo más largo; ruta desconocida = `null` = PASA). **`/tienda` NO está en la tabla: hay que añadir `{ prefijo: "/tienda", min: 4 }`** (Lealtad: `{ prefijo: "/lealtad", min: 4 }`, l.21). Guardián de ruta: `admin-shell.tsx:450` `perfil && !puedeVer(jer, pathname) ? <SinAcceso/> : children`. Jerarquías: Dueño 5, Admin 4, Supervisor 3, Cajero 2. Panel entero exige >=3 (`JERARQUIA_MINIMA_PANEL`, acceso.ts:64). Test existente: `A/lib/__tests__/acceso.test.ts` (hay caso de lealtad; añadir uno de tienda).
- Un item sin add-on NO se esconde: Lealtad siempre aparece y la página muestra la invitación (inventario sí pone insignia "Plan Negocio", l.~370).
- Layout: `A/(panel)/layout.tsx` = `<AdminShell>{children}</AdminShell>` (sidebar + main + guardias). El shell expone contextos: `usePerfil()`, `useAccesoTenant()` (nivel ok/gracia/bloqueado; "bloqueado" = solo lectura, las pantallas de alta lo usan para apagar botones), `useModulos()` (`{permitidos, efectivos}` | `"error"` | `null`).
- Cabecera/cuerpo de página: `A/components/page-header.tsx`:
```tsx
export type Miga = { label: string; href?: string };
export function PageHeader({ titulo, subtitulo, migas, right }: { titulo: string; subtitulo?: string; migas?: Miga[]; right?: ReactNode })
export function PageBody({ children })   // scroll, px-4/lg:px-8, <div className="mx-auto max-w-[1140px]">
export function TablaScroll({ children, min = 720 })
```
  Patrón de página: `<> <PageHeader .../> <PageBody>…</PageBody> </>`; las páginas son `"use client"`.
- Layout de sección (patrón lealtad): `A/(panel)/lealtad/layout.tsx` (client) decide cargando / sin_contratar / hijos (ver §2).

## 2. Lealtad de punta a punta

Archivos: `A/(panel)/lealtad/{layout,page}.tsx`, `lealtad/premios/page.tsx`, `lealtad/movimientos/page.tsx`; `A/components/{lealtad-sin-contratar,lealtad-pestanas,pedir-modulo,cliente-lealtad}.tsx`; `A/lib/{lealtad.ts (289 l.),lealtad-plan.ts,lealtad-libro.ts}`; tests `A/lib/__tests__/{lealtad,lealtad-libro}.test.ts`.

- Decisión contratar/encender/configurado = DOS capas:
  1. `lealtad/layout.tsx` (client): `const estado = estadoLealtad(useModulos());` → `"cargando"` → `<PageBody>Cargando…`; `"sin_contratar"` → `<LealtadSinContratar />`; si no `<>{children}</>`.
  2. `A/lib/lealtad-plan.ts:13-17` (pura, testeable):
```ts
export function estadoLealtad(m: ModulosLeidos | "error" | null): EstadoLealtad {
  if (m === null) return "cargando";
  if (m === "error") return "permitida";          // fallo de lectura: se enseña la sección (la base igual protege)
  return m.permitidos.lealtad === true ? "permitida" : "sin_contratar";
}
```
  La guía es `permitidos` (VIM concedió), no `efectivos`. Dentro, `page.tsx` lee el interruptor fresco de la base (`leerLealtadEncendida()`) porque el shell lee módulos UNA vez por sesión. `ModulosLeidos` type está en `A/lib/inventario-plan.ts` (importado por lealtad-plan).
- "Contratar": `LealtadSinContratar` → `PedirModulo` (`A/components/pedir-modulo.tsx`): props `{titulo, texto: ReactNode, incluye: {titulo,detalle}[], cierre, boton, mensaje:(quien)=>string}`; un solo botón que abre WhatsApp (enlace de `@vim/db/soporte`, `enlaceWhatsapp`, `leerAyuda()`), mensaje pre-escrito `mensajeQuieroLealtad` = `mensajeAyudaAdmin(d).replace(/Necesito ayuda con VIM POS\.$/, "Quiero activar el programa de lealtad.")`. Sin precios a propósito.
- Lectura de módulos: `A/lib/modulos.ts` `leerModulos()` → `supabase.rpc("modulos_efectivos", { p_tenant: tid })` → `{permitidos, efectivos}`.
- Interruptor (escritura DIRECTA, upsert; no RPC) `A/lib/lealtad.ts:180-186`; hermano `activarModuloDelivery` en `A/lib/modulos.ts`:
```ts
export async function activarModuloLealtad(activo: boolean): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("configuracion_tenant")
    .upsert({ tenant_id: tid, modulo_lealtad_activo: activo }, { onConflict: "tenant_id" });
  if (error) throw fallo(error, "No se pudo cambiar");
}
```
  Lectura: `leerLealtadEncendida()` l.193: `.from("configuracion_tenant").select("modulo_lealtad_activo").eq("tenant_id", tid).maybeSingle()`; sin fila = apagado.
  Errores: `mensajeLealtad(e, porDefecto)` (l.16-26) traduce códigos de la base (`SIN_ADDON_LEALTAD`, `SIN_PROGRAMA_LEALTAD`, nombres de índice) y `/row-level security|permission denied/i` → `SOLO_ADMIN`; `fallo()` envuelve en `Error`. **Para lealtad existe trigger `configuracion_tenant_lealtad_guardia` (0156:243-277) que rechaza encender sin add-on activo y sin programa; 0161 NO creó un equivalente para `modulo_tienda_activo`** → hoy un admin puede poner `modulo_tienda_activo=true` por REST sin el add-on (inocuo: `modulos_efectivos` hace AND con el add-on; pero no hay códigos `SIN_ADDON_TIENDA` ni aviso de "primero guarda la configuración"). Tampoco hay trigger que apague el interruptor al retirar el add-on (lealtad: `tenant_addons_apaga_lealtad`).
- Formulario (patrón `lealtad/page.tsx`, 266 l.): client component con `useState` por campo, `form` de textos (`FormPrograma`, strings para no convertir un campo a medio escribir en 0), validación en la lib (`guardarPrograma` → zod `programaSchema` + RPC `lealtad_guardar_programa`), estados `existe: boolean|undefined`, `guardando`, `cambiando`, `error`, `ok`, `falloLectura` + `intento` (botón Reintentar; un fallo de lectura NO pinta el formulario para no pisar datos reales). Feedback = párrafos inline, NO toasts: `<p className="mb-4 text-sm font-medium text-danger" role="alert">`, `text-success role="status"`. Interruptor = botón `role="switch"` hecho a mano (l.126-133, sin componente compartido):
```tsx
<button type="button" role="switch" aria-checked={encendido} aria-label="Programa de lealtad"
  disabled={cambiando || !existe}
  onClick={() => (encendido ? setApagando(true) : void cambiarEncendido(true))}
  className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors ${encendido ? "bg-accent" : "bg-line-strong"} disabled:opacity-50`}>
  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${encendido ? "left-[22px]" : "left-0.5"}`} /></button>
```
  Apagar pide `DialogoPeligro` (props usadas: `titulo, consecuencia, boton, ocupado, textoOcupado, ancho="sm", error, onConfirmar, onCerrar`). Encender no pide confirmación. Texto "Primero guarda tu programa… Después lo enciendes." cuando aún no hay fila. Aviso fijo al pie: tardanza de sync a las cajas.
  Server actions: NINGUNA en el admin. Todo es client + supabase-js con la sesión del usuario.
- Tests: vitest `environment: "node"`, `include: ["app/**/*.test.ts"]` (solo .ts, no .tsx) — `apps/admin/vitest.config.ts`; env dummy `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`. 42 archivos en `A/lib/__tests__/`. Un archivo puede pedir jsdom con `// @vitest-environment jsdom` (3 lo hacen; `jsdom` está en devDependencies). Correr: `pnpm --filter ./apps/admin test` (= `vitest run`). Patrón de `lealtad.test.ts`: doble de PostgREST en memoria con `vi.hoisted` + `vi.mock("../supabase")`:
```ts
const doble = vi.hoisted(() => ({ tablas: {} as Record<string, Fila[]>, rpc: [] as {fn:string;args:Fila}[],
  rpcRespuesta: {} as Record<string,{data:unknown;error:{message:string;code?:string}|null}>,
  escrituras: [] as {tabla:string;op:string;valores:Fila;filtros:Fila}[], errorEscritura: null as ..., errorLectura: null as ... }));
vi.mock("../supabase", () => ({ supabase: { from: consulta, rpc: vi.fn(async (fn, args) => {...}) },
  leerSesion: vi.fn(async () => ({ email: "d@d.com", userId: "u1", tenantId: "t1", tipoIdentidad: "ADMIN_WEB", autoservicio: false })) }));
// casos: describe("el interruptor") it("enciende con un upsert sobre la configuración del negocio"),
//        it("los rechazos de la base se dicen en palabras del dueño"), "sin fila de configuración está apagado"
```
  El doble soporta `select/insert/update/upsert/eq/is/order/maybeSingle/then` (NO `.select()` tras update ni `.single()`; si la plan los usa hay que ampliar el doble).

## 3. Acceso a Supabase en el admin

- Un solo cliente, solo navegador: `A/lib/supabase.ts:13` `export const supabase: SupabaseClient = createClient(URL, ANON, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "vimpos.admin.session" } })` (`"use client"`, clave anon). No hay cliente de servidor / SSR / server components con datos: todo `"use client"`. No hay `middleware.ts`.
- Tenant id: `leerSesion()` (supabase.ts:31) decodifica el JWT (`tenant_id`, `tipo_identidad`) → `Sesion {email,userId,tenantId,tipoIdentidad,autoservicio}`. Helper compartido `tenantId()` en `A/lib/datos.ts:7` (lanza "Sesión sin tenant"); `anuncios-pantalla.ts` tiene su propia copia. Casi nunca hace falta pasar tenant a los SELECT: RLS filtra.
- Rol: `A/lib/perfil.ts` `cargarPerfil()` → `Perfil {nombre, rolCodigo, rolNombre, jerarquia}` (rol más alto desde `usuarios_acceso → roles`); se obtiene con `usePerfil()` (contexto del shell). "Es dueño/admin" en la UI = `jerarquia >= 4` vía `puedeVer`/`MIN_JERARQUIA`. La base usa `es_admin_del_tenant()` (0014:77): `roles.codigo IN ('DUENO','ADMIN') AND es_sistema` — un rol personalizado con jerarquía >=4 pasaría la UI y fallaría en RLS (de ahí el mapeo "row-level security → SOLO_ADMIN").
- Un UPDATE denegado por RLS NO da error (0 filas): `anuncios-pantalla.ts:150-154` `actualizar()` hace `.update(...).eq("id",id).select("id")` y si `data.length===0` lanza `SOLO_ADMIN`. Un INSERT/UPSERT denegado sí da error "row-level security".
- `service_role` en apps/admin: **ninguno** en código (`grep -i service_role` solo da un comentario en `A/lib/configuracion.ts:309` que menciona `cargar-csd`). Bien.

## 4. Subida de imagen (anuncios) y edición de productos

Anuncios: UI `A/(panel)/configuracion/pantalla-cliente/page.tsx` (`<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only">` dentro de un `<label>` con `botonClases()`, l.43/227); lib `A/lib/anuncios-pantalla.ts`; reescalado `A/lib/imagen.ts` `reescalarImagen(archivo,{ladoMax,maxBytes})` → data URI (canvas, PNG o JPEG sobre blanco); tests `anuncios-pantalla.test.ts` y `anuncios-pantalla-almacen.test.ts`. Excerpt `anuncios-pantalla.ts`:
```ts
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;   // l.36
export function dataUriAArchivo(dataUri) {                                              // l.46 PURA, valida tipo y ANUNCIO_MAX_BYTES (800 KB)
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUri);
  ... return { blob: new Blob([bytes], { type: tipo }), ext: EXT[tipo], tipo }; }
const urlPublica = (ruta: string) => supabase.storage.from(ALMACEN).getPublicUrl(ruta).data.publicUrl;   // l.91
// subirAnuncio (l.108-141):
dataUri = await reescalarImagen(archivo, { ladoMax: ANUNCIO_LADO_MAX, maxBytes: Math.floor(ANUNCIO_MAX_BYTES * 4 / 3) });
const { blob, ext, tipo } = dataUriAArchivo(dataUri);
const id = crypto.randomUUID();
const ruta = `${tid}/${id}.${ext}`;            // la base lo exige con CHECK anuncios_pantalla_ruta_chk
const subida = await supabase.storage.from(ALMACEN).upload(ruta, blob, { contentType: tipo, cacheControl: "31536000", upsert: false });
if (subida.error) throw new Error(traducir(subida.error.message));
const { error } = await supabase.from("anuncios_pantalla").insert({ id, tenant_id: tid, ruta, orden, bytes: blob.size });
if (error) { await quitarDelAlmacen(ruta, "la fila no entró"); throw ... }   // limpia la huérfana
// borrar (l.82-89, 188-192): baja lógica en la fila y luego supabase.storage.from(ALMACEN).remove([ruta]) SIN lanzar si falla (supabase-js no lanza: devuelve { error }; se lee y se console.warn).
```
  Bucket `productos` (0161:698-721): público, 1 MB, jpeg/png/webp; políticas SOLO `INSERT` y `DELETE` (y SELECT a authenticated) → **no hay política UPDATE: `upsert:true` fallaría; cada foto nueva = ruta nueva `<tenant>/<uuid>.<ext>` + borrar la anterior**. Escritura exige `es_admin_del_tenant`. Carpeta = `(storage.foldername(name))[1] = current_tenant_id()::text`. La URL pública del bucket (`.../storage/v1/object/public/productos/<tenant>/<uuid>.<ext>`) la da `getPublicUrl`. (Ojo: el admin no tiene CSP propia en `next.config.mjs`/vercel; no hay `img-src` que tocar en admin.)

Productos:
- Formulario: `A/components/producto-form.tsx` (compartido por `A/(panel)/catalogo/productos/nuevo/page.tsx` y `productos/[id]/page.tsx`; lista `productos/page.tsx`). Lib `A/lib/catalogo.ts`. El submit (`guardar`, producto-form.tsx:~201) hace `productoSchema.safeParse({...})` y llama `actualizarProducto(idPrevio, datos)` o `crearProducto(...)`, luego filas de menú y agotados por sucursal.
- Guardado = escritura DIRECTA (no RPC), `catalogo.ts:~324-342`:
```ts
await supabase.from("productos").update({
  nombre, categoria_id, precio_base_mxn, descripcion: datos.descripcion || null, codigo_interno: datos.codigo_interno || null,
  estado, visible_en_pos, marca_virtual_id: ... || null, area_cocina_id: ... || null, clave_sat: ... || null,
  tasa_iva, iva_incluido_en_precio }).eq("id", id);
```
  `crearProducto` (l.~290-320) hace `.insert({tenant_id, ..., en_menu_general, orden_visualizacion})`. Schema `productoSchema` (catalogo.ts:~163): nombre, categoria_id, precio_base_mxn, **descripcion (max 500)**, codigo_interno, estado ACTIVO|PAUSADO, agotado, visible_en_pos, marca_virtual_id, area_cocina_id, clave_sat, tasa_iva, iva_incluido_en_precio. El tipo `Producto` y el SELECT de `listarProductos` (l.221) NO traen `imagen_url`.
- `descripcion` YA existe en el formulario (sección plegable "Más datos", textarea `maxLength={500}`, placeholder "Lo que verá el cliente", producto-form.tsx:~447-456) — pero está plegada si vacía. `imagen_url`: **no aparece en ningún archivo de apps/admin** (tampoco `imagenUrl`). La columna existe: `productos.imagen_url text NULL` (0007:148; la 0007:68 es la de `categorias`, también sin uso). La tienda (0162:246, 311) ya lee `p.imagen_url`.
- Guarda 0133 (`supabase/migrations/0133_guardas_escritura_directa.sql`): para `productos` NO hay lista de columnas permitidas; solo exige el permiso `config.productos` en escrituras REST directas (DUENO y ADMIN lo tienen; override por negocio se respeta). Cita (l.145-155):
```sql
IF v_tabla IN ('productos', 'categorias', 'grupos_modificadores', 'opciones_modificador',
               'productos_grupos_modificadores', 'combo_grupos', 'combo_opciones', 'promociones') THEN
  IF NOT usuario_actual_tiene_permiso(CASE WHEN v_tabla = 'promociones' THEN 'config.promociones' ELSE 'config.productos' END) THEN
    RAISE EXCEPTION 'Tu rol no puede modificar el catálogo (%).', v_tabla USING ERRCODE = 'insufficient_privilege', ...
  RETURN ...;
```
  → escribir `imagen_url` por REST funciona para quien tenga `config.productos`. (Las listas de columnas permitidas de 0133 son de las tablas de dinero, no de productos.) Nota: la política de Storage exige `es_admin_del_tenant` (DUENO/ADMIN de sistema), más estricta que `config.productos`: un rol con el permiso pero no admin de sistema no podría subir.
- Logo del negocio (nota de la entrega 2): `/configuracion/negocio` (`A/(panel)/configuracion/negocio/page.tsx:139,156`) llama `guardarLogoNegocio(dataUri)` (`A/lib/configuracion.ts:80-87`) que escribe **`tenants.logo_url`** (data URI ≤512 KB, 0066). **`tienda_negocio` (0162:134,173) lee `tenants.logo_png_url`** (0080:74, columna del PAC, que ninguna app escribe). Son columnas distintas: hay que decidir (a) cambiar `tienda_negocio` para devolver `logo_url` (un data URI de hasta 512 KB dentro de cada respuesta de `negocio`), o (b) subir el logo de la tienda a Storage y guardar su URL (¿dónde? `tienda_config` no tiene columna `logo`).

## 5. Sucursales y zonas

- Lista/edición: `A/(panel)/configuracion/sucursales/page.tsx` + modal `A/components/modal-sucursal.tsx` (`ModalSucursal({sucursal, onCerrar, onGuardado})`) + `A/components/modal-caja.tsx`. Lib `A/lib/configuracion.ts:405` `listarSucursales()`:
```ts
supabase.from("sucursales").select("id, codigo, nombre, direccion_calle, ciudad, estado_geo, telefono, activa, cajas(count), areas_cocina(count)").is("deleted_at", null).order("nombre")
// → Sucursal = { id, codigo, nombre, direccion_calle, ciudad, estado_geo, telefono, activa, nCajas, nAreas }  (strings vacíos en vez de null)
```
  Tipo en `sucursalSchema` (l.383): `telefono` opcional (max 20) → **una sucursal puede no tener teléfono** (la lista de revisión de la spec lo bloquea). No hay campos `direccion_*` separados más allá de `direccion_calle`, `ciudad`, `estado_geo` (el POS/tienda quizá quiera colonia/CP: `sucursales` real los tiene según database.types, pero el admin no los lee).
- El shell ya llama `listarSucursales()` en cada carga (admin-shell.tsx) para el selector del sidebar.
- Selectores de sucursal reutilizables: `A/components/selector-sucursal.tsx` (`useSucursalReporte()`, `SelectorSucursal`, para reportes), `disponibilidad-sucursales.tsx` (`DisponibilidadSucursales`, agotado por sucursal).
- Zonas de envío SÍ tienen pantalla de admin: `A/(panel)/configuracion/envios/page.tsx` (elige sucursal, lista/crea/edita/pausa/elimina) + lib `A/lib/zonas-envio.ts` (`listarZonas(sucursalId)` → `{id,sucursalId,nombre,costoMxn,orden,activa}` filtrando `deleted_at IS NULL`, `crearZona`, `editarZona`, `setActivaZona`, `eliminarZona` = `borrarSuave`); test `A/lib/__tests__/zonas-envio.test.ts`. Para el bloqueo "domicilio sin zonas" hay que contar zonas `activa=true AND deleted_at IS NULL` por sucursal (listarZonas hoy es una por sucursal; la revisión necesitaría una consulta agrupada nueva o N llamadas). También las usa el POS (`apps/pos/app/lib/zonas-envio.ts`). Enlace natural: `/configuracion/envios`.

## 6. Sistema de diseño

- `docs/diseno/`: `nucleo.md` (278 l., capa base: color, tipografía, espaciado, controles, componentes compartidos; manda sobre todas), `admin.md` (238 l., panel del dueño: densidad, números, fechas, peligro, combos, inventario, plan, llegada del cliente, pantalla del cliente, menús del catálogo, "Piezas que se repiten en el panel" l.217), `pos.md`, `kds.md`, `factura.md`, `platform.md`, `pantalla-cliente.md`, `sitio.md` (no gobiernan el admin). **No hay sección de Tienda en línea en admin.md** (el plan debería añadirla; patrón "Pantalla del cliente" l.149-175 es el molde: controles de 44 px en páginas que el dueño abre desde el celular). Tokens: `packages/ui/tokens.css` (98 l.; `--accent: 0 120 201`, `--ink`, `--ink-2`, clases Tailwind `bg-surface`, `border-line`, `border-line-strong`, `text-ink-2/3`, `bg-warning-soft`, `border-warning-line`, `bg-sel`, `bg-hover`, `bg-bg`, `text-danger/success`). Escala tipográfica `text-11..40` obligatoria: `pnpm tipografia` (CI) falla con `text-[Npx]` fuera de escala (11,12,13,14,15,16,18,20,24,28,32,40).
- Componentes (`@vim/ui/styles`, `packages/ui/src/index.ts`): `Button` (`variant` primary|ghost|danger; `size` md h-11|lg h-14) y `botonClases()` para enlaces; `Modal` (`{open,onClose,title,children,hideTitle,className,backdropClassName}`); `Aviso` (`tono` success|warning|danger|info, `onCerrar`, `role`, `className`) = callout; `StatusChip` (`tone` success|warning|danger|info|neutral, `punto`); `DialogoPeligro` (confirmación destructiva); `useConfirmar()` (promesa `confirmar({titulo, mensaje, boton, peligrosa})` + `dialogoConfirmar` a renderizar); `PinKeypad`; `LogoVim`; `cn`.
- De `A/components/`: `PageHeader/PageBody/TablaScroll` (page-header.tsx); `label`, `input` (campos.ts: `input` = `h-11 w-full rounded border border-line-strong px-3 text-sm …`); `Segmentos({etiqueta, opciones:{v,l}[], valor, onCambiar, grande})` y `AccionFila` (controles.tsx); `BotonCopiar({valor, etiqueta})` (boton-copiar.tsx, copia con `navigator.clipboard`, muestra "Copiado" 1.5 s) ; `Plegable({titulo, resumen, abierto, children})`; `PedirModulo`; `Aviso` de `@vim/ui` para advertencias. NO existen componentes compartidos de: tarjeta/sección (se repite `<section className="max-w-[720px] rounded-lg border border-line bg-surface p-5">`), interruptor (switch a mano en lealtad/page.tsx:126; hay otros a mano), input de hora, input de color, select (se usa `<select className={input}>` crudo), estado vacío, checklist. Hay que crearlos o repetir el marcado (admin.md pide subir a `app/components` a la 2.ª vez).
- QR: **no hay generador de QR en admin ni en packages**. Única librería: `qrcode.react ^4.0.0` en `apps/pos/package.json:20` (`import { QRCodeSVG } from "qrcode.react"` en `apps/pos/app/components/recibo-ticket.tsx:3`). Otros "qr" son el QR de TOTP que viene de Supabase como SVG (platform `segundo-factor.tsx`) y la impresión nativa en Epson. Para QR descargable en admin: añadir `qrcode.react` (ya validada en el monorepo) y descargar vía SVG→canvas→PNG.
- `apps/admin/package.json` dependencies: `@supabase/supabase-js ^2.45.0`, `@vim/db`, `@vim/fecha`, `@vim/ui` (workspace), `next ^15.5.25`, `react ^19`, `react-dom ^19`, `zod ^4.6.5`. devDeps: `@types/node ^20`, `@types/react ^19`, `@types/react-dom ^19`, `@vim/config`, `autoprefixer`, `jsdom ^30.1.1`, `postcss`, `tailwindcss ^3.4`, `typescript ^5.6`, `vitest ^3.2.7`. Scripts: `dev` (puerto 3001), `build`, `start`, `typecheck`, `test`. Sin `qrcode.react`, sin color-picker, sin librería de toasts.

## 7. Gating por plan/add-on

- Admin: no hay banner genérico; el patrón es `PedirModulo` (§2) renderizado por el layout de la sección cuando `permitidos.<modulo>` es falso (`estadoLealtad`; inventario usa `estadoInventario` de `A/lib/inventario-plan.ts`). El código de módulo `tienda` ya está en `packages/db/src/modulos.ts` (`CodigoModulo`, `MODULOS[]` con `interruptorDueno: "modulo_tienda_activo"`, `porAddon: true`). Un `A/lib/tienda-plan.ts` análogo (`estadoTienda`, `TIENDA_INCLUYE`, `mensajeQuieroTienda`) sería el molde.
- Platform: `apps/platform/app/components/ficha-contrato.tsx:293-318` pinta el catálogo de add-ons con botón "Activar…/Dar de baja…" (`setPendiente({tipo:"addon_activar"|"addon_desactivar"})`), alimentado por `catalogoAddons` de `apps/platform/app/api/tenants/[id]/route.ts:58-62`: `.from("addons").select(...).eq("activo", true)`. **TIENDA tiene `activo=false` (0161:735-745) → NO aparece en el panel de VIM**: hasta la entrega 7 (que lo activa) no se puede conceder desde el panel; para probar el admin hay que insertar `tenant_addons` a mano o poner `addons.activo=true` en una base de prueba. Además `ADDONS_DEL_PLAN` en `apps/platform/app/lib/cambio-plan.ts:11-15` sólo lista CFDI, DELIVERY, LEALTAD (la pareja TIENDA/`tienda_incluida` queda para entrega 7, según comentario 0161:725-731). `ficha-contrato.tsx:411` tiene un texto "Pierde X" sólo para DELIVERY y LEALTAD.

## 8. Reglas de slug en SQL (0161:561-575)

```sql
slug               text NOT NULL UNIQUE
                   CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
                          AND slug NOT IN ('api', 'admin', 'pedido', 'cuenta', 'privacidad', 'terminos', 'static', 'assets')),
color              text NOT NULL DEFAULT '#111111' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
descripcion        varchar(200) NULL,
aceptacion         text NOT NULL DEFAULT 'MANUAL' CHECK (aceptacion IN ('MANUAL', 'AUTO')),
minutos_aceptacion integer NOT NULL DEFAULT 5 CHECK (minutos_aceptacion BETWEEN 3 AND 15),
pago_efectivo boolean NOT NULL DEFAULT true, pago_tarjeta boolean NOT NULL DEFAULT false,
CONSTRAINT tienda_config_algun_pago CHECK (pago_efectivo OR pago_tarjeta)
```
- Slug: 3-40 caracteres, minúsculas/dígitos/guion, sin guion al inicio o final (el regex admite guiones dobles). Sin comprobación de mayúsculas: el admin debe normalizar (minúsculas, sin acentos, espacios→guion). Sin DEFAULT: **la fila de `tienda_config` no existe hasta que el dueño elige un slug → el primer guardado es INSERT (con `tenant_id`), luego UPDATE**; `slug` es NOT NULL, así que no se puede "crear la fila con valores por omisión" sin slug (se podría sugerir uno desde `tenants.nombre_comercial`).
- Disponibilidad: RLS de `tienda_config` solo deja SELECT de la fila propia (`tenant_id = current_tenant_id()`), así que el admin NO puede consultar si otro negocio ya tomó un slug; sólo se aprende del error del INSERT/UPDATE: Postgres 23505 `duplicate key value violates unique constraint "tienda_config_slug_key"` (nombre auto-generado de la UNIQUE inline; PK = `tienda_config_pkey`, que significaría "ya hay fila" al hacer INSERT). El CHECK inline violado se llama `tienda_config_slug_check` (23514; mismo nombre para formato y reservadas), `tienda_config_color_check`, `tienda_config_algun_pago`. `A/lib/errores.ts` mapea 23505 a "Ya existe un registro con esos datos." y 23514 a "Alguno de los datos no es válido" — genérico: la tienda necesitará su propio traductor por nombre de constraint (como `mensajeLealtad` con `lealtad_premios_producto_uq`). Las palabras reservadas se pueden duplicar en una constante TS y probar en vitest para avisar antes de ir a la base. Una comprobación de disponibilidad previa exigiría una RPC `security definer` nueva (no existe).
- `tienda_sucursales`: PK `sucursal_id`; FK compuesta `tienda_sucursales_sucursal_del_negocio (sucursal_id, tenant_id)`; `horario` solo `CHECK (jsonb_typeof(horario) = 'object')` — **la forma ("HH:MM" y claves "1".."7") NO está validada en SQL**; `tienda_horario_abierto` (0162:18-64) trata cualquier forma mala como cerrado (swallow de errores). Validar en admin (nota de la entrega 2). Cierre menor que apertura = cruza medianoche. `pausa_hasta` la pone la caja (no el admin). Ambas tablas: RLS select por tenant, insert/update/delete `es_admin_del_tenant`, trigger `set_updated_at`; `REVOKE ALL FROM PUBLIC, anon`.

## 9. Pruebas y CI

- Runner: vitest ^3.2.7, `apps/admin/vitest.config.ts` (ver §2). Sólo pruebas de lib pura y libs con `supabase` simulado (`vi.mock("../supabase")`); NO hay pruebas de componentes React (el `include` es `*.test.ts`; los 3 casos con jsdom prueban utilidades de DOM, no componentes). Hay `acceso.test.ts` (tabla de jerarquías) y `modulos.test.ts`.
- E2E: no hay Playwright en admin ni en el repo (solo `sitio-web/_capturas/package.json` para capturas). Verificación visual = a mano o con el navegador.
- CI `.github/workflows/ci.yml`: job `build-and-test` (l.34+): Node 22, pnpm 9.12.0, `pnpm install --frozen-lockfile`, `pnpm tipografia`, `pnpm --filter "./apps/*" -r typecheck` (l.66), `pnpm -r build` (con `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`, `…ANON_KEY=dummy`), `pnpm -r test` (l.81, ejecuta admin), `pnpm test:sitio`, `pnpm test:functions` (incluye `supabase/functions/_shared/tienda/*.test.ts`), `pnpm audit --prod --audit-level=high` (bloqueante). Job aparte `rls-tests` (supabase start + smokes `supabase/scripts/smoke_*.sql`). Una dependencia nueva (p. ej. `qrcode.react`) exige actualizar `pnpm-lock.yaml` (install con `--frozen-lockfile`) y pasa por `pnpm audit --prod`.

## 10. Referencias existentes a la tienda en apps/ y packages/

- Ninguna sección/ruta de admin: `A/(panel)/tienda` NO existe.
- `packages/db/src/modulos.ts`: `CodigoModulo` incluye `"tienda"`; entrada `MODULOS` con `interruptorDueno: "modulo_tienda_activo"`, `porAddon: true` (l.~7 y ~24).
- `packages/db/src/database.types.ts`: `modulo_tienda_activo` en `configuracion_tenant` (l.2177, 2220, 2263); `tienda_config` (l.9882+); `tienda_cuenta_id` en `delivery_pedidos`/tickets (l.3243…). Los tipos de `tienda_sucursales` y de la columna `canal` conviene verificarlos (regenerar tipos fue paso pendiente de la entrega 2).
- `apps/pos/app/lib/pedidos-apps.ts`, `components/pantalla-pedidos-apps.tsx` y `apps/platform/...` solo mencionan "tienda" en el sentido de la tienda de Uber o textos sueltos (no la tienda propia).
- Ningún uso de `TIENDA` (código de add-on) en TS salvo lo anterior.

## Datos útiles extra
- `configuracion_tenant`: la mayoría de negocios no tiene fila hasta el primer ajuste → siempre `upsert({tenant_id, ...}, {onConflict:"tenant_id"})` (comentario en `A/lib/modulos.ts`).
- Admin no tiene `next/image` ni CSP propia; se usa `<img>` directo (p. ej. pantalla-cliente).
