# Demo autoguiada de la caja — plan de construcción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un enlace (`demo.vimpos.com.mx`) que abre la caja real (`apps/pos`) en tableta horizontal o PC, crea un Crazy Burgers propio para cada visitante y lo lleva con una guía «Hazlo tú» por un turno completo en 17 pasos.

**Architecture:** La misma app `apps/pos`, compilada con `NEXT_PUBLIC_VIM_DEMO=1` y apuntando a un proyecto de Supabase **gratuito y aparte** de producción. **Iniciar demo** llama a la Edge Function `demo-iniciar`, que llama a la RPC `demo_clonar` (crea tenant, sucursal, caja, cuenta de la caja, Ana con PIN y menú), inicia sesión como la caja y devuelve la sesión. La caja la inyecta con `deviceClient.auth.setSession` y sigue su flujo normal (selector → PIN → turno). La guía es un componente propio que lee el DOM (`[data-tour=…]`) para saber en qué paso va. Un `pg_cron` nocturno borra los tenants de más de 24 h con `eliminar_tenant`.

**Tech Stack:** Next 15 + React 19 + Tailwind 3 (`apps/pos`), Supabase (Postgres + Edge Functions en Deno), vitest, smokes `.sql`.

**Spec:** `docs/superpowers/specs/2026-10-20-demo-autoguiada-design.md` (léelo completo antes de empezar).

## Global Constraints

- Negocio de ejemplo: **Crazy Burgers**, ficticio. Cajera **Ana**, PIN **1234**. Fondo sugerido **$500**. Faltante a propósito: **$20**.
- Recorrido de **17 pasos** en 5 etapas: Abrir turno, Hacer una venta, Monitor de ventas, Cerrar turno, Ver el corte. Barra de avance: «Paso N de 17 · <etapa>».
- Guía **«Hazlo tú»**: no avanza hasta que la persona hace la acción; solo los pasos de explicación llevan botón **Entendido**.
- Entrada directa: botones **Iniciar demo** y **Prefiero explorar solo**. Sin formulario previo.
- WhatsApp de VIM: **+52 56 6508 3346** (`https://wa.me/525665083346`). Precios: **https://vimpos.com.mx/precios**.
- Clon **sin** turnos, tickets, historial, inventario, apps de reparto, add-ons, ni usuario de la dueña.
- **Nada de producción** se toca salvo: la migración (que en producción queda inerte) y la función `solicitar-demo` que ya existe (origen `demo-autoguiada`).
- **El sitio web no se toca.**
- Tableta solo en horizontal. Vertical con ancho ≥ 600 px → «Gira tu tableta». Ancho < 600 px → «Ábrela en una tableta o computadora».
- Código y dominio en español, archivos `kebab-case`, sin `any`, sin dependencias nuevas.
- Todo se trabaja en el worktree `feat/demo-autoguiada`, cortado de `origin/main`. **Sin push, PR ni despliegue sin el OK de Fermín.**

## Review Focus

1. **Pasos fuera de orden** (toca Cobrar antes de agregar la bebida, o se adelanta) → la guía salta al primer paso no cumplido; no se atora. Prueba: `pasoActual` en la Task 4.
2. **Ancla ausente** (abrió el Menú o se fue a Mesas a media guía) → la guía muestra el texto del paso centrado con «Regresa a la pantalla de venta», no un recuadro apuntando a la nada. Prueba: `estadoDelPaso` → `"perdida"` en la Task 4.
3. **Negocio borrado o sesión vencida con la pestaña abierta** → vuelve a la bienvenida, nunca a la pantalla de vincular con correo y contraseña. Verificación manual en la Task 7.
4. **Ráfaga de «Iniciar demo»** (doble toque, bots, una IP insistente) → el botón se desactiva mientras espera; arriba de 5 por IP/hora responde 429 con mensaje claro; con 300 demos vivas responde `DEMO_LLENA`. Prueba del tope en el smoke de la Task 1.
5. **Recargar a media guía** → vuelve a su mismo negocio y al primer paso no cumplido. Prueba: `pasoActual` arranca del índice guardado en la Task 4; verificación manual en la Task 7.

