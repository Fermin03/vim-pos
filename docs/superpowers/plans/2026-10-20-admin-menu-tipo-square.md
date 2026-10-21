# Admin: menú desplegable e inicio con pasos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El menú lateral de `apps/admin` pasa a ser un árbol desplegable (estilo Square) que lleva a
todas las páginas, y el inicio muestra los pasos de configuración en lugar de mandar a `/bienvenida`.

**Architecture:** El árbol del menú y toda su lógica (filtrar por rol/módulos/plan, ruta activa,
búsqueda) viven en un módulo puro `lib/menu-admin.ts`, probado con vitest. Un componente
`menu-lateral.tsx` lo pinta con acordeón y buscador; `admin-shell.tsx` solo arma el contexto y lo
monta. Los pasos se pintan con un componente nuevo en el dashboard que reutiliza
`lib/onboarding.ts` y mueve ahí las escrituras de `fase`.

**Tech Stack:** Next.js 15 App Router (client components), React 19, Tailwind con tokens de
`@vim/ui`, vitest (entorno `node`, solo lógica pura).

**Spec:** `docs/superpowers/specs/2026-10-20-admin-menu-tipo-square-design.md` — léelo completo; el
mapa del menú de la spec es la fuente de las etiquetas y rutas.

## Global Constraints

- Todo en el worktree `C:/vwtAdm`, rama `feat/admin-menu`. **Sin push, PR, merge ni despliegue.**
- No cambia ninguna URL. No se agregan dependencias.
- Estilos solo con los tokens/clases que ya usa `admin-shell.tsx` (`bg-ink`, `text-[#C8C8CC]`, etc.).
  Antes de escribir CSS, cargar las skills de Emil Kowalski; antes de escribir código, `ponytail`.
- Permisos sin cambios: `puedeVer` (`lib/acceso.ts`), `rutasOcultas` (`lib/operacion.ts`, ADR 0034),
  "Apps de delivery › Conexión" oculta sin `permitidos.delivery_apps`, etiqueta "Plan Negocio" vía
  `estadoInventario(...) === "no_incluido" && rutaEsDeInventario(href)`.
- Español en nombres de dominio; archivos `kebab-case`; sin `any`.
- Pruebas: `pnpm --filter @vim/admin test` (vitest) y `pnpm --filter @vim/admin typecheck`. **Nunca
  `next build`** (rompe el dev server que comparte `.next`).
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Supervisor (jerarquía 3) o giro sin comedor/domicilio/reservaciones: el menú debe mostrar
   exactamente lo que `puedeVer` + `rutasOcultas` permiten hoy — ni una opción más (Task 1 lo prueba).
2. Página hija (`/catalogo/productos/123`, `/configuracion/cajas/descargar`, `/inventario/compras/nueva`):
   el elemento correcto queda activo y su grupo desplegado (Task 1: `rutaActiva` + `caminoDe`).
3. Mientras cargan módulos/perfil (`null`) el menú no debe parpadear encogiéndose: `null` = no
   esconder nada por módulo (igual que `rutasOcultas(null)`), y sin perfil no se filtra por rol (Task 1).
4. Buscador con acentos/mayúsculas ("configuracion", "CAJA") debe encontrar "Cómo vende tu negocio",
   "Cajas" (Task 1: normalizar NFD).
5. Negocio ya en `GO_LIVE` o rol Supervisor no ve el bloque de pasos; negocio `INVITADO` pasa a
   `EN_CONFIGURACION` al verlo una vez (Task 4: `debeMostrarPasos`).

---

### Task 1: Árbol del menú y su lógica pura

**Files:**
- Create: `apps/admin/app/lib/menu-admin.ts`
- Create: `apps/admin/app/lib/reportes-grupos.ts` (mueve `GRUPOS`, `Reporte`, `Grupo` desde `(panel)/reportes/page.tsx`)
- Modify: `apps/admin/app/(panel)/reportes/page.tsx` (importa de `reportes-grupos.ts`; cada `<section>` lleva `id={g.id}` y `className="scroll-mt-6"`; filtra con `reporteVisible`)
- Test: `apps/admin/app/lib/__tests__/menu-admin.test.ts`, `apps/admin/app/lib/__tests__/reportes-grupos.test.ts`

