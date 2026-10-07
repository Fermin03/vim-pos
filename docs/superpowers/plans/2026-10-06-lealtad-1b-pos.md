# Lealtad 1B — POS: saldo, canje, ticket impreso y corte: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que quien cobra vea el saldo del cliente y lo que gana, canjee puntos o premios en la cuenta, y que el canje salga bien en el total, en el ticket impreso, en el corte y en la facturación.

**Architecture:** El POS no decide nada de lealtad: lee programa, premios, saldos y canjes bajo RLS, y canjea en dos pasos por la Edge Function `lealtad-canje` (la nube descuenta, la base donde vive el ticket asienta). Toda la lógica vive en tres módulos de `apps/pos/app/lib` (reglas puras, lecturas y llamadas, orquestación del canje) y un solo modal autocontenido que se monta desde la captura y desde la lista de cuentas. Los consumidores de solo lectura (`TotalesTicket`, ticket impreso, `reporte_x`, corte Z) aprenden la columna `tickets.lealtad_mxn`.

**Tech Stack:** Next.js (React, `apps/pos`), TypeScript estricto, Vitest (`environment: node`, solo `*.test.ts`), zod, Tailwind con los tokens de `@vim/ui`, Postgres (una migración chica para `reporte_x`), smokes `.sql` del escritorio.

**Spec:** `docs/superpowers/specs/2026-10-05-lealtad-design.md` (§6 y §13). **ADR:** `docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md` (sección «Lo que queda para los planes 1B y 1C»).