---

### Task 0: Worktree, documentos y ADR

**Files:**
- Create: `docs/decisiones/0044-demo-autoguiada-con-tenant-por-visitante.md`
- Move in: `docs/superpowers/specs/2026-10-20-demo-autoguiada-design.md`, `docs/superpowers/plans/2026-10-20-demo-autoguiada.md`

- [ ] **Step 1:** `git fetch origin && git worktree add ../vwtDemo -b feat/demo-autoguiada origin/main`. Instala dependencias **copiando** de verdad, no con junction (ver memoria «dist con junction»): `pnpm install` en el worktree.
- [ ] **Step 2:** Copia el spec y este plan desde el checkout principal (donde están sin commit) a las mismas rutas del worktree.
- [ ] **Step 3:** Si `0044` ya está ocupado en `origin/main`, usa el siguiente libre. Escribe el ADR con el formato de los demás (`docs/decisiones/README.md`): contexto (ADR 0010 dejó pendiente el tenant de prueba), decisión (proyecto Supabase gratuito aparte, tenant por visitante, borrado a las 24 h, misma app con bandera), consecuencias (cada migración se aplica también al proyecto de demo; la demo se duerme tras 7 días sin uso). Agrégalo al índice del README.
- [ ] **Step 4:** Commit: `docs: ADR 0044 y diseño de la demo autoguiada`.

### Task 1: Migración de la demo y su smoke

**Files:**
- Create: `supabase/migrations/NNNN_demo_autoguiada.sql`
- Create: `supabase/scripts/smoke_demo_autoguiada.sql`

**Interfaces:**
- Produces:
  - Tabla `demo_sesiones(tenant_id uuid PK REFERENCES tenants ON DELETE CASCADE, caja_id uuid NOT NULL, ip text, ultimo_paso smallint NOT NULL DEFAULT 1, creado_en timestamptz NOT NULL DEFAULT now())`. RLS activado, sin políticas.
  - `demo_clonar(p_caja_id uuid, p_clave text, p_ip text) RETURNS TABLE(tenant_id uuid, correo text)`. SECURITY DEFINER; `EXECUTE` solo para `service_role`. Lanza `DEMO_LLENA` si hay ≥ 300 filas en `demo_sesiones`.
  - `demo_registrar_paso(p_paso smallint) RETURNS void`. SECURITY DEFINER; `EXECUTE` para `authenticated`. Toma el tenant de `auth.jwt()->>'tenant_id'` y hace `ultimo_paso = GREATEST(ultimo_paso, p_paso)`; con un tenant sin fila no hace nada.
  - `demo_limpiar() RETURNS integer` (cuántos borró). Solo `service_role`.
  - Job `pg_cron` `demo-limpiar`, diario a las 04:40 → `SELECT public.demo_limpiar()`.

- [ ] **Step 1: Número.** Toma el siguiente número libre **por encima del más alto en `origin/main` y en todas las ramas locales** (`git branch -a` + `git ls-tree <rama> supabase/migrations`); hoy las ramas locales llegan a 0260. Anota el número en el ADR.
- [ ] **Step 2: Escribe el smoke que falla**, con el estilo de `supabase/scripts/smoke_provisioning.sql` (`DO $$ … RAISE EXCEPTION … $$`). Aserciones:
  - `demo_clonar(gen_random_uuid(), 'clave-prueba-123', '1.2.3.4')` devuelve un `correo` = `caja-<p_caja_id>@dispositivos.vimpos.com.mx`.
  - Para ese tenant: 1 sucursal, 1 caja con id `p_caja_id`, ≥ 8 productos, ≥ 1 grupo de modificadores ligado a una hamburguesa, ≥ 1 mesa; **0** turnos, **0** tickets, **0** filas en `tenant_addons`, **0** usuarios con rol DUENO.
  - Existe un `usuarios_perfil` llamado `Ana` y `verificar_pin_login(<ana_id>, '1234', …)` lo acepta (usa la firma real de `0006:263`).
  - Con `set_config('request.jwt.claims', '{"sub":"<id de la caja>","tenant_id":"<tenant>","tipo_identidad":"DISPOSITIVO","role":"authenticated"}', true)`, `mi_acceso()` **no** devuelve nivel `bloqueado`.
  - `demo_registrar_paso(5)` y luego `demo_registrar_paso(3)` dejan `ultimo_paso = 5`.
  - Con 300 filas en `demo_sesiones` (insértalas apuntando a tenants creados con `demo_clonar` o, si es muy lento, baja el tope con una constante y documenta), el siguiente `demo_clonar` lanza `DEMO_LLENA`.
  - Un tenant con `creado_en = now() - interval '25 hours'` desaparece tras `demo_limpiar()` (y su `auth.users` de la caja también); uno de hace 1 hora sigue.