**Interfaces:**
- Produces (`reportes-grupos.ts`):
  - `GRUPOS: GrupoReportes[]` con `id` nuevo por grupo: `"que-se-vende" | "operacion" | "inventario-costos" | "que-vigilar" | "varias-sucursales"`.
  - `reporteVisible(r: Reporte, disponibles: ReportesDisponibles | null, jerarquia: number | null, verTodos?: boolean): boolean` — misma regla que hoy en la página (sin jerarquía = permitido; sin `disponibles` = visible).
  - `idsGruposVisibles(disponibles: ReportesDisponibles | null, jerarquia: number | null): ReadonlySet<string>` — grupos con al menos un reporte visible (`verTodos = false`).
- Produces (`menu-admin.ts`):
  ```ts
  export type Hoja = { tipo: "hoja"; label: string; href: string; claves?: string[]; icon?: NombreIcono };
  export type Grupo = { tipo: "grupo"; id: string; label: string; hijos: Nodo[]; icon?: NombreIcono };
  export type Nodo = Hoja | Grupo;
  export type MenuAdmin = { principal: Nodo[]; canales: Nodo[] };
  export type ContextoMenu = {
    jerarquia: number | null;              // null = perfil cargando → no filtrar por rol
    ocultas: ReadonlySet<string>;           // rutasOcultas(m) + "/configuracion/integraciones" sin delivery_apps
    tiendaContratada: boolean | null;       // false → el grupo "tienda" se vuelve Hoja "Tienda en línea" → /tienda
    gruposInformes: ReadonlySet<string> | null; // null = no filtrar
  };
  export const MENU: MenuAdmin;
  export function filtrarMenu(menu: MenuAdmin, ctx: ContextoMenu): MenuAdmin;
  export function rutaActiva(menu: MenuAdmin, pathname: string): string | null; // href de la hoja ganadora
  export function caminoDe(menu: MenuAdmin, href: string): string[];            // ids de grupos ancestros
  export function buscarEnMenu(menu: MenuAdmin, texto: string): { label: string; href: string; ruta: string[] }[];
  ```
  `ruta` del resultado = etiquetas de ancestros (p. ej. `["Ajustes", "Dispositivos"]`).

- [ ] **Step 1: Mover `GRUPOS` a `reportes-grupos.ts` y escribir sus pruebas**

```ts
it("un supervisor no ve Inventario y costos (costo de ventas y movimientos piden 4)", () => {
  expect(idsGruposVisibles(TODO_DISPONIBLE, 3).has("inventario-costos")).toBe(false);
});
it("con una sola sucursal no aparece Varias sucursales", () => {
  expect(idsGruposVisibles({ ...TODO_DISPONIBLE, variasSucursales: false }, 5).has("varias-sucursales")).toBe(false);
});
it("sin datos de disponibilidad se muestran todos", () => {
  expect(idsGruposVisibles(null, 5).size).toBe(5);
});
```

- [ ] **Step 2: Escribir `menu-admin.test.ts` (falla: el módulo no existe)**