Segundo de tres planes de la entrega 1. Se apila sobre **1A** (rama `feat/lealtad-1a`, PR Fermin03/vim-pos#110, sin mezclar). **1C** (admin `/lealtad`, panel, encendido del add-on, instalador 0.5.0) viene después.

## Global Constraints

- **Rama y worktree:** `feat/lealtad-1b`, creada desde `feat/lealtad-1a`, en el worktree `C:/vwtM`. No se toca `C:/vwtL` (ahí se atiende el PR #110), ni el checkout principal, ni otros worktrees.
- **Prohibido:** `git push`, abrir PR o mezclar sin que Fermín lo pida; `supabase db reset`, `supabase test db`, `supabase start/stop`, `pnpm db:types` (borran o tocan la base local de desarrollo); cualquier cosa contra la nube; leer o usar `.env.local` (apunta a PRODUCCIÓN); `npm run dist`, instaladores, `desktop/bin/`; `npm run verify:push` y `verify:sync` (usan el puerto 54329 de la caja instalada); `next build` (rompe el dev server: comparten `.next`; se usa `tsc --noEmit`).
- **Migraciones:** las `0001`–`0156` no se editan. Este plan crea **dos**: `0157_lealtad_corte.sql` y `0158_lealtad_premio_sin_factura.sql`. Si al empezar alguno de esos números ya existe en `origin/main`, usa los siguientes libres y cámbialos en todo el plan. Corren también en el Postgres de cada caja: deben ser inocuas en local.
- **Orden de salida (no es parte de la ejecución, es regla para mezclar):** `0156`, `0157` y `0158` en producción, `lealtad-canje` desplegada y `autofacturar` **vuelta a desplegar**, todo **antes** de mezclar; el instalador lo hace el plan 1C. Este plan **no** cambia `desktop/package.json` ni publica nada.
- **Todo queda oculto** mientras `modulos.lealtad` no sea `true`. El add-on `LEALTAD` nace inactivo (lo enciende 1C), así que ningún negocio ve nada de esto al mezclar. Cada punto de entrada de la UI se condiciona a `lealtadActiva`.
- **Una venta no se cae por la lealtad.** Toda lectura de lealtad que acompañe a un cobro o a una impresión va en `try/catch` y, si falla, la venta o el papel salen igual, sin lealtad.
- **El canje es descuento, nunca forma de pago.** 1 punto = $1 en `PUNTOS_DINERO`. Un canje vivo por cuenta.
- **La cuenta se guarda antes de canjear** y el `ticket_id` viaja en `canjear` y en `asentar` (la nube ata el canje a esa cuenta y a esa caja).
- **Una cuenta con premio no se factura individual** (decisión de Fermín, 6 oct 2026). El producto de regalo sale en $0.00, y un concepto en cero es justo lo que el SAT puede rechazar. Por eso la cuenta que lleva un premio de producto **no admite factura individual** (ni desde el portal ni desde el admin) y **sí entra en la factura global**, que arma un concepto por ticket y no por producto. Una cuenta que es solo el premio (total $0) queda fuera de la global: no hay ingreso que amparar. El canje de puntos por dinero es un descuento normal y se factura como siempre. Con esto ya no hay compuerta de Facturama: los premios nacen habilitados.
- **TypeScript:** sin `any`. Los archivos `*.test.ts` están fuera del typecheck (`apps/pos/tsconfig.json`), así que un campo nuevo obligatorio no rompe los fixtures, pero sí cualquier literal en código de producción: `pnpm --filter @vim/pos typecheck` es la red.
- **Diseño:** antes de tocar JSX lee `docs/diseno/pos.md` y `docs/diseno/nucleo.md`. Nada de estilos inventados: las clases de este plan salen de `modal-descuento.tsx`, `modal-cliente-cuenta.tsx` y `sidebar-ticket.tsx`. Controles táctiles de 44 px (`h-11`) como mínimo. Una sola acción azul por pantalla. `pnpm tipografia` falla con cualquier `text-[Npx]`.
- **Papel térmico:** `escpos.ts` convierte a `?` todo lo que no sea ASCII 0x20–0x7E después de quitar acentos. En los textos nuevos del ticket no uses `·`, `×`, `¡`, `¿`, `»` ni emojis.
- **Fechas de negocio** en `America/Mexico_City` (UTC−6 fijo, sin horario de verano).
- **Commits** en español, estilo `feat(lealtad): …`, terminados con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Cómo correr pruebas** (siempre con ruta absoluta; el directorio no persiste entre comandos):
  - Un archivo del POS: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/<archivo>.test.ts`
  - Todo el POS: `cd C:/vwtM && pnpm --filter @vim/pos test`
  - Typecheck: `cd C:/vwtM && pnpm --filter @vim/pos typecheck`
  - Smokes SQL: `cd C:/vwtM/desktop && node scripts/smokes.mjs <smoke>.sql` (Postgres embebido, base nueva en cada corrida, ~1 min)

## Alcance: qué entra y qué no

Entra:

| Qué | Dónde se ve |
|---|---|
| Saldo del cliente y lo que gana con la compra | Franja sobre los totales en la pantalla de captura |
| Canjear puntos por dinero; canjear un premio (el producto entra en $0.00) | Modal «Lealtad», desde la captura (Comedor, Para llevar, Pick-up) y desde la lista de cuentas (todos los modos, Domicilio incluido) |
| Quitar el canje de una cuenta abierta | El mismo modal |
| Canje a medias: reintentar sin descontar dos veces | El mismo modal; sobrevive a cerrar la app |
| Renglón «Lealtad» en los totales | Captura, lista de cuentas, consulta de cuentas |
| Pie de lealtad en el ticket impreso y en su vista previa | Ticket del cliente |
| Lealtad en el corte | `reporte_x`, monitor de ventas, corte Z impreso y en pantalla |
| Una cuenta con premio no se factura individual; sí entra en la global | Portal de autofactura, admin, ticket impreso (sin QR de factura) |
| Teléfono en dígitos al registrar un cliente de domicilio | `clientes-domicilio.ts` |

No entra (y quién lo toma):

| Qué | Quién |
|---|---|
| `/lealtad` en el admin, panel `/platform`, reportes del admin, encender el add-on, instalador | Plan 1C |
| Pantalla del cliente con saldo y canje | Entrega 2 |
| QR y página web de consulta | Entrega 3 |
| Elegir modificadores del premio (el premio entra como el producto base, sin modificadores) | Decisión de producto abierta; ver «Límites conocidos» al final |
| Canjear desde la captura en un pedido a Domicilio (el carrito pierde al cliente de domicilio al releer la cuenta) | Se canjea desde la lista de Domicilio |
| Imprimir las promociones en el ticket | Tarea aparte ya sugerida («Imprimir las promociones en el ticket») |

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `apps/pos/app/lib/telefono.ts` (nuevo) | `normalizarTelefono`, sin dependencias, para romper el ciclo cuenta↔domicilio |
| `apps/pos/app/lib/clientes-cuenta.ts` | Reexporta `normalizarTelefono`; `asignarClienteTicket` se niega con un canje vivo |
| `apps/pos/app/lib/clientes-domicilio.ts` | Teléfono en dígitos al registrar; no crea duplicados; búsqueda también por dígitos |
| `apps/pos/app/lib/lealtad-reglas.ts` (nuevo) | Todo lo PURO: tipos, espejo de `lealtad_puntos_por_compra`, textos, máximos, mensajes de error |
| `apps/pos/app/lib/lealtad.ts` (nuevo) | Lecturas bajo RLS y llamadas a `lealtad-canje`; `quitar_canje_lealtad`; quitar un canje recortado |
| `apps/pos/app/lib/lealtad-canje.ts` (nuevo) | Orquestación del canje en pasos reanudables y su registro pendiente en `localStorage` |
| `apps/pos/app/lib/supabase.ts` | `urlFuncion` y `encabezadosFuncion` con la URL de runtime |
| `apps/pos/app/lib/cobro.ts` | `TotalesTicket.lealtad` |
| `apps/pos/app/components/modal-canje-lealtad.tsx` (nuevo) | El modal: saldo, canje de dinero, premios, canje aplicado, canje a medias |
| `apps/pos/app/components/sidebar-ticket.tsx` | Franja de lealtad y renglón «Lealtad» |
| `apps/pos/app/components/home-pos.tsx` | Estado de lealtad, apertura del modal en captura y en lista, guardas (editar premio, antes de cobrar) |
| `apps/pos/app/components/pantalla-cuentas-modo.tsx` | Renglón «Lealtad» y acción «Canjear puntos» |
| `apps/pos/app/components/pantalla-consulta-cuentas.tsx` | Renglón «Lealtad» |
| `apps/pos/app/lib/print/tipos.ts`, `ticket-datos.ts`, `ticket-builder.ts` | Lealtad en los datos, la lectura y el papel |
| `apps/pos/app/components/recibo-ticket.tsx` | Espejo en pantalla del papel |
| `supabase/migrations/0157_lealtad_corte.sql` (nuevo) | `reporte_x` con `lealtad_mxn` |
| `supabase/scripts/smoke_lealtad_corte.sql` (nuevo) | El corte reporta el canje de una cuenta cobrada |
| `apps/pos/app/lib/cierre.ts`, `print/reporte-z-builder.ts`, `components/recibo-z.tsx`, `pantalla-cierre.tsx`, `pantalla-monitor-ventas.tsx` | Lealtad en el corte |
| `supabase/migrations/0158_lealtad_premio_sin_factura.sql` (nuevo) | `ticket_lleva_premio`, candado en `tickets_cfdi`, la global sin cuentas de puro premio |
| `supabase/scripts/smoke_lealtad_factura.sql` (nuevo) | Con premio no hay borrador de factura; con canje de dinero sí; qué entra a la global |
| `supabase/functions/autofacturar/index.ts` | Mensaje propio en el portal para una cuenta con premio |
| `docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md` | Qué cerró 1B y qué sigue abierto |

Pruebas nuevas: `app/lib/__tests__/clientes-domicilio.test.ts`, `lealtad-reglas.test.ts`, `lealtad.test.ts`, `lealtad-canje.test.ts`; casos nuevos en `clientes-cuenta.test.ts`, `cobro.test.ts`, `print/__tests__/ticket-datos.test.ts`, `ticket-builder.test.ts`, `reporte-z-builder.test.ts`. No hay pruebas de componentes en este repo (Vitest corre en `node` y solo `*.test.ts`): la UI se cubre con typecheck y con la prueba manual de la Tarea 12.

## Contrato que este plan consume (ya existe en `feat/lealtad-1a`)

`POST {SUPABASE_URL}/functions/v1/lealtad-canje`, con `apikey` y `Authorization: Bearer <token del empleado>`:

| Acción | Cuerpo | Éxito (200) |
|---|---|---|
| `saldo` | `{ accion, cliente_id?, telefono? }` | `{ ok, cliente_id, saldo, vence_el, mecanica, programa_version }` |
| `canjear` | `{ accion, canje_id, ticket_id, cliente_id?, telefono?, puntos? \| premio_id?, sucursal_id? }` | `{ ok, canje_id, cliente_id, puntos, monto_mxn, premio_id, producto_id, saldo, vence_el, programa_version, ticket_id, caja_id, repetido }` |
| `asentar` | `{ accion, canje_id, ticket_id, ticket_item_id? }` | `{ ok, canje_id }` |

Errores: `409 { ok:false, error }` (negocio: `SALDO_INSUFICIENTE` —trae `saldo`—, `CLIENTE_NO_EXISTE`, `PREMIO_INVALIDO`, `PUNTOS_INVALIDOS`, `MODULO_APAGADO`, `SIN_PROGRAMA`, `CANJE_NO_EXISTE`, `CANJE_REVERTIDO`, `CANJE_DE_OTRA_CUENTA`, `CANJE_DE_OTRA_CAJA` y los 15 de asentar); `403 { error }` (`SIN_MODULO_LEALTAD`, `SOLO_EMPLEADO`, `SIN_TENANT`, `CAJA_NO_VALIDA`); `400` (`FALTAN_CAMPOS`, `BAD_JSON`, `ACCION_INVALIDA`); `503` (`SIN_RED`, `FUNCION_REQUIERE_NUBE`); `502` (`RESPUESTA_INVALIDA`); `500` (`ERROR_INTERNO`). Repetir `canjear` con el mismo `canje_id` devuelve lo mismo con `repetido: true` y no descuenta dos veces.

Bajo RLS el empleado **lee** `lealtad_programa`, `lealtad_premios`, `lealtad_movimientos`, `lealtad_saldos`, `ticket_canjes_lealtad`; **no escribe** ninguna. RPC directas permitidas: `quitar_canje_lealtad(p_ticket_id)`, `modulos_efectivos(p_tenant)`, `lealtad_puntos_por_compra(...)`.

---

## Task 0: Worktree, dependencias y línea base

**Files:**
- Create: worktree `C:/vwtM` (rama `feat/lealtad-1b`)
- Create: `C:/vwtM/docs/superpowers/plans/2026-10-06-lealtad-1b-pos.md` (copia de este plan)

- [ ] **Step 1: Crear el worktree desde la rama de 1A**

```bash
cd "D:/Users/Fermi/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos" && git fetch origin && git worktree add C:/vwtM -b feat/lealtad-1b feat/lealtad-1a
```

Expected: `Preparing worktree (new branch 'feat/lealtad-1b')` y `HEAD is now at cced1b2 …` (o el commit más reciente de `feat/lealtad-1a`).

- [ ] **Step 2: Instalar dependencias del monorepo en el worktree**

```bash
cd C:/vwtM && pnpm install --frozen-lockfile --prefer-offline
```

Expected: termina con `Done in …`. Debe existir `C:/vwtM/apps/pos/node_modules`. Si falla por certificados (Norton intercepta TLS en esta máquina), repite con `--offline`.

- [ ] **Step 3: Enlazar las dependencias del escritorio (solo para correr smokes)**

`desktop/` es un proyecto npm aparte. Para los smokes basta una junction al del checkout principal. **Nunca** se empaqueta un instalador desde un worktree con junction.

```powershell
New-Item -ItemType Junction -Path "C:\vwtM\desktop\node_modules" -Target "D:\Users\Fermi\Documents\VIM MARKETING\Vim-marketing managment\PROYECTOS\VIM POS\vim-pos\desktop\node_modules"
```

Expected: una fila con `Mode d----l` y `Name node_modules`.

- [ ] **Step 4: Confirmar que `0157` y `0158` están libres**

```bash
cd C:/vwtM && git ls-tree --name-only origin/main supabase/migrations/ | tail -2 && ls supabase/migrations | tail -2
```

Expected: la última de `origin/main` es `0155_…` o `0156_…`; la última local es `0156_lealtad.sql`. Si `origin/main` ya tiene una `0157` o una `0158`, usa los siguientes números libres en todo el plan.

- [ ] **Step 5: Línea base**

```bash
cd C:/vwtM && pnpm --filter @vim/pos test 2>&1 | tail -6
cd C:/vwtM && pnpm --filter @vim/pos typecheck 2>&1 | tail -3
cd C:/vwtM/desktop && node scripts/smokes.mjs smoke_lealtad_totales.sql smoke_cierre.sql 2>&1 | tail -5
```

Expected: Vitest en verde (anota el número de archivos y pruebas: es la línea base), typecheck sin errores, los dos smokes `OK`. Si algo falla aquí, es anterior a este plan: detente y repórtalo, no lo arregles.

- [ ] **Step 6: Guardar el plan en la rama**

```bash
mkdir -p C:/vwtM/docs/superpowers/plans && cp "D:/Users/Fermi/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos/docs/superpowers/plans/2026-10-06-lealtad-1b-pos.md" C:/vwtM/docs/superpowers/plans/ && cd C:/vwtM && git add docs/superpowers/plans/2026-10-06-lealtad-1b-pos.md && git commit -m "docs(lealtad): plan 1B del POS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 1: El teléfono se guarda en dígitos también en Domicilio

`clientes-cuenta.ts` ya guarda el teléfono solo con dígitos; `clientes-domicilio.ts` lo guarda con `.trim()`. La lealtad resuelve al cliente por dígitos, así que un mismo número escrito de dos formas crea dos clientes con dos saldos. `clientes-cuenta.ts` ya importa de `clientes-domicilio.ts`, así que `normalizarTelefono` se muda a un módulo sin dependencias.

**Files:**
- Create: `apps/pos/app/lib/telefono.ts`
- Modify: `apps/pos/app/lib/clientes-cuenta.ts:31-33`
- Modify: `apps/pos/app/lib/clientes-domicilio.ts:84-97` y `:161-185`
- Create: `apps/pos/app/lib/__tests__/clientes-domicilio.test.ts`

**Interfaces:**
- Produces: `normalizarTelefono(t: string): string` (en `telefono.ts`, reexportado por `clientes-cuenta.ts`); `filtroBusquedaDomicilio(q: string): string`.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `apps/pos/app/lib/__tests__/clientes-domicilio.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Doble mínimo de PostgREST sobre filas en memoria (el mismo criterio que clientes-cuenta.test.ts):
// aplica los filtros de verdad e inserta, para probar QUÉ queda escrito.
type Fila = Record<string, unknown>;
const { tablas } = vi.hoisted(() => ({ tablas: {} as Record<string, Fila[]> }));

function consulta(tabla: string) {
  let filtros: ((f: Fila) => boolean)[] = [];
  let nueva: Fila | null = null;
  const resolver = () => {
    if (nueva) {
      const fila = { id: `id-${(tablas[tabla] ?? []).length + 1}`, deleted_at: null, ...nueva };
      (tablas[tabla] ??= []).push(fila);
      return { data: [fila], error: null };
    }
    return { data: (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f))), error: null };
  };
  const q = {
    insert: (v: Fila) => { nueva = v; return q; },
    select: () => q,
    eq: (col: string, v: unknown) => { filtros = [...filtros, (f) => f[col] === v]; return q; },
    is: (col: string, v: unknown) => { filtros = [...filtros, (f) => (f[col] ?? null) === v]; return q; },
    limit: () => q,
    single: async () => ({ data: resolver().data[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: resolver().data[0] ?? null, error: null }),
    then: (ok: (r: unknown) => unknown) => Promise.resolve(resolver()).then(ok),
  };
  return q;
}

vi.mock("../supabase", () => ({ employeeClient: () => ({ from: consulta }) }));

import { filtroBusquedaDomicilio, registrarClienteDomicilio } from "../clientes-domicilio";
import { normalizarTelefono } from "../telefono";

const DIR = { etiqueta: "Casa", calle: "Hidalgo", numeroExterior: "12", colonia: "Centro", referencias: "", zona: null };

describe("teléfono de un cliente de domicilio", () => {
  beforeEach(() => {
    tablas.clientes = [{ id: "c-existente", tenant_id: "t", nombre: "Luis", apellido_paterno: "Pérez", telefono: "4779998888", deleted_at: null }];
    tablas.direcciones_cliente = [];
  });

  it("normalizarTelefono deja solo dígitos", () => {
    expect(normalizarTelefono("(477) 123-4567")).toBe("4771234567");
  });

  it("se guarda solo con dígitos, igual que el de una cuenta", async () => {
    // Lo que pase después con la dirección no importa aquí: el cliente ya quedó escrito.
    await registrarClienteDomicilio("tk", { nombre: "Ana", telefono: "477 123-4567", tenantId: "t", sucursalId: "s", dir: DIR as never }).catch(() => {});
    const ana = tablas.clientes.find((f) => f.nombre === "Ana");
    expect(ana?.telefono).toBe("4771234567");
  });

  it("un teléfono que ya existe no crea otro cliente: dice de quién es", async () => {
    const intento = registrarClienteDomicilio("tk", { nombre: "Otro", telefono: "477 999 8888", tenantId: "t", sucursalId: "s", dir: DIR as never });
    await expect(intento).rejects.toThrow(/ya es de Luis Pérez/);
    expect(tablas.clientes).toHaveLength(1);
  });

  it("sin teléfono se registra igual, con teléfono nulo", async () => {
    await registrarClienteDomicilio("tk", { nombre: "Sin Tel", telefono: "  ", tenantId: "t", sucursalId: "s", dir: DIR as never }).catch(() => {});
    expect(tablas.clientes.find((f) => f.nombre === "Sin Tel")?.telefono).toBeNull();
  });
});

describe("búsqueda de clientes de domicilio", () => {
  it("busca el texto tal cual y, si trae dígitos con formato, también solo los dígitos", () => {
    expect(filtroBusquedaDomicilio("477 555")).toBe("telefono.ilike.%477 555%,nombre.ilike.%477 555%,telefono.ilike.%477555%");
  });

  it("un texto sin formato no repite el filtro", () => {
    expect(filtroBusquedaDomicilio("477555")).toBe("telefono.ilike.%477555%,nombre.ilike.%477555%");
    expect(filtroBusquedaDomicilio("ana")).toBe("telefono.ilike.%ana%,nombre.ilike.%ana%");
  });

  it("los caracteres que rompen el .or() no llegan a PostgREST", () => {
    expect(filtroBusquedaDomicilio("a,b(c)")).toBe("telefono.ilike.%a b c %,nombre.ilike.%a b c %");
  });
});
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/clientes-domicilio.test.ts`
Expected: FAIL — no existe `../telefono` ni `filtroBusquedaDomicilio`.

- [ ] **Step 3: Crear `telefono.ts`**

```ts
// El teléfono es la identidad del cliente en la lealtad (ADR 0030): la nube lo compara por dígitos.
// Vive aparte y sin dependencias porque lo usan clientes-cuenta.ts y clientes-domicilio.ts, y el
// primero ya importa del segundo.

/** Deja solo los dígitos: "477 123-4567" y "(477) 1234567" son el mismo número. */
export function normalizarTelefono(t: string): string {
  return t.replace(/\D/g, "");
}
```

- [ ] **Step 4: `clientes-cuenta.ts` reexporta en vez de definir**

En `apps/pos/app/lib/clientes-cuenta.ts`, añade el import junto a los otros y sustituye la función de las líneas 31-33:

```ts
import { normalizarTelefono } from "./telefono";
```

```ts
// Se reexporta: es parte de la interfaz de este módulo desde antes de que existiera telefono.ts.
export { normalizarTelefono };
```

- [ ] **Step 5: `clientes-domicilio.ts` normaliza, no duplica y busca por dígitos**

Añade el import:

```ts
import { normalizarTelefono } from "./telefono";
```

Antes de `buscarClientesDomicilio` (línea 84) añade el filtro puro, y dentro de la función sustituye las dos líneas de `esc` y `.or(...)`:

```ts
/**
 * Filtro `.or()` de la búsqueda de domicilio. Busca el texto tal cual (hay teléfonos viejos guardados
 * con espacios) y, si el texto trae un número con formato, también solo sus dígitos (así se guardan
 * desde la lealtad). Pura, con pruebas.
 */
export function filtroBusquedaDomicilio(q: string): string {
  const esc = q.trim().replace(/[%,()]/g, " ");
  const partes = [`telefono.ilike.%${esc}%`, `nombre.ilike.%${esc}%`];
  const digitos = normalizarTelefono(q);
  if (digitos.length >= 2 && digitos !== esc) partes.push(`telefono.ilike.%${digitos}%`);
  return partes.join(",");
}
```

```ts
  const { data, error } = await sb
    .from("clientes")
    .select("id, nombre, apellido_paterno, telefono, direcciones:direcciones_cliente(id, etiqueta, calle, numero_exterior, colonia, referencias, zona:zonas_envio(id, nombre, costo_mxn))")
    .or(filtroBusquedaDomicilio(term))
    .is("deleted_at", null)
    .limit(8);
```

(Borra la línea `const esc = term.replace(/[%,()]/g, " ");`, que ya no se usa.)

En `registrarClienteDomicilio`, sustituye desde `const sb = employeeClient(token);` hasta el `insert` de `clientes`, y las dos apariciones de `input.telefono.trim() || null`:

```ts
  const sb = employeeClient(token);
  // Solo dígitos, igual que clientes-cuenta.ts: la lealtad identifica al cliente por su teléfono y lo
  // compara por dígitos. El mismo número escrito de dos formas serían dos clientes con dos saldos.
  const telefono = normalizarTelefono(input.telefono) || null;
  if (telefono) {
    const { data: previo, error: e0 } = await sb
      .from("clientes")
      .select("id, nombre, apellido_paterno")
      .eq("telefono", telefono)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (previo) {
      const p = previo as { nombre: string; apellido_paterno: string | null };
      const quien = [p.nombre, p.apellido_paterno].filter(Boolean).join(" ").trim();
      throw new Error(`Ese teléfono ya es de ${quien}. Búscalo por su teléfono y elígelo de la lista.`);
    }
  }
  const { data: cli, error: e1 } = await sb
    .from("clientes")
    .insert({ tenant_id: input.tenantId, nombre: input.nombre.trim(), telefono })
    .select("id")
    .single();
```

y en el `return` final: `telefono,` en lugar de `telefono: input.telefono.trim() || null,`.

- [ ] **Step 6: Correr las pruebas**

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/clientes-domicilio.test.ts app/lib/__tests__/clientes-cuenta.test.ts`
Expected: PASS las dos suites (7 casos nuevos; `clientes-cuenta` sin cambios).

- [ ] **Step 7: Typecheck y commit**

```bash
cd C:/vwtM && pnpm --filter @vim/pos typecheck && git add apps/pos/app/lib/telefono.ts apps/pos/app/lib/clientes-cuenta.ts apps/pos/app/lib/clientes-domicilio.ts apps/pos/app/lib/__tests__/clientes-domicilio.test.ts && git commit -m "fix(clientes): el teléfono de domicilio se guarda en dígitos y no duplica al cliente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Reglas puras de la lealtad en el POS

Todo lo que se puede probar sin red ni base. `puntosPorCompra` es el espejo de `lealtad_puntos_por_compra` (0156 §3) y se prueba con los **mismos seis casos** de `supabase/scripts/smoke_lealtad_ganar.sql:40-46`.

**Files:**
- Create: `apps/pos/app/lib/lealtad-reglas.ts`
- Create: `apps/pos/app/lib/__tests__/lealtad-reglas.test.ts`

**Interfaces:**
- Consumes: `redondearCentavos` de `./dinero`.
- Produces:
  - `type Mecanica = "PUNTOS_DINERO" | "SELLOS" | "PUNTOS_PREMIOS"`
  - `type Programa = { mecanica: Mecanica; version: number; porcentaje: number | null; pesosPorPunto: number | null; compraMinima: number; topeComprasDia: number }`
  - `type Premio = { id: string; productoId: string; nombre: string; costo: number }`
  - `puntosPorCompra(p, base): number`, `baseDeLealtad(total, envio): number`, `maximoCanjeDinero(saldo, total, envio): number`
  - `unidad(mecanica, n): string`, `cantidad(mecanica, n): string`, `fechaCorta(iso): string`
  - `premiosConFaltante(premios, saldo): (Premio & { alcanza: boolean; falta: number })[]`
  - `inicioDelDiaMexico(ahora: Date): string`
  - `canjeRecortado(canje, lealtadMxn): boolean`
  - `franjaLealtad(e): FranjaLealtad`
  - `mensajeErrorLealtad(codigo): string`, `esFalloAmbiguo(codigo): boolean`

- [ ] **Step 1: Escribir la prueba que falla**

Crea `apps/pos/app/lib/__tests__/lealtad-reglas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  baseDeLealtad, canjeRecortado, cantidad, esFalloAmbiguo, fechaCorta, franjaLealtad, inicioDelDiaMexico,
  maximoCanjeDinero, mensajeErrorLealtad, premiosConFaltante, puntosPorCompra, unidad, type Programa,
} from "../lealtad-reglas";

const P = (x: Partial<Programa>): Programa => ({
  mecanica: "PUNTOS_DINERO", version: 1, porcentaje: null, pesosPorPunto: null, compraMinima: 0, topeComprasDia: 3, ...x,
});

// Los MISMOS seis casos de supabase/scripts/smoke_lealtad_ganar.sql:40-46. Si cambias uno aquí,
// cambia el otro: la caja imprime lo que dice el SQL y la pantalla promete lo que dice esto.
describe("puntosPorCompra — espejo de lealtad_puntos_por_compra", () => {
  it.each([
    ["5% de 200 da 10", P({ porcentaje: 5 }), 200, 10],
    ["se redondea hacia abajo", P({ porcentaje: 5 }), 199.99, 9],
    ["bajo la compra mínima no gana", P({ porcentaje: 5, compraMinima: 100 }), 80, 0],
    ["1 punto por cada $10", P({ mecanica: "PUNTOS_PREMIOS", pesosPorPunto: 10 }), 125, 12],
    ["una visita, un sello", P({ mecanica: "SELLOS" }), 45, 1],
    ["una cuenta en cero no gana", P({ mecanica: "SELLOS" }), 0, 0],
  ])("%s", (_nombre, programa, base, esperado) => {
    expect(puntosPorCompra(programa, base)).toBe(esperado);
  });

  it("no hereda errores de coma flotante: 10% de 0.30 no es 0.03 puntos de más ni de menos", () => {
    expect(puntosPorCompra(P({ porcentaje: 10 }), 110)).toBe(11);
    expect(puntosPorCompra(P({ porcentaje: 15 }), 20)).toBe(3);
    expect(puntosPorCompra(P({ mecanica: "PUNTOS_PREMIOS", pesosPorPunto: 0.1 }), 0.3)).toBe(3);
  });

  it("sin parámetro no gana, y una base que no es número tampoco", () => {
    expect(puntosPorCompra(P({}), 200)).toBe(0);
    expect(puntosPorCompra(P({ mecanica: "PUNTOS_PREMIOS" }), 200)).toBe(0);
    expect(puntosPorCompra(P({ porcentaje: 5 }), Number.NaN)).toBe(0);
  });
});

describe("base y máximo del canje", () => {
  it("la base es lo que se paga por comida: el total sin el envío", () => {
    expect(baseDeLealtad(240, 40)).toBe(200);
    expect(baseDeLealtad(30, 40)).toBe(0);
  });

  it("se puede canjear hasta el menor entre el saldo y la comida, en pesos cerrados", () => {
    expect(maximoCanjeDinero(500, 199.5, 0)).toBe(199);
    expect(maximoCanjeDinero(50, 240, 40)).toBe(50);
    expect(maximoCanjeDinero(0, 240, 0)).toBe(0);
    expect(maximoCanjeDinero(-3, 240, 0)).toBe(0);
  });
});

describe("textos", () => {
  it("puntos o sellos, en singular cuando es uno", () => {
    expect(unidad("SELLOS", 1)).toBe("sello");
    expect(unidad("SELLOS", 4)).toBe("sellos");
    expect(unidad("PUNTOS_DINERO", 1)).toBe("punto");
    expect(cantidad("PUNTOS_PREMIOS", 120)).toBe("120 puntos");
  });

  it("la fecha de vencimiento no se mueve de día por la zona horaria", () => {
    expect(fechaCorta("2027-04-05")).toBe("05/04/2027");
    expect(fechaCorta("2027-04-05T00:00:00+00:00")).toBe("05/04/2027");
  });

  it("el día en México empieza a medianoche de México, no de UTC", () => {
    // 6 oct 2026, 03:30 UTC = 5 oct 2026, 21:30 en México.
    expect(inicioDelDiaMexico(new Date("2026-10-06T03:30:00Z"))).toBe("2026-10-05T00:00:00-06:00");
    expect(inicioDelDiaMexico(new Date("2026-10-06T18:00:00Z"))).toBe("2026-10-06T00:00:00-06:00");
  });
});

describe("premios", () => {
  const premios = [
    { id: "b", productoId: "p2", nombre: "Hamburguesa", costo: 8 },
    { id: "a", productoId: "p1", nombre: "Refresco", costo: 3 },
  ];

  it("ordena por costo y dice cuánto falta para cada uno", () => {
    expect(premiosConFaltante(premios, 5)).toEqual([
      { id: "a", productoId: "p1", nombre: "Refresco", costo: 3, alcanza: true, falta: 0 },
      { id: "b", productoId: "p2", nombre: "Hamburguesa", costo: 8, alcanza: false, falta: 3 },
    ]);
  });
});

describe("canje recortado", () => {
  it("un canje de dinero que ya no cabe en la cuenta está recortado", () => {
    expect(canjeRecortado({ ticketItemId: null, monto: 50 }, 30)).toBe(true);
    expect(canjeRecortado({ ticketItemId: null, monto: 50 }, 0)).toBe(true);
  });

  it("uno que entra completo no, y un premio nunca (su renglón se cancela, no se recorta)", () => {
    expect(canjeRecortado({ ticketItemId: null, monto: 50 }, 50)).toBe(false);
    expect(canjeRecortado({ ticketItemId: "it-1", monto: 120 }, 60)).toBe(false);
    expect(canjeRecortado(null, 0)).toBe(false);
  });
});

describe("franja de lealtad de la cuenta", () => {
  const base = { programa: P({ porcentaje: 5 }), saldo: 120, comprasHoy: 0, base: 200, canje: null, online: true };

  it("con saldo y conexión deja canjear y dice lo que gana", () => {
    expect(franjaLealtad(base)).toEqual({ saldoTexto: "120 puntos", detalle: "Gana 10 puntos con esta compra", boton: "Canjear", puedeAbrir: true });
  });

  it("sin conexión no deja canjear y lo dice", () => {
    expect(franjaLealtad({ ...base, online: false })).toEqual({ saldoTexto: "120 puntos", detalle: "Canje no disponible sin conexión", boton: "Canjear", puedeAbrir: false });
  });

  it("sin saldo no hay qué canjear", () => {
    expect(franjaLealtad({ ...base, saldo: 0 }).puedeAbrir).toBe(false);
  });

  it("al llegar al tope del día avisa que esta compra ya no suma", () => {
    expect(franjaLealtad({ ...base, comprasHoy: 3 }).detalle).toBe("Hoy ya no suma: tope de 3 compras al día");
  });

  it("si la compra no gana nada, no promete nada", () => {
    expect(franjaLealtad({ ...base, base: 10 }).detalle).toBeNull();
  });

  it("con un canje aplicado se puede abrir siempre, también sin conexión: quitarlo no necesita nube", () => {
    expect(franjaLealtad({ ...base, online: false, saldo: 0, canje: { puntos: 50 } })).toEqual({
      saldoTexto: "0 puntos", detalle: "Canje aplicado: 50 puntos", boton: "Ver canje", puedeAbrir: true,
    });
  });
});

describe("errores del canje", () => {
  it("cada código que el cajero puede ver tiene un texto en español, sin el código en crudo", () => {
    for (const c of ["SIN_RED", "FUNCION_REQUIERE_NUBE", "SIN_MODULO_LEALTAD", "MODULO_APAGADO", "SOLO_EMPLEADO", "SIN_PROGRAMA",
      "CLIENTE_NO_EXISTE", "SALDO_INSUFICIENTE", "PREMIO_INVALIDO", "PUNTOS_INVALIDOS", "CANJE_REVERTIDO", "CANJE_DE_OTRA_CUENTA",
      "CANJE_DE_OTRA_CAJA", "TICKET_YA_TIENE_CANJE", "TICKET_NO_ABIERTO", "TICKET_SIN_CLIENTE", "CLIENTE_NO_COINCIDE", "RENGLON_NO_ES_PREMIO"]) {
      expect(mensajeErrorLealtad(c)).not.toContain(c);
    }
  });

  it("un código desconocido se muestra, para poder reportarlo", () => {
    expect(mensajeErrorLealtad("ALGO_RARO")).toBe("No se pudo completar el canje (ALGO_RARO).");
  });

  it("ambiguo = no se sabe si la nube alcanzó a descontar; se reintenta con el mismo canje", () => {
    for (const c of ["SIN_RED", "RESPUESTA_INVALIDA", "ERROR_INTERNO", "HTTP_502", "HTTP_500"]) expect(esFalloAmbiguo(c)).toBe(true);
    for (const c of ["SALDO_INSUFICIENTE", "FUNCION_REQUIERE_NUBE", "SIN_MODULO_LEALTAD", "HTTP_403", "CANJE_REVERTIDO"]) expect(esFalloAmbiguo(c)).toBe(false);
  });
});
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/lealtad-reglas.test.ts`
Expected: FAIL — `Cannot find module '../lealtad-reglas'`.

- [ ] **Step 3: Escribir `lealtad-reglas.ts`**

```ts
// Reglas PURAS de la lealtad en el POS (ADR 0030). Sin red, sin base, sin React: todo aquí tiene
// prueba en __tests__/lealtad-reglas.test.ts. Lo que lee o escribe está en lealtad.ts; el canje
// paso a paso, en lealtad-canje.ts.
import { redondearCentavos } from "./dinero";

export type Mecanica = "PUNTOS_DINERO" | "SELLOS" | "PUNTOS_PREMIOS";

/** La fila de `lealtad_programa` que le sirve al POS. */
export type Programa = {
  mecanica: Mecanica;
  version: number;
  porcentaje: number | null;      // PUNTOS_DINERO
  pesosPorPunto: number | null;   // PUNTOS_PREMIOS
  compraMinima: number;
  topeComprasDia: number;
};

/** Un premio del catálogo (`lealtad_premios` + el nombre de su producto). */
export type Premio = { id: string; productoId: string; nombre: string; costo: number };

/**
 * Cuánto gana una compra. ESPEJO de `lealtad_puntos_por_compra` (supabase/migrations/0156_lealtad.sql):
 * si cambias una, cambia la otra, y sus casos de prueba son los mismos. La de SQL es la que escribe
 * el movimiento; esta solo anuncia en pantalla lo que va a pasar.
 *
 * Se calcula en centavos enteros: `0.3 / 0.1` en coma flotante da 2.9999… y perdería un punto que
 * Postgres (numeric) sí da.
 */
export function puntosPorCompra(
  p: Pick<Programa, "mecanica" | "porcentaje" | "pesosPorPunto" | "compraMinima">,
  base: number,
): number {
  if (!Number.isFinite(base) || base <= 0 || base < (p.compraMinima ?? 0)) return 0;
  const baseCent = Math.round(base * 100);
  if (p.mecanica === "SELLOS") return 1;
  if (p.mecanica === "PUNTOS_DINERO") {
    const pctCent = Math.round((p.porcentaje ?? 0) * 100);
    return Math.floor((baseCent * pctCent) / 1_000_000);
  }
  if (p.mecanica === "PUNTOS_PREMIOS") {
    const porPuntoCent = Math.round((p.pesosPorPunto ?? 0) * 100);
    return porPuntoCent > 0 ? Math.floor(baseCent / porPuntoCent) : 0;
  }
  return 0;
}

/** Lo que se paga por comida: el total sin el envío. Es la base de ganar y el techo de canjear. */
export function baseDeLealtad(total: number, envioMxn: number): number {
  return Math.max(0, redondearCentavos(total - Math.max(0, envioMxn)));
}

/** Máximo de puntos-dinero que caben en la cuenta: 1 punto = $1, en pesos cerrados. */
export function maximoCanjeDinero(saldo: number, total: number, envioMxn: number): number {
  return Math.max(0, Math.min(Math.floor(saldo), Math.floor(baseDeLealtad(total, envioMxn))));
}

export function unidad(mecanica: Mecanica, n: number): string {
  if (mecanica === "SELLOS") return n === 1 ? "sello" : "sellos";
  return n === 1 ? "punto" : "puntos";
}

/** "120 puntos", "1 sello". */
export function cantidad(mecanica: Mecanica, n: number): string {
  return `${n} ${unidad(mecanica, n)}`;
}

/** "2027-04-05" → "05/04/2027". Se parte el texto: pasar por `Date` movería el día según la zona. */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function premiosConFaltante(premios: Premio[], saldo: number): (Premio & { alcanza: boolean; falta: number })[] {
  return [...premios]
    .sort((x, y) => x.costo - y.costo)
    .map((p) => ({ ...p, alcanza: saldo >= p.costo, falta: Math.max(0, p.costo - saldo) }));
}

/** Medianoche de HOY en México, como instante. México no tiene horario de verano: UTC−6 fijo. */
export function inicioDelDiaMexico(ahora: Date): string {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
  return `${dia}T00:00:00-06:00`;
}

/**
 * Un canje de DINERO está recortado cuando la cuenta ya no lo aguanta completo (se canceló un
 * platillo después de canjear): `tickets.lealtad_mxn` queda por debajo de lo autorizado, pero el
 * cliente ya pagó todos sus puntos. El POS lo quita y avisa. Un premio no se recorta: si su renglón
 * se cancela, la base devuelve los puntos sola.
 */
export function canjeRecortado(canje: { ticketItemId: string | null; monto: number } | null, lealtadMxn: number): boolean {
  if (!canje || canje.ticketItemId !== null) return false;
  return lealtadMxn + 0.005 < canje.monto;
}

export type FranjaLealtad = { saldoTexto: string; detalle: string | null; boton: "Canjear" | "Ver canje"; puedeAbrir: boolean };

/** Lo que dice la franja de lealtad sobre los totales de la cuenta. */
export function franjaLealtad(e: {
  programa: Programa;
  saldo: number;
  /** Compras de hoy que ya le sumaron a este cliente en esta caja. */
  comprasHoy: number;
  base: number;
  canje: { puntos: number } | null;
  online: boolean;
}): FranjaLealtad {
  const m = e.programa.mecanica;
  const saldoTexto = cantidad(m, Math.max(0, e.saldo));
  if (e.canje) return { saldoTexto, detalle: `Canje aplicado: ${cantidad(m, e.canje.puntos)}`, boton: "Ver canje", puedeAbrir: true };
  if (!e.online) return { saldoTexto, detalle: "Canje no disponible sin conexión", boton: "Canjear", puedeAbrir: false };
  const tope = e.programa.topeComprasDia;
  const gana = puntosPorCompra(e.programa, e.base);
  const detalle = e.comprasHoy >= tope
    ? `Hoy ya no suma: tope de ${tope} compras al día`
    : gana > 0 ? `Gana ${cantidad(m, gana)} con esta compra` : null;
  return { saldoTexto, detalle, boton: "Canjear", puedeAbrir: e.saldo > 0 };
}

const MENSAJES: Record<string, string> = {
  SIN_RED: "Sin conexión con la nube. El canje necesita internet.",
  FUNCION_REQUIERE_NUBE: "Esta caja todavía no está conectada a la nube. El canje necesita internet.",
  SIN_MODULO_LEALTAD: "La lealtad está apagada para este negocio.",
  MODULO_APAGADO: "La lealtad está apagada para este negocio.",
  SOLO_EMPLEADO: "Entra con tu PIN para canjear.",
  SIN_PROGRAMA: "El negocio todavía no configura su programa de lealtad.",
  CLIENTE_NO_EXISTE: "Este cliente todavía no llega a la nube. Espera un minuto y vuelve a intentar.",
  SALDO_INSUFICIENTE: "El saldo ya no alcanza. Revisa el saldo y vuelve a intentar.",
  PREMIO_INVALIDO: "Ese premio ya no está disponible.",
  PUNTOS_INVALIDOS: "La cantidad a canjear no es válida.",
  CANJE_NO_EXISTE: "La nube no tiene ese canje. Empieza uno nuevo.",
  CANJE_REVERTIDO: "Ese canje ya se le devolvió al cliente. Empieza uno nuevo.",
  CANJE_DE_OTRA_CUENTA: "Ese canje es de otra cuenta.",
  CANJE_DE_OTRA_CAJA: "Ese canje se hizo en otra caja.",
  CANJE_NO_COINCIDE: "Ese canje no coincide con el que autorizó la nube.",
  CANJE_YA_ASENTADO: "Ese canje ya se aplicó a otra cuenta.",
  TICKET_YA_TIENE_CANJE: "Esta cuenta ya tiene un canje. Quítalo para poner otro.",
  TICKET_NO_ABIERTO: "Esta cuenta ya se cobró.",
  TICKET_NO_EXISTE: "Esta cuenta ya no existe.",
  TICKET_SIN_CLIENTE: "La cuenta no tiene cliente asignado.",
  CLIENTE_NO_COINCIDE: "El cliente de la cuenta no es el del canje.",
  PREMIO_SIN_RENGLON: "El premio no se pudo aplicar a ese producto.",
  RENGLON_NO_EXISTE: "El premio no se pudo aplicar a ese producto.",
  RENGLON_NO_ES_PREMIO: "El premio no se pudo aplicar a ese producto.",
  RENGLON_NO_APLICA: "El premio no se pudo aplicar a ese producto.",
  MONTO_INVALIDO: "El premio no se pudo aplicar a ese producto.",
};

/** El texto que ve quien cobra. Nunca el código en crudo, salvo que sea uno que no conocemos. */
export function mensajeErrorLealtad(codigo: string): string {
  return MENSAJES[codigo] ?? `No se pudo completar el canje (${codigo}).`;
}

/**
 * ¿No se sabe si la nube alcanzó a descontar? Entonces NO se da por perdido ni por hecho: se guarda
 * el canje a medias y se reintenta con el mismo id (repetirlo no descuenta dos veces).
 * `FUNCION_REQUIERE_NUBE` no es ambiguo: la caja ni siquiera lo mandó.
 */
export function esFalloAmbiguo(codigo: string): boolean {
  return codigo === "SIN_RED" || codigo === "RESPUESTA_INVALIDA" || codigo === "ERROR_INTERNO" || /^HTTP_5\d\d$/.test(codigo);
}
```

- [ ] **Step 4: Correr la prueba**

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/lealtad-reglas.test.ts`
Expected: PASS (todos los casos). Si falla `inicioDelDiaMexico`, el Node de la máquina no trae ICU completo: sustituye el cuerpo por `const mx = new Date(ahora.getTime() - 6 * 3600_000).toISOString().slice(0, 10); return \`${mx}T00:00:00-06:00\`;` y vuelve a correr.

- [ ] **Step 5: Commit**

```bash
cd C:/vwtM && pnpm --filter @vim/pos typecheck && git add apps/pos/app/lib/lealtad-reglas.ts apps/pos/app/lib/__tests__/lealtad-reglas.test.ts && git commit -m "feat(lealtad): reglas puras del POS, con el espejo de lo que gana una compra

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Lecturas bajo RLS y llamadas a `lealtad-canje`

`pedidos-apps.ts` llama a las Edge Functions con la URL del build; en una segunda caja de la red local eso apunta a la propia máquina y no al hub. `supabase.ts` ya resuelve la URL de runtime pero no la exporta: se añaden dos helpers y la lealtad nace usándolos.

**Files:**
- Modify: `apps/pos/app/lib/supabase.ts` (después de `employeeClient`, línea ≈191)
- Modify: `apps/pos/app/lib/cobro.ts:21-35` y `:184-210`
- Create: `apps/pos/app/lib/lealtad.ts`
- Create: `apps/pos/app/lib/__tests__/lealtad.test.ts`
- Modify: `apps/pos/app/lib/__tests__/cobro.test.ts` (fixture de `leerTotales`)

**Interfaces:**
- Consumes: `Mecanica`, `Premio`, `Programa`, `canjeRecortado`, `cantidad`, `inicioDelDiaMexico` de `./lealtad-reglas`; `leerTotales`, `TotalesTicket` de `./cobro`.
- Produces:
  - En `supabase.ts`: `urlFuncion(nombre: string): string`, `encabezadosFuncion(token: string): Record<string, string>`
  - En `cobro.ts`: `TotalesTicket.lealtad: number`
  - En `lealtad.ts`:
    - `leerPrograma(token): Promise<Programa | null>`
    - `leerPremios(token): Promise<Premio[]>`
    - `type ClienteLealtad = { clienteId: string; nombre: string; telefono: string | null }`; `leerClienteLealtad(token, clienteId): Promise<ClienteLealtad | null>`
    - `type SaldoCliente = { saldo: number; venceEl: string | null }`; `leerSaldoLocal(token, clienteId, version): Promise<SaldoCliente>`
    - `comprasQueSumanHoy(token, clienteId, ahora?): Promise<number>`
    - `type CanjeVivo = { id: string; puntos: number; monto: number; premioId: string | null; ticketItemId: string | null }`; `leerCanjeDelTicket(token, ticketId): Promise<CanjeVivo | null>`
    - `quitarCanje(token, ticketId): Promise<number>`
    - `agregarRenglonPremio(token, { ticketId, productoId, clientId }): Promise<string>`
    - `type RespuestaLealtad<T> = ({ ok: true } & T) | { ok: false; error: string; saldo?: number }`
    - `type SaldoNube`, `type CanjeAutorizado`
    - `consultarSaldo(token, { clienteId, telefono })`, `canjear(token, {...})`, `asentar(token, {...})`
    - `quitarCanjeSiQuedoRecortado(token, totales, mecanica): Promise<{ totales: TotalesTicket; aviso: string | null }>`

- [ ] **Step 1: Escribir la prueba que falla**

Crea `apps/pos/app/lib/__tests__/lealtad.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const { tablas, rpcs } = vi.hoisted(() => ({
  tablas: {} as Record<string, Fila[]>,
  rpcs: [] as { nombre: string; args: Fila }[],
}));

// Doble de PostgREST: filtra de verdad sobre filas en memoria.
function consulta(tabla: string) {
  let filtros: ((f: Fila) => boolean)[] = [];
  const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => { filtros = [...filtros, (f) => f[col] === v]; return q; },
    is: (col: string, v: unknown) => { filtros = [...filtros, (f) => (f[col] ?? null) === v]; return q; },
    gte: (col: string, v: string) => { filtros = [...filtros, (f) => new Date(String(f[col])).getTime() >= new Date(v).getTime()]; return q; },
    order: () => q,
    limit: () => q,
    single: async () => ({ data: filas()[0] ?? null, error: filas()[0] ? null : { message: "sin fila" } }),
    maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
    then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: filas(), error: null }).then(ok),
  };
  return q;
}