- [ ] **Step 3:** `npm run smokes` en `desktop/` → FAIL en `smoke_demo_autoguiada` («function demo_clonar does not exist»).
- [ ] **Step 4: Implementa la migración.**
  - `demo_clonar` es la **versión parametrizada** de `sitio-web/_capturas/semilla-demo.sql`, solo sus secciones :101–:163 (tenant, sucursal, una caja, `configuracion_tenant`, `auth.users` de la caja y de Ana con tokens en `''` y no NULL, `usuarios_perfil` con `pin_hash = crypt('1234', gen_salt('bf'))`, `usuarios_acceso` CAJERO y DISPOSITIVO, `tenant_folios_saldo`), más :167–:226 (categorías, productos, modificadores) y :322–:336 (secciones y mesas). Ids con `gen_random_uuid()`, salvo la caja (`p_caja_id`). Contraseña de la caja: `crypt(p_clave, gen_salt('bf'))`. No copies turnos, tickets, comandas, inventario, Rappi, la dueña ni `GO_LIVE`.
  - Tenant: `codigo` = `'demo-' || left(replace(<tenant_id>::text,'-',''), 12)`, estado y plan que hagan pasar la aserción de `mi_acceso` (el plan `QS` de la semilla está inactivo en la nube; usa uno activo, p. ej. ESENCIAL, y no llames a `_sincronizar_addons_del_plan`). `operacion` = `juego_inicial_de_giro('QUICK_SERVICE')` con `kds` y `meseros` en `false`.
  - `demo_limpiar` recorre `demo_sesiones` con `creado_en < now() - interval '24 hours'` (máx. 100 por corrida), pone el tenant en `CANCELADO` sin días de gracia y llama a `eliminar_tenant(id, 'Demo autoguiada vencida', 'sistema-demo', 'ELIMINAR', NULL)`. Si alguna condición de `eliminar_tenant` (`0144:541`) lo impide, satisfácela aquí; no la relajes en `eliminar_tenant`.
  - El `cron.schedule` va dentro de `IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='pg_cron')`, como `0093:52-61`.
  - En producción todo esto queda inerte: tabla vacía, RPCs solo para `service_role` y nadie las llama.
- [ ] **Step 5:** `npm run smokes` → PASS, incluidos los smokes existentes.
- [ ] **Step 6:** `pnpm db:types` y commit: `feat(demo): migración demo_autoguiada (clonar, registrar paso, limpiar)`.

### Task 2: Edge Function `demo-iniciar`

**Files:**
- Create: `supabase/functions/demo-iniciar/index.ts`
- Modify: `supabase/config.toml` (bloque `[functions.demo-iniciar]` con `verify_jwt = false`, junto a `solicitar-demo`, :64)

**Interfaces:**
- Consumes: `demo_clonar` (Task 1); `servir`, `clienteAdmin` de `_shared/http.ts`; `consumirCupos`, `ipDeLaPeticion` de `_shared/limite.ts`.
- Produces: `POST /functions/v1/demo-iniciar`, cuerpo vacío →
  - 200 `{ access_token: string, refresh_token: string }`
  - 404 si `Deno.env.get("VIM_DEMO") !== "1"` (en producción la función no existe para nadie)
  - 429 `{ error: "CUPO" }` · 503 `{ error: "DEMO_LLENA" }` · 500 `{ error: "DEMO_ERROR" }`