```ts
const BASE: ContextoMenu = { jerarquia: 5, ocultas: new Set(), tiendaContratada: true, gruposInformes: null };
const hrefs = (m: MenuAdmin) => /* aplanar todas las hojas */;

it("cada ruta del mapa de la spec está en el menú", () => {
  for (const r of ["/dashboard","/catalogo/productos","/catalogo/importar","/inventario/compras","/inventario/proveedores",
    "/inventario/movimientos","/usuarios/repartidores","/configuracion/roles","/configuracion/cajas/descargar",
    "/configuracion/facturacion","/conciliacion","/tienda/menu","/reportes"]) expect(hrefs(MENU)).toContain(r);
});
it("un supervisor ve solo Inicio, Reservaciones, Informes y Conciliación", () => {
  expect(hrefs(filtrarMenu(MENU, { ...BASE, jerarquia: 3 })).map((h) => h.split("#")[0]))
    .toEqual(expect.arrayContaining(["/dashboard", "/reservaciones", "/reportes", "/conciliacion"]));
  expect(hrefs(filtrarMenu(MENU, { ...BASE, jerarquia: 3 })).some((h) => h.startsWith("/configuracion"))).toBe(false);
});
it("perfil cargando (null) no filtra por rol", () => { /* jerarquia null → contiene /configuracion/negocio */ });
it("rutas ocultas por módulo desaparecen y un grupo vacío desaparece entero", () => {
  const m = filtrarMenu(MENU, { ...BASE, ocultas: new Set(["/configuracion/mesas", "/reservaciones"]) });
  expect(hrefs(m)).not.toContain("/configuracion/mesas"); expect(hrefs(m)).not.toContain("/reservaciones");
});
it("sin delivery_apps queda Conciliación sola en Apps de delivery", () => {
  const m = filtrarMenu(MENU, { ...BASE, ocultas: new Set(["/configuracion/integraciones"]) });
  expect(hrefs(m)).toContain("/conciliacion"); expect(hrefs(m)).not.toContain("/configuracion/integraciones");
});
it("tienda sin contratar se vuelve un solo enlace", () => {
  const m = filtrarMenu(MENU, { ...BASE, tiendaContratada: false });
  expect(m.canales.find((n) => n.label === "Tienda en línea")).toMatchObject({ tipo: "hoja", href: "/tienda" });
});
it("Informes muestra solo los grupos visibles", () => {
  const m = filtrarMenu(MENU, { ...BASE, gruposInformes: new Set(["que-se-vende"]) });
  expect(hrefs(m)).toContain("/reportes#que-se-vende"); expect(hrefs(m)).not.toContain("/reportes#varias-sucursales");
});
it("gana el prefijo más largo", () => {
  expect(rutaActiva(MENU, "/configuracion/cajas/descargar")).toBe("/configuracion/cajas/descargar");
  expect(rutaActiva(MENU, "/configuracion/cajas")).toBe("/configuracion/cajas");
  expect(rutaActiva(MENU, "/catalogo/productos/abc")).toBe("/catalogo/productos");
  expect(rutaActiva(MENU, "/inventario/compras/nueva")).toBe("/inventario/compras");
  expect(rutaActiva(MENU, "/reportes/ventas-producto")).toBe("/reportes");
  expect(rutaActiva(MENU, "/configuracion/envios/colonias")).toBe("/configuracion/envios");
});
it("caminoDe da los grupos a desplegar", () => {
  expect(caminoDe(MENU, "/configuracion/cajas")).toEqual(["ajustes", "dispositivos"]);
});
it("el buscador ignora acentos y mayúsculas y usa claves", () => {
  expect(buscarEnMenu(MENU, "CAJA").map((r) => r.href)).toContain("/configuracion/cajas");
  expect(buscarEnMenu(MENU, "configuracion").map((r) => r.label)).toContain("Cómo vende tu negocio");
  expect(buscarEnMenu(MENU, "sello")[0]).toMatchObject({ href: "/configuracion/facturacion", ruta: ["Facturación"] });
  expect(buscarEnMenu(MENU, "  ")).toEqual([]);
});
```

- [ ] **Step 3: Correr y ver que fallan** — `pnpm --filter @vim/admin test -- menu-admin reportes-grupos` → FAIL (módulo no encontrado).

- [ ] **Step 4: Implementar `menu-admin.ts`**

  `MENU` copia literal el mapa de la spec (etiquetas, rutas, orden; ids de grupo:
  `menu, inventario, clientes, informes, personal, facturacion, ajustes, mi-negocio, dispositivos,
  cuenta, tienda, delivery`). Iconos de raíz: Inicio `casa`, Menú `catalogo`, Inventario `caja`,
  Clientes `personas`, Informes `grafica`, Personal `persona`, Facturación `recibo`, Ajustes
  `engrane`, Tienda `bolsa`, Apps de delivery `moto`. Claves de búsqueda mínimas: Cajas
  `["punto de cobro","caja"]`, Conectar computadora `["descargar","instalar","vincular"]`, Datos
  fiscales `["sello","csd","rfc","cfdi"]`, Facturas `["cfdi","factura"]`, Estaciones de preparación
  `["cocina","kds","areas"]`, Promociones `["descuento"]`. Para `puedeVer` y `ocultas` usar
  `href.split("#")[0]`; "Todos los informes" no depende de `gruposInformes`. `rutaActiva`: ignora
  hojas con `#`, elige la hoja con `pathname === href || pathname.startsWith(href + "/")` de href
  más largo. Normalizar búsqueda con `normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()`.

