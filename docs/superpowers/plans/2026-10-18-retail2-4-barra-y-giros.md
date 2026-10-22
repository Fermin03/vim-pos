# Retail 2 · Entrega 4 (barra Cobrar/Más y abrir los giros) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dos cosas cierran la segunda tanda de retail:

- La barra de la caja de tienda dice **Cobrar · Inventario · Transacciones · Notificaciones · Más**, y en «Más» van primero Cotizaciones y Créditos.
- Los giros Abarrotes, Frutería, Ferretería y Vinos ya se pueden elegir en el registro, en /platform y en prospectos, y la migración que los libera en `cambiar_giro` queda lista.

**Architecture:**
- **La barra solo cambia de texto.** Los ids internos (`panel`, `configuracion`) se quedan para no tocar decenas de referencias.
- **«Más»** es la página de Configuración de hoy, con otro título y una primera sección **«Ventas»** que trae Cotizaciones y Créditos cuando su módulo está encendido.
- **Los giros nuevos se abren como se abrió ropa** (entrega 5 de ropa): listas de TS, CHECK de prospectos (0214) y una migración aparte (0215) que los quita de la lista de bloqueados de `cambiar_giro`. Esa migración va **después** del instalador.

**Tech Stack:** Next.js + Vitest (`apps/pos`, `apps/admin`, `apps/platform`), `packages/db`, funciones de Supabase (Deno; sus pruebas no se pueden correr aquí), PostgreSQL y smokes.

**Spec:** `docs/superpowers/specs/2026-10-18-giros-retail-2-design.md`: §2, el punto de la barra; §3, los dos primeros puntos; y las secciones «Entrega 1/2/3, hecha».

## Global Constraints

- **Todo en local.** Rama `feat/retail2-barra` encima de `feat/retail2-cotizaciones` (HEAD 94d5624b). 0188–0213 no se editan. Las nuevas son 0214 y 0215, aplicadas al Docker local y registradas.
- **Etiquetas exactas de la barra:** «Cobrar», «Inventario», «Transacciones», «Notificaciones» y «Más». El título de la página «Más» es **«Más»**.
- **Etiquetas de los giros** (ya están en `packages/db/src/operacion.ts:21-24`):
  - «Tienda de abarrotes o supermercado»
  - «Frutería y verdulería»
  - «Ferretería»
  - «Vinos y licores»
- **BAR, CAFETERIA y TAQUERIA siguen bloqueados en `cambiar_giro`.** Son de restaurante y nadie ha pedido abrirlos.
- **Los restaurantes no cambian:** ni su menú general ni su caja.
- Ponytail; español; sin `any`.
- Suites: smokes, pos/admin/platform test y typecheck, tipografía y 0040.

## Review Focus

1. **Un restaurante abre su menú** (el menú general de pantalla completa, que comparte `ContenidoMenu`) y no ve «Ventas», ni Cotizaciones, ni Créditos. → Task 1.
2. **Un texto que todavía dice «Configuración» o «Panel»** donde el cajero lo lee en la tienda (avisos, aria-labels, «Búscala en Configuración › Cotizaciones»). → Task 1.
3. **Un negocio nuevo se registra como Ferretería** y nace con existencias, sin cocina. Sus módulos son los de `juego_inicial_de_giro`. → Task 2, en un smoke del alta.
4. **Cambiar de giro un negocio existente a FRUTERIA:** antes de la 0215 responde 409; después funciona. → Task 2.
5. **El formulario de demo del sitio** no se toca en esta entrega: sigue con los giros viejos, como quedó anotado en la entrega 5 de ropa. → nada que hacer; solo se anota.

---

### Task 1: La barra dice Cobrar y Más; Cotizaciones y Créditos van primero en «Más»

**Files:**
- Modify: `apps/pos/app/components/barra-tienda.tsx` (`DESTINOS` :5-11): «Panel» → «Cobrar» y «Configuración» → «Más». El ícono de «Más» es el de un menú (busca el ícono «menu» en `@vim/ui`). Se actualiza el docblock (:13-17).
- Modify: `apps/pos/app/components/home-pos.tsx`:
  - en la página de la sección `configuracion` (:3354-3379), el `<h1>` dice «Más»;
  - el texto visible «Búscala en Configuración › Cotizaciones.» (:2227) pasa a «Búscala en Más › Cotizaciones.»;
  - se ajustan los comentarios que nombran la barra.