- [ ] **Step 1:** Implementa con `servir()`. Orden: bandera `VIM_DEMO` → cupos **5 por IP por hora y 60 globales por hora, modo cerrar** → `crypto.randomUUID()` para la caja → clave aleatoria de 24 caracteres (`crypto.getRandomValues`) → `rpc("demo_clonar", …)` con `clienteAdmin()` → `signInWithPassword({ email: correo, password: clave })` con un cliente **anon** → responde con los dos tokens. Mapea la excepción `DEMO_LLENA` a 503.
- [ ] **Step 2:** Verifica en local: `supabase start`, `supabase functions serve --env-file <archivo con VIM_DEMO=1>` y `curl -X POST http://127.0.0.1:54321/functions/v1/demo-iniciar -H "apikey: <anon>"` → 200 con dos tokens. Sin `VIM_DEMO` → 404. Seis llamadas seguidas → la sexta da 429.
- [ ] **Step 3:** Commit: `feat(demo): función demo-iniciar`.

### Task 3: Modo demo en la caja

**Files:**
- Create: `apps/pos/app/lib/demo.ts`
- Create: `apps/pos/app/components/demo/bienvenida-demo.tsx`
- Create: `apps/pos/app/components/demo/aviso-pantalla.tsx`
- Modify: `apps/pos/app/page.tsx` (estado `vincular`, :32-39 y el `useEffect` de :52-85)
- Modify: `apps/pos/app/lib/print/config.ts:74` (`leerConfigImpresoras`)
- Modify: `apps/pos/app/components/menu-general.tsx` (ocultar tiles)
- Modify: `turbo.json` (`globalEnv` += `NEXT_PUBLIC_VIM_DEMO`)
- Test: `apps/pos/app/lib/__tests__/demo.test.ts`

**Interfaces:**
- Produces (en `lib/demo.ts`):
  - `export const MODO_DEMO: boolean` = `process.env.NEXT_PUBLIC_VIM_DEMO === "1"`
  - `export async function iniciarDemo(): Promise<void>`: `POST urlFuncion("demo-iniciar")` con `encabezadosFuncion()` sin token; con 200 hace `deviceClient.auth.setSession(tokens)` y `guardarIdent({ email })`; si no, lanza `Error` con el código (`CUPO`, `DEMO_LLENA`, `DEMO_ERROR`).
  - `export const LLAVE_GUIA = "vimpos.demo.guia"`: en localStorage, `{ activa: boolean, indice: number }`.
- Produces (componentes): `<BienvenidaDemo onListo={(conGuia: boolean) => void} />`, `<AvisoPantalla />`.