- [ ] **Step 5: Ajustar `reportes/page.tsx`** para importar de `reportes-grupos.ts`, usar
  `reporteVisible` y poner `id` + `scroll-mt-6` a cada sección. Sin otros cambios de comportamiento.

- [ ] **Step 6: Pruebas y tipos** — `pnpm --filter @vim/admin test` → PASS todo;
  `pnpm --filter @vim/admin typecheck` → sin errores.

- [ ] **Step 7: Commit** — `feat(admin): árbol del menú lateral y su lógica (filtros, ruta activa, búsqueda)`

---

### Task 2: Menú lateral desplegable en el shell

**Files:**
- Create: `apps/admin/app/components/menu-lateral.tsx`
- Modify: `apps/admin/app/components/admin-shell.tsx` (borra `NAV`, `Item`, `Seccion` y el `<nav>` de las líneas ~312-348; reemplaza la tarjeta de sucursal ~300-310)

**Interfaces:**
- Consumes: `MENU`, `filtrarMenu`, `rutaActiva`, `caminoDe`, `buscarEnMenu`, `ContextoMenu` (Task 1); `idsGruposVisibles` (Task 1); `leerReportesDisponibles` (`lib/reportes.ts`); `estadoTienda` (`lib/tienda-plan.ts`).
- Produces: `export function MenuLateral(props: { menu: MenuAdmin; pathname: string; marcaPlan: (href: string) => boolean }): JSX.Element`.

- [ ] **Step 1: Armar el contexto en `AdminShell`.** `ocultas` = `rutasOcultas(modulos)` + `"/configuracion/integraciones"` si no `modulos.permitidos.delivery_apps === true` (misma regla que `configuracion/layout.tsx`). `tiendaContratada` = `estadoTienda(modulos) === "cargando" ? null : estadoTienda(modulos) !== "sin_contratar"`. `gruposInformes`: estado nuevo cargado una vez tras el perfil con `leerReportesDisponibles()`, luego `idsGruposVisibles(d, perfil.jerarquia)`; si falla → `null`. `jerarquia` = `perfil?.jerarquia ?? null`.

- [ ] **Step 2: Encabezado del menú.** La tarjeta de sucursal muestra arriba `ayuda.negocio ?? "Tu negocio"` (negrita) y debajo la línea actual (`{sucursales.nombre} · 1 de N sucursales`). Debajo, el buscador (`<input type="search" aria-label="Buscar en el menú">`).

- [ ] **Step 3: Implementar `MenuLateral`.**
  - Estado `abiertos: Set<string>` de ids de grupo. Al cambiar `pathname`: `abiertos = new Set(caminoDe(menu, rutaActiva(menu, pathname)))`.
  - Tocar un grupo: si estaba abierto lo cierra (y sus descendientes); si no, lo abre y cierra sus hermanos del mismo nivel.
  - Grupo = `<button aria-expanded aria-controls>` con chevron (`chevron-abajo`, rotado 180° abierto); hoja = `<Link aria-current="page">` en la activa. Sangría por nivel; raíz con icono, niveles 2 y 3 sin icono.
  - Línea separadora entre `principal` y `canales`.
  - "Plan Negocio" en hojas donde `marcaPlan(href)`; en el grupo Inventario también.
  - Buscador: con texto no vacío, el árbol se reemplaza por la lista plana `buscarEnMenu` (etiqueta + `ruta.join(" › ")` en gris); Enter navega al primero (`router.push`), Esc limpia; sin resultados: "Nada en el menú con «…»". Al navegar se limpia.
  - Despliegue: altura con `grid-template-rows: 0fr → 1fr` ~150 ms `ease-out`, sin animación con `motion-reduce`.
  - Objetivos táctiles: `min-h-[44px]` por debajo de `lg` como los enlaces de hoy.

- [ ] **Step 4: Tipos** — `pnpm --filter @vim/admin typecheck` → sin errores.