vi.mock("../supabase", () => ({
  employeeClient: () => ({
    from: consulta,
    rpc: async (nombre: string, args: Fila) => {
      rpcs.push({ nombre, args });
      if (nombre === "quitar_canje_lealtad") {
        for (const c of tablas.ticket_canjes_lealtad ?? []) if (c.ticket_id === args.p_ticket_id) c.revertido = true;
        for (const t of tablas.tickets ?? []) if (t.id === args.p_ticket_id) { t.total_mxn = "80"; t.lealtad_mxn = "0"; }
        return { data: 1, error: null };
      }
      if (nombre === "agregar_item_a_ticket") return { data: "item-nuevo", error: null };
      return { data: null, error: { message: `rpc sin doble: ${nombre}` } };
    },
  }),
  urlFuncion: (n: string) => `http://gw/functions/v1/${n}`,
  encabezadosFuncion: (t: string) => ({ apikey: "anon", Authorization: `Bearer ${t}`, "Content-Type": "application/json" }),
}));

import {
  agregarRenglonPremio, asentar, canjear, comprasQueSumanHoy, consultarSaldo, leerCanjeDelTicket, leerClienteLealtad,
  leerPremios, leerPrograma, leerSaldoLocal, quitarCanje, quitarCanjeSiQuedoRecortado,
} from "../lealtad";
import type { TotalesTicket } from "../cobro";

const TICKET_FILA = {
  id: "tk-1", subtotal_mxn: "68.97", iva_mxn: "11.03", descuentos_manuales_mxn: "0", promociones_mxn: "0", lealtad_mxn: "30",
  total_mxn: "50", monto_pagado_mxn: "0", cambio_mxn: "0", monto_pendiente_mxn: "50", estado_fiscal: "ABIERTO", folio_completo: "KC-1",
};

beforeEach(() => {
  rpcs.length = 0;
  for (const k of Object.keys(tablas)) delete tablas[k];
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("lecturas bajo RLS", () => {
  it("el programa llega con números, no con los textos de numeric", async () => {
    tablas.lealtad_programa = [{ mecanica: "PUNTOS_DINERO", version: 2, porcentaje: "5.00", pesos_por_punto: null, compra_minima_mxn: "100.00", tope_compras_dia: 3 }];
    expect(await leerPrograma("tk")).toEqual({ mecanica: "PUNTOS_DINERO", version: 2, porcentaje: 5, pesosPorPunto: null, compraMinima: 100, topeComprasDia: 3 });
  });

  it("sin programa configurado devuelve null", async () => {
    tablas.lealtad_programa = [];
    expect(await leerPrograma("tk")).toBeNull();
  });

  it("los premios traen el nombre de su producto; los apagados y los borrados no salen", async () => {
    tablas.lealtad_premios = [
      { id: "pr-1", costo: 6, activo: true, deleted_at: null, producto: { id: "p-1", nombre: "Hamburguesa" } },
      { id: "pr-2", costo: 3, activo: false, deleted_at: null, producto: { id: "p-2", nombre: "Refresco" } },
      { id: "pr-3", costo: 9, activo: true, deleted_at: "2026-10-01", producto: { id: "p-3", nombre: "Malteada" } },
      { id: "pr-4", costo: 4, activo: true, deleted_at: null, producto: null },
    ];
    expect(await leerPremios("tk")).toEqual([{ id: "pr-1", productoId: "p-1", nombre: "Hamburguesa", costo: 6 }]);
  });

  it("el cliente de la lealtad: nombre completo y teléfono", async () => {
    tablas.clientes = [{ id: "c-1", nombre: "Ana", apellido_paterno: "Gómez", telefono: "4771234567", deleted_at: null }];
    expect(await leerClienteLealtad("tk", "c-1")).toEqual({ clienteId: "c-1", nombre: "Ana Gómez", telefono: "4771234567" });
    expect(await leerClienteLealtad("tk", "c-x")).toBeNull();
  });

  it("un saldo de otra versión del programa ya no vale", async () => {
    tablas.lealtad_saldos = [{ cliente_id: "c-1", saldo: 120, vence_el: "2027-04-05", programa_version: 1 }];
    expect(await leerSaldoLocal("tk", "c-1", 1)).toEqual({ saldo: 120, venceEl: "2027-04-05" });
    expect(await leerSaldoLocal("tk", "c-1", 2)).toEqual({ saldo: 0, venceEl: null });
    expect(await leerSaldoLocal("tk", "c-nuevo", 1)).toEqual({ saldo: 0, venceEl: null });
  });

  it("cuenta las compras de HOY (hora de México) que ya le sumaron, una por cuenta", async () => {
    tablas.lealtad_movimientos = [
      { cliente_id: "c-1", tipo: "GANADO", ticket_id: "t-a", fecha: "2026-10-06T15:00:00Z" },
      { cliente_id: "c-1", tipo: "GANADO", ticket_id: "t-a", fecha: "2026-10-06T15:05:00Z" },
      { cliente_id: "c-1", tipo: "GANADO", ticket_id: "t-b", fecha: "2026-10-06T17:00:00Z" },
      { cliente_id: "c-1", tipo: "GANADO", ticket_id: "t-ayer", fecha: "2026-10-06T03:00:00Z" }, // 21:00 del 5 en México
      { cliente_id: "c-1", tipo: "CANJE", ticket_id: "t-c", fecha: "2026-10-06T17:00:00Z" },
      { cliente_id: "c-2", tipo: "GANADO", ticket_id: "t-d", fecha: "2026-10-06T17:00:00Z" },
    ];
    expect(await comprasQueSumanHoy("tk", "c-1", new Date("2026-10-06T18:00:00Z"))).toBe(2);
  });

  it("el canje vivo de una cuenta; uno revertido no cuenta", async () => {
    tablas.ticket_canjes_lealtad = [
      { id: "cj-0", ticket_id: "tk-1", puntos: 20, monto_descontado_mxn: "20.00", premio_id: null, ticket_item_id: null, revertido: true },
      { id: "cj-1", ticket_id: "tk-1", puntos: 50, monto_descontado_mxn: "50.00", premio_id: null, ticket_item_id: null, revertido: false },
    ];
    expect(await leerCanjeDelTicket("tk", "tk-1")).toEqual({ id: "cj-1", puntos: 50, monto: 50, premioId: null, ticketItemId: null });
    expect(await leerCanjeDelTicket("tk", "otra")).toBeNull();
  });
});

describe("escrituras directas", () => {
  it("quitar el canje llama a la única RPC que el POS puede usar", async () => {
    expect(await quitarCanje("tk", "tk-1")).toBe(1);
    expect(rpcs).toEqual([{ nombre: "quitar_canje_lealtad", args: { p_ticket_id: "tk-1" } }]);
  });

  it("el premio entra como renglón propio de UNA pieza, sin modificadores, y devuelve su id", async () => {
    expect(await agregarRenglonPremio("tk", { ticketId: "tk-1", productoId: "p-1", clientId: "premio-abc" })).toBe("item-nuevo");
    expect(rpcs[0]).toEqual({
      nombre: "agregar_item_a_ticket",
      args: { p_ticket_id: "tk-1", p_producto_id: "p-1", p_cantidad: 1, p_nota_cocina: "Premio de lealtad", p_modificadores: [], p_client_id_local: "premio-abc" },
    });
  });
});

describe("llamadas a lealtad-canje", () => {
  const responder = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("saldo: manda cliente y teléfono con el token del empleado, a la URL de runtime", async () => {
    const f = responder(200, { ok: true, cliente_id: "c-1", saldo: 120, vence_el: null, mecanica: "PUNTOS_DINERO", programa_version: 1 });
    vi.stubGlobal("fetch", f);
    const r = await consultarSaldo("tk-emp", { clienteId: "c-1", telefono: "4771234567" });
    expect(r).toMatchObject({ ok: true, saldo: 120 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://gw/functions/v1/lealtad-canje");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tk-emp");
    expect(JSON.parse(String(init.body))).toEqual({ accion: "saldo", cliente_id: "c-1", telefono: "4771234567" });
  });

  it("canjear dinero manda puntos y la cuenta; canjear premio manda el premio y no puntos", async () => {
    const f = responder(200, { ok: true, canje_id: "cj", puntos: 50, monto_mxn: 50, premio_id: null, producto_id: null, saldo: 70, repetido: false });
    vi.stubGlobal("fetch", f);
    await canjear("tk", { canjeId: "cj", ticketId: "tk-1", clienteId: "c-1", telefono: null, puntos: 50, sucursalId: "s-1" });
    await canjear("tk", { canjeId: "cj2", ticketId: "tk-1", clienteId: "c-1", telefono: "477", premioId: "pr-1", sucursalId: "s-1" });
    const cuerpos = f.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
    expect(cuerpos[0]).toEqual({ accion: "canjear", canje_id: "cj", ticket_id: "tk-1", cliente_id: "c-1", puntos: 50, sucursal_id: "s-1" });
    expect(cuerpos[1]).toEqual({ accion: "canjear", canje_id: "cj2", ticket_id: "tk-1", cliente_id: "c-1", telefono: "477", premio_id: "pr-1", sucursal_id: "s-1" });
  });

  it("asentar manda el renglón solo si lo hay", async () => {
    const f = responder(200, { ok: true, canje_id: "cj" });
    vi.stubGlobal("fetch", f);
    await asentar("tk", { canjeId: "cj", ticketId: "tk-1" });
    await asentar("tk", { canjeId: "cj", ticketId: "tk-1", ticketItemId: "it-9" });
    const cuerpos = f.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
    expect(cuerpos[0]).toEqual({ accion: "asentar", canje_id: "cj", ticket_id: "tk-1" });
    expect(cuerpos[1]).toEqual({ accion: "asentar", canje_id: "cj", ticket_id: "tk-1", ticket_item_id: "it-9" });
  });

  it("un 409 de negocio devuelve su código y, si viene, el saldo real", async () => {
    vi.stubGlobal("fetch", responder(409, { ok: false, error: "SALDO_INSUFICIENTE", saldo: 12 }));
    expect(await canjear("tk", { canjeId: "cj", ticketId: "tk-1", clienteId: "c-1", telefono: null, puntos: 50, sucursalId: "s" }))
      .toEqual({ ok: false, error: "SALDO_INSUFICIENTE", saldo: 12 });
  });

  it("los errores sin `ok` (403, 503) también llegan con su código", async () => {
    vi.stubGlobal("fetch", responder(503, { error: "FUNCION_REQUIERE_NUBE", funcion: "lealtad-canje" }));
    expect(await consultarSaldo("tk", { clienteId: "c-1", telefono: null })).toEqual({ ok: false, error: "FUNCION_REQUIERE_NUBE" });
  });

  it("si la red se cae es SIN_RED; si contestan algo que no es JSON, HTTP_<status>", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await consultarSaldo("tk", { clienteId: "c-1", telefono: null })).toEqual({ ok: false, error: "SIN_RED" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    expect(await consultarSaldo("tk", { clienteId: "c-1", telefono: null })).toEqual({ ok: false, error: "HTTP_502" });
  });

  it("un 200 sin ok:true no se da por bueno", async () => {
    vi.stubGlobal("fetch", responder(200, { cliente_id: "c-1" }));
    expect(await consultarSaldo("tk", { clienteId: "c-1", telefono: null })).toEqual({ ok: false, error: "HTTP_200" });
  });
});

describe("canje de dinero recortado antes de cobrar", () => {
  const totales: TotalesTicket = {
    ticketId: "tk-1", subtotal: 68.97, iva: 11.03, descuentos: 0, promociones: 0, lealtad: 30, total: 50,
    montoPagado: 0, cambio: 0, pendiente: 50, estadoFiscal: "ABIERTO", folio: "KC-1",
  };

  beforeEach(() => { tablas.tickets = [{ ...TICKET_FILA }]; });

  it("si la cuenta ya no aguanta el canje completo, lo quita, relee el total y avisa", async () => {
    tablas.ticket_canjes_lealtad = [{ id: "cj-1", ticket_id: "tk-1", puntos: 50, monto_descontado_mxn: "50", premio_id: null, ticket_item_id: null, revertido: false }];
    const r = await quitarCanjeSiQuedoRecortado("tk", totales, "PUNTOS_DINERO");
    expect(rpcs.map((x) => x.nombre)).toEqual(["quitar_canje_lealtad"]);
    expect(r.totales.total).toBe(80);
    expect(r.totales.lealtad).toBe(0);
    expect(r.aviso).toMatch(/50 puntos/);
    expect(r.aviso).toMatch(/volvieron/);
  });

  it("un canje que entra completo no se toca", async () => {
    tablas.ticket_canjes_lealtad = [{ id: "cj-1", ticket_id: "tk-1", puntos: 30, monto_descontado_mxn: "30", premio_id: null, ticket_item_id: null, revertido: false }];
    const r = await quitarCanjeSiQuedoRecortado("tk", totales, "PUNTOS_DINERO");
    expect(rpcs).toEqual([]);
    expect(r).toEqual({ totales, aviso: null });
  });

  it("sin canje no hace nada", async () => {
    tablas.ticket_canjes_lealtad = [];
    expect(await quitarCanjeSiQuedoRecortado("tk", { ...totales, lealtad: 0 }, "PUNTOS_DINERO")).toMatchObject({ aviso: null });
    expect(rpcs).toEqual([]);
  });
});
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/lealtad.test.ts`
Expected: FAIL — `Cannot find module '../lealtad'`.

- [ ] **Step 3: Exportar la URL de runtime en `supabase.ts`**

Justo después de `employeeClient` (línea ≈191):

```ts
/**
 * URL de una Edge Function con la URL de RUNTIME. En una segunda caja de la red local
 * `window.__VIM_SUPABASE_URL` apunta al hub; la URL del build (`process.env`) apuntaría a esta
 * misma máquina, que no tiene gateway. Las funciones nuevas se llaman con esto.
 */
export function urlFuncion(nombre: string): string {
  return `${URL}/functions/v1/${nombre}`;
}

/** Encabezados para llamar una Edge Function como el empleado que tiene la sesión. */
export function encabezadosFuncion(token: string): Record<string, string> {
  return { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}
```

- [ ] **Step 4: `TotalesTicket` aprende `lealtad`**

En `apps/pos/app/lib/cobro.ts`, dentro de `TotalesTicket`, después de `promociones`:

```ts
  /** Lo descontado por canje de lealtad (puntos por dinero o un premio de producto). Tercer carril,
   *  aparte de `descuentos` y `promociones`: lo mantiene la base en `tickets.lealtad_mxn` (0156). */
  lealtad: number;
```

En `leerTotales`: añade `lealtad_mxn` al `.select(...)` (después de `promociones_mxn`), `lealtad_mxn: string | number;` al tipo de `t`, y en el objeto devuelto, después de `promociones`:

```ts
    lealtad: Number(t.lealtad_mxn ?? 0),
```

En `apps/pos/app/lib/__tests__/cobro.test.ts`, en el fixture de la fila `tickets` (línea ≈33, donde dice `descuentos_manuales_mxn: "0", promociones_mxn: "0"`), añade `lealtad_mxn: "0"`.

- [ ] **Step 5: Escribir `lealtad.ts`**

```ts
"use client";
// Lealtad en el POS (ADR 0030): lo que LEE bajo RLS y lo que LLAMA. El POS no escribe el libro, ni
// los saldos, ni los canjes: eso lo hacen funciones de la base. Sus únicas escrituras directas son
// quitar el canje de una cuenta abierta y agregar el renglón de un premio.
//
// El canje va por la Edge Function `lealtad-canje`, igual desde el POS web que desde la caja: en la
// caja el gateway local la atiende y la reenvía a la nube (desktop/src/lealtad-puente.mjs).
import { employeeClient, encabezadosFuncion, urlFuncion } from "./supabase";
import { leerTotales, type TotalesTicket } from "./cobro";
import { canjeRecortado, cantidad, inicioDelDiaMexico, type Mecanica, type Premio, type Programa } from "./lealtad-reglas";

const num = (v: unknown): number => Number(v ?? 0);

/** El programa del negocio, o null si el dueño todavía no lo configura. */
export async function leerPrograma(token: string): Promise<Programa | null> {
  const { data, error } = await employeeClient(token)
    .from("lealtad_programa")
    .select("mecanica, version, porcentaje, pesos_por_punto, compra_minima_mxn, tope_compras_dia")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const p = data as {
    mecanica: Mecanica; version: number; porcentaje: string | number | null; pesos_por_punto: string | number | null;
    compra_minima_mxn: string | number; tope_compras_dia: number;
  };
  return {
    mecanica: p.mecanica,
    version: Number(p.version),
    porcentaje: p.porcentaje == null ? null : Number(p.porcentaje),
    pesosPorPunto: p.pesos_por_punto == null ? null : Number(p.pesos_por_punto),
    compraMinima: num(p.compra_minima_mxn),
    topeComprasDia: Number(p.tope_compras_dia),
  };
}

/** Premios activos con el nombre de su producto. Uno cuyo producto ya no existe no se ofrece. */
export async function leerPremios(token: string): Promise<Premio[]> {
  const { data, error } = await employeeClient(token)
    .from("lealtad_premios")
    .select("id, costo, producto:productos(id, nombre)")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("costo", { ascending: true });
  if (error) throw new Error(error.message);
  type Fila = { id: string; costo: number; producto: { id: string; nombre: string } | { id: string; nombre: string }[] | null };
  return ((data ?? []) as unknown as Fila[]).flatMap((f) => {
    const prod = Array.isArray(f.producto) ? f.producto[0] : f.producto;
    return prod ? [{ id: f.id, productoId: prod.id, nombre: prod.nombre, costo: Number(f.costo) }] : [];
  });
}

export type ClienteLealtad = { clienteId: string; nombre: string; telefono: string | null };

export async function leerClienteLealtad(token: string, clienteId: string): Promise<ClienteLealtad | null> {
  const { data, error } = await employeeClient(token)
    .from("clientes")
    .select("id, nombre, apellido_paterno, telefono")
    .eq("id", clienteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const c = data as { id: string; nombre: string; apellido_paterno: string | null; telefono: string | null };
  return { clienteId: c.id, nombre: [c.nombre, c.apellido_paterno].filter(Boolean).join(" ").trim(), telefono: c.telefono };
}

export type SaldoCliente = { saldo: number; venceEl: string | null };

/**
 * El saldo que esta base conoce. En la caja es la copia que baja el pull más lo ganado aquí sin
 * subir: sirve para MOSTRAR, también sin internet. Para canjear manda el de la nube (consultarSaldo).
 */
export async function leerSaldoLocal(token: string, clienteId: string, version: number): Promise<SaldoCliente> {
  const { data, error } = await employeeClient(token)
    .from("lealtad_saldos")
    .select("saldo, vence_el, programa_version")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const s = data as { saldo: number; vence_el: string | null; programa_version: number } | null;
  // Un saldo de otra versión del programa ya no vale (el dueño cambió de mecánica).
  if (!s || Number(s.programa_version) !== version) return { saldo: 0, venceEl: null };
  return { saldo: Number(s.saldo), venceEl: s.vence_el };
}

/**
 * Cuántas cuentas de HOY ya le sumaron a este cliente en esta base, para anunciar el tope diario.
 * Aproxima la regla de `lealtad_acumular_por_ticket`: no descuenta las compras revertidas del día.
 * Solo decide un texto en pantalla; quien otorga o no los puntos es la base.
 */
export async function comprasQueSumanHoy(token: string, clienteId: string, ahora: Date = new Date()): Promise<number> {
  const { data, error } = await employeeClient(token)
    .from("lealtad_movimientos")
    .select("ticket_id")
    .eq("cliente_id", clienteId)
    .eq("tipo", "GANADO")
    .gte("fecha", inicioDelDiaMexico(ahora));
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { ticket_id: string | null }[]).map((m) => m.ticket_id).filter(Boolean)).size;
}

export type CanjeVivo = { id: string; puntos: number; monto: number; premioId: string | null; ticketItemId: string | null };

/** El canje vivo de una cuenta (solo cabe uno), o null. */
export async function leerCanjeDelTicket(token: string, ticketId: string): Promise<CanjeVivo | null> {
  const { data, error } = await employeeClient(token)
    .from("ticket_canjes_lealtad")
    .select("id, puntos, monto_descontado_mxn, premio_id, ticket_item_id")
    .eq("ticket_id", ticketId)
    .eq("revertido", false)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const c = data as { id: string; puntos: number; monto_descontado_mxn: string | number; premio_id: string | null; ticket_item_id: string | null };
  return { id: c.id, puntos: Number(c.puntos), monto: num(c.monto_descontado_mxn), premioId: c.premio_id, ticketItemId: c.ticket_item_id };
}

/** Quita el canje de una cuenta que sigue abierta: los puntos vuelven. Funciona sin internet. */
export async function quitarCanje(token: string, ticketId: string): Promise<number> {
  const { data, error } = await employeeClient(token).rpc("quitar_canje_lealtad", { p_ticket_id: ticketId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * El renglón de un premio: el producto, UNA pieza, sin modificadores (así lo exige
 * `lealtad_asentar_canje`). Devuelve el id del renglón, que es lo que se manda al asentar.
 * Repetirlo con el mismo `clientId` no agrega otro: `agregar_item_a_ticket` es idempotente por él.
 */
export async function agregarRenglonPremio(
  token: string,
  a: { ticketId: string; productoId: string; clientId: string },
): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("agregar_item_a_ticket", {
    p_ticket_id: a.ticketId,
    p_producto_id: a.productoId,
    p_cantidad: 1,
    p_nota_cocina: "Premio de lealtad",
    p_modificadores: [],
    p_client_id_local: a.clientId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// ── Edge Function lealtad-canje ───────────────────────────────────────────────────────────────

export type RespuestaLealtad<T> = ({ ok: true } & T) | { ok: false; error: string; saldo?: number };

export type SaldoNube = { cliente_id: string; saldo: number; vence_el: string | null; mecanica: Mecanica; programa_version: number };
export type CanjeAutorizado = {
  canje_id: string; puntos: number; monto_mxn: number | null; premio_id: string | null; producto_id: string | null;
  saldo: number; repetido: boolean;
};

async function llamar<T>(token: string, cuerpo: Record<string, unknown>): Promise<RespuestaLealtad<T>> {
  let r: Response;
  try {
    r = await fetch(urlFuncion("lealtad-canje"), {
      method: "POST",
      headers: encabezadosFuncion(token),
      body: JSON.stringify(cuerpo),
      // La caja espera hasta 15 s a la nube (lealtad-puente.mjs); aquí un poco más, para no rendirse antes.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, error: "SIN_RED" };
  }
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (r.ok && j?.ok === true) return j as unknown as { ok: true } & T;
  const error = typeof j?.error === "string" ? j.error : `HTTP_${r.status}`;
  return { ok: false, error, ...(typeof j?.saldo === "number" ? { saldo: j.saldo } : {}) };
}

/** Solo viajan los campos que tienen valor: `validarCuerpo` rechaza un uuid vacío. */
function sinVacios(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

/** El saldo de verdad, el de la nube. Es también la prueba de que hay conexión para canjear. */
export function consultarSaldo(token: string, c: { clienteId: string; telefono: string | null }): Promise<RespuestaLealtad<SaldoNube>> {
  return llamar<SaldoNube>(token, sinVacios({ accion: "saldo", cliente_id: c.clienteId, telefono: c.telefono }));
}

/** Paso 1: la nube descuenta. Repetir con el mismo `canjeId` devuelve lo mismo y no descuenta dos veces. */
export function canjear(
  token: string,
  a: { canjeId: string; ticketId: string; clienteId: string; telefono: string | null; puntos?: number; premioId?: string; sucursalId: string },
): Promise<RespuestaLealtad<CanjeAutorizado>> {
  return llamar<CanjeAutorizado>(token, sinVacios({
    accion: "canjear", canje_id: a.canjeId, ticket_id: a.ticketId, cliente_id: a.clienteId, telefono: a.telefono,
    puntos: a.puntos, premio_id: a.premioId, sucursal_id: a.sucursalId,
  }));
}

/** Paso 2: el canje autorizado se pega a la cuenta, en la base donde vive (la caja o la nube). */
export function asentar(
  token: string,
  a: { canjeId: string; ticketId: string; ticketItemId?: string | null },
): Promise<RespuestaLealtad<{ canje_id: string }>> {
  return llamar<{ canje_id: string }>(token, sinVacios({
    accion: "asentar", canje_id: a.canjeId, ticket_id: a.ticketId, ticket_item_id: a.ticketItemId,
  }));
}

/**
 * Antes de cobrar: si la cuenta bajó por debajo de un canje de dinero (se canceló un platillo), la
 * base recorta el descuento pero el cliente ya pagó todos sus puntos. Se quita el canje completo
 * —los puntos vuelven— y se avisa, para que quien cobra lo vuelva a poner por lo que sí cabe.
 */
export async function quitarCanjeSiQuedoRecortado(
  token: string,
  totales: TotalesTicket,
  mecanica: Mecanica,
): Promise<{ totales: TotalesTicket; aviso: string | null }> {
  const canje = await leerCanjeDelTicket(token, totales.ticketId);
  if (!canje || !canjeRecortado(canje, totales.lealtad)) return { totales, aviso: null };
  await quitarCanje(token, totales.ticketId);
  return {
    totales: await leerTotales(token, totales.ticketId),
    aviso: `Se quitó el canje de ${cantidad(mecanica, canje.puntos)} porque la cuenta bajó a menos de eso. Los puntos volvieron al cliente. Si los quiere usar, vuelve a canjear.`,
  };
}
```

- [ ] **Step 6: Correr las pruebas**

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/lealtad.test.ts app/lib/__tests__/cobro.test.ts`
Expected: PASS las dos.

- [ ] **Step 7: Typecheck: encontrar cada literal de `TotalesTicket`**

Run: `cd C:/vwtM && pnpm --filter @vim/pos typecheck`
Expected: sin errores, o errores `Property 'lealtad' is missing in type … TotalesTicket` en código de producción que construya el objeto a mano. En cada uno añade `lealtad: 0` (o `lealtad: Number(fila.lealtad_mxn ?? 0)` si ahí hay una fila de `tickets` leída con su propio select: entonces añade también `lealtad_mxn` a ese select). Repite hasta que pase.

- [ ] **Step 8: Commit**

```bash
cd C:/vwtM && git add apps/pos/app/lib && git commit -m "feat(lealtad): el POS lee programa, premios, saldo y canje, y llama a lealtad-canje

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: El canje paso a paso, reanudable

Un canje son hasta tres pasos contra dos sistemas, y cualquiera puede fallar a la mitad. El orden está elegido para que **lo que falla con más facilidad (la red) falle antes de gastar nada que no se pueda recuperar desde la caja**:

1. **Premio:** primero entra a la cuenta su renglón (escritura local, casi no falla; si falla, no se descontó nada).
2. **`canjear`** en la nube. Rechazo de negocio → nada se descontó; el renglón del premio se cancela solo si se puede. Fallo ambiguo (sin red, 5xx) → queda **a medias** y se reintenta con el mismo `canje_id`.
3. **`asentar`** en la base del ticket. Fallo reintentable → a medias. Rechazo definitivo → los puntos quedaron gastados y vuelven solos en 48 h (red de seguridad de la nube): se dice claro, desde la caja no hay cómo deshacerlo.

El canje a medias se guarda en `localStorage`, por cuenta, para que sobreviva a cerrar el modal o la app.

**Files:**
- Create: `apps/pos/app/lib/lealtad-canje.ts`
- Create: `apps/pos/app/lib/__tests__/lealtad-canje.test.ts`

**Interfaces:**
- Consumes: `agregarRenglonPremio`, `asentar`, `canjear`, `ClienteLealtad`, `RespuestaLealtad`, `CanjeAutorizado` de `./lealtad`; `cantidad`, `esFalloAmbiguo`, `mensajeErrorLealtad`, `Mecanica`, `Premio` de `./lealtad-reglas`; `nuevoClientId` de `./carrito`; `cancelarItem` de `./cancelacion`.
- Produces:
  - `type Pendiente` (zod), `type Almacen = { getItem(k): string | null; setItem(k, v): void }`
  - `almacenLocal(): Almacen`, `leerPendiente(almacen, ticketId): Pendiente | null`, `guardarPendiente(almacen, p): void`, `borrarPendiente(almacen, ticketId): void`
  - `nuevoCanjeDinero({ ticketId, sucursalId, cliente, mecanica, puntos }): Pendiente`
  - `nuevoCanjePremio({ ticketId, sucursalId, cliente, mecanica, premio }): Pendiente`
  - `type OpsCanje`, `opsReales(token): OpsCanje`
  - `type ResultadoCanje = { estado: "APLICADO" } | { estado: "RECHAZADO"; mensaje } | { estado: "A_MEDIAS"; mensaje; pendiente } | { estado: "PUNTOS_GASTADOS"; mensaje }`
  - `avanzarCanje(ops, almacen, pendiente): Promise<ResultadoCanje>`

- [ ] **Step 1: Escribir la prueba que falla**

Crea `apps/pos/app/lib/__tests__/lealtad-canje.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  avanzarCanje, borrarPendiente, guardarPendiente, leerPendiente, nuevoCanjeDinero, nuevoCanjePremio,
  type Almacen, type OpsCanje, type Pendiente,
} from "../lealtad-canje";

function memoria(): Almacen & { crudo: Map<string, string> } {
  const crudo = new Map<string, string>();
  return { crudo, getItem: (k) => crudo.get(k) ?? null, setItem: (k, v) => { crudo.set(k, v); } };
}

const ANA = { clienteId: "c-1", nombre: "Ana Gómez", telefono: "4771234567" };
const HAMBURGUESA = { id: "pr-1", productoId: "p-1", nombre: "Hamburguesa", costo: 6 };

type Guion = {
  agregar?: () => Promise<string>;
  canjear?: () => Awaited<ReturnType<OpsCanje["canjear"]>>;
  asentar?: () => Awaited<ReturnType<OpsCanje["asentar"]>>;
  cancelar?: () => Promise<void>;
};

/** Operaciones de mentira que anotan en qué orden se llamaron y con qué. */
function ops(g: Guion = {}) {
  const llamadas: [string, unknown][] = [];
  const o: OpsCanje = {
    agregarRenglon: async (a) => { llamadas.push(["agregar", a]); return g.agregar ? g.agregar() : "it-9"; },
    canjear: async (a) => {
      llamadas.push(["canjear", a]);
      return g.canjear ? g.canjear() : { ok: true, canje_id: a.canjeId, puntos: a.puntos ?? 6, monto_mxn: a.puntos ?? null, premio_id: a.premioId ?? null, producto_id: null, saldo: 0, repetido: false };
    },
    asentar: async (a) => { llamadas.push(["asentar", a]); return g.asentar ? g.asentar() : { ok: true, canje_id: a.canjeId }; },
    cancelarRenglon: async (id) => { llamadas.push(["cancelar", id]); if (g.cancelar) await g.cancelar(); },
  };
  return { o, llamadas, nombres: () => llamadas.map((l) => l[0]) };
}

let alm: ReturnType<typeof memoria>;
let dinero: Pendiente;
let premio: Pendiente;

beforeEach(() => {
  alm = memoria();
  dinero = nuevoCanjeDinero({ ticketId: "tk-1", sucursalId: "s-1", cliente: ANA, mecanica: "PUNTOS_DINERO", puntos: 50 });
  premio = nuevoCanjePremio({ ticketId: "tk-1", sucursalId: "s-1", cliente: ANA, mecanica: "SELLOS", premio: HAMBURGUESA });
});

describe("canje de dinero", () => {
  it("camino feliz: la nube descuenta, la cuenta lo asienta, y no queda nada pendiente", async () => {
    const t = ops();
    expect(await avanzarCanje(t.o, alm, dinero)).toEqual({ estado: "APLICADO" });
    expect(t.nombres()).toEqual(["canjear", "asentar"]);
    expect(t.llamadas[0][1]).toEqual({ canjeId: dinero.canjeId, ticketId: "tk-1", clienteId: "c-1", telefono: "4771234567", puntos: 50, sucursalId: "s-1" });
    expect(t.llamadas[1][1]).toEqual({ canjeId: dinero.canjeId, ticketId: "tk-1", ticketItemId: null });
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });

  it("la nube lo rechaza: no se descontó nada, no se asienta y no queda pendiente", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "SALDO_INSUFICIENTE", saldo: 12 }) });
    const r = await avanzarCanje(t.o, alm, dinero);
    expect(r.estado).toBe("RECHAZADO");
    expect(r.estado === "RECHAZADO" && r.mensaje).toMatch(/No se descontó nada/);
    expect(t.nombres()).toEqual(["canjear"]);
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });

  it("sin red al canjear: queda a medias, y el reintento usa el MISMO canje", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "SIN_RED" }) });
    const r = await avanzarCanje(t.o, alm, dinero);
    expect(r.estado).toBe("A_MEDIAS");
    const guardado = leerPendiente(alm, "tk-1");
    expect(guardado).toMatchObject({ canjeId: dinero.canjeId, paso: "CANJEAR" });

    const t2 = ops();
    expect(await avanzarCanje(t2.o, alm, guardado as Pendiente)).toEqual({ estado: "APLICADO" });
    expect((t2.llamadas[0][1] as { canjeId: string }).canjeId).toBe(dinero.canjeId);
  });

  it("sin red al asentar: queda a medias en ASENTAR, y el reintento ya no vuelve a canjear", async () => {
    const t = ops({ asentar: () => ({ ok: false, error: "SIN_RED" }) });
    const r = await avanzarCanje(t.o, alm, dinero);
    expect(r.estado).toBe("A_MEDIAS");
    expect(r.estado === "A_MEDIAS" && r.mensaje).toMatch(/no se descuentan dos veces/);
    const guardado = leerPendiente(alm, "tk-1") as Pendiente;
    expect(guardado.paso).toBe("ASENTAR");

    const t2 = ops();
    expect(await avanzarCanje(t2.o, alm, guardado)).toEqual({ estado: "APLICADO" });
    expect(t2.nombres()).toEqual(["asentar"]);
  });

  it.each(["FUNCION_REQUIERE_NUBE", "SOLO_EMPLEADO", "AUTH_INVALIDA", "HTTP_502"])(
    "asentar con %s se puede reintentar: no se dan los puntos por perdidos", async (codigo) => {
      const t = ops({ asentar: () => ({ ok: false, error: codigo }) });
      expect((await avanzarCanje(t.o, alm, dinero)).estado).toBe("A_MEDIAS");
      expect(leerPendiente(alm, "tk-1")?.paso).toBe("ASENTAR");
    });

  it("la cuenta rechaza el asiento para siempre: lo dice claro, con las 48 horas, y limpia", async () => {
    const t = ops({ asentar: () => ({ ok: false, error: "TICKET_NO_ABIERTO" }) });
    const r = await avanzarCanje(t.o, alm, dinero);
    expect(r.estado).toBe("PUNTOS_GASTADOS");
    expect(r.estado === "PUNTOS_GASTADOS" && r.mensaje).toMatch(/50 puntos/);
    expect(r.estado === "PUNTOS_GASTADOS" && r.mensaje).toMatch(/48 horas/);
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });

  it("FUNCION_REQUIERE_NUBE al canjear es un rechazo limpio: la caja ni lo mandó", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "FUNCION_REQUIERE_NUBE" }) });
    expect((await avanzarCanje(t.o, alm, dinero)).estado).toBe("RECHAZADO");
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });
});