- [ ] **Step 1: Test que falla** en `demo.test.ts`, con el estilo de `precios-visibles.test.ts` (`vi.resetModules()` + `await import`): con `NEXT_PUBLIC_VIM_DEMO="1"`, `MODO_DEMO === true`; sin la variable, `false`. Y con `fetch` simulado devolviendo 503 `{error:"DEMO_LLENA"}`, `iniciarDemo()` rechaza con `"DEMO_LLENA"`.
- [ ] **Step 2:** `pnpm --filter pos test` → FAIL.
- [ ] **Step 3: Implementa `lib/demo.ts`.**
- [ ] **Step 4:** `pnpm --filter pos test` → PASS.
- [ ] **Step 5: Bienvenida.** Pantalla completa con el texto del paso 1 del spec y los dos botones. Al tocar uno: desactiva ambos, muestra «Preparando tu negocio…», llama a `iniciarDemo()`, guarda `LLAVE_GUIA = { activa: <botón>, indice: 0 }` y llama a `onListo`. Errores: `CUPO` → «Ya iniciaste varias demos. Intenta en una hora.»; `DEMO_LLENA` / `DEMO_ERROR` → «La demo no está disponible ahora. Escríbenos por WhatsApp.» con el enlace. (Los textos finales los ajusta James en la Task 6.)
- [ ] **Step 6: `page.tsx`.** Con `MODO_DEMO`, el estado `vincular` (con o sin `motivo`) renderiza `<BienvenidaDemo>` en lugar de `<VincularDispositivo>`, y `onListo` hace lo mismo que `onVinculado` (pasar a `selector`). `<AvisoPantalla />` se monta solo con `MODO_DEMO`.
- [ ] **Step 7: Aviso de pantalla, solo con CSS.** Un `div` fijo encima de todo, oculto por defecto, con dos mensajes. `@media (max-width: 599px)` muestra «Ábrela en una tableta o computadora»; `@media (min-width: 600px) and (orientation: portrait)` muestra «Gira tu tableta». Sin JavaScript.
- [ ] **Step 8: Impresión.** En `leerConfigImpresoras`, con `MODO_DEMO` devuelve `CONFIG_POR_DEFECTO` (preview) sin leer localStorage.
- [ ] **Step 9: Ocultar.** Con `MODO_DEMO`, en `menu-general.tsx` no se muestran «Configurar impresoras y pantallas», «Cambiar mi PIN» ni «Abrir cajón». Cocina, Uber, lealtad, tienda y terminal ya se ocultan solas: el clon no tiene add-ons, `kds` va apagado y no hay `terminal_conexiones`. Compruébalo en la Task 7; no agregues condiciones para ellas.
- [ ] **Step 10:** `pnpm --filter pos typecheck` → sin errores. Commit: `feat(demo): modo demo en la caja (bienvenida, aviso de pantalla, impresión en pantalla)`.

### Task 4: La guía

**Files:**
- Create: `apps/pos/app/lib/demo-guia.ts`
- Create: `apps/pos/app/components/demo/guia.tsx`
- Modify (solo atributos `data-tour`): `selector-empleados.tsx`, `modal-pin.tsx`, `abrir-turno.tsx`, `pantalla-inicio.tsx`, `catalogo-productos.tsx`, `modal-modificadores.tsx`, `sidebar-ticket.tsx`, `modal-cobro.tsx`, `cobro-completado.tsx`, `pantalla-monitor-ventas.tsx`, `pantalla-cierre.tsx`, `recibo-z.tsx`
- Modify: `apps/pos/app/page.tsx` (montar `<Guia />` con `MODO_DEMO`)
- Test: `apps/pos/app/lib/__tests__/demo-guia.test.ts`

**Interfaces:**
- Consumes: `MODO_DEMO`, `LLAVE_GUIA` (Task 3); RPC `demo_registrar_paso` (Task 1) vía `deviceClient.rpc`.
- Produces (en `lib/demo-guia.ts`):
  ```ts
  export type Etapa = "Abrir turno" | "Hacer una venta" | "Monitor de ventas" | "Cerrar turno" | "Ver el corte";
  export type Raiz = Pick<Document, "querySelector" | "querySelectorAll">;
  export type Paso = {
    numero: number;            // 2..16 (1 = bienvenida, 17 = pantalla final)
    etapa: Etapa;
    titulo: string;
    texto: string;
    ancla: string;             // selector CSS
    tipo: "hazlo" | "explica"; // "explica" lleva botón Entendido
    abrir?: string;            // solo paso 13: si falta `ancla`, se ilumina este selector con «Tócalo»
    listo: (r: Raiz) => boolean;
  };
  export const PASOS: Paso[];
  export function pasoActual(pasos: Paso[], desde: number, r: Raiz): number; // primer índice ≥ desde cuyo listo() es false; pasos.length si todos están listos
  export function estadoDelPaso(p: Paso, r: Raiz): "visible" | "perdida";    // "perdida" si no existe el ancla
  ```