- Modify: `apps/pos/app/components/contenido-menu.tsx`:
  - Cotizaciones y Créditos salen de «Operación» (:140-145) y van en un grupo nuevo **«Ventas»** al principio, que solo se pinta si hay alguno (con su módulo encendido y su prop `onX`);
  - se quitan las notas «temporal: la entrega 4 lo lleva a «Más»».
- Modify: `apps/pos/app/components/seccion-cotizaciones.tsx:64` y `seccion-creditos.tsx:75`: `aria-label="Volver a Más"`, y el docblock ya no dice «temporal».
- Tests:
  - una prueba de la barra (render estático): las cinco etiquetas en orden;
  - `menu-general.test.ts`: con `onCreditos`/`onCotizaciones` y sus módulos, «Ventas» va primero; sin módulos, o en el menú general del restaurante, no aparece y «Operación» sigue terminando en «Abrir cajón», «Retiro / Depósito».

- [ ] Pruebas que fallan → implementar → `pnpm --filter @vim/pos test`, typecheck y tipografía → navegador (controlador) → commit `"Caja de tienda: la barra dice Cobrar y Más"`.

### Task 2: Abrir los giros nuevos (0214, 0215 y listas)

**Files:**
- Create: `supabase/migrations/0214_prospectos_retail2.sql`: `prospectos_giro_check` con los 10 valores de la 0202 más ABARROTES, FRUTERIA, FERRETERIA y VINOS (patrón DROP/ADD de la 0202).
- Create: `supabase/migrations/0215_liberar_retail2.sql`: `cambiar_giro` con el cuerpo vigente de la 0206 (:53 en adelante), quitando los 4 de la lista de no disponibles (:66-67). BAR, CAFETERIA y TAQUERIA se quedan. Mismos grants. Encabezado: «En el lanzamiento va DESPUÉS de publicar el instalador que trae la 0205» (molde: la 0203).
- Modify: `supabase/functions/_shared/alta.ts` (`VERTICALES` :18, `GIRO_ETIQUETA` :21-30) y `alta.test.ts:170-179`, que pasa a «los doce giros que se ofrecen pasan».
- Modify: `supabase/functions/provisionar-tenant/index.ts:33` y `supabase/functions/solicitar-demo/index.ts:64-77`, con sus etiquetas.
- Modify: `apps/admin/app/registro/page.tsx:15-24`: los 4 giros nuevos después de ropa.
- Modify: `packages/db/src/operacion.ts:21-24`: `ofrecido: true`. Ajustar `apps/admin/app/lib/__tests__/operacion-catalogo.test.ts:29-31`.
- Modify: `supabase/scripts/smoke_prospectos_giros.sql:9` (los 4 nuevos aceptados; 'SUPERMERCADO' se sigue rechazando) y `supabase/scripts/smoke_retail2.sql`:
  - 2c: cambiar a FRUTERIA funciona y deja `juego_inicial_de_giro('FRUTERIA')`;
  - en 4d, el comentario ya no dice «todavía lo bloquea»;
  - caso nuevo: un alta con `crear_tenant_con_owner` como FERRETERIA nace con mostrador y existencias, sin cocina (Review Focus 3).

- [ ] Smokes y pruebas que fallan → 0214 y 0215 → aplicar/registrar → smokes completos, 0040, `pnpm --filter @vim/admin test`, `pnpm --filter @vim/platform test` y typecheck de admin, platform y pos → navegador (controlador): /registro del admin muestra los 4 → commit `"Abrir los giros de abarrotes, frutería, ferretería y vinos (0214, 0215)"`.

### Task 3: Documentos y revisión final

- `docs/diseno/pos-retail.md`: la barra (:21-38 y el dibujo :131), la sección «Configuración» (:91-103), que pasa a «Más» con «Ventas» primero, y quitar «entrada temporal» en :311 y :330.
- El spec de retail 2: «Entrega 4, hecha», más un bloque **«Lanzamiento de la segunda tanda»** con el orden completo:
  1. migraciones 0205–0214 a producción antes de las apps (0207 y 0205 son solo `ADD VALUE`);
  2. instalador con 0205/0207;
  3. 0215;
  4. desplegar las funciones de alta, provisión y demo, y el portal de factura;
  5. merge.

  Y recordar que nada sale hasta tener servicios y belleza.
- Suites completas, revisión de toda la rama y commit.

## Rulings de este plan (Fermín puede corregirlos)

- La barra cambia solo de texto; los ids internos se quedan (`panel`, `configuracion`).
- «Más» no es una pantalla nueva: es Configuración con otro título y un grupo «Ventas» arriba.
- El formulario de demo del sitio no se toca: el sitio y el PDF de prospectos se hacen al final de todos los giros.