- [ ] **Step 5: Verificar en el navegador** (dev server del admin, `pnpm --filter @vim/admin dev`, puerto 3001, contra Supabase local; ver memoria "Rediseño del admin por partes" para entrar sin contraseña): abrir `/configuracion/cajas/descargar` → Ajustes y Dispositivos desplegados, "Conectar computadora" activa; abrir Menú cierra Ajustes; buscar "sello" → Datos fiscales; a 375 px el cajón funciona (Esc, velo, se cierra al navegar). Captura.

- [ ] **Step 6: Commit** — `feat(admin): menú lateral desplegable con buscador`

---

### Task 3: Quitar las sub-navegaciones duplicadas

**Files:**
- Delete: `apps/admin/app/components/config-sidenav.tsx`, `apps/admin/app/components/catalogo-tabs.tsx`, `apps/admin/app/(panel)/configuracion/layout.tsx`
- Modify: las 12 páginas de `(panel)/catalogo/**` que importan `CatalogoTabs` y `components/inventario-desde-negocio.tsx` (quitar import y `<CatalogoTabs />`); `(panel)/tienda/marco.tsx` (quitar `PESTANAS` y `<Pestanas …/>`)
- Keep: `pestanas.tsx`, `lealtad-pestanas.tsx`, `envios-pestanas.tsx`; redirección de `/catalogo` → `/catalogo/categorias` y de `/configuracion` → `/configuracion/negocio`.

**Interfaces:** Consumes Task 2 (el menú ya cubre esas rutas). Produces nada.

- [ ] **Step 1:** Antes de borrar, `git grep -n "config-sidenav\|catalogo-tabs\|ConfigSideNav\|CatalogoTabs"` y también buscar fuera del repo (`.claude/launch.json` de la raíz del workspace y la memoria) por si algo los nombra.
- [ ] **Step 2:** Borrar/quitar lo listado. Si `configuracion/layout.tsx` desaparece, confirmar que ninguna página de configuración dependía de su contenedor `flex` (revisar `/configuracion/negocio` y `/configuracion/cajas` en el navegador: el contenido debe ocupar el ancho completo sin cambiar de altura/scroll).
- [ ] **Step 3:** `pnpm --filter @vim/admin typecheck` y `test` → verde.
- [ ] **Step 4:** Navegador: Catálogo › Productos, Tienda › Pedidos y pagos, Ajustes › Mi negocio › Datos del negocio se ven sin las pestañas/columna y con el menú marcando la opción. Lealtad y Zonas de envío conservan sus pestañas. Captura.
- [ ] **Step 5: Commit** — `refactor(admin): el menú lateral reemplaza las pestañas de catálogo, tienda y configuración`

---

### Task 4: Pasos de configuración en el inicio

**Files:**
- Modify: `apps/admin/app/lib/onboarding.ts` (agrega funciones puras)
- Create: `apps/admin/app/components/pasos-configuracion.tsx`
- Modify: `apps/admin/app/(panel)/dashboard/page.tsx` (reemplaza la tarjeta-enlace a `/bienvenida`, ~líneas 318-324 y 422-437)
- Modify: `apps/admin/app/(panel)/bienvenida/page.tsx` → solo `redirect("/dashboard")`
- Modify: `apps/admin/app/cuenta-confirmada/page.tsx:28` → `router.replace("/dashboard")`
- Test: `apps/admin/app/lib/__tests__/onboarding-pasos.test.ts`

**Interfaces:**
- Produces (`onboarding.ts`):
  ```ts
  export function debeMostrarPasos(fase: OnboardingFase, jerarquia: number | null): boolean; // fase !== "GO_LIVE" && jerarquia !== null && jerarquia >= 4 (misma regla de fase que el aviso de hoy)
  export function resumenPasos(e: EstadoOnboarding, ignorados: ReadonlySet<string>): {
    visibles: PasoOnboarding[];   // excluye opcionales ignorados
    siguiente: string | null;     // clave del primer obligatorio incompleto
    listo: boolean;               // = e.listoParaVender
  };
  ```
- Produces: `export function PasosConfiguracion(props: { estado: EstadoOnboarding; tenantId: string; onTerminar: () => Promise<void> }): JSX.Element`.

- [ ] **Step 1: Pruebas que fallan**