- [ ] **Step 1: Test que falla.** Con un `Raiz` falso (un objeto cuyo `querySelector` responde según un `Set` de selectores presentes):
  - `PASOS.length === 15`, números 2 a 16 sin huecos, anclas únicas, y las 5 etapas en el orden del spec.
  - `pasoActual(PASOS, 0, raiz)` con nada listo → `0`.
  - Si `listo` de los índices 0–3 da `true` → `4` (se adelantó: no se atora).
  - `pasoActual(PASOS, 6, raiz)` con 0–5 sin cumplir → `6` (al recargar no retrocede a pasos que la pantalla ya no puede mostrar).
  - Todos listos → `15`.
  - `estadoDelPaso` → `"perdida"` sin el ancla y `"visible"` con ella.
- [ ] **Step 2:** `pnpm --filter pos test` → FAIL.
- [ ] **Step 3: Implementa `PASOS`** según los pasos 2–16 del spec. Las anclas son `[data-tour="<id>"]`. `listo` de cada paso «hazlo» = existe el ancla del paso siguiente (p. ej. «elige a Ana» está listo cuando existe `[data-tour="pin"]`); los pasos «explica» (11 ticket, 13 monitor, 16 corte) tienen `listo: () => false` y avanzan solo con el botón Entendido, que guarda `indice = i + 1` (por eso una explicación nunca se salta, aunque la persona se adelante). Excepciones:
  - Paso 7 (extra y nota): listo cuando `[data-tour="ticket-item"]` existe y el modal de modificadores ya cerró.
  - Paso 8 (bebida): listo con ≥ 2 `[data-tour="ticket-item"]` (usa `querySelectorAll`).
  - Paso 13 (monitor) es «explica» con `ancla = [data-tour="monitor-pantalla"]` y `abrir = [data-tour="monitor"]`: primero pide tocar «Monitor ventas» y, ya abierto, explica con Entendido. `estadoDelPaso` devuelve `"visible"` si existe `ancla` o `abrir`. Agrega este caso al test del Step 1.
  - Paso 12 (segunda venta) es «explica» con dos botones: **Hacer otra venta** (deja la guía en pausa hasta el siguiente `[data-tour="cobro-completado"]`) y **Saltar**.
- [ ] **Step 4:** `pnpm --filter pos test` → PASS.
- [ ] **Step 5: Anclas.** Agrega `data-tour` en: tarjeta de empleado (`empleado-ana`, el valor sale de `nombre.toLowerCase()`), teclado de PIN (`pin`), campo de fondo y botón de abrir turno (`fondo`, `abrir-turno`), acceso «Para llevar» (`para-llevar`), botón de producto (`producto-<nombre en minúsculas, espacios a guiones>`), modal de modificadores (`modificadores`), renglón del ticket (`ticket-item`), botón Cobrar (`cobrar`), modal de cobro (`cobro`), pago dividido (`pago-dividido`), cobro completado (`cobro-completado`), acceso «Monitor ventas» (`monitor`), pantalla del monitor (`monitor-pantalla`), acceso «Cerrar turno» (`cerrar-turno`), campo de efectivo contado (`conteo-efectivo`), corte generado (`corte`). Nada más cambia en esos archivos.
- [ ] **Step 6: Componente `<Guia />`.**
  - Lee `LLAVE_GUIA`; si `activa` es false, no renderiza nada.
  - Cada 300 ms (`setInterval`, se limpia al desmontar) calcula `pasoActual` desde el índice guardado. Cuando avanza, guarda el índice y llama sin esperar a `deviceClient.rpc("demo_registrar_paso", { p_paso: numero })`, ignorando errores.
  - `"visible"`: recuadro alrededor de `getBoundingClientRect()` del ancla, con `box-shadow: 0 0 0 9999px rgba(0,0,0,.55)` para oscurecer el resto. El recuadro y el oscurecido llevan `pointer-events: none` para que el toque llegue al botón real. Al lado va el globo con título, texto y «Paso N de 17 · Etapa».
  - `"perdida"`: el globo va centrado, con el texto del paso y la línea «Regresa a la pantalla de venta para seguir».
  - Siempre hay un botón **Salir de la guía** (pone `activa: false`).
  - Cuando `pasoActual` llega a `PASOS.length`, muestra la pantalla final (Task 5).
  - Respeta `prefers-reduced-motion` (sin transiciones).