describe("canje de premio", () => {
  it("camino feliz: renglón, canje con el premio (sin puntos) y asiento sobre ESE renglón", async () => {
    const t = ops();
    expect(await avanzarCanje(t.o, alm, premio)).toEqual({ estado: "APLICADO" });
    expect(t.nombres()).toEqual(["agregar", "canjear", "asentar"]);
    expect(t.llamadas[0][1]).toEqual({ ticketId: "tk-1", productoId: "p-1", clientId: premio.premio?.renglonClientId });
    expect(t.llamadas[1][1]).toEqual({ canjeId: premio.canjeId, ticketId: "tk-1", clienteId: "c-1", telefono: "4771234567", premioId: "pr-1", sucursalId: "s-1" });
    expect(t.llamadas[2][1]).toEqual({ canjeId: premio.canjeId, ticketId: "tk-1", ticketItemId: "it-9" });
  });

  it("si el renglón no entra, no se llama a la nube: no se descontó nada", async () => {
    const t = ops({ agregar: async () => { throw new Error("Producto agotado"); } });
    const r = await avanzarCanje(t.o, alm, premio);
    expect(r.estado).toBe("RECHAZADO");
    expect(r.estado === "RECHAZADO" && r.mensaje).toMatch(/Producto agotado/);
    expect(t.nombres()).toEqual(["agregar"]);
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });

  it("la nube rechaza el premio: el renglón se cancela solo y la cuenta queda como estaba", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "PREMIO_INVALIDO" }) });
    const r = await avanzarCanje(t.o, alm, premio);
    expect(t.nombres()).toEqual(["agregar", "canjear", "cancelar"]);
    expect(t.llamadas[2][1]).toBe("it-9");
    expect(r.estado === "RECHAZADO" && r.mensaje).not.toMatch(/quedó en la cuenta/);
  });

  it("si el renglón no se pudo cancelar (ya está en cocina), avisa que se quedó a su precio", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "SALDO_INSUFICIENTE" }), cancelar: async () => { throw new Error("requiere PIN"); } });
    const r = await avanzarCanje(t.o, alm, premio);
    expect(r.estado === "RECHAZADO" && r.mensaje).toMatch(/Hamburguesa quedó en la cuenta a su precio/);
  });

  it("sin red al canjear: a medias, con el renglón ya anotado para no agregarlo dos veces", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "SIN_RED" }) });
    const r = await avanzarCanje(t.o, alm, premio);
    expect(r.estado === "A_MEDIAS" && r.mensaje).toMatch(/Hamburguesa/);
    const guardado = leerPendiente(alm, "tk-1") as Pendiente;
    expect(guardado.premio?.ticketItemId).toBe("it-9");

    const t2 = ops();
    expect(await avanzarCanje(t2.o, alm, guardado)).toEqual({ estado: "APLICADO" });
    expect(t2.nombres()).toEqual(["canjear", "asentar"]);
  });

  it("puntos gastados en un premio: además dice que el producto quedó a su precio", async () => {
    const t = ops({ asentar: () => ({ ok: false, error: "RENGLON_NO_ES_PREMIO" }) });
    const r = await avanzarCanje(t.o, alm, premio);
    expect(r.estado === "PUNTOS_GASTADOS" && r.mensaje).toMatch(/6 sellos/);
    expect(r.estado === "PUNTOS_GASTADOS" && r.mensaje).toMatch(/Hamburguesa quedó en la cuenta a su precio/);
  });
});