```ts
it("GO_LIVE no muestra pasos", () => {
  expect(debeMostrarPasos("GO_LIVE", 5)).toBe(false);
});
it("un supervisor no ve pasos; perfil cargando tampoco", () => {
  expect(debeMostrarPasos("EN_CONFIGURACION", 3)).toBe(false);
  expect(debeMostrarPasos("INVITADO", null)).toBe(false);
});
it("dueño en configuración sí", () => expect(debeMostrarPasos("EN_CONFIGURACION", 5)).toBe(true));
it("siguiente = primer obligatorio incompleto; ignorar facturación la quita", () => {
  const r = resumenPasos(ESTADO_DOS_DE_CINCO, new Set(["fiscal"]));
  expect(r.siguiente).toBe("caja");
  expect(r.visibles.map((p) => p.clave)).not.toContain("fiscal");
});
it("un obligatorio no se puede ignorar", () => {
  expect(resumenPasos(ESTADO_DOS_DE_CINCO, new Set(["caja"])).visibles.map((p) => p.clave)).toContain("caja");
});
```

- [ ] **Step 2:** Correr → FAIL. **Step 3:** Implementar ambas funciones. **Step 4:** Correr → PASS.

- [ ] **Step 5: `PasosConfiguracion`.** Título «Configura tu negocio para empezar a vender», «Completaste N de M pasos» (obligatorios), barra con `role="progressbar"` (copiar la de `bienvenida/page.tsx` antes de reemplazarla), cuadrícula de tarjetas (1 columna en celular, 2 en `sm`, 3 en `lg`). Tarjeta: marca **SIGUIENTE** en la del `siguiente`, título, descripción, botón (`botonClases` primary en `siguiente`, ghost en el resto; texto como hoy: "Revisar" si completo, "Conectar" en `vincular`, si no "Configurar"); completas atenuadas con "✓ Listo". Opcional: etiqueta "Opcional" + botón «Ignorar» que guarda en `localStorage["vim-admin:pasos-ignorados:" + tenantId]` (JSON de claves, todo en try/catch). Con `listo`: el bloque se reduce a «Tu negocio está listo para vender» + texto actual de cierre + botón **Terminar configuración** → `onTerminar`.
- [ ] **Step 6: Dashboard.** Leer `tenantId` con `leerSesion()`. Si `debeMostrarPasos(onb.fase, perfil?.jerarquia ?? null)`: pintar `PasosConfiguracion` donde estaba el enlace; si `onb.fase === "INVITADO"`, llamar una vez `actualizarFase("EN_CONFIGURACION", 1).catch(() => {})`. `onTerminar` = `actualizarFase("GO_LIVE")` y luego volver a leer el estado (el bloque desaparece). Mientras el bloque está visible y no hay ventas, el estado vacío "Aún no hay ventas" se reduce a una línea.
- [ ] **Step 7:** `/bienvenida` → `redirect("/dashboard")`; `cuenta-confirmada` → `/dashboard`. Dejar `{ prefijo: "/bienvenida", min: 0 }` en `acceso.ts`.
- [ ] **Step 8:** `typecheck` + `test` → verde. Navegador con un negocio nuevo en Supabase local (registrar uno en `/registro` local o usar uno con `fase` ≠ GO_LIVE): ver el bloque, completar un paso y volver (avanza), ignorar Facturación, terminar → desaparece. Con un Supervisor no aparece. Captura en escritorio y 375 px.
- [ ] **Step 9: Commit** — `feat(admin): los pasos de configuración viven en el inicio`

---

### Task 5: Documentar y entregar capturas

**Files:**
- Modify: `docs/diseno/admin.md` (sección de navegación: árbol de la spec, acordeón, buscador, pasos en el inicio; quitar lo que describa la columna de Configuración o las pestañas de catálogo/tienda)

- [ ] **Step 1:** Actualizar `docs/diseno/admin.md`.
- [ ] **Step 2:** Recorrido final en el navegador: cada hoja del menú abre su página (Dueño), menú con Supervisor, giro sin comedor, sin delivery, tienda sin contratar; 375 px sin scroll horizontal. Guardar capturas antes/después en el scratchpad y enviarlas a Fermín.
- [ ] **Step 3:** `test` + `typecheck` verdes. Commit `docs(admin): la navegación nueva en el documento de diseño`.
- [ ] **Step 4:** No hacer push. Avisar a Fermín qué quedó y en qué rama.