- [ ] **Step 7:** `pnpm --filter pos typecheck` → sin errores. Commit: `feat(demo): guía «Hazlo tú» de 17 pasos`.

### Task 5: Pantalla final y contacto

**Files:**
- Create: `apps/pos/app/components/demo/fin-demo.tsx`
- Modify: `apps/pos/app/components/demo/guia.tsx` (mostrar `<FinDemo />`)

**Interfaces:**
- Consumes: la función de producción `solicitar-demo`, sin cambios. URL en `NEXT_PUBLIC_VIM_PROSPECTOS_URL` (agrégala a `turbo.json`). Payload según el handler actual: `nombre`, `whatsapp`, `negocio`, `origen: "demo-autoguiada"`, honeypot `sitio_web: ""` y `abierto_en` (ms al montar el formulario; el handler exige ≥ 3 s).

- [ ] **Step 1:** Antes de escribir, lee `supabase/functions/solicitar-demo/index.ts` y confirma qué campos son obligatorios. Si exige `giro`, `cajas` o `sucursales`, manda `giro` con el valor del CHECK que corresponda a hamburguesas/comida rápida (`0182`) y deja los demás con el valor que el handler acepte por defecto. No cambies el handler.
- [ ] **Step 2:** `<FinDemo />`: título «Así de fácil es un turno con VIM POS», botón **Hablar con VIM por WhatsApp** (`https://wa.me/525665083346`, nueva pestaña), botón **Ver precios** (`https://vimpos.com.mx/precios`) y el formulario opcional «Déjame tu WhatsApp y te contactamos» (nombre, WhatsApp, negocio). Con 200 → «Listo, te escribimos pronto.»; con error → «No se pudo enviar. Escríbenos por WhatsApp.». Un botón **Seguir explorando** cierra la pantalla y apaga la guía.
- [ ] **Step 3:** Verifica contra Supabase local (`supabase functions serve`): enviar el formulario crea una fila en `prospectos` con `origen = 'demo-autoguiada'`.
- [ ] **Step 4:** `pnpm --filter pos typecheck`. Commit: `feat(demo): pantalla final con WhatsApp, precios y contacto`.

### Task 6: Textos con James

**Files:**
- Modify: `apps/pos/app/lib/demo-guia.ts` (solo `titulo` y `texto`), `bienvenida-demo.tsx`, `fin-demo.tsx`, `aviso-pantalla.tsx` (solo textos)

- [ ] **Step 1:** Pide a James (agente redactor) los textos de bienvenida, de los pasos 2–16, de la pantalla final, del aviso de pantalla y de los errores. Pásale el spec y estas reglas: una o dos frases por paso, voz de quien cobra en la caja, sin jerga, sin marcas ajenas, sin números de clientes reales; cada paso «hazlo» empieza con la acción («Toca…», «Escribe…»).
- [ ] **Step 2:** Pega los textos. `pnpm --filter pos test` → PASS (el test no depende de los textos).
- [ ] **Step 3:** Commit: `copy(demo): textos de la guía`.

### Task 7: Recorrido completo en local y ajustes para iPad

**Files:**
- Modify: según lo que salga. Esperados: `home-pos.tsx:2577` (barra lateral de 240 px) y `pantalla-cierre.tsx:444,536` (paneles de 360/560 px).