describe("el canje pendiente guardado", () => {
  it("se guarda por cuenta y no se mezcla con el de otra", () => {
    guardarPendiente(alm, dinero);
    guardarPendiente(alm, { ...premio, ticketId: "tk-2" });
    expect(leerPendiente(alm, "tk-1")?.canjeId).toBe(dinero.canjeId);
    expect(leerPendiente(alm, "tk-2")?.canjeId).toBe(premio.canjeId);
    borrarPendiente(alm, "tk-1");
    expect(leerPendiente(alm, "tk-1")).toBeNull();
    expect(leerPendiente(alm, "tk-2")).not.toBeNull();
  });

  it("basura en el almacén no truena ni se toma por un canje", () => {
    alm.setItem("vim_lealtad_pendiente", "{no es json");
    expect(leerPendiente(alm, "tk-1")).toBeNull();
    alm.setItem("vim_lealtad_pendiente", JSON.stringify({ "tk-1": { canjeId: 7 } }));
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });

  it("cada canje nuevo nace con su propio id (un uuid) y en el paso CANJEAR", () => {
    const otro = nuevoCanjeDinero({ ticketId: "tk-1", sucursalId: "s-1", cliente: ANA, mecanica: "PUNTOS_DINERO", puntos: 50 });
    expect(otro.canjeId).not.toBe(dinero.canjeId);
    expect(dinero.canjeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(dinero).toMatchObject({ paso: "CANJEAR", premio: null, puntos: 50 });
    expect(premio).toMatchObject({ paso: "CANJEAR", puntos: 6, premio: { id: "pr-1", productoId: "p-1", nombre: "Hamburguesa", ticketItemId: null } });
  });
});
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/lealtad-canje.test.ts`
Expected: FAIL — `Cannot find module '../lealtad-canje'`.

- [ ] **Step 3: Escribir `lealtad-canje.ts`**

```ts
"use client";
// El canje de lealtad, paso a paso y reanudable (ADR 0030, plan 1B).
//
// Un canje toca dos sistemas —la nube, que descuenta, y la base donde vive la cuenta, que lo
// asienta— y cualquiera de los pasos puede fallar a la mitad. Lo que no puede pasar es que el
// cliente pierda puntos sin que quien cobra lo sepa. Por eso:
//   · el id del canje nace AQUÍ, antes de llamar: reintentar con el mismo id no descuenta dos veces;
//   · cada avance se guarda en localStorage por cuenta: cerrar el modal o la app no lo pierde;
//   · el orden deja para el final lo único que no se puede deshacer desde la caja.
import { z } from "zod";
import { nuevoClientId } from "./carrito";
import { cancelarItem } from "./cancelacion";
import {
  agregarRenglonPremio, asentar, canjear,
  type CanjeAutorizado, type ClienteLealtad, type RespuestaLealtad,
} from "./lealtad";
import { cantidad, esFalloAmbiguo, mensajeErrorLealtad, type Mecanica, type Premio } from "./lealtad-reglas";

const LLAVE = "vim_lealtad_pendiente";

const esquemaPendiente = z.object({
  ticketId: z.string().min(1),
  canjeId: z.string().min(1),
  sucursalId: z.string().min(1),
  clienteId: z.string().min(1),
  telefono: z.string().nullable(),
  mecanica: z.enum(["PUNTOS_DINERO", "SELLOS", "PUNTOS_PREMIOS"]),
  puntos: z.number().int().positive(),
  /** null = canje de dinero sobre la cuenta. */
  premio: z.object({
    id: z.string().min(1),
    productoId: z.string().min(1),
    nombre: z.string(),
    /** `client_id_local` del renglón: con él, agregarlo dos veces no lo duplica. */
    renglonClientId: z.string().min(1),
    /** null mientras el renglón no ha entrado a la cuenta. */
    ticketItemId: z.string().nullable(),
  }).nullable(),
  /** Qué sigue: pedirle el canje a la nube, o pegarlo a la cuenta. */
  paso: z.enum(["CANJEAR", "ASENTAR"]),
});
export type Pendiente = z.infer<typeof esquemaPendiente>;

/** Lo mínimo de `Storage`, para poder probar con uno de memoria. */
export type Almacen = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** `localStorage`, o uno de memoria si el navegador lo niega: el canje funciona igual, sin sobrevivir a un cierre. */
export function almacenLocal(): Almacen {
  try {
    const ls = window.localStorage;
    ls.getItem(LLAVE);
    return ls;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
  }
}

function leerTodos(a: Almacen): Record<string, unknown> {
  try {
    const o: unknown = JSON.parse(a.getItem(LLAVE) ?? "{}");
    return o !== null && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function leerPendiente(a: Almacen, ticketId: string): Pendiente | null {
  const p = esquemaPendiente.safeParse(leerTodos(a)[ticketId]);
  return p.success && p.data.ticketId === ticketId ? p.data : null;
}

export function guardarPendiente(a: Almacen, p: Pendiente): void {
  a.setItem(LLAVE, JSON.stringify({ ...leerTodos(a), [p.ticketId]: p }));
}

export function borrarPendiente(a: Almacen, ticketId: string): void {
  const todos = leerTodos(a);
  delete todos[ticketId];
  a.setItem(LLAVE, JSON.stringify(todos));
}

export function nuevoCanjeDinero(a: {
  ticketId: string; sucursalId: string; cliente: ClienteLealtad; mecanica: Mecanica; puntos: number;
}): Pendiente {
  return {
    ticketId: a.ticketId, canjeId: nuevoClientId(), sucursalId: a.sucursalId,
    clienteId: a.cliente.clienteId, telefono: a.cliente.telefono,
    mecanica: a.mecanica, puntos: a.puntos, premio: null, paso: "CANJEAR",
  };
}

export function nuevoCanjePremio(a: {
  ticketId: string; sucursalId: string; cliente: ClienteLealtad; mecanica: Mecanica; premio: Premio;
}): Pendiente {
  return {
    ticketId: a.ticketId, canjeId: nuevoClientId(), sucursalId: a.sucursalId,
    clienteId: a.cliente.clienteId, telefono: a.cliente.telefono,
    mecanica: a.mecanica, puntos: a.premio.costo,
    premio: { id: a.premio.id, productoId: a.premio.productoId, nombre: a.premio.nombre, renglonClientId: `premio-${nuevoClientId()}`, ticketItemId: null },
    paso: "CANJEAR",
  };
}

/** Las cuatro operaciones que el canje necesita. Van aparte para probar el orden sin red ni base. */
export type OpsCanje = {
  agregarRenglon: (a: { ticketId: string; productoId: string; clientId: string }) => Promise<string>;
  canjear: (a: { canjeId: string; ticketId: string; clienteId: string; telefono: string | null; puntos?: number; premioId?: string; sucursalId: string }) => Promise<RespuestaLealtad<CanjeAutorizado>>;
  asentar: (a: { canjeId: string; ticketId: string; ticketItemId: string | null }) => Promise<RespuestaLealtad<{ canje_id: string }>>;
  cancelarRenglon: (ticketItemId: string) => Promise<void>;
};

export function opsReales(token: string): OpsCanje {
  return {
    agregarRenglon: (a) => agregarRenglonPremio(token, a),
    canjear: (a) => canjear(token, a),
    asentar: (a) => asentar(token, a),
    // Sin PIN: sirve mientras la cuenta no está en cocina. Si la base lo exige, falla, y el renglón
    // se queda en la cuenta para que quien cobra lo cancele por el camino de siempre.
    cancelarRenglon: (id) => cancelarItem(token, { ticketItemId: id, motivo: "Premio de lealtad no canjeado" }),
  };
}

export type ResultadoCanje =
  /** El canje quedó en la cuenta. */
  | { estado: "APLICADO" }
  /** No se descontó nada. */
  | { estado: "RECHAZADO"; mensaje: string }
  /** No se sabe, o falta un paso: se reintenta con el mismo canje. */
  | { estado: "A_MEDIAS"; mensaje: string; pendiente: Pendiente }
  /** La nube descontó y la cuenta lo rechazó para siempre: los puntos vuelven solos en 48 h. */
  | { estado: "PUNTOS_GASTADOS"; mensaje: string };

/** Asentar se puede reintentar también si la caja perdió la nube o la sesión entre un paso y otro. */
function asentarSePuedeReintentar(codigo: string): boolean {
  return esFalloAmbiguo(codigo) || ["FUNCION_REQUIERE_NUBE", "SOLO_EMPLEADO", "NO_AUTH", "AUTH_INVALIDA"].includes(codigo);
}

/**
 * Lleva un canje desde donde esté hasta donde se pueda. Sirve igual para empezarlo que para
 * reanudarlo: lo que ya se hizo va anotado en `inicial` y no se repite.
 */
export async function avanzarCanje(ops: OpsCanje, almacen: Almacen, inicial: Pendiente): Promise<ResultadoCanje> {
  let p = inicial;
  const cuanto = cantidad(p.mecanica, p.puntos);
  const renglonSeQueda = p.premio
    ? ` ${p.premio.nombre} quedó en la cuenta a su precio: quítalo desde la cuenta si el cliente no lo quiere.`
    : "";

  // 0) El premio entra primero a la cuenta como renglón. Si esto falla, la nube no se ha tocado.
  if (p.premio && !p.premio.ticketItemId) {
    const premio = p.premio;
    try {
      const ticketItemId = await ops.agregarRenglon({ ticketId: p.ticketId, productoId: premio.productoId, clientId: premio.renglonClientId });
      p = { ...p, premio: { ...premio, ticketItemId } };
      guardarPendiente(almacen, p);
    } catch (e) {
      borrarPendiente(almacen, p.ticketId);
      const causa = e instanceof Error ? e.message : "error";
      return { estado: "RECHAZADO", mensaje: `No se pudo agregar ${premio.nombre} a la cuenta: ${causa}. No se descontó nada.` };
    }
  }

  // 1) La nube descuenta. El pendiente se anota ANTES de llamar: si la respuesta se pierde, el
  //    reintento usa el mismo canje y la nube contesta lo mismo sin descontar otra vez.
  if (p.paso === "CANJEAR") {
    guardarPendiente(almacen, p);
    const r = await ops.canjear({
      canjeId: p.canjeId, ticketId: p.ticketId, clienteId: p.clienteId, telefono: p.telefono, sucursalId: p.sucursalId,
      ...(p.premio ? { premioId: p.premio.id } : { puntos: p.puntos }),
    });
    if (!r.ok) {
      if (esFalloAmbiguo(r.error)) {
        return {
          estado: "A_MEDIAS", pendiente: p,
          mensaje: `No se pudo confirmar el canje con la nube. ${mensajeErrorLealtad(r.error)} Toca Reintentar.${p.premio ? ` Mientras tanto, ${p.premio.nombre} está en la cuenta a su precio.` : ""}`,
        };
      }
      // Rechazo de negocio: no se descontó nada. El renglón del premio sobra; se intenta cancelar.
      let seQuedo = false;
      if (p.premio?.ticketItemId) {
        try { await ops.cancelarRenglon(p.premio.ticketItemId); } catch { seQuedo = true; }
      }
      borrarPendiente(almacen, p.ticketId);
      return { estado: "RECHAZADO", mensaje: `${mensajeErrorLealtad(r.error)} No se descontó nada.${seQuedo ? renglonSeQueda : ""}` };
    }
    p = { ...p, paso: "ASENTAR" };
    guardarPendiente(almacen, p);
  }

  // 2) El canje autorizado se pega a la cuenta.
  const a = await ops.asentar({ canjeId: p.canjeId, ticketId: p.ticketId, ticketItemId: p.premio?.ticketItemId ?? null });
  if (a.ok) {
    borrarPendiente(almacen, p.ticketId);
    return { estado: "APLICADO" };
  }
  if (asentarSePuedeReintentar(a.error)) {
    return {
      estado: "A_MEDIAS", pendiente: p,
      mensaje: `La nube ya descontó ${cuanto}, pero falta aplicarlos a esta cuenta. ${mensajeErrorLealtad(a.error)} Toca Reintentar: no se descuentan dos veces.`,
    };
  }
  borrarPendiente(almacen, p.ticketId);
  return {
    estado: "PUNTOS_GASTADOS",
    mensaje: `La nube ya descontó ${cuanto} y esta cuenta no los aceptó. ${mensajeErrorLealtad(a.error)} Vuelven solos al cliente en un máximo de 48 horas; desde la caja no se pueden devolver antes. Cobra la cuenta sin el canje.${renglonSeQueda}`,
  };
}
```

- [ ] **Step 4: Correr la prueba**

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/lealtad-canje.test.ts`
Expected: PASS (todos los casos).

- [ ] **Step 5: Typecheck y commit**

```bash
cd C:/vwtM && pnpm --filter @vim/pos typecheck && git add apps/pos/app/lib/lealtad-canje.ts apps/pos/app/lib/__tests__/lealtad-canje.test.ts && git commit -m "feat(lealtad): el canje avanza por pasos y se puede reanudar sin descontar dos veces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Con un canje aplicado no se cambia al cliente

Regla del spec (§6): el canje es de un cliente; cambiarlo con el canje puesto dejaría el descuento de Ana en la cuenta de Luis. `asignarClienteTicket` es el único camino por el que el POS cambia al cliente de una cuenta guardada (lo usan `home-pos.tsx:928` y `pantalla-cuentas-modo.tsx:639`), así que la guarda va ahí.

**Files:**
- Modify: `apps/pos/app/lib/clientes-cuenta.ts:152-161`
- Modify: `apps/pos/app/lib/__tests__/clientes-cuenta.test.ts` (bloque «asignar el cliente a una cuenta abierta»)

- [ ] **Step 1: Añadir los casos que fallan**

En `clientes-cuenta.test.ts`, dentro de `describe("asignar el cliente a una cuenta abierta", …)`, añade `tablas.ticket_canjes_lealtad = [];` al final del `beforeEach` y estos dos casos:

```ts
  it("con un canje de lealtad aplicado no cambia al cliente: pide quitar el canje primero", async () => {
    tablas.ticket_canjes_lealtad = [{ id: "cj-1", ticket_id: "abierta", revertido: false }];
    await expect(asignarClienteTicket("tk", "abierta", "c2")).rejects.toThrow(/Quita el canje/);
    expect(tablas.tickets[0].cliente_id).toBeNull();
  });

  it("un canje ya quitado (revertido) no estorba", async () => {
    tablas.ticket_canjes_lealtad = [{ id: "cj-1", ticket_id: "abierta", revertido: true }];
    await asignarClienteTicket("tk", "abierta", "c2");
    expect(tablas.tickets[0].cliente_id).toBe("c2");
  });
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/clientes-cuenta.test.ts`
Expected: FAIL en el primer caso nuevo (hoy asigna a `c2` sin preguntar).

- [ ] **Step 3: La guarda**

Sustituye el cuerpo de `asignarClienteTicket`:

```ts
export async function asignarClienteTicket(token: string, ticketId: string, clienteId: string | null): Promise<void> {
  const sb = employeeClient(token);
  // Con un canje de lealtad aplicado el cliente no se cambia: el descuento salió del saldo de ESE
  // cliente. Si la lectura falla no se bloquea nada: una cuenta no se queda sin cliente por la lealtad.
  const { data: canje, error: e0 } = await sb
    .from("ticket_canjes_lealtad")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("revertido", false)
    .limit(1)
    .maybeSingle();
  if (!e0 && canje) throw new Error("Esta cuenta tiene un canje de lealtad. Quita el canje antes de cambiar al cliente.");

  const { data, error } = await sb
    .from("tickets")
    .update({ cliente_id: clienteId })
    .eq("id", ticketId)
    .in("estado_fiscal", ["BORRADOR", "ABIERTO"])
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Esta cuenta ya se cobró: su cliente ya no se puede cambiar.");
}
```

- [ ] **Step 4: Correr, typecheck y commit**

```bash
cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/clientes-cuenta.test.ts && pnpm --filter @vim/pos typecheck && git add apps/pos/app/lib/clientes-cuenta.ts apps/pos/app/lib/__tests__/clientes-cuenta.test.ts && git commit -m "feat(lealtad): con un canje aplicado no se cambia al cliente de la cuenta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: PASS, sin errores de tipos.

---

## Task 6: El modal «Lealtad»

Un solo modal, autocontenido: recibe la cuenta y el cliente, y él lee todo lo demás. Así se monta igual desde la captura que desde la lista de cuentas. No tiene prueba automática (el repo no prueba componentes): su lógica está en las Tareas 2–4, que sí la tienen. Se verifica con typecheck aquí y a mano en la Tarea 12.

**Files:**
- Create: `apps/pos/app/components/modal-canje-lealtad.tsx`

**Interfaces:**
- Consumes: todo lo de las Tareas 2–4; `leerTotales` de `../lib/cobro`; `leerEnvioDelTicket` de `../lib/descuento`; `fmtMxn` de `../lib/turno`; `Aviso`, `Button`, `Modal` de `@vim/ui/styles`.
- Produces: `ModalCanjeLealtad({ token, ticketId, clienteId, sucursalId, onCambio, onCerrar })`, con `onCambio: (r: { premioAplicado: boolean }) => void | Promise<void>` — se llama cada vez que la cuenta cambió (canje aplicado, canje quitado, o renglón de premio que se quedó en la cuenta).

- [ ] **Step 1: Leer las reglas de diseño**

Lee `docs/diseno/pos.md` y `docs/diseno/nucleo.md` completos. Las clases de abajo ya salen de `modal-descuento.tsx` y `modal-cliente-cuenta.tsx`; no añadas otras.

- [ ] **Step 2: Escribir el componente**

```tsx
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aviso, Button, Modal } from "@vim/ui/styles";
import { leerTotales } from "../lib/cobro";
import { leerEnvioDelTicket } from "../lib/descuento";
import { fmtMxn } from "../lib/turno";
import {
  consultarSaldo, leerCanjeDelTicket, leerClienteLealtad, leerPremios, leerPrograma, quitarCanje,
  type CanjeVivo, type ClienteLealtad,
} from "../lib/lealtad";
import {
  cantidad, fechaCorta, maximoCanjeDinero, mensajeErrorLealtad, premiosConFaltante,
  type Premio, type Programa,
} from "../lib/lealtad-reglas";
import {
  almacenLocal, avanzarCanje, borrarPendiente, leerPendiente, nuevoCanjeDinero, nuevoCanjePremio, opsReales,
  type Pendiente,
} from "../lib/lealtad-canje";

type Datos = {
  programa: Programa;
  premios: Premio[];
  cliente: ClienteLealtad;
  canje: CanjeVivo | null;
  total: number;
  envio: number;
};

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const encabezado = "mb-2 text-12 font-bold uppercase tracking-wide text-ink-3";

/**
 * Lealtad de la cuenta (ADR 0030): saldo del cliente, canjear y quitar el canje. Autocontenido: lee
 * programa, premios, cliente, canje y total por su cuenta, para montarse igual desde la captura que
 * desde la lista de cuentas. La cuenta YA debe estar guardada: el canje nace atado a su ticket.
 */
export function ModalCanjeLealtad({
  token,
  ticketId,
  clienteId,
  sucursalId,
  onCambio,
  onCerrar,
}: {
  token: string;
  ticketId: string;
  clienteId: string;
  sucursalId: string;
  /** La cuenta cambió: hay que releerla. `premioAplicado` = entró un producto gratis que cocina debe recibir. */
  onCambio: (r: { premioAplicado: boolean }) => void | Promise<void>;
  onCerrar: () => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  /** Saldo de la NUBE: el único contra el que se canjea. null = todavía no llega o no se pudo leer. */
  const [saldo, setSaldo] = useState<{ saldo: number; venceEl: string | null } | null>(null);
  const [sinSaldo, setSinSaldo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [puntos, setPuntos] = useState("");
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  const almacen = useMemo(() => almacenLocal(), []);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const cargar = useCallback(async () => {
    try {
      const [programa, premios, cliente, canje, tot, envio] = await Promise.all([
        leerPrograma(token),
        leerPremios(token),
        leerClienteLealtad(token, clienteId),
        leerCanjeDelTicket(token, ticketId),
        leerTotales(token, ticketId),
        leerEnvioDelTicket(token, ticketId).catch(() => 0),
      ]);
      if (!vivo.current) return;
      if (!programa) { setError(mensajeErrorLealtad("SIN_PROGRAMA")); return; }
      if (!cliente) { setError("La cuenta ya no tiene a ese cliente."); return; }
      setDatos({ programa, premios, cliente, canje, total: tot.total, envio });
      setPendiente(leerPendiente(almacen, ticketId));
      // El saldo de la nube es también la prueba de conexión: en la caja, `online` solo dice que el
      // gateway local responde, no que haya internet.
      const s = await consultarSaldo(token, { clienteId, telefono: cliente.telefono });
      if (!vivo.current) return;
      if (s.ok) {
        setSaldo({ saldo: s.saldo, venceEl: s.vence_el });
        setSinSaldo(null);
        setPuntos(String(maximoCanjeDinero(s.saldo, tot.total, envio) || ""));
      } else {
        setSaldo(null);
        setSinSaldo(mensajeErrorLealtad(s.error));
      }
    } catch (e) {
      if (vivo.current) setError(e instanceof Error ? e.message : "No se pudo cargar la lealtad");
    }
  }, [token, ticketId, clienteId, almacen]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function ejecutar(p: Pendiente) {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const r = await avanzarCanje(opsReales(token), almacen, p);
      if (r.estado === "APLICADO") {
        await onCambio({ premioAplicado: p.premio !== null });
        onCerrar();
        return;
      }
      if (r.estado === "RECHAZADO") setError(r.mensaje);
      else setAviso(r.mensaje);
      // El renglón del premio pudo quedarse en la cuenta aunque el canje no entrara: la cuenta cambió.
      if (p.premio) await onCambio({ premioAplicado: false });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar el canje");
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }

  async function quitar() {
    setOcupado(true);
    setError(null);
    try {
      await quitarCanje(token, ticketId);
      await onCambio({ premioAplicado: false });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar el canje");
      setOcupado(false);
    }
  }

  function descartarPendiente() {
    borrarPendiente(almacen, ticketId);
    setPendiente(null);
    setAviso("Canje descartado. Si la nube alcanzó a descontar los puntos, vuelven solos al cliente en un máximo de 48 horas.");
  }

  const m = datos?.programa.mecanica ?? "PUNTOS_DINERO";
  const esDinero = m === "PUNTOS_DINERO";
  const maximo = datos && saldo ? maximoCanjeDinero(saldo.saldo, datos.total, datos.envio) : 0;
  const puntosNum = Number(puntos || 0);
  const puntosValidos = Number.isInteger(puntosNum) && puntosNum >= 1 && puntosNum <= maximo;
  const nombrePremio = datos?.canje?.premioId ? datos.premios.find((p) => p.id === datos.canje?.premioId)?.nombre ?? "Producto de premio" : null;

  return (
    <Modal
      open
      onClose={ocupado ? () => {} : onCerrar}
      title="Lealtad"
      hideTitle
      className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Lealtad{datos ? ` de ${datos.cliente.nombre}` : ""}</h2>
        <p className="mt-0.5 text-13 text-ink-3">
          {!datos && !error && "Cargando…"}
          {datos && saldo && (
            <>Saldo: <span className="font-semibold tabular-nums text-ink">{cantidad(m, saldo.saldo)}</span>{saldo.venceEl ? ` · vence el ${fechaCorta(saldo.venceEl)}` : ""}</>
          )}
          {datos && !saldo && !sinSaldo && "Consultando el saldo…"}
        </p>
      </div>

      {/* Canje a medias: lo primero, porque hay puntos del cliente en el aire. */}
      {datos && pendiente && (
        <Aviso tono="warning" role="alert" className="mb-4">
          <div>
            Hay un canje a medias de {cantidad(pendiente.mecanica, pendiente.puntos)}
            {pendiente.premio ? ` (${pendiente.premio.nombre})` : ""} en esta cuenta.
          </div>
          <div className="mt-2 flex gap-2">
            <Button onClick={() => void ejecutar(pendiente)} disabled={ocupado}>{ocupado ? "Reintentando…" : "Reintentar"}</Button>
            <Button variant="ghost" onClick={descartarPendiente} disabled={ocupado}>Descartar</Button>
          </div>
        </Aviso>
      )}

      {/* Canje ya aplicado a la cuenta. */}
      {datos?.canje && !pendiente && (
        <div className="mb-4">
          <div className={encabezado}>Canje en esta cuenta</div>
          <div className="flex items-center justify-between gap-3 rounded border border-success-line bg-success-soft px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-13 font-semibold text-success">
                {nombrePremio ? `Premio: ${nombrePremio}` : "Puntos por dinero"}
              </div>
              <div className="text-12 tabular-nums text-ink-2">
                {cantidad(m, datos.canje.puntos)} · −{fmtMxn(datos.canje.monto)}
              </div>
            </div>
            {!confirmandoQuitar && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setConfirmandoQuitar(true)}
                className="h-11 flex-shrink-0 rounded border border-line-strong bg-surface px-3 text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink active:scale-[.97] disabled:opacity-40"
              >
                Quitar
              </button>
            )}
          </div>
          {confirmandoQuitar && (
            <div className="mt-2 rounded border border-line bg-hover p-3">
              <p className="text-13 text-ink-2">
                {cantidad(m, datos.canje.puntos)} vuelven a {datos.cliente.nombre} y la cuenta sube {fmtMxn(datos.canje.monto)}.
                {nombrePremio ? ` ${nombrePremio} se queda en la cuenta a su precio: cancélalo desde la cuenta si ya no lo quiere.` : ""}
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmandoQuitar(false)} disabled={ocupado}>Volver</Button>
                <Button variant="danger" onClick={() => void quitar()} disabled={ocupado}>{ocupado ? "Quitando…" : "Quitar canje"}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sin saldo de la nube no se canjea: se dice por qué. Quitar un canje sí se puede sin internet. */}
      {datos && sinSaldo && !pendiente && (
        <Aviso tono="warning" className="mb-4">{sinSaldo}</Aviso>
      )}

      {/* Canjear puntos por dinero. */}
      {datos && saldo && !datos.canje && !pendiente && esDinero && (
        maximo < 1 ? (
          <Aviso tono="info" className="mb-4">
            {saldo.saldo < 1 ? "Este cliente todavía no tiene puntos para canjear." : "En esta cuenta no hay nada que cubrir con puntos."}
          </Aviso>
        ) : (
          <div className="mb-4">
            <label className="mb-1.5 block text-13 font-medium text-ink-2" htmlFor="lea-puntos">
              Puntos a usar (1 punto = $1, hasta {maximo})
            </label>
            <div className="relative mb-4">
              <input
                id="lea-puntos"
                className={input}
                value={puntos}
                inputMode="numeric"
                autoFocus
                onChange={(e) => setPuntos(e.target.value.replace(/\D/g, ""))}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-3">puntos</span>
            </div>
            <div className="rounded-lg border border-line bg-hover p-3 text-14">
              <div className="flex justify-between text-ink-2">
                <span>Total actual</span><span className="tabular-nums">{fmtMxn(datos.total)}</span>
              </div>
              <div className="mt-1 flex justify-between text-ink-2">
                <span>Canje</span><span className="tabular-nums text-success">−{fmtMxn(puntosValidos ? puntosNum : 0)}</span>
              </div>
              {datos.envio > 0 && (
                <div className="mt-1 text-12 text-ink-3">El envío ({fmtMxn(datos.envio)}) no se cubre con puntos.</div>
              )}
              <div className="mt-2 flex justify-between border-t border-line pt-2 font-display text-16 font-bold">
                <span>Nuevo total</span><span className="tabular-nums">{fmtMxn(Math.max(0, datos.total - (puntosValidos ? puntosNum : 0)))}</span>
              </div>
            </div>
          </div>
        )
      )}

      {/* Premios (sellos o puntos por premios). */}
      {datos && saldo && !datos.canje && !pendiente && !esDinero && (
        <div className="mb-4">
          <div className={encabezado}>Premios</div>
          {datos.premios.length > 0 && (
            <p className="mb-2 text-12 text-ink-3">El producto entra a la cuenta en $0.00. Una cuenta con premio no se factura de forma individual.</p>
          )}
          {datos.premios.length === 0 && <p className="py-2 text-13 text-ink-3">El negocio todavía no tiene premios.</p>}
          <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">
            {premiosConFaltante(datos.premios, saldo.saldo).map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={ocupado || !p.alcanza}
                onClick={() => void ejecutar(nuevoCanjePremio({ ticketId, sucursalId, cliente: datos.cliente, mecanica: m, premio: p }))}
                className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded border border-line-strong bg-surface px-3 py-2.5 text-left transition hover:border-ink active:scale-[.98] disabled:cursor-default disabled:opacity-40 disabled:hover:border-line-strong disabled:active:scale-100"
              >
                <span className="min-w-0 truncate text-14 font-semibold">{p.nombre}</span>
                <span className="flex-shrink-0 text-13 font-semibold tabular-nums text-ink-2">
                  {p.alcanza ? cantidad(m, p.costo) : `Faltan ${cantidad(m, p.falta)}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {aviso && <Aviso tono="warning" role="alert" className="mb-3">{aviso}</Aviso>}
      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={ocupado}>Cerrar</Button>
        {datos && saldo && !datos.canje && !pendiente && esDinero && maximo >= 1 && (
          <Button
            onClick={() => void ejecutar(nuevoCanjeDinero({ ticketId, sucursalId, cliente: datos.cliente, mecanica: m, puntos: puntosNum }))}
            disabled={ocupado || !puntosValidos}
          >
            {ocupado ? "Canjeando…" : `Canjear ${puntosValidos ? cantidad(m, puntosNum) : "puntos"}`}
          </Button>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Comprobar las piezas de `@vim/ui` que usa**

Run: `cd C:/vwtM && grep -n "tono\|className\|role" packages/ui/src/components/aviso.tsx | head -20 && grep -n "variant" packages/ui/src/components/button.tsx | head -8`
Expected: `Aviso` acepta `tono` (`success | warning | danger | info`), `role` y `className`; `Button` acepta `variant` con `ghost` y `danger`. Si alguna prop no existe con ese nombre, ajusta el JSX al nombre real (no cambies `@vim/ui`).

- [ ] **Step 4: Typecheck, tipografía y commit**

```bash
cd C:/vwtM && pnpm --filter @vim/pos typecheck && pnpm tipografia && git add apps/pos/app/components/modal-canje-lealtad.tsx && git commit -m "feat(lealtad): modal de lealtad con saldo, canje, premios y canje a medias

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck sin errores; `pnpm tipografia` sin hallazgos nuevos.

---

## Task 7: La cuenta en captura: franja de lealtad, renglón «Lealtad» y el modal

**Files:**
- Modify: `apps/pos/app/components/sidebar-ticket.tsx` (props ≈50-140, totales ≈414-457)
- Modify: `apps/pos/app/components/home-pos.tsx` (estado ≈165-345, `editarLinea` 679, `onAplicarDescuento` 934, `iniciarCobro` 980, `alEscapar` 1346, `modalesCobro` 1429, `<SidebarTicket>` 2141)

**Interfaces:**
- Consumes: `franjaLealtad`, `baseDeLealtad`, `FranjaLealtad`, `Programa` de `../lib/lealtad-reglas`; `leerPrograma`, `leerSaldoLocal`, `comprasQueSumanHoy`, `leerCanjeDelTicket`, `quitarCanjeSiQuedoRecortado`, `CanjeVivo`, `SaldoCliente` de `../lib/lealtad`; `ModalCanjeLealtad`.
- Produces: en `SidebarTicket`, las props `lealtad?: { nombre: string; franja: FranjaLealtad; onAbrir?: () => void } | null` y `lealtadMxn?: number`. En `home-pos.tsx`, el estado `canjeDe: { ticketId: string; clienteId: string; origen: "captura" | "lista" } | null` y la constante JSX `modalCanje` (la Tarea 8 las reutiliza).

- [ ] **Step 1: `SidebarTicket` — props nuevas**

En el destructuring añade `lealtad = null, lealtadMxn = 0,` y en el tipo de props, después de `promocionMxn?: number;`:

```tsx
  /** Canje de lealtad ya aplicado en BD (autoritativo). 0 = sin canje. */
  lealtadMxn?: number;
  /** Lealtad del cliente de la cuenta (ADR 0030). null = módulo apagado, sin programa o cuenta sin
   *  cliente: no se pinta nada. Sin `onAbrir` la franja informa, pero no canjea. */
  lealtad?: { nombre: string; franja: FranjaLealtad; onAbrir?: () => void } | null;
```

Import: `import type { FranjaLealtad } from "../lib/lealtad-reglas";`

Junto a `const hayPromocion = promocionMxn > 0;` añade:

```tsx
  const hayLealtad = lealtadMxn > 0;
```

- [ ] **Step 2: `SidebarTicket` — la franja y el renglón**

Dentro del bloque de totales (`<div className="flex-shrink-0 border-t border-line bg-sel px-4 pb-2.5 pt-3">`), como **primer hijo**, antes de `{estado.envio && (`:

```tsx
        {lealtad && (
          <div className="mb-2 flex items-center gap-2 border-b border-line pb-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-13 font-semibold text-ink">
                {lealtad.nombre} <span className="font-medium tabular-nums text-ink-2">· {lealtad.franja.saldoTexto}</span>
              </div>
              {lealtad.franja.detalle && <div className="truncate text-12 text-ink-2">{lealtad.franja.detalle}</div>}
            </div>
            {lealtad.onAbrir && (
              <button
                type="button"
                disabled={!lealtad.franja.puedeAbrir || procesando}
                onClick={lealtad.onAbrir}
                className={`${BOTON_RENGLON} border border-line-strong bg-surface text-ink hover:border-ink disabled:cursor-default disabled:opacity-[.45] disabled:hover:border-line-strong disabled:active:scale-100`}
              >
                {lealtad.franja.boton}
              </button>
            )}
          </div>
        )}
```

Después del bloque `{hayPromocion && (…)}` y antes de `{hayDescuento && (`:

```tsx
        {hayLealtad && (
          <div className="mb-1 flex justify-between text-13 font-medium text-success">
            <span>Lealtad</span>
            <span className="tabular-nums">−{fmtMxn(lealtadMxn)}</span>
          </div>
        )}
```

- [ ] **Step 3: `home-pos.tsx` — imports y estado**

Imports (junto a los de `../lib/…` y `./modal-…`):

```tsx
import { baseDeLealtad, franjaLealtad, type Programa } from "../lib/lealtad-reglas";
import { comprasQueSumanHoy, leerCanjeDelTicket, leerPrograma, leerSaldoLocal, quitarCanjeSiQuedoRecortado, type CanjeVivo, type SaldoCliente } from "../lib/lealtad";
import { ModalCanjeLealtad } from "./modal-canje-lealtad";
```

Comprueba que `admiteClienteCuenta` y `calcularTotalesDisplay` estén en el import de `../lib/carrito`; si falta alguno, añádelo.

Después de `const hayDelivery = modulos?.delivery_apps === true;` (línea ≈166):

```tsx
  // Lealtad (ADR 0030). Todo lo de abajo queda apagado si el módulo no está efectivo.
  const lealtadActiva = modulos?.lealtad === true;
  const [programa, setPrograma] = useState<Programa | null>(null);
  const [saldoCliente, setSaldoCliente] = useState<SaldoCliente | null>(null);
  const [comprasHoy, setComprasHoy] = useState(0);
  const [canjeVivo, setCanjeVivo] = useState<CanjeVivo | null>(null);
  /** Cuenta sobre la que está abierto el modal de lealtad, y desde dónde se abrió. */
  const [canjeDe, setCanjeDe] = useState<{ ticketId: string; clienteId: string; origen: "captura" | "lista" } | null>(null);
```

Después de la declaración de `ticketBd` y de `totalAutoritativo` (línea ≈303), los efectos y las derivadas:

```tsx
  // El programa del negocio. Se relee cuando el módulo se enciende; un cambio del dueño llega con el
  // siguiente arranque del POS (el modal siempre lo lee fresco antes de canjear).
  useEffect(() => {
    if (!lealtadActiva) { setPrograma(null); return; }
    let vivo = true;
    leerPrograma(token).then((p) => { if (vivo) setPrograma(p); }).catch(() => { if (vivo) setPrograma(null); });
    return () => { vivo = false; };
  }, [lealtadActiva, token]);

  // El cliente al que le cuenta la compra: el de la cuenta, o el de domicilio.
  const clienteLealtad = carrito.modoServicio === "DELIVERY_PROPIO"
    ? (carrito.clienteDomicilio ? { clienteId: carrito.clienteDomicilio.clienteId, nombre: carrito.clienteDomicilio.nombre } : null)
    : (carrito.clienteCuenta ? { clienteId: carrito.clienteCuenta.clienteId, nombre: carrito.clienteCuenta.nombre } : null);
  const clienteLealtadId = clienteLealtad?.clienteId ?? null;
  const versionPrograma = programa?.version ?? null;
  const lealtadTicket = ticketBd?.lealtad ?? 0;

  // Saldo que esta base conoce y compras de hoy: para MOSTRAR. Se relee al cambiar de cliente y cada
  // vez que el canje de la cuenta cambia (lo movió un canje o una reversa).
  useEffect(() => {
    if (!lealtadActiva || versionPrograma === null || !clienteLealtadId) { setSaldoCliente(null); setComprasHoy(0); return; }
    let vivo = true;
    Promise.all([leerSaldoLocal(token, clienteLealtadId, versionPrograma), comprasQueSumanHoy(token, clienteLealtadId)])
      .then(([s, n]) => { if (vivo) { setSaldoCliente(s); setComprasHoy(n); } })
      .catch(() => { if (vivo) { setSaldoCliente(null); setComprasHoy(0); } });
    return () => { vivo = false; };
  }, [lealtadActiva, versionPrograma, clienteLealtadId, token, lealtadTicket]);

  // El canje vivo de la cuenta guardada.
  const ticketBdId = ticketBd?.ticketId ?? null;
  useEffect(() => {
    if (!lealtadActiva || !ticketBdId) { setCanjeVivo(null); return; }
    let vivo = true;
    leerCanjeDelTicket(token, ticketBdId).then((c) => { if (vivo) setCanjeVivo(c); }).catch(() => { if (vivo) setCanjeVivo(null); });
    return () => { vivo = false; };
  }, [lealtadActiva, ticketBdId, lealtadTicket, token]);

  const envioCarrito = carrito.envio?.costoMxn ?? 0;
  const franja = lealtadActiva && programa && clienteLealtad
    ? franjaLealtad({
        programa,
        saldo: saldoCliente?.saldo ?? 0,
        comprasHoy,
        base: baseDeLealtad(totalAutoritativo ?? calcularTotalesDisplay(carrito.lineas, 16, envioCarrito).total, envioCarrito),
        canje: canjeVivo,
        online,
      })
    : null;
```

- [ ] **Step 4: `home-pos.tsx` — abrir el modal guardando antes la cuenta**

Justo después de `onAplicarDescuento` (termina en la línea ≈963), con el mismo patrón:

```tsx
  // Lealtad: el canje nace atado a un ticket, así que la cuenta se guarda ANTES de abrir el modal
  // (igual que con el descuento). Solo cuentas con cliente de cuenta: en Domicilio el carrito pierde
  // al cliente al releer la cuenta, y ahí se canjea desde la lista de Domicilio.
  const onAbrirLealtad = useCallback(async () => {
    const clienteId = carrito.clienteCuenta?.clienteId;
    if (!clienteId || carrito.lineas.length === 0) return;
    setProcesandoCobro(true);
    setError(null);
    try {
      let bd = ticketBd;
      if (!bd || ticketIncompleto) {
        bd = await persistirTicket(
          { token, sucursalId: caja.sucursal_id, cajaId: turno.caja_id, turnoId: turno.id },
          carrito.modoServicio,
          carrito.lineas,
          idTicketDelCarrito(),
          clienteIdParaTicket(carrito),
          carrito.clienteDomicilio?.direccionId ?? null,
          carrito.notaOrden ?? null,
          carrito.nombreCuenta ?? null,
          carrito.envio?.zonaId ?? null,
        );
        setTicketBd(bd);
        setTicketIncompleto(false);
      }
      try { setItemsPersistidos(await leerItemsPersistidos(token, bd.ticketId)); } catch { /* no bloquear */ }
      setCanjeDe({ ticketId: bd.ticketId, clienteId, origen: "captura" });
    } catch (e) {
      setError(await adoptarTicketSiQuedoAbierto(e, "Error al preparar el canje"));
    } finally {
      setProcesandoCobro(false);
    }
  }, [carrito, ticketBd, ticketIncompleto, token, caja.sucursal_id, turno.caja_id, turno.id, adoptarTicketSiQuedoAbierto]);
```

- [ ] **Step 5: `home-pos.tsx` — el modal, una sola vez, para captura y lista**

Justo antes de `const modalesCobro = (` (línea ≈1429):

```tsx
  // Lealtad: el mismo modal sirve a la captura y a la lista de cuentas. Va en su propia constante
  // porque el componente tiene un return por pantalla (igual que `modalesCobro`).
  const modalCanje = canjeDe && (
    <ModalCanjeLealtad
      token={token}
      ticketId={canjeDe.ticketId}
      clienteId={canjeDe.clienteId}
      sucursalId={caja.sucursal_id}
      onCambio={async ({ premioAplicado }) => {
        if (canjeDe.origen === "captura") {
          // Relee carrito, totales y renglones: el premio es un renglón nuevo y el total cambió.
          await recargarCuenta();
          return;
        }
        // Desde la lista no hay pantalla de captura donde tocar «Enviar a cocina»: el premio se
        // manda aquí, con la misma secuencia que usa «Agregar producto» en la lista.
        if (premioAplicado) {
          try {
            const esAgregado = await yaEnviadoACocina(token, canjeDe.ticketId);
            const enviados = await enviarACocina(token, canjeDe.ticketId);
            await imprimirComandaCocina(canjeDe.ticketId, enviados, esAgregado);
          } catch (e) {
            setError(e instanceof Error ? `El premio entró a la cuenta, pero no se pudo mandar a cocina: ${e.message}` : "El premio no se pudo mandar a cocina");
          }
        }
        setCuentasVersion((v) => v + 1);
      }}
      onCerrar={() => setCanjeDe(null)}
    />
  );
```

(`yaEnviadoACocina` y `enviarACocina` vienen de `../lib/mesero` y ya se usan en este archivo, línea ≈1956.)

Monta `{modalCanje}` en la pantalla de captura, junto a `{modalesCobro}` (línea ≈2201):

```tsx
      {modalCanje}
```

- [ ] **Step 6: `home-pos.tsx` — Escape**

En `alEscapar` (línea ≈1346), añade la capa antes de `[cancelandoItem != null, …]` y `canjeDe` a la lista de dependencias del `useMemo`:

```tsx
      [canjeDe != null, () => setCanjeDe(null)],
```

(El `Modal` de `@vim/ui` ya atiende Escape y no cierra mientras hay un canje en curso; la capa es la red que pide `docs/diseno/pos.md` para toda pantalla nueva.)

- [ ] **Step 7: `home-pos.tsx` — pasarle la lealtad al `SidebarTicket`**

En `<SidebarTicket …>` (línea ≈2141), después de `promocionMxn={ticketBd?.promociones ?? 0}`:

```tsx
          lealtadMxn={ticketBd?.lealtad ?? 0}
          lealtad={franja && clienteLealtad
            ? {
                nombre: clienteLealtad.nombre.split(" ")[0] ?? clienteLealtad.nombre,
                franja,
                onAbrir: admiteClienteCuenta(carrito.modoServicio) && carrito.lineas.length > 0 ? () => void onAbrirLealtad() : undefined,
              }
            : null}
```

- [ ] **Step 8: `home-pos.tsx` — un renglón premiado no se edita**

«Editar renglón» cancela el renglón viejo y pone uno nuevo; sobre un premio eso devuelve los puntos y deja el producto a su precio, sin avisar. En `editarLinea` (línea 679), dentro de `if (ticketBd) { … }`, después de `if (!it) return;`:

```tsx
      if (canjeVivo?.ticketItemId && it.id === canjeVivo.ticketItemId) {
        setError(`${l.producto.nombre} es un premio de lealtad. Para cambiarlo, quita el canje desde Lealtad.`);
        return;
      }
```

Añade `canjeVivo` a las dependencias de ese `useCallback`.

- [ ] **Step 9: `home-pos.tsx` — antes de cobrar, un canje recortado se quita y se avisa**

En `iniciarCobro` (línea 980), justo después de `if (carrito.lineas.length === 0) return;` y **antes** de `abrirCajonParaCobrar();` (para no abrir el cajón de una cuenta que no se va a cobrar todavía):

```tsx
    // Lealtad: si después de canjear dinero la cuenta bajó (se canceló un platillo), el canje ya no
    // cabe completo. Se quita, se avisa y NO se abre el cobro: el total cambió y hay que mirarlo.
    // Si esta revisión falla, se cobra igual: una venta no se cae por la lealtad.
    if (lealtadActiva && programa && ticketBd && !ticketIncompleto) {
      try {
        const r = await quitarCanjeSiQuedoRecortado(token, ticketBd, programa.mecanica);
        if (r.aviso) {
          setTicketBd(r.totales);
          setAvisoReparto({ titulo: "Se quitó el canje de lealtad", texto: r.aviso });
          return;
        }
      } catch { /* se cobra con lo que hay */ }
    }
```

Añade `lealtadActiva` y `programa` a las dependencias del `useCallback`. (`avisoReparto` es el diálogo de aviso genérico de este archivo, línea ≈1621, y vive dentro de `modalesCobro`, así que se ve en todas las pantallas.)

- [ ] **Step 10: Verificar**

```bash
cd C:/vwtM && pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test 2>&1 | tail -6 && pnpm tipografia
```

Expected: sin errores de tipos; toda la suite del POS en verde (línea base de la Tarea 0 más los archivos nuevos); `tipografia` limpio. Si `react-hooks/exhaustive-deps` protesta en `pnpm --filter @vim/pos lint`, añade la dependencia que pida, no un comentario que lo calle.

- [ ] **Step 11: Commit**

```bash
cd C:/vwtM && git add apps/pos/app/components/sidebar-ticket.tsx apps/pos/app/components/home-pos.tsx && git commit -m "feat(lealtad): la cuenta muestra saldo y lo que gana, y abre el canje

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Lista de cuentas: renglón «Lealtad» y «Canjear puntos»

En Comedor, Pick-up y Domicilio las cuentas se cobran desde la lista, sin pasar por la captura. El canje tiene que estar ahí también.

**Files:**
- Modify: `apps/pos/app/components/pantalla-cuentas-modo.tsx` (props ≈69-106, acciones ≈390, totales ≈474)
- Modify: `apps/pos/app/components/home-pos.tsx` (`<PantallaCuentasModo>` ≈1835, `onCobrar` ≈1865, montaje ≈1906)

- [ ] **Step 1: `pantalla-cuentas-modo.tsx` — prop, acción y renglón**

En el destructuring y en el tipo de props, junto a `extraPorCuenta`:

```tsx
  onCanjear,
```

```tsx
  /** Lealtad (ADR 0030): abre el canje de esa cuenta. Sin la prop (módulo apagado) no hay botón. */
  onCanjear?: (c: CuentaAbierta) => void;
```

En la fila de acciones, después del `<Accion label={hayDescuento ? …} … />` de Descuento (línea ≈390):

```tsx
                {onCanjear && sel.clienteId && (
                  <Accion label={(totales?.lealtad ?? 0) > 0 ? "Canje aplicado" : "Canjear puntos"} onClick={() => onCanjear(sel)} />
                )}
```

En los totales (línea ≈474), después del bloque `{hayDescuento && (…)}`:

```tsx
                  {totales.lealtad > 0 && (
                    <div className="mt-0.5 flex justify-between text-13 font-medium text-success">
                      <span>Lealtad</span><span className="tabular-nums">−{fmtMxn(totales.lealtad)}</span>
                    </div>
                  )}
```

- [ ] **Step 2: `home-pos.tsx` — conectar la lista**

En `<PantallaCuentasModo …>` (línea ≈1835), junto a `onAgregarProductos`:

```tsx
        onCanjear={lealtadActiva ? (c) => { if (c.clienteId) setCanjeDe({ ticketId: c.ticketId, clienteId: c.clienteId, origen: "lista" }); } : undefined}
```

En el `onCobrar` de la lista (línea ≈1865), sustituye desde `abrirCajonParaCobrar();` hasta el `setTotalesCobro(…)` del `try` por esto. El cajón pasa a abrirse cuando ya se sabe que la cuenta sí se va a cobrar:

```tsx
          try {
            setAtajoCobro(null);
            const totales = await leerTotales(token, ticketId);
            // Lealtad: mismo cuidado que en la captura (ver iniciarCobro).
            if (lealtadActiva && programa) {
              try {
                const r = await quitarCanjeSiQuedoRecortado(token, totales, programa.mecanica);
                if (r.aviso) {
                  setAvisoReparto({ titulo: "Se quitó el canje de lealtad", texto: r.aviso });
                  setCuentasVersion((v) => v + 1);
                  return;
                }
              } catch { /* se cobra con lo que hay */ }
            }
            abrirCajonParaCobrar();
            setTotalesCobro(totales);
          } catch (e) {
```

(El `catch` que sigue se queda como está.)

Monta el modal también en la rama de listas, justo después de `{modalesCobro}` (línea ≈1906):

```tsx
        {modalCanje}
```

- [ ] **Step 3: Verificar y commit**

```bash
cd C:/vwtM && pnpm --filter @vim/pos typecheck && pnpm tipografia && git add apps/pos/app/components/pantalla-cuentas-modo.tsx apps/pos/app/components/home-pos.tsx && git commit -m "feat(lealtad): canjear desde la lista de cuentas y ver el canje en sus totales

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck sin errores; `tipografia` limpio.

---

## Task 9: Ticket impreso: el canje en los totales y el pie de lealtad

El papel y su vista previa (`recibo-ticket.tsx`) son espejos manuales: lo que entra en uno entra en el otro, en el mismo orden. El pie dice lo ganado, el saldo y cuándo vence (spec §6). En una cuenta que todavía no se cobra —Comedor imprime antes de cobrar— dice lo que **va a ganar al pagar**. Para que una reimpresión salga idéntica, en una cuenta cobrada el saldo es el que quedó anotado en su último movimiento (`saldo_visto`), no el de hoy.

**Files:**
- Modify: `apps/pos/app/lib/print/tipos.ts` (`DatosTicketImpresion`, ≈70-91)
- Modify: `apps/pos/app/lib/print/ticket-datos.ts` (`Ctx` :8, select :77, retorno ≈199-223)
- Modify: `apps/pos/app/lib/print/ticket-builder.ts` (totales ≈98, pie ≈116)
- Modify: `apps/pos/app/components/recibo-ticket.tsx` (totales ≈138, pie ≈170)
- Modify: `apps/pos/app/components/pantalla-consulta-cuentas.tsx:253-256`
- Modify: `apps/pos/app/components/home-pos.tsx` (las tres lecturas para comanda: ≈792, ≈839, ≈1145)
- Test: `apps/pos/app/lib/print/__tests__/ticket-datos.test.ts`, `ticket-builder.test.ts`

**Interfaces:**
- Consumes: `leerPrograma` de `../lealtad`; `puntosPorCompra`, `fechaCorta`, `Programa` de `../lealtad-reglas`.
- Produces:
  - `type LealtadImpresion = { cliente: string | null; unidad: "puntos" | "sellos"; ganado: number; porGanar: number; saldo: number | null; venceEl: string | null }`
  - `DatosTicketImpresion.lealtad?: LealtadImpresion | null` y `DatosTicketImpresion.totales.lealtad?: number` (opcionales: hay otros lugares que construyen estos datos y no deben romperse)
  - `resumenLealtadTicket(e): LealtadImpresion` (pura) en `ticket-datos.ts`
  - `cantidadLealtad(n, unidad): string` en `ticket-builder.ts`
  - `Ctx.conLealtad?: boolean` en `leerTicketParaImpresion` (por omisión, sí)

- [ ] **Step 1: Pruebas que fallan — `resumenLealtadTicket`**

Añade al final de `apps/pos/app/lib/print/__tests__/ticket-datos.test.ts` (y `resumenLealtadTicket` al import de `../ticket-datos`):

```ts
describe("resumenLealtadTicket — el pie de lealtad del ticket", () => {
  const programa = { mecanica: "PUNTOS_DINERO" as const, version: 2, porcentaje: 5, pesosPorPunto: null, compraMinima: 0, topeComprasDia: 3 };
  const base = {
    programa, clienteNombre: "Ana Gómez", cobrada: true, baseComida: 200, esApp: false,
    movimientos: [{ tipo: "GANADO", puntos: 10, saldo_visto: 130, programa_version: 2, fecha: "2026-10-06T18:00:00+00:00" }],
    saldo: { saldo: 500, vence_el: "2027-04-05", programa_version: 2 },
  };

  it("cuenta cobrada: lo ganado y el saldo que quedó ESE día, para que la reimpresión salga idéntica", () => {
    expect(resumenLealtadTicket(base)).toEqual({ cliente: "Ana", unidad: "puntos", ganado: 10, porGanar: 0, saldo: 130, venceEl: "2027-04-05" });
  });

  it("una devolución parcial baja lo ganado; nunca sale negativo", () => {
    const movimientos = [
      ...base.movimientos,
      { tipo: "REVERSA_GANADO", puntos: -4, saldo_visto: 126, programa_version: 2, fecha: "2026-10-06T19:00:00+00:00" },
    ];
    expect(resumenLealtadTicket({ ...base, movimientos })).toMatchObject({ ganado: 6, saldo: 126 });
    expect(resumenLealtadTicket({ ...base, movimientos: [{ ...movimientos[1] }] })).toMatchObject({ ganado: 0 });
  });

  it("cuenta sin cobrar: dice lo que ganará al pagar y el saldo de hoy", () => {
    expect(resumenLealtadTicket({ ...base, cobrada: false, movimientos: [] }))
      .toEqual({ cliente: "Ana", unidad: "puntos", ganado: 0, porGanar: 10, saldo: 500, venceEl: "2027-04-05" });
  });

  it("un canje sin cobrar no cuenta como ganado, pero el saldo ya lo refleja", () => {
    const movimientos = [{ tipo: "CANJE", puntos: -50, saldo_visto: 450, programa_version: 2, fecha: "2026-10-06T18:00:00+00:00" }];
    expect(resumenLealtadTicket({ ...base, cobrada: false, movimientos, saldo: { ...base.saldo, saldo: 450 } }))
      .toMatchObject({ ganado: 0, saldo: 450 });
  });

  it("los movimientos y el saldo de otra versión del programa no valen", () => {
    const r = resumenLealtadTicket({
      ...base,
      movimientos: [{ ...base.movimientos[0], programa_version: 1 }],
      saldo: { saldo: 500, vence_el: "2027-04-05", programa_version: 1 },
    });
    expect(r).toMatchObject({ ganado: 0, saldo: 0, venceEl: null });
  });

  it("cliente nuevo, sin fila de saldo: saldo 0, no null", () => {
    expect(resumenLealtadTicket({ ...base, cobrada: false, movimientos: [], saldo: null })).toMatchObject({ saldo: 0, venceEl: null });
  });

  it("los sellos se llaman sellos, y un pedido de app no promete ganar", () => {
    const sellos = { ...programa, mecanica: "SELLOS" as const };
    expect(resumenLealtadTicket({ ...base, programa: sellos, cobrada: false, movimientos: [] })).toMatchObject({ unidad: "sellos", porGanar: 1 });
    expect(resumenLealtadTicket({ ...base, cobrada: false, movimientos: [], esApp: true })).toMatchObject({ porGanar: 0 });
  });

  it("del cliente solo sale el nombre de pila", () => {
    expect(resumenLealtadTicket({ ...base, clienteNombre: "  María José Pérez " }).cliente).toBe("María");
    expect(resumenLealtadTicket({ ...base, clienteNombre: null }).cliente).toBeNull();
  });
});
```

- [ ] **Step 2: Pruebas que fallan — el papel**

Añade al final de `apps/pos/app/lib/print/__tests__/ticket-builder.test.ts` (y `cantidadLealtad` al import de `../ticket-builder`):

```ts
describe("construirTicketJob — lealtad", () => {
  const LEALTAD = { cliente: "Ana", unidad: "puntos" as const, ganado: 10, porGanar: 0, saldo: 130, venceEl: "2027-04-05" };

  it("sin lealtad el ticket sale exactamente como antes", () => {
    const job = construirTicketJob(DATOS);
    expect(job.bloques.find((b) => b.t === "texto" && b.valor.startsWith("LEALTAD"))).toBeUndefined();
    expect(job.bloques.find((b) => b.t === "fila" && b.izq === "Lealtad")).toBeUndefined();
  });

  it("el canje sale en los totales, aparte del descuento", () => {
    const job = construirTicketJob({ ...DATOS, totales: { ...DATOS.totales, lealtad: 50 } });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Lealtad", der: "-$50.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Descuento", der: "-$12.00" });
  });

  it("el pie dice lo ganado, el saldo y cuándo vence, antes del agradecimiento", () => {
    const job = construirTicketJob({ ...DATOS, lealtad: LEALTAD });
    const i = job.bloques.findIndex((b) => b.t === "texto" && b.valor === "LEALTAD - Ana");
    const gracias = job.bloques.findIndex((b) => b.t === "texto" && b.valor.includes("Gracias"));
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(gracias);
    expect(job.bloques.slice(i, i + 5)).toEqual([
      { t: "texto", valor: "LEALTAD - Ana", align: "centro", bold: true },
      { t: "fila", izq: "Ganaste", der: "10 puntos" },
      { t: "fila", izq: "Tu saldo", der: "130 puntos", bold: true },
      { t: "fila", izq: "Vence", der: "05/04/2027" },
      { t: "separador", estilo: "punteado" },
    ]);
  });

  it("en una cuenta sin cobrar dice lo que ganará al pagar, no lo que ganó", () => {
    const job = construirTicketJob({ ...DATOS, lealtad: { ...LEALTAD, ganado: 0, porGanar: 10, venceEl: null } });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Ganas al pagar", der: "10 puntos" });
    expect(job.bloques.find((b) => b.t === "fila" && b.izq === "Ganaste")).toBeUndefined();
    expect(job.bloques.find((b) => b.t === "fila" && b.izq === "Vence")).toBeUndefined();
  });

  it("uno solo va en singular, y sin nombre el encabezado no deja un guion colgando", () => {
    expect(cantidadLealtad(1, "sellos")).toBe("1 sello");
    expect(cantidadLealtad(1, "puntos")).toBe("1 punto");
    expect(cantidadLealtad(4, "sellos")).toBe("4 sellos");
    const job = construirTicketJob({ ...DATOS, lealtad: { ...LEALTAD, cliente: null } });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "LEALTAD", align: "centro", bold: true });
  });

  it("nada del pie trae caracteres que la impresora cambie por '?'", () => {
    const job = construirTicketJob({ ...DATOS, lealtad: { ...LEALTAD, porGanar: 3 }, totales: { ...DATOS.totales, lealtad: 50 } });
    const i = job.bloques.findIndex((b) => b.t === "texto" && b.valor.startsWith("LEALTAD"));
    const textos = job.bloques.slice(i, i + 6).flatMap((b) => (b.t === "texto" ? [b.valor] : b.t === "fila" ? [b.izq, b.der] : []));
    for (const s of textos) expect(s).toMatch(/^[\x20-\x7e]*$/);
  });
});
```

- [ ] **Step 3: Correr y ver fallar**

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/print/__tests__/ticket-datos.test.ts app/lib/print/__tests__/ticket-builder.test.ts`
Expected: FAIL — `resumenLealtadTicket` y `cantidadLealtad` no existen.

- [ ] **Step 4: `tipos.ts`**

Antes de `export type DatosTicketImpresion`:

```ts
/** Pie de lealtad del ticket (ADR 0030). */
export type LealtadImpresion = {
  /** Solo el nombre de pila: el ticket se queda sobre la mesa. */
  cliente: string | null;
  unidad: "puntos" | "sellos";
  /** Lo que esta cuenta le sumó, neto de devoluciones. 0 = no sumó (o todavía no se cobra). */
  ganado: number;
  /** Lo que sumará al pagar. Solo en una cuenta sin cobrar; no descuenta el tope diario. */
  porGanar: number;
  saldo: number | null;
  /** "AAAA-MM-DD". */
  venceEl: string | null;
};
```

Dentro de `DatosTicketImpresion`, cambia `totales` y añade `lealtad` después de `qrUrl`:

```ts
  /** `lealtad` = lo descontado por canje (tickets.lealtad_mxn). Opcional: no todos los que arman estos datos lo conocen. */
  totales: { subtotal: number; descuentos: number; iva: number; total: number; propina: number; lealtad?: number };
```

```ts
  /** Pie de lealtad. null o ausente = sin cliente, módulo apagado o no se pudo leer: el ticket sale sin él. */
  lealtad?: LealtadImpresion | null;
```

- [ ] **Step 5: `ticket-datos.ts`**

Imports:

```ts
import { leerPrograma } from "../lealtad";
import { puntosPorCompra, type Programa } from "../lealtad-reglas";
import type { DatosEntrega, DatosTicketImpresion, LealtadImpresion, LineaImpresion, PagoImpresion } from "./tipos";
```

`Ctx`:

```ts
type Ctx = {
  token: string; cajeroNombre: string; cajaNombre: string;
  /** false = no leer la lealtad (comandas: cuatro consultas que cocina no necesita en hora pico). */
  conLealtad?: boolean;
};
```

Después de `urlAutofactura`, la función pura y la lectura:

```ts
type MovimientoLealtad = { tipo: string; puntos: number; saldo_visto: number | null; programa_version: number; fecha: string };
type SaldoLealtad = { saldo: number; vence_el: string | null; programa_version: number };

/**
 * Arma el pie de lealtad del ticket. PURA, con pruebas.
 *
 * En una cuenta COBRADA el saldo es el que quedó anotado en su último movimiento (`saldo_visto`): así
 * una reimpresión de la semana que viene dice lo mismo que el papel que se llevó el cliente. En una
 * cuenta sin cobrar es el saldo de hoy, y `porGanar` anuncia lo que sumará al pagar.
 */
export function resumenLealtadTicket(e: {
  programa: Programa;
  /** Los movimientos de ESTE ticket. */
  movimientos: MovimientoLealtad[];
  saldo: SaldoLealtad | null;
  clienteNombre: string | null;
  cobrada: boolean;
  /** Lo que se paga por comida: el total sin los cargos (envío). */
  baseComida: number;
  /** Pedido de una app de delivery: no gana. */
  esApp: boolean;
}): LealtadImpresion {
  const v = e.programa.version;
  const propios = e.movimientos.filter((m) => Number(m.programa_version) === v);
  const ganado = Math.max(0, propios
    .filter((m) => m.tipo === "GANADO" || m.tipo === "REVERSA_GANADO")
    .reduce((s, m) => s + Number(m.puntos), 0));
  const enOrden = [...propios].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  const ultimo = enOrden.length > 0 ? enOrden[enOrden.length - 1] : null;
  const vigente = e.saldo && Number(e.saldo.programa_version) === v ? e.saldo : null;
  const saldo = e.cobrada && ultimo?.saldo_visto != null ? Number(ultimo.saldo_visto) : Number(vigente?.saldo ?? 0);
  const pila = (e.clienteNombre ?? "").trim().split(/\s+/)[0] ?? "";
  return {
    cliente: pila || null,
    unidad: e.programa.mecanica === "SELLOS" ? "sellos" : "puntos",
    ganado,
    porGanar: !e.cobrada && !e.esApp ? puntosPorCompra(e.programa, e.baseComida) : 0,
    saldo,
    venceEl: vigente?.vence_el ?? null,
  };
}

/**
 * Lee lo que el pie de lealtad necesita. Nunca lanza: si algo falla, el ticket sale sin pie. Un
 * ticket que no se imprime por culpa de la lealtad es peor que uno sin saldo.
 */
async function leerLealtadDelTicket(
  sb: ReturnType<typeof employeeClient>,
  token: string,
  t: { id: string; tenantId: string; clienteId: string | null; cobrada: boolean; esApp: boolean; baseComida: number },
): Promise<LealtadImpresion | null> {
  if (!t.clienteId) return null;
  try {
    const { data: mod } = await sb.rpc("modulos_efectivos", { p_tenant: t.tenantId });
    if ((mod as { efectivos?: Record<string, boolean> } | null)?.efectivos?.lealtad !== true) return null;
    const programa = await leerPrograma(token);
    if (!programa) return null;
    const [movs, saldo, cli] = await Promise.all([
      sb.from("lealtad_movimientos").select("tipo, puntos, saldo_visto, programa_version, fecha").eq("ticket_id", t.id),
      sb.from("lealtad_saldos").select("saldo, vence_el, programa_version").eq("cliente_id", t.clienteId).maybeSingle(),
      sb.from("clientes").select("nombre").eq("id", t.clienteId).maybeSingle(),
    ]);
    return resumenLealtadTicket({
      programa,
      movimientos: (movs.data ?? []) as MovimientoLealtad[],
      saldo: (saldo.data ?? null) as SaldoLealtad | null,
      clienteNombre: ((cli.data ?? null) as { nombre: string } | null)?.nombre ?? null,
      cobrada: t.cobrada,
      baseComida: t.baseComida,
      esApp: t.esApp,
    });
  } catch {
    return null;
  }
}
```

En `leerTicketParaImpresion`:

1. En el `.select(...)` de `tickets` (línea 77) añade `lealtad_mxn, estado_fiscal` al final de la lista.
2. Justo antes del `return {`:

```ts
  // Lealtad: lo ganado, el saldo y el vencimiento. Base = lo pagado por comida (total sin cargos).
  const cargos = lineas.filter((l) => l.cargoTipo).reduce((s, l) => s + l.totalMxn, 0);
  const estado = (tk.estado_fiscal as string) ?? "";
  const lealtad = ctx.conLealtad === false
    ? null
    : await leerLealtadDelTicket(sb, ctx.token, {
        id: ticketId,
        tenantId: tk.tenant_id as string,
        clienteId: (tk.cliente_id as string | null) ?? null,
        cobrada: estado === "PAGADO" || estado === "FACTURADO",
        esApp: ((tk.modo_servicio as string) ?? "").startsWith("APP_"),
        baseComida: Math.max(0, Math.round((Number(tk.total_mxn) - cargos) * 100) / 100),
      });
```

3. En el objeto devuelto: dentro de `totales` añade `lealtad: Number(tk.lealtad_mxn ?? 0),` y, después de `qrUrl: …,`, añade `lealtad,`.

- [ ] **Step 6: `ticket-builder.ts`**

Import: `import { fechaCorta } from "../lealtad-reglas";`

Después de `pesos`:

```ts
/** "12 puntos", "1 sello". Solo ASCII: la impresora cambia por '?' todo lo demás. */
export function cantidadLealtad(n: number, unidad: "puntos" | "sellos"): string {
  return `${n} ${n === 1 ? unidad.slice(0, -1) : unidad}`;
}
```

En los totales, después de la fila `Descuento` (línea ≈98):

```ts
  // Canje de lealtad: tercer carril, aparte del descuento manual (igual que en la pantalla).
  if ((d.totales.lealtad ?? 0) > 0) b.push({ t: "fila", izq: "Lealtad", der: `-${pesos(d.totales.lealtad ?? 0)}` });
```

Después de `b.push({ t: "separador", estilo: "solido" });` y antes del comentario `// 6. Pie fiscal`:

```ts
  // 5.b Lealtad (ADR 0030): lo ganado, el saldo y el vencimiento. Antes del agradecimiento: es lo
  //      último que el cliente lee de su cuenta. Sin cliente o con el módulo apagado no se imprime.
  if (d.lealtad) {
    const u = d.lealtad.unidad;
    b.push({ t: "texto", valor: d.lealtad.cliente ? `LEALTAD - ${d.lealtad.cliente}` : "LEALTAD", align: "centro", bold: true });
    if (d.lealtad.ganado > 0) b.push({ t: "fila", izq: "Ganaste", der: cantidadLealtad(d.lealtad.ganado, u) });
    if (d.lealtad.porGanar > 0) b.push({ t: "fila", izq: "Ganas al pagar", der: cantidadLealtad(d.lealtad.porGanar, u) });
    if (d.lealtad.saldo != null) b.push({ t: "fila", izq: "Tu saldo", der: cantidadLealtad(d.lealtad.saldo, u), bold: true });
    if (d.lealtad.venceEl) b.push({ t: "fila", izq: "Vence", der: fechaCorta(d.lealtad.venceEl) });
    b.push({ t: "separador", estilo: "punteado" });
  }
```

- [ ] **Step 7: `recibo-ticket.tsx` — el espejo en pantalla**

Imports: `import { cantidadLealtad } from "../lib/print/ticket-builder";` y `import { fechaCorta } from "../lib/lealtad-reglas";`

En los totales, después del `TotRow` de `Descuento`:

```tsx
        {(datos.totales.lealtad ?? 0) > 0 && (
          <TotRow label="Lealtad" value={`−${fmt(datos.totales.lealtad ?? 0)}`} className="text-[#2E7D52]" />
        )}
```

Después de `<hr className="my-3.5 border-0 border-t border-[#888]" />` y antes del comentario `{/* Pie + QR fiscal */}`:

```tsx
      {/* Lealtad. Espejo MANUAL de construirTicketJob: mismo contenido, mismo orden. */}
      {datos.lealtad && (
        <>
          <div className="text-[10.5px] leading-[1.7]">
            <div className="text-center font-bold">LEALTAD{datos.lealtad.cliente ? ` - ${datos.lealtad.cliente}` : ""}</div>
            {datos.lealtad.ganado > 0 && <PayRow label="Ganaste:" value={cantidadLealtad(datos.lealtad.ganado, datos.lealtad.unidad)} />}
            {datos.lealtad.porGanar > 0 && <PayRow label="Ganas al pagar:" value={cantidadLealtad(datos.lealtad.porGanar, datos.lealtad.unidad)} />}
            {datos.lealtad.saldo != null && <PayRow label="Tu saldo:" value={cantidadLealtad(datos.lealtad.saldo, datos.lealtad.unidad)} />}
            {datos.lealtad.venceEl && <PayRow label="Vence:" value={fechaCorta(datos.lealtad.venceEl)} />}
          </div>
          <DividerDashed />
        </>
      )}
```

(`recibo-ticket.tsx` está en la lista `PAPEL` de `scripts/tipografia.mjs`: ahí los `text-[Npx]` imitan a la impresora y no cuentan.)

- [ ] **Step 8: Consulta de cuentas — renglón «Lealtad»**

En `apps/pos/app/components/pantalla-consulta-cuentas.tsx`, después de `{detalle.totales.descuentos > 0 && <Row k="Descuento" v={-detalle.totales.descuentos} />}` (línea ≈254):

```tsx
                  {(detalle.totales.lealtad ?? 0) > 0 && <Row k="Lealtad" v={-(detalle.totales.lealtad ?? 0)} />}
```

- [ ] **Step 9: Las comandas no leen la lealtad**

En `apps/pos/app/components/home-pos.tsx` hay tres llamadas a `leerTicketParaImpresion` que arman una **comanda** de cocina, no un ticket: dentro de `imprimirComandaCocina` (≈792), en la comanda de cancelación (≈839) y en la reimpresión de comanda (≈1145). En las tres, añade `conLealtad: false` al objeto de contexto:

```tsx
      const datos = await leerTicketParaImpresion(ticketId, {
        token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre, conLealtad: false,
      });
```

Las otras llamadas (ticket de la cuenta ≈1176, tras el cobro ≈1452, `pantalla-consulta-cuentas.tsx:85`, `pantalla-devoluciones.tsx:197`) se quedan como están: por omisión sí la leen.

- [ ] **Step 10: Correr, typecheck y commit**

```bash
cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/print/__tests__ && pnpm --filter @vim/pos typecheck && pnpm tipografia
cd C:/vwtM && git add apps/pos/app/lib/print apps/pos/app/components/recibo-ticket.tsx apps/pos/app/components/pantalla-consulta-cuentas.tsx apps/pos/app/components/home-pos.tsx && git commit -m "feat(lealtad): el ticket imprime el canje, lo ganado, el saldo y el vencimiento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: las 10 suites de `print/__tests__` en verde (las existentes sin cambios: sin `lealtad` el papel es idéntico), typecheck y tipografía limpios.

---

## Task 10: El corte conoce la lealtad

`reporte_x` (0011:295) arma el objeto `tickets` del corte y no conoce `lealtad_mxn`. `reporte_z` no calcula nada: congela lo que dice `reporte_x`. Así que basta redefinir `reporte_x`, y los cortes Z ya emitidos (que guardaron su `payload_completo`) simplemente no traen la clave: quien la lea usa `?? 0`.

**Files:**
- Create: `supabase/migrations/0157_lealtad_corte.sql`
- Create: `supabase/scripts/smoke_lealtad_corte.sql`
- Modify: `apps/pos/app/lib/cierre.ts:8-47`
- Modify: `apps/pos/app/lib/print/reporte-z-builder.ts:42-52` y `:170`
- Modify: `apps/pos/app/components/recibo-z.tsx:125`
- Modify: `apps/pos/app/components/pantalla-cierre.tsx:327`
- Modify: `apps/pos/app/components/pantalla-monitor-ventas.tsx:101`
- Test: `apps/pos/app/lib/print/__tests__/reporte-z-builder.test.ts`

**Interfaces:**
- Produces: `reporte_x(...)->'tickets'->>'lealtad_mxn'`; `ReporteXResumen.lealtad: number`; `DatosReporteZ.lealtad?: number`.

- [ ] **Step 1: El smoke que falla**

Crea `supabase/scripts/smoke_lealtad_corte.sql`:

```sql
-- Smoke lealtad · corte (0157). El corte X reporta lo descontado por canje de lealtad en las cuentas
-- cobradas del turno, aparte de descuentos y promociones, y no cuenta una cuenta que sigue abierta.
-- Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_cli uuid; v_t uuid; v_t2 uuid;
  v_x      jsonb;
BEGIN
  -- aplicar_pago y reporte_x leen al empleado y el tenant del JWT.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Corte', '4770001571') RETURNING id INTO v_cli;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LCOR', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  -- Un turno sin ventas reporta lealtad en cero, no NULL ni ausente.
  v_x := reporte_x(v_turno);
  IF NOT (v_x->'tickets' ? 'lealtad_mxn') THEN RAISE EXCEPTION 'reporte_x no trae la clave lealtad_mxn'; END IF;
  IF (v_x->'tickets'->>'lealtad_mxn')::numeric <> 0 THEN RAISE EXCEPTION 'turno vacío: lealtad % (esperado 0)', v_x->'tickets'->>'lealtad_mxn'; END IF;

  -- Cuenta de $240 con un canje de $40: se cobra en $200.
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcor-1', v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcor-1a');
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcor-1b');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t, v_cli, 40, 40);

  -- Mientras sigue abierta, el corte no la cuenta.
  v_x := reporte_x(v_turno);
  IF (v_x->'tickets'->>'lealtad_mxn')::numeric <> 0 THEN RAISE EXCEPTION 'una cuenta abierta se coló en el corte: %', v_x->'tickets'->>'lealtad_mxn'; END IF;

  PERFORM aplicar_pago(v_t, 'EFECTIVO'::metodo_pago, 200, 200);

  -- Otra cuenta con canje que se queda abierta: tampoco cuenta.
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcor-2', v_maria);
  PERFORM agregar_item_a_ticket(v_t2, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcor-2a');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t2, v_cli, 15, 15);

  v_x := reporte_x(v_turno);
  IF (v_x->'tickets'->>'lealtad_mxn')::numeric <> 40 THEN RAISE EXCEPTION 'lealtad del corte % (esperado 40)', v_x->'tickets'->>'lealtad_mxn'; END IF;
  IF (v_x->'tickets'->>'total_neto_mxn')::numeric <> 200 THEN RAISE EXCEPTION 'venta neta % (esperado 200)', v_x->'tickets'->>'total_neto_mxn'; END IF;
  -- El canje no se cuela en los otros dos carriles.
  IF (v_x->'tickets'->>'descuentos_manuales_mxn')::numeric <> 0 OR (v_x->'tickets'->>'promociones_mxn')::numeric <> 0 THEN
    RAISE EXCEPTION 'el canje se reportó como descuento o promoción';
  END IF;
  -- Y el efectivo esperado es lo que de verdad entró: fondo 500 + 200.
  IF (v_x->>'efectivo_esperado_mxn')::numeric <> 700 THEN RAISE EXCEPTION 'efectivo esperado % (esperado 700)', v_x->>'efectivo_esperado_mxn'; END IF;

  RAISE NOTICE 'SMOKE LEALTAD CORTE OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd C:/vwtM/desktop && node scripts/smokes.mjs smoke_lealtad_corte.sql`
Expected: FAIL con `reporte_x no trae la clave lealtad_mxn`.

- [ ] **Step 3: La migración**

Crea `supabase/migrations/0157_lealtad_corte.sql`. El cuerpo es el de `0011_reportes_cierres.sql:295-414` **copiado íntegro**; el único cambio es la línea `'lealtad_mxn'`:

```sql
-- 0157 · Lealtad en el corte (ADR 0030, plan 1B).
--
-- reporte_x arma el objeto `tickets` del corte X; reporte_z no calcula nada, congela ese mismo objeto
-- en reportes_z_historico.payload_completo. Hasta hoy no conocía tickets.lealtad_mxn (0156): un turno
-- con canjes mostraba la venta neta ya rebajada sin decir por qué. Aquí gana la clave `lealtad_mxn`,
-- hermana de descuentos_manuales_mxn y promociones_mxn.
--
-- Cuerpo copiado ÍNTEGRO de 0011_reportes_cierres.sql:295-414 (única definición vigente). El único
-- cambio es la línea marcada con «0157». Un corte Z ya emitido no gana la clave: quien la lea usa 0.
-- Corre también en el Postgres de cada caja: solo redefine una función de lectura.

CREATE OR REPLACE FUNCTION reporte_x(
  p_turno_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id    uuid := current_tenant_id();
  v_turno        turnos%ROWTYPE;
  v_resultado    jsonb;
  v_pagos_metodo jsonb;
  v_tickets      jsonb;
  v_devoluciones jsonb;
  v_movimientos  jsonb;
  v_efectivo_esperado numeric(12,2);
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no existe o no pertenece al tenant', p_turno_id;
  END IF;

  -- ===== Pagos por método (suma de tickets PAGADO/FACTURADO del turno) =====
  SELECT jsonb_agg(jsonb_build_object(
    'metodo_pago', metodo_pago,
    'monto_total_mxn', monto_total,
    'cantidad_pagos', cantidad
  ) ORDER BY metodo_pago)
  INTO v_pagos_metodo
  FROM (
    SELECT
      p.metodo_pago,
      SUM(p.monto_mxn) AS monto_total,
      COUNT(*) AS cantidad
    FROM pagos p
    JOIN tickets t ON t.id = p.ticket_id
    WHERE p.turno_id = p_turno_id
      AND p.deleted_at IS NULL
      AND p.estado = 'APLICADO'
      AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
    GROUP BY p.metodo_pago
  ) sub;

  -- ===== Tickets del turno =====
  SELECT jsonb_build_object(
    'total_tickets_abiertos',     COUNT(*) FILTER (WHERE estado_fiscal IN ('BORRADOR', 'ABIERTO')),
    'total_tickets_pagados',      COUNT(*) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')),
    'total_tickets_cancelados',   COUNT(*) FILTER (WHERE estado_fiscal = 'CANCELADO'),
    'total_tickets_en_espera',    COUNT(*) FILTER (WHERE en_espera = true AND estado_fiscal = 'ABIERTO'),
    'subtotal_neto_mxn',          COALESCE(SUM(subtotal_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'iva_neto_mxn',               COALESCE(SUM(iva_mxn)      FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'total_neto_mxn',             COALESCE(SUM(total_mxn)    FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'descuentos_manuales_mxn',    COALESCE(SUM(descuentos_manuales_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'promociones_mxn',            COALESCE(SUM(promociones_mxn)        FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'lealtad_mxn',                COALESCE(SUM(lealtad_mxn)            FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),  -- 0157
    'propina_total_mxn',          COALESCE(SUM(propina_mxn)                FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'ticket_promedio_mxn',        COALESCE(AVG(total_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0)
  ) INTO v_tickets
  FROM tickets
  WHERE turno_id = p_turno_id
    AND deleted_at IS NULL;

  -- ===== Devoluciones del turno =====
  SELECT jsonb_build_object(
    'cantidad',      COUNT(*),
    'total_mxn',     COALESCE(SUM(total_devuelto_mxn), 0),
    'por_motivo',    COALESCE(jsonb_object_agg(motivo, count_motivo), '{}'::jsonb)
  ) INTO v_devoluciones
  FROM (
    SELECT
      motivo,
      total_devuelto_mxn,
      COUNT(*) OVER (PARTITION BY motivo) AS count_motivo
    FROM devoluciones
    WHERE turno_id = p_turno_id
      AND estado = 'CONFIRMADA'
      AND deleted_at IS NULL
  ) sub;

  -- ===== Movimientos de caja (inyecciones, retiros, depósitos, devoluciones efectivo) =====
  SELECT jsonb_agg(jsonb_build_object(
    'tipo', tipo,
    'cantidad', cantidad,
    'monto_total_mxn', monto_total
  ))
  INTO v_movimientos
  FROM (
    SELECT
      tipo,
      COUNT(*) AS cantidad,
      SUM(monto_mxn) AS monto_total
    FROM movimientos_caja
    WHERE turno_id = p_turno_id
    GROUP BY tipo
  ) sub;

  -- ===== Efectivo esperado en caja =====
  SELECT calcular_efectivo_esperado(p_turno_id) INTO v_efectivo_esperado;

  -- ===== Construir respuesta completa =====
  v_resultado := jsonb_build_object(
    'reporte_tipo', 'X',
    'turno_id', v_turno.id,
    'turno_estado', v_turno.estado,
    'sucursal_id', v_turno.sucursal_id,
    'caja_id', v_turno.caja_id,
    'usuario_apertura_id', v_turno.usuario_apertura_id,
    'fecha_apertura', v_turno.fecha_apertura,
    'fondo_apertura_mxn', v_turno.fondo_inicial_mxn,
    'fecha_consulta', now(),

    'tickets', v_tickets,
    'pagos_por_metodo', COALESCE(v_pagos_metodo, '[]'::jsonb),
    'devoluciones', v_devoluciones,
    'movimientos_caja', COALESCE(v_movimientos, '[]'::jsonb),

    'efectivo_esperado_mxn', v_efectivo_esperado
  );

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION reporte_x IS 'Lectura intermedia del turno (no cierra ni modifica nada). Idempotente. Devuelve jsonb listo para impresión o UI. 0157: tickets.lealtad_mxn.';
```

Antes de guardar, compara con el original para confirmar que solo cambió esa línea (y el `COMMENT`):

```bash
cd C:/vwtM && diff <(sed -n '295,414p' supabase/migrations/0011_reportes_cierres.sql) <(sed -n '/^CREATE OR REPLACE FUNCTION reporte_x/,/^\$\$;/p' supabase/migrations/0157_lealtad_corte.sql)
```

Expected: una sola diferencia de contenido, la línea `'lealtad_mxn'` (más, si acaso, líneas de comentario del original que caigan en el rango). Si aparece cualquier otra, el cuerpo copiado está mal: corrígelo contra el archivo `0011`, que es el que manda sobre este plan.

- [ ] **Step 4: Correr los smokes**

Run: `cd C:/vwtM/desktop && node scripts/smokes.mjs smoke_lealtad_corte.sql smoke_cierre.sql smoke_lealtad_totales.sql`
Expected: los tres `OK` (el runner aplica todas las migraciones desde cero: un error de sintaxis en la 0157 aparece aquí).

- [ ] **Step 5: La prueba del corte Z impreso, que falla**

Añade a `apps/pos/app/lib/print/__tests__/reporte-z-builder.test.ts`, dentro de `describe("construirReporteZJob", …)`:

```ts
  it("con canjes de lealtad en el turno, el corte los lista aparte de los descuentos", () => {
    const job = construirReporteZJob({ ...D, lealtad: 240 });
    const i = job.bloques.findIndex((b) => b.t === "fila" && b.izq === "-DESCUENTOS :");
    expect(job.bloques[i + 1]).toEqual({ t: "fila", izq: "-LEALTAD    :", der: "$240.00" });
  });

  it("sin canjes (o en un corte anterior a la lealtad) el corte sale igual que siempre", () => {
    expect(construirReporteZJob(D).bloques.find((b) => b.t === "fila" && b.izq.startsWith("-LEALTAD"))).toBeUndefined();
    expect(construirReporteZJob({ ...D, lealtad: 0 }).bloques.find((b) => b.t === "fila" && b.izq.startsWith("-LEALTAD"))).toBeUndefined();
  });
```

Run: `cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/print/__tests__/reporte-z-builder.test.ts`
Expected: FAIL en el primer caso nuevo.

- [ ] **Step 6: El corte en el POS**

`apps/pos/app/lib/cierre.ts` — en `ReporteXResumen`, después de `descuentos: number;`:

```ts
  /** Lo descontado por canjes de lealtad en las cuentas cobradas del turno (0157). */
  lealtad: number;
```

y en `leerReporteX`, después de `descuentos: num(tk.descuentos_manuales_mxn),`:

```ts
    lealtad: num(tk.lealtad_mxn),
```

`apps/pos/app/lib/print/reporte-z-builder.ts` — en `DatosReporteZ`, después de `descuentos: number;`:

```ts
  /** Canjes de lealtad del turno. Opcional: un corte anterior a la 0157 no lo trae. */
  lealtad?: number;
```

y después de la fila `-DESCUENTOS :` (línea ≈170):

```ts
  if ((d.lealtad ?? 0) > 0) b.push({ t: "fila", izq: "-LEALTAD    :", der: pesos(d.lealtad ?? 0) });
```

`apps/pos/app/components/recibo-z.tsx` — después del `FlujoRow` de `-DESCUENTOS :` (línea ≈125):

```tsx
      {(datos.lealtad ?? 0) > 0 && <FlujoRow label="-LEALTAD    :" value={fmt(datos.lealtad ?? 0)} />}
```

`apps/pos/app/components/pantalla-cierre.tsx` — después de `descuentos: Number(tk.descuentos_manuales_mxn ?? 0),` (línea ≈327):

```tsx
      lealtad: Number(tk.lealtad_mxn ?? 0),
```

`apps/pos/app/components/pantalla-monitor-ventas.tsx` — la tarjeta de Descuentos (línea ≈101) dice también lo canjeado:

```tsx
              <Tarjeta titulo="Descuentos" valor={fmtMxn(x.descuentos)} pie={`${stats.cuentasConDescuento} cuenta(s)${x.lealtad > 0 ? ` · lealtad ${fmtMxn(x.lealtad)}` : ""}`} alerta={x.descuentos > 0} />
```

- [ ] **Step 7: Correr, typecheck y commit**

```bash
cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/print/__tests__/reporte-z-builder.test.ts && pnpm --filter @vim/pos typecheck
cd C:/vwtM && git add supabase/migrations/0157_lealtad_corte.sql supabase/scripts/smoke_lealtad_corte.sql apps/pos/app/lib/cierre.ts apps/pos/app/lib/print apps/pos/app/components/recibo-z.tsx apps/pos/app/components/pantalla-cierre.tsx apps/pos/app/components/pantalla-monitor-ventas.tsx && git commit -m "feat(lealtad): el corte X y el Z reportan lo canjeado, aparte de los descuentos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: PASS y sin errores de tipos. Si el typecheck marca otro lugar que construya `ReporteXResumen` a mano, añade ahí `lealtad: 0`.

---

## Task 11: Una cuenta con premio no se factura individual

Decisión de Fermín (6 oct 2026): el producto de regalo sale en $0.00 y esa cuenta no admite factura individual. Hechos del código que lo sostienen:

- La factura **individual** arma un concepto por renglón (`armarConceptos`): el renglón premiado saldría con descuento igual a su importe y base cero, que el Anexo 20 puede rechazar.
- La factura **global** arma un concepto por ticket y por tasa de IVA (`armarConceptosGlobal`, `_shared/pac/conceptos.ts:390`): el regalo se suma al resto de la cuenta y no queda nada en cero, salvo que la cuenta sea solo el premio.
- Los dos caminos de la factura individual (el portal, vía `autofacturar`, y el admin, vía `cfdi_crear_borrador`) terminan en un `INSERT` a `tickets_cfdi`. Un candado ahí cubre a los dos sin copiar otra vez el cuerpo de `cfdi_crear_borrador`.

**Files:**
- Create: `supabase/migrations/0158_lealtad_premio_sin_factura.sql`
- Create: `supabase/scripts/smoke_lealtad_factura.sql`
- Modify: `supabase/functions/autofacturar/index.ts` (≈221)
- Modify: `apps/pos/app/lib/print/ticket-datos.ts` (lectura del QR, ≈173-190, y el `qrUrl` del retorno)

**Interfaces:**
- Produces: `ticket_lleva_premio(p_ticket_id uuid) RETURNS boolean` (RPC para `authenticated` y `service_role`); respuesta `409 { estado: "CON_PREMIO", mensaje }` de `autofacturar`.

- [ ] **Step 1: El smoke que falla**

Crea `supabase/scripts/smoke_lealtad_factura.sql`:

```sql
-- Smoke lealtad · factura (0158). Una cuenta con un premio de producto no admite factura individual
-- y sí entra en la global; una que es SOLO el premio (total $0) no entra en la global; un canje de
-- puntos por dinero se factura como siempre. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_cli uuid; v_cfdi uuid;
  v_premio uuid; v_solo uuid; v_dinero uuid; v_item uuid; v_item2 uuid;
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_fallo  boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Factura', '4770001581') RETURNING id INTO v_cli;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LFAC', v_hoy, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  -- A) Dos hamburguesas, una de premio: se cobra $120.
  v_premio := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lfac-a', v_maria);
  PERFORM agregar_item_a_ticket(v_premio, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-a1');
  v_item := agregar_item_a_ticket(v_premio, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-a2');
  IF ticket_lleva_premio(v_premio) THEN RAISE EXCEPTION 'sin canje no hay premio'; END IF;
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, ticket_item_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_premio, v_cli, v_item, 6, 120);
  IF NOT ticket_lleva_premio(v_premio) THEN RAISE EXCEPTION 'la cuenta con premio no se reconoce'; END IF;
  PERFORM aplicar_pago(v_premio, 'EFECTIVO'::metodo_pago, 120, 120);

  -- B) Una sola hamburguesa, y es el premio: queda pagada en $0.
  v_solo := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lfac-b', v_maria);
  v_item2 := agregar_item_a_ticket(v_solo, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-b1');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, ticket_item_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_solo, v_cli, v_item2, 6, 120);
  UPDATE tickets SET estado_fiscal = 'PAGADO', fecha_pago = now() WHERE id = v_solo;

  -- C) Canje de puntos por dinero: $120 − $30 = $90.
  v_dinero := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lfac-c', v_maria);
  PERFORM agregar_item_a_ticket(v_dinero, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-c1');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_dinero, v_cli, 30, 30);
  PERFORM aplicar_pago(v_dinero, 'EFECTIVO'::metodo_pago, 90, 90);
  IF ticket_lleva_premio(v_dinero) THEN RAISE EXCEPTION 'un canje de dinero no es un premio'; END IF;

  -- 1) La cuenta con premio NO admite borrador de factura individual, y dice por qué.
  v_fallo := false;
  BEGIN
    v_cfdi := cfdi_crear_borrador(
      p_ticket_id := v_premio, p_tipo_comprobante := 'INGRESO'::cfdi_tipo_comprobante,
      p_receptor_rfc := 'XAXX010101000', p_receptor_razon_social := 'PUBLICO EN GENERAL',
      p_receptor_uso_cfdi := 'S01', p_receptor_codigo_postal := '37000', p_receptor_regimen_fiscal := '616',
      p_receptor_email := 'cliente@demo.mx', p_emisor_rfc := 'XAXX010101000',
      p_emisor_razon_social := 'VIM MARKETING SA DE CV', p_emisor_regimen_fiscal := '601',
      p_emisor_lugar_expedicion := '37000', p_metodo_pago_sat := 'PUE', p_forma_pago_sat := '01',
      p_pac_proveedor := 'FACTURAPI'::cfdi_proveedor_pac);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%premio de lealtad%' THEN RAISE EXCEPTION 'falló por otra razón: %', SQLERRM; END IF;
    v_fallo := true;
  END;
  IF NOT v_fallo THEN RAISE EXCEPTION 'una cuenta con premio admitió factura individual'; END IF;

  -- 2) La de canje de dinero SÍ.
  v_cfdi := cfdi_crear_borrador(
    p_ticket_id := v_dinero, p_tipo_comprobante := 'INGRESO'::cfdi_tipo_comprobante,
    p_receptor_rfc := 'XAXX010101000', p_receptor_razon_social := 'PUBLICO EN GENERAL',
    p_receptor_uso_cfdi := 'S01', p_receptor_codigo_postal := '37000', p_receptor_regimen_fiscal := '616',
    p_receptor_email := 'cliente@demo.mx', p_emisor_rfc := 'XAXX010101000',
    p_emisor_razon_social := 'VIM MARKETING SA DE CV', p_emisor_regimen_fiscal := '601',
    p_emisor_lugar_expedicion := '37000', p_metodo_pago_sat := 'PUE', p_forma_pago_sat := '01',
    p_pac_proveedor := 'FACTURAPI'::cfdi_proveedor_pac);
  IF v_cfdi IS NULL THEN RAISE EXCEPTION 'el canje de dinero dejó de ser facturable'; END IF;

  -- 3) La global del día: entra la del premio (hay $120 cobrados), entra la del canje de dinero (su
  --    borrador no está timbrado, así que no cuenta como factura propia), y NO entra la que es solo
  --    el premio ($0: no hay ingreso que amparar y sería un concepto en cero).
  IF NOT EXISTS (SELECT 1 FROM tickets_de_periodo_global(v_tenant, v_hoy, v_hoy) g WHERE g.ticket_id = v_premio) THEN
    RAISE EXCEPTION 'la cuenta con premio se quedó fuera de la global';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets_de_periodo_global(v_tenant, v_hoy, v_hoy) g WHERE g.ticket_id = v_dinero) THEN
    RAISE EXCEPTION 'la cuenta con canje de dinero se quedó fuera de la global';
  END IF;
  IF EXISTS (SELECT 1 FROM tickets_de_periodo_global(v_tenant, v_hoy, v_hoy) g WHERE g.ticket_id = v_solo) THEN
    RAISE EXCEPTION 'una cuenta de puro premio ($0) entró a la global';
  END IF;

  -- 4) Un canje revertido ya no cuenta como premio.
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE ticket_id = v_premio;
  IF ticket_lleva_premio(v_premio) THEN RAISE EXCEPTION 'un premio revertido sigue bloqueando la factura'; END IF;

  RAISE NOTICE 'SMOKE LEALTAD FACTURA OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd C:/vwtM/desktop && node scripts/smokes.mjs smoke_lealtad_factura.sql`
Expected: FAIL con `function ticket_lleva_premio(uuid) does not exist`.

- [ ] **Step 3: La migración**

Crea `supabase/migrations/0158_lealtad_premio_sin_factura.sql`:

```sql
-- 0158 · Una cuenta con premio de lealtad no se factura individual (ADR 0030, plan 1B).
--
-- Decisión de producto (6 oct 2026): el producto de regalo sale en $0.00 y esa cuenta no admite
-- factura individual. La razón es fiscal: la factura individual arma un concepto por renglón, y el
-- renglón premiado saldría con descuento igual a su importe y base de traslado en cero, que el
-- Anexo 20 puede rechazar. La factura GLOBAL no tiene ese problema: arma un concepto por ticket y
-- por tasa (armarConceptosGlobal), así que el regalo se suma al resto de la cuenta. Por eso la
-- cuenta con premio SÍ entra en la global —lo que el cliente pagó es ingreso y debe quedar
-- amparado—, salvo la que es solo el premio: total $0, nada que amparar, y sería un concepto en cero.
--
-- El canje de puntos por dinero no pasa por aquí: es un descuento sobre la cuenta, como cualquiera.
-- Corre también en el Postgres de cada caja: ahí nadie factura, y todo esto es inocuo.

-- ¿La cuenta lleva un premio de producto vivo? SECURITY INVOKER a propósito: un empleado solo ve
-- los canjes de su negocio (RLS de 0156) y las funciones definer que la llaman ven todo.
CREATE OR REPLACE FUNCTION ticket_lleva_premio(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ticket_canjes_lealtad
     WHERE ticket_id = p_ticket_id AND ticket_item_id IS NOT NULL AND NOT revertido);
$$;
COMMENT ON FUNCTION ticket_lleva_premio(uuid) IS
  'TRUE si la cuenta lleva un premio de producto de lealtad sin revertir. Esas cuentas no admiten factura individual (0158).';
REVOKE ALL ON FUNCTION ticket_lleva_premio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ticket_lleva_premio(uuid) TO authenticated, service_role;

-- El candado. Los dos caminos de la factura individual —el portal (autofacturar) y el admin
-- (cfdi_crear_borrador)— terminan en este INSERT. Las globales no tienen ticket_id y pasan; las
-- notas de crédito (EGRESO) también.
CREATE OR REPLACE FUNCTION trg_cfdi_sin_premio()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tipo_comprobante = 'INGRESO' AND NEW.ticket_id IS NOT NULL AND ticket_lleva_premio(NEW.ticket_id) THEN
    RAISE EXCEPTION 'Esta venta incluye un premio de lealtad y no se factura de forma individual. Queda amparada en la factura global.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tickets_cfdi_sin_premio ON tickets_cfdi;
CREATE TRIGGER trg_tickets_cfdi_sin_premio
  BEFORE INSERT ON tickets_cfdi
  FOR EACH ROW EXECUTE FUNCTION trg_cfdi_sin_premio();

-- La global: cuerpo copiado ÍNTEGRO de 0082_factura_global.sql:231-247 (única definición vigente).
-- El único cambio es la última condición, marcada con «0158».
CREATE OR REPLACE FUNCTION tickets_de_periodo_global(p_tenant_id uuid, p_desde date, p_hasta date)
RETURNS TABLE (ticket_id uuid, folio varchar, total_mxn numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT t.id, t.folio_completo, t.total_mxn
    FROM tickets t
   WHERE t.tenant_id = p_tenant_id
     AND t.dia_contable BETWEEN p_desde AND p_hasta
     AND t.estado_fiscal = 'PAGADO'
     AND NOT EXISTS (
       SELECT 1 FROM tickets_cfdi c
        WHERE c.ticket_id = t.id
          AND c.tipo_comprobante = 'INGRESO'
          AND c.estado_sat IN ('TIMBRADO', 'EN_PROCESO_CANCELACION')
     )
     AND NOT EXISTS (SELECT 1 FROM cfdi_global_tickets g WHERE g.ticket_id = t.id)
     -- 0158: una cuenta que es solo un premio de lealtad no tiene ingreso que amparar.
     AND NOT (t.total_mxn = 0 AND ticket_lleva_premio(t.id))
   ORDER BY t.dia_contable, t.folio_completo;
$$;
```

Antes de guardar, confirma que el cuerpo de la global coincide con el vigente salvo esa condición:

```bash
cd C:/vwtM && grep -ln "CREATE OR REPLACE FUNCTION tickets_de_periodo_global" supabase/migrations/*.sql && sed -n '231,247p' supabase/migrations/0082_factura_global.sql
```

Expected: el único archivo con esa definición, además de la 0158, es `0082_factura_global.sql`, y sus líneas son las de arriba sin las dos marcadas «0158». Si hubiera una definición posterior, copia **esa** y aplícale la misma condición.

- [ ] **Step 4: Correr los smokes**

Run: `cd C:/vwtM/desktop && node scripts/smokes.mjs smoke_lealtad_factura.sql smoke_lealtad_totales.sql smoke_global_pendientes.sql`
Expected: los tres `OK`. `smoke_lealtad_totales.sql` crea un borrador de factura sobre una cuenta con canje de **dinero**: debe seguir pasando.

Si `smoke_lealtad_factura.sql` falla en el `UPDATE tickets SET estado_fiscal = 'PAGADO'` del caso B (un trigger que no deja pagar así una cuenta de $0), sustituye esa línea por `PERFORM aplicar_pago(v_solo, 'EFECTIVO'::metodo_pago, 0, 0);`. Lo que el caso necesita es una cuenta `PAGADO` con `total_mxn = 0` y un premio vivo; declara en tu reporte cuál de las dos formas quedó.

- [ ] **Step 5: Las guardias pgTAP**

Las pruebas pgTAP no se ejecutan en local (corren en el CI). Revisa si alguna lleva una lista de funciones que haya que mantener al día:

```bash
cd C:/vwtM && grep -n "quitar_canje_lealtad" supabase/tests/*.test.sql | head
```

Expected: cada archivo que mencione `quitar_canje_lealtad` (la RPC que 1A abrió a `authenticated`) es una guardia de permisos. Si la lista es de funciones ejecutables por `authenticated`, añade `ticket_lleva_premio(uuid)` con el mismo formato que esa línea y sube en uno el `plan(N)` del archivo. Si la lista es solo de funciones `SECURITY DEFINER`, no hay nada que tocar: `ticket_lleva_premio` y `trg_cfdi_sin_premio` son invoker. Anota en tu reporte: «pgTAP revisada, no ejecutada».

- [ ] **Step 6: El portal de autofactura lo dice con sus palabras**

En `supabase/functions/autofacturar/index.ts`, justo **antes** de `const { data: puede } = await sb.rpc("ticket_autofacturable", { p_ticket_id: ticket.id });` (línea ≈221):

```ts
  // Lealtad (0158): una cuenta con un premio de producto no se factura individual. Se dice aquí,
  // con su razón, en vez de dejar que el candado de la base conteste un error genérico al timbrar.
  // Recuperar o reenviar una factura que ya existe no pasa por aquí.
  if (body.accion !== "recuperar" && body.accion !== "enviar") {
    const { data: conPremio } = await sb.rpc("ticket_lleva_premio", { p_ticket_id: ticket.id });
    if (conPremio === true) {
      return json({
        estado: "CON_PREMIO",
        mensaje: "Esta compra incluye un premio de lealtad y no se puede facturar de forma individual.",
        negocio: tenant.nombre_comercial,
        logo: tenant.logo_png_url,
      }, 409);
    }
  }
```

El portal (`apps/factura/app/lib/portal.ts:86`) ya muestra el `mensaje` de cualquier respuesta que no sea 2xx: no hay que tocarlo.

Run: `cd C:/vwtM && pnpm -s test:functions 2>&1 | tail -3`
Expected: 303/303. Este cambio no tiene prueba unitaria (`autofacturar/index.ts` es el punto de entrada y no se prueba aislado): se cubre en la prueba manual de la Tarea 12.

- [ ] **Step 7: El ticket de una cuenta con premio no imprime el QR de factura**

Imprimir «¿Necesitas factura? Escanea el código» en un ticket que no se puede facturar es prometer algo que el portal va a negar. En `apps/pos/app/lib/print/ticket-datos.ts`, después del bloque que pide `tokenQr` (≈línea 190):

```ts
  // Lealtad (0158): una cuenta con un premio de producto no admite factura individual, así que su
  // ticket no invita a pedirla. Si la consulta falla, el QR sale como siempre: el portal lo dirá.
  let conPremio = false;
  if (qrActivo) {
    try {
      const { data } = await sb.rpc("ticket_lleva_premio", { p_ticket_id: ticketId });
      conPremio = data === true;
    } catch {
      conPremio = false;
    }
  }
```

y en el objeto devuelto cambia la condición del QR:

```ts
    qrUrl: qrActivo && !conPremio ? urlAutofactura(tn.codigo ?? null, (tk.folio_completo as string | null) ?? null, tokenQr) : null,
```

- [ ] **Step 8: Verificar y commit**

```bash
cd C:/vwtM && pnpm --filter @vim/pos exec vitest run app/lib/print/__tests__ && pnpm --filter @vim/pos typecheck
cd C:/vwtM && git add supabase/migrations/0158_lealtad_premio_sin_factura.sql supabase/scripts/smoke_lealtad_factura.sql supabase/functions/autofacturar/index.ts supabase/tests apps/pos/app/lib/print/ticket-datos.ts && git commit -m "feat(lealtad): una cuenta con premio no se factura individual y sí entra en la global

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: pruebas de impresión en verde, typecheck limpio.

---

## Task 12: Documentación y verificación final

**Files:**
- Modify: `docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md` (sección «Lo que queda para los planes 1B y 1C»)

- [ ] **Step 1: Toda la verificación automática**

```bash
cd C:/vwtM && pnpm --filter @vim/pos test 2>&1 | tail -8
cd C:/vwtM && pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos lint && pnpm tipografia
cd C:/vwtM/desktop && node scripts/smokes.mjs 2>&1 | tail -6
cd C:/vwtM && pnpm -s test:functions 2>&1 | tail -3
```

Expected: Vitest en verde con la línea base de la Tarea 0 más las suites nuevas; typecheck, lint y tipografía limpios; **todos** los smokes `OK` (65: los 63 de 1A más `smoke_lealtad_corte.sql` y `smoke_lealtad_factura.sql`); funciones 303/303. No corras `next build`.

- [ ] **Step 2: Actualizar el ADR 0030**

En `docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md`, sustituye la sección «Lo que queda para los planes 1B y 1C» por «Lo que cerró el plan 1B y lo que queda para 1C», con este contenido:

```markdown
## Lo que cerró el plan 1B y lo que queda para 1C

Cerrado en 1B (POS):

- **La cuenta se guarda antes de canjear** y el id del ticket viaja en `canjear` y en `asentar`.
- **El canje avanza por pasos y se reanuda** (`apps/pos/app/lib/lealtad-canje.ts`): el id nace en la
  caja, cada avance se guarda por cuenta en `localStorage`, y reintentar no descuenta dos veces. El
  premio entra primero como renglón; después la nube descuenta; al final se asienta.
- **Canje autorizado que la cuenta rechaza:** el POS lo dice con todas sus letras —los puntos
  vuelven solos en un máximo de 48 horas y desde la caja no se pueden devolver antes— y deja cobrar
  sin el canje.
- **Canje de dinero recortado:** antes de cobrar, si la cuenta bajó por debajo de lo canjeado, el
  POS quita el canje completo (los puntos vuelven) y avisa.
- **Un renglón premiado no se edita** desde el POS; para cambiarlo se quita el canje. Cancelarlo sí
  se puede: la base devuelve los puntos.
- **Con un canje aplicado no se cambia al cliente** de la cuenta.
- **El teléfono se guarda en dígitos** también al registrar un cliente de domicilio. El índice único
  sigue sobre el texto: los clientes capturados antes con formato siguen así.
- **Consumidores de solo lectura:** totales del POS, lista y consulta de cuentas, ticket impreso
  (canje en los totales y pie con lo ganado, el saldo y el vencimiento) y corte X/Z (`reporte_x`,
  migración 0157).
- **La compuerta de Facturama ya no existe** (decisión de Fermín, 6 oct 2026, migración 0158): el
  producto de regalo sale en $0.00 y **una cuenta con premio no admite factura individual**, ni en
  el portal ni en el admin (candado `trg_tickets_cfdi_sin_premio`); su ticket no imprime el QR de
  factura. **Sí entra en la factura global**, que arma un concepto por ticket y no por producto, y
  así lo que el cliente pagó queda amparado. La cuenta que es solo el premio ($0) queda fuera de la
  global. El canje de puntos por dinero se factura como siempre. Conviene que el contador del
  negocio lo confirme antes de encender premios en un negocio que factura mucho.

Sigue abierto:

- **Una cuenta con productos de varias tasas de IVA y un premio** puede dejar en cero, dentro de la
  global, el grupo de una tasa (cuando el premio es el único producto de esa tasa en la cuenta).
  Hoy casi todo el catálogo va al 16 %; si un negocio mezcla tasas y regala productos, hay que
  revisarlo antes de encenderle los premios.
- **La factura global con cuentas premiadas no se ha timbrado nunca**: el razonamiento sale del
  código, no de una prueba contra el PAC. La primera global de un negocio con premios hay que mirarla.
- **El premio entra sin modificadores** (el producto base, una pieza). Un producto que exige elegir
  algo —el término de la carne— llega a cocina sin esa elección. Elegir modificadores del premio, y
  decidir si un premio con extras caros sale gratis completo, es decisión de producto.
- **En Domicilio no se canjea desde la captura**, solo desde la lista de Domicilio: al releer la
  cuenta el carrito pierde al cliente de domicilio.
- **El anuncio «gana X» no descuenta las compras revertidas del día** al calcular el tope; es un
  texto, quien otorga los puntos es la base.
- El admin no debe ofrecer combos como premio (el alta no lo impide; solo falla al canjear).
- `_sincronizar_addons_del_plan` y su espejo en TS.
- Los reportes del admin que leen los descuentos del ticket.
```

- [ ] **Step 3: Commit de la documentación**

```bash
cd C:/vwtM && git add docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md && git commit -m "docs(lealtad): el ADR 0030 dice qué cerró el POS y qué sigue abierto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Prueba manual — DETENTE Y PREGUNTA a Fermín dónde**

La interfaz de este plan no tiene pruebas automáticas (el repo no prueba componentes). Para verla funcionar hace falta una base con la `0156`, la `0157` y la `0158` aplicadas y el módulo encendido. Hay dos caminos y **los dos necesitan que Fermín lo decida**; no elijas tú:

1. **Base local de desarrollo:** aplicar las dos migraciones con `supabase migration up` (no borra datos, pero deja la base local con una migración que todavía puede cambiar antes de mezclar).
2. **VIM Pruebas en producción:** después de aplicar `0156`/`0157`/`0158` y desplegar `lealtad-canje` y `autofacturar` según el orden de salida.

Con el camino elegido, concede el add-on a mano al negocio de pruebas (`tenant_addons` con `LEALTAD`), enciende `configuracion_tenant.modulo_lealtad_activo`, crea una fila en `lealtad_programa` (`PUNTOS_DINERO`, 5 %) y recorre:

| # | Qué haces | Qué debes ver |
|---|---|---|
| 1 | Para llevar, asignas un cliente con teléfono, capturas $200 | Franja: nombre de pila, «0 puntos», «Gana 10 puntos con esta compra»; botón Canjear apagado |
| 2 | Cobras | Ticket con pie «LEALTAD - Nombre», «Ganaste 10 puntos», «Tu saldo 10 puntos» |
| 3 | Otra cuenta de $240 del mismo cliente, tocas Canjear | La cuenta se guarda; el modal propone 10 puntos; «Nuevo total $230» |
| 4 | Canjeas | Renglón «Lealtad −$10.00», total $230, franja «Canje aplicado: 10 puntos», botón «Ver canje» |
| 5 | Cancelas un producto para que la cuenta baje de $10 y tocas Cobrar | Aviso «Se quitó el canje de lealtad»; el cobro no se abre; el saldo vuelve a 10 |
| 6 | Vuelves a canjear, abres Lealtad y tocas Quitar → Quitar canje | El total regresa; el saldo vuelve |
| 7 | Con el canje puesto, intentas cambiar al cliente | «Quita el canje antes de cambiar al cliente» |
| 8 | Canjeas y cobras; abres el monitor de ventas y haces el corte | Tarjeta Descuentos con «· lealtad $10.00»; corte Z con «-LEALTAD : $10.00» |
| 9 | Comedor: abres una mesa con cliente, desde la lista tocas «Canjear puntos» | El mismo modal; al canjear, la lista se actualiza y el detalle muestra «Lealtad» |
| 10 | Desconectas la red de la caja y abres Lealtad | «Sin conexión con la nube. El canje necesita internet.»; quitar un canje ya puesto sigue funcionando |
| 11 | Reimprimes desde Consulta el ticket del paso 2, después de haber ganado más puntos | El mismo saldo que el papel original (10), no el de hoy |
| 12 | Registras por Domicilio un cliente con teléfono «477 123-4567» | En la base queda `4771234567`; registrar otro con el mismo número dice de quién es |
| 13 | Cambias el programa a `SELLOS`, das de alta un premio (una hamburguesa, 2 sellos) y haces dos compras con el cliente | La franja dice «2 sellos»; el modal lista el premio como alcanzable |
| 14 | En una cuenta con otro producto, canjeas el premio | La hamburguesa entra a la cuenta con la nota «Premio de lealtad»; el total no sube; renglón «Lealtad −$120.00»; cocina recibe la comanda |
| 15 | Tocas la hamburguesa de premio para editarla | «…es un premio de lealtad. Para cambiarlo, quita el canje desde Lealtad.» |
| 16 | Cobras e imprimes | La hamburguesa de premio sale en $0.00; el ticket **no** trae el QR de factura |
| 17 | Intentas facturar ese folio en el portal de autofactura y desde el admin | Portal: «Esta compra incluye un premio de lealtad y no se puede facturar de forma individual.» Admin: el mismo motivo |
| 18 | Cobras una cuenta con canje de puntos por dinero | Su ticket sí trae el QR y se factura normal |
| 19 | Dejas un canje a medias (corta la red justo al canjear y cierra el modal) y tocas Cobrar, en la captura y desde la lista | Aviso «Hay un canje a medias»; el cobro no abre ni se abre el cajón. Tras Reintentar o descartar en Lealtad, cobra normal |
| 20 | Canjeas desde un segundo dispositivo sobre la misma mesa y cobras en el primero, sin recargar | Cobra con el total correcto (el de la base, con el canje) y NO quita el canje |
| 21 | Venta rápida de Para llevar (sin mesa): con cliente asignado, canjeas un premio desde la captura | El carrito se reconstruye con el premio dentro; la cuenta sigue siendo la misma |
| 22 | Canjeas un premio desde la lista de cuentas | Cocina recibe la comanda del producto de premio |

Anota cada desviación. Lo que no coincida se arregla antes de pedir revisión.

- [ ] **Step 5: Cerrar**

Usa la skill `superpowers:finishing-a-development-branch`. Recuerda al presentar las opciones: la rama se apila sobre `feat/lealtad-1a`; el PR, si se abre, va **contra `feat/lealtad-1a`** mientras el #110 no esté mezclado, y no se mezcla nada antes de aplicar `0156`, `0157` y `0158` en producción, desplegar `lealtad-canje` y volver a desplegar `autofacturar`.

---

## Límites conocidos de este plan

- **La UI no tiene pruebas automáticas.** `modal-canje-lealtad.tsx` y los cambios de `home-pos.tsx`, `sidebar-ticket.tsx` y `pantalla-cuentas-modo.tsx` se cubren con typecheck, lint y la prueba manual de la Tarea 12. Toda la lógica que puede fallar en silencio (qué gana una compra, el orden del canje, el reintento, el recorte, el pie del ticket) está en módulos puros con pruebas.
- **`lealtad-canje` y el manejador del gateway siguen sin haberse ejecutado de punta a punta** (límite heredado de 1A). La prueba manual de la Tarea 12 es su primera corrida real.
- **En la caja, «hay conexión» no significa «hay internet».** `useConexion` le pregunta al gateway local. Por eso el botón Canjear no se fía de él: la prueba de conexión es la consulta de saldo que hace el modal al abrir.
- **El tope diario del anuncio es aproximado** (no descuenta reversas del día).
- **El premio entra sin modificadores** y **Domicilio no canjea desde la captura** (ver el ADR).
- **Con IVA por fuera**, el `lealtad_mxn` de un premio es el importe antes de impuestos; el renglón «Lealtad» lo muestra tal cual.
- **Dos textos de `SALDO_INSUFICIENTE`:** la nube devuelve el saldo real en el rechazo; el modal no lo muestra en el mensaje, pero al recargar tras el rechazo consulta el saldo de nuevo y lo pinta arriba.