- [ ] **Step 1:** Levanta Supabase local con la migración y `demo-iniciar` (`VIM_DEMO=1`, más `pin-login` y `autorizar-pin` servidas). Corre la caja con `NEXT_PUBLIC_VIM_DEMO=1` y `NEXT_PUBLIC_SUPABASE_URL` local (dev server de `apps/pos`, por `.claude/launch.json`).
- [ ] **Step 2:** En la vista previa a **1024×768**, recorre los 17 pasos. Captura cada paso y confirma: el recuadro cae sobre el botón correcto, el toque llega al botón, el corte marca **-$20**, y el monitor y el corte solo muestran la venta de la demo.
- [ ] **Step 3:** Corrige lo que se desborde o quede tapado a 1024×768 y a 1180×820. Usa clases responsivas de Tailwind (`lg:`) para que en escritorio todo siga igual. Vuelve a capturar.
- [ ] **Step 4: Review Focus, a mano.**
  - Toca Cobrar antes de la bebida: la guía se acomoda.
  - Abre el Menú a media guía: aparece «Regresa…».
  - Recarga en el paso 9: vuelve a su negocio y al paso correcto.
  - Borra el tenant con `demo_limpiar()` (o con `creado_en` en el pasado) y recarga: aparece la bienvenida, no la pantalla de vincular.
  - A 768×1024: «Gira tu tableta». A 375×812: «Ábrela en una tableta o computadora».
  - Revisa que Cocina, Uber, lealtad, tienda, terminal y facturación no aparezcan.
  - Abre la caja **sin** `NEXT_PUBLIC_VIM_DEMO`: idéntica a hoy, sin bienvenida, sin guía y con impresoras configurables.
- [ ] **Step 5:** `pnpm typecheck && pnpm --filter pos test && (cd desktop && npm run smokes)` → todo en verde (los rojos de Windows conocidos no cuentan; ver memoria «Pruebas del escritorio en Windows»).
- [ ] **Step 6:** Commit: `fix(demo): pantallas del recorrido en iPad horizontal`.

### Task 8: Puesta en línea — SOLO con el OK de Fermín

Nada de esta tarea corre sin que Fermín lo autorice en el chat. Varios pasos los hace él con su cuenta.

- [ ] **Step 1 (Fermín):** Crear una organización **gratuita** en Supabase y, dentro, el proyecto `vim-pos-demo`. Si su organización actual es de pago, no crearlo ahí, porque se cobra.
- [ ] **Step 2:** `supabase link` al proyecto de demo y `supabase db push` con todas las migraciones de `main` más la de la demo. Activar en el panel el custom access token hook (`public.custom_access_token_hook`), que en la nube no lo prende el `config.toml`.
- [ ] **Step 3:** Secretos del proyecto de demo: `VIM_DEMO=1`, `VIM_JWT_SECRET` (el JWT secret legado del proyecto nuevo; `pin-login` firma HS256 con él), `VIM_CORS_ORIGINS=https://demo.vimpos.com.mx`. Desplegar `demo-iniciar`, `pin-login` y `autorizar-pin` (ver la memoria «Desplegar funciones públicas»: sin `verify_jwt=false` responden «Invalid JWT»).
- [ ] **Step 4 (producción):** agregar `https://demo.vimpos.com.mx` a `VIM_CORS_ORIGINS` del proyecto de producción, para que el formulario final llegue a `solicitar-demo`. Es el único cambio en producción además de aplicar la migración (que queda inerte). La migración va a producción **antes** del merge (memoria «Migraciones: antes del merge»).
- [ ] **Step 5:** En Vercel, un proyecto nuevo `pos-demo` con Root Directory `apps/pos`, variables `NEXT_PUBLIC_VIM_DEMO=1`, `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` del proyecto de demo, y `NEXT_PUBLIC_VIM_PROSPECTOS_URL` de producción. Dominio `demo.vimpos.com.mx`. Respetar el Ignored Build Step de los demás proyectos (memoria «Vercel: límite de despliegues»). Recordar que los créditos de Vercel se agotaron el 17 oct.
- [ ] **Step 6:** En `docs/operacion/`, en el procedimiento de migraciones, agregar una línea: «cada `db push` a producción se repite en `vim-pos-demo`».
- [ ] **Step 7:** Recorrer los 17 pasos en `demo.vimpos.com.mx` desde un iPad real o, si no hay, en la vista previa a 1024×768. Confirmar al día siguiente que el cron borró los tenants de más de 24 h.
