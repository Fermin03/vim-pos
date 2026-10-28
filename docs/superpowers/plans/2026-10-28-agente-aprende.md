# El agente de WhatsApp aprende de cada conversación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada noche un revisor propone hasta 5 lecciones de las conversaciones del día; Fermín las aprueba, corrige o descarta respondiendo por WhatsApp, y el agente usa lo aprobado de inmediato.

**Architecture:** Tabla `wa_lecciones` (migración 0287). Edge Function nueva `whatsapp-aprender` (pg_cron 2:00 CDMX) llama a Claude Sonnet, guarda propuestas y encola un aviso en `wa_avisos_fermin`, que sale a las 9:00 por la tubería que ya existe (`whatsapp-avisos` + plantilla `aviso_fermin`). El webhook enruta los mensajes del número de Fermín a un módulo de revisión (VER / SÍ / NO / corrección / QUITAR). `cerebro.ts` recibe las lecciones aprobadas como un bloque más de instrucciones.

**Tech Stack:** Postgres/Supabase (migración + smoke), Deno Edge Functions (módulos puros con `node --test --experimental-strip-types`), Claude Messages API (`claude-sonnet-5-5` para el revisor), Next.js `apps/platform` (vitest).

**Spec:** `docs/superpowers/specs/2026-10-28-agente-aprende-design.md` (base: `docs/superpowers/specs/2026-10-27-agente-whatsapp-design.md`).

## Global Constraints

- Rama `feat/agente-aprende` (worktree `D:/vwtWa`), sobre `feat/agente-whatsapp` (PR #220). Sin push hasta que Fermín lo diga.
- Migración **0287**, aplicada a producción a mano **antes** del merge (`supabase db push`; producción tiene la 0261 de la demo, que hay que copiar temporalmente para que el push no falle: `git show 8983eaee:supabase/migrations/0261_demo_autoguiada.sql`).
- Español en código, nombres y textos. Al cliente nunca se nombra a Fermín; a Fermín sí se le habla directo.
- Máximo **5** lecciones por noche; caducan a los **3 días**; tope del bloque aprendido **12 000** caracteres (las más recientes primero).
- Tipos de lección: `DUDA`, `TONO`, `PREGUNTA`. Estados: `PENDIENTE` → `ENVIADA` → `APROBADA` | `DESCARTADA` | `CADUCADA`; `APROBADA` → `RETIRADA`.
- Lo comercial (precios, descuentos, promociones, planes, condiciones) **sí se aprende** y se marca `comercial = true`.
- Precedencia en el agente: anti-metas de `reglas.md` > lo aprendido > conocimiento del sitio.
- Ninguna lección guarda datos personales: sin teléfonos (10+ dígitos), correos, ni nombres de cliente; el revisor generaliza.
- Aviso de las 9:00: fila en `wa_avisos_fermin` con `motivo = 'Lecciones'`, `resumen = '<N> lecciones nuevas del asistente; responde VER para verlas'`, `sale_en = wa_siguiente_horario(now())`. No se encola si ya hay lecciones `ENVIADA` sin contestar.
- Textos a Fermín (exactos):
  - lección: `*Lección {i} de {n} · {Duda técnica|Tono|Pregunta sin respuesta}{ · Comercial}*\n{evidencia}\nEl agente aprendería: «{texto}»\nResponde *SÍ*, *NO* o escribe la corrección.`
  - confirmación: `Listo: {a} aprendidas, {d} descartadas.`
  - aviso comercial al aprobar: `Listo. Ojo: desde ahora a todos los que pregunten les digo: «{texto}». Para quitarlo, responde QUITAR a este mensaje o entra a /platform.`
  - sin saber a cuál responde: `Desliza el mensaje de la lección y contesta ahí (o escribe el número: «SÍ 2»).`

## Review Focus

1. **Fermín contesta «sí» sin deslizar con varias lecciones esperando** → no se aprueba ninguna a ciegas; se le pide deslizar o numerar. Test en Task 4.
2. **Fermín escribe algo normal desde su número sin lecciones esperando** («ok», «gracias») → se registra y no se contesta, como hoy. Test en Task 4.
3. **Una corrección trae un teléfono o correo de cliente** → se rechaza con un aviso a Fermín y no se guarda. Test en Task 4.
4. **El revisor devuelve JSON roto o más de 5 propuestas** → se guardan las válidas hasta 5, nunca falla la noche entera. Test en Task 6.
5. **Muchas lecciones aprobadas** → el bloque no pasa de 12 000 caracteres y entran las más recientes. Test en Task 3.

---

### Task 1: Migración 0287 — tabla de lecciones y cron del revisor

**Files:**
- Create: `supabase/migrations/0287_agente_aprende.sql`
- Create: `supabase/scripts/smoke_agente_aprende.sql`

**Interfaces:**
- Produces: tabla `wa_lecciones(id uuid pk default gen_random_uuid(), tipo text CHECK IN ('DUDA','TONO','PREGUNTA'), comercial boolean default false, pregunta text null, texto text not null CHECK length ≤ 2000, evidencia text not null CHECK length ≤ 1000, escenario jsonb null, conversacion_id uuid null references wa_conversaciones on delete set null, estado text CHECK IN ('PENDIENTE','ENVIADA','APROBADA','DESCARTADA','CADUCADA','RETIRADA') default 'PENDIENTE', orden smallint null, wamid_envio text unique null, wamid_confirmacion text unique null, creado_en timestamptz default now(), decidido_en timestamptz null)`. RLS activado sin políticas; `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT` a service_role.
- Produces: `wa_caducar_lecciones() → int` (pasa a `CADUCADA` las `PENDIENTE`/`ENVIADA` con `creado_en < now() - interval '3 days'`, devuelve cuántas) y `wa_aprender_cron()` + `cron.schedule('wa-aprender', '0 8 * * *', …)` (8:00 UTC = 2:00 CDMX) que primero llama `wa_caducar_lecciones()` y luego hace `net.http_post` a `vim_functions_url || '/whatsapp-aprender'` con `x-vim-interno`, mismo patrón y degradación que `wa_avisos_cron` en 0286.

- [ ] **Step 1:** Smoke `smoke_agente_aprende.sql` con `DO`/`ASSERT`: insertar una lección `PENDIENTE` con `creado_en = now() - interval '4 days'` y otra de hoy → `wa_caducar_lecciones()` devuelve 1 y solo la vieja queda `CADUCADA`; un `estado = 'OTRO'` falla por CHECK; `SET ROLE anon` no puede leer `wa_lecciones`.
- [ ] **Step 2:** `cd D:/vwtWa/desktop && npm run smokes -- smoke_agente_aprende.sql` → FAIL.
- [ ] **Step 3:** Escribir la migración.
- [ ] **Step 4:** Smoke → PASS; `npm run smokes` completo → sin rojos nuevos (base 115).
- [ ] **Step 5:** Commit `feat(agente-aprende): tabla de lecciones y cron del revisor`.

### Task 2: El aviso de Meta trae a qué mensaje responde

**Files:**
- Modify: `supabase/functions/_shared/whatsapp/aviso-meta.ts` (tipo `Evento` y `leerAviso`)
- Test: `supabase/functions/_shared/whatsapp/aviso-meta.test.ts`

**Interfaces:**
- Produces: `Evento` de tipo `"mensaje"` con campo nuevo `respondeA: string | null` = `messages[i].context.id` si es string, si no `null`.

- [ ] **Step 1:** Test: mensaje con `context: { id: "wamid.LECCION" }` → `respondeA === "wamid.LECCION"`; sin `context` → `null`. Ajustar los `deepEqual` existentes de mensajes para incluir `respondeA: null`.
- [ ] **Step 2–4:** FAIL → implementar → PASS (`npm run test:functions`).
- [ ] **Step 5:** Commit `feat(agente-aprende): el aviso trae a qué mensaje responde`.

### Task 3: El agente usa lo aprendido

**Files:**
- Create: `supabase/functions/_shared/agente/lecciones/bloque.ts`, `bloque.test.ts`
- Modify: `supabase/functions/_shared/agente/cerebro.ts` (`Turno` y armado de `system`)
- Modify: `supabase/functions/_shared/agente/cerebro.test.ts`
- Modify: `package.json` (`test:functions` + `supabase/functions/_shared/agente/lecciones/*.test.ts`)

**Interfaces:**
- Produces: `type LeccionAprobada = { tipo: "DUDA" | "TONO" | "PREGUNTA"; comercial: boolean; pregunta: string | null; texto: string; decidido_en: string }`
- Produces: `bloqueAprendido(lecciones: LeccionAprobada[], max = 12_000): string` — `""` si no hay; si hay, encabezado fijo `"LO QUE HAS APRENDIDO (aprobado por VIM; manda sobre el conocimiento del sitio, nunca sobre tus reglas de «Lo que nunca haces»):"` y una línea por lección, las más recientes (`decidido_en`) primero, hasta no pasar `max`: DUDA/PREGUNTA → `- Si preguntan «{pregunta}»: {texto}`; TONO → `- Tono: {texto}`; comerciales con prefijo `[comercial] `.
- Produces: `Turno.aprendido?: string`; en `responder`, si no está vacío va como bloque `system` propio **después** del bloque cacheado actual y **antes** del de «Ahora», con su propio `cache_control: { type: "ephemeral", ttl: "1h" }`.

- [ ] **Step 1:** Tests de `bloqueAprendido`: vacío → `""`; DUDA y TONO con el formato exacto; comercial lleva `[comercial] `; 400 lecciones de 100 caracteres → resultado ≤ 12 000 y la primera línea es la más reciente. Test en `cerebro.test.ts`: con `aprendido: "X"` el `system` tiene 5 bloques (4 si `fundadorAbierta: false`), el de lo aprendido es el penúltimo y lleva `cache_control.ttl === "1h"`; sin `aprendido`, igual que hoy.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(agente-aprende): el agente usa lo aprendido`.

### Task 4: Revisión de lecciones por WhatsApp

**Files:**
- Create: `supabase/functions/_shared/agente/lecciones/revision.ts`, `revision.test.ts`

**Interfaces:**
- Consumes: `Evento` con `respondeA` (Task 2).
- Produces: `type Leccion = { id: string; tipo: "DUDA" | "TONO" | "PREGUNTA"; comercial: boolean; pregunta: string | null; texto: string; evidencia: string; estado: string; orden: number | null; wamid_envio: string | null; wamid_confirmacion: string | null }`
- Produces: `interpretar(texto: string): { accion: "VER" } | { accion: "SI" | "NO" | "QUITAR"; numero: number | null } | { accion: "CORRECCION"; numero: number | null; texto: string }` — sin importar mayúsculas ni acentos; «sí», «si», «va», «ok» → SI; «no» → NO; «quitar» → QUITAR; «SÍ 2» / «2 sí» → con número; «2: <texto>» → CORRECCION con número; cualquier otro texto → CORRECCION sin número.
- Produces: `textoLeccion(l: Leccion, i: number, n: number): string` y los textos fijos de Global Constraints.
- Produces: `atenderFermin(e: { wamid: string; texto: string; respondeA: string | null }, deps: DepsRevision): Promise<void>` con `DepsRevision = { lecciones(estados: string[]): Promise<Leccion[]>; actualizar(id: string, cambios: Partial<Leccion> & { decidido_en?: string }): Promise<void>; enviar(texto: string): Promise<{ ok: boolean; wamid: string | null }>; ahora(): Date }`.
- Lógica de `atenderFermin`:
  - `VER` con `PENDIENTE` → envía cada una (hasta 5, en orden de creación), guarda `wamid_envio`, `orden = i` y `estado = 'ENVIADA'`. Sin pendientes → no contesta.
  - Respuesta con `respondeA` igual a un `wamid_envio` de una `ENVIADA` → aplica a esa. Igual a un `wamid_confirmacion` de una `APROBADA` y la acción es `QUITAR` → `RETIRADA`.
  - Sin `respondeA` pero con número → la `ENVIADA` con ese `orden`. Sin número y exactamente una `ENVIADA` → esa. Varias `ENVIADA` → envía el texto «Desliza el mensaje…». Ninguna `ENVIADA` → no contesta (mensaje normal de Fermín).
  - SI → `APROBADA`; NO → `DESCARTADA`; CORRECCION → `APROBADA` con `texto` = corrección (si la corrección contiene un teléfono de 10+ dígitos o un correo, no se guarda: se le contesta «Esa corrección trae datos de un cliente; escríbela sin teléfonos ni correos.»).
  - Al aprobar una `comercial` (o una corrección que mencione `$`, «precio», «descuento», «promo», «plan»: entonces se marca `comercial = true`) → envía el aviso comercial y guarda su `wamid_confirmacion`.
  - Cuando ya no quedan `ENVIADA` → envía la confirmación con los conteos de esa revisión (lecciones decididas desde el primer envío de la tanda).

- [ ] **Step 1:** Tests (deps falsas en memoria): `interpretar` de cada forma; VER manda 3 mensajes y marca `ENVIADA` con `orden` 1..3; respuesta deslizada «sí» aprueba la correcta; «no» descarta; «Mejor di que …» aprueba con ese texto; «SÍ 2» sin deslizar aprueba la 2; «sí» sin deslizar con 2 esperando → manda «Desliza…» y no cambia nada (Review Focus 1); «gracias» sin `ENVIADA` → no envía nada (Review Focus 2); corrección con `4771234567` → no guarda y avisa (Review Focus 3); aprobar comercial manda el aviso comercial; QUITAR a ese aviso → `RETIRADA`; al decidir la última → confirmación «Listo: 2 aprendidas, 1 descartadas.».
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(agente-aprende): revisión de lecciones por WhatsApp`.

### Task 5: Conectar revisión y lo aprendido en el webhook

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`
- Modify: `supabase/functions/_shared/agente/turno.ts` (solo si hace falta pasar `aprendido` en `Turno`)

**Interfaces:**
- Consumes: `atenderFermin` + `DepsRevision` (Task 4), `bloqueAprendido` (Task 3), `respondeA` (Task 2).
- Cambios: tras `wa_registrar_entrante`, si los últimos 10 dígitos de `e.waId` = los de `WA_NUMERO_FERMIN` → `enSegundoPlano(atenderFermin(...))` en vez de `atenderMensaje` (el filtro de `turno.ts` queda como respaldo). `DepsRevision.enviar` manda texto a `WA_NUMERO_FERMIN` con `enviar(cuerpoTexto(...))`. `leerConversacion` carga las `APROBADA` (`tipo, comercial, pregunta, texto, decidido_en`) y pasa `aprendido: bloqueAprendido(...)` al turno.

- [ ] **Step 1:** `npm run test:functions` sigue en verde; `deno check` con el import map de prueba (como en fase 1).
- [ ] **Step 2:** Commit `feat(agente-aprende): el webhook atiende las respuestas de Fermín y carga lo aprendido`.

### Task 6: El revisor nocturno

**Files:**
- Create: `supabase/functions/_shared/agente/lecciones/revisor.ts`, `revisor.test.ts`
- Create: `supabase/functions/whatsapp-aprender/index.ts`
- Modify: `supabase/config.toml` (`[functions.whatsapp-aprender] verify_jwt = false`, comentario), `supabase/functions/README.md`

**Interfaces:**
- Produces: `type Propuesta = { tipo: "DUDA" | "TONO" | "PREGUNTA"; comercial: boolean; pregunta: string | null; texto: string; evidencia: string; escenario: { turnos: string[]; criterios: string[] }; conversacion_id: string | null }`
- Produces: `filtrarPropuestas(crudo: unknown, max = 5): Propuesta[]` — acepta `{ propuestas: [...] }`, descarta las que no cumplan tipos/largos (texto ≤ 2000, evidencia ≤ 1000) o traigan teléfono de 10+ dígitos o correo en `texto`/`pregunta`/`evidencia`, corta a `max`; nunca lanza.
- Produces: `proponer(conversaciones: string, contexto: { conocimiento: string; aprendido: string }, clave: string, f?: typeof fetch): Promise<Propuesta[]>` — Sonnet (`claude-sonnet-5-5`, `max_tokens` 8192), prompt con: prioridades DUDA (Fermín contestó) > TONO (ánimo; ejemplo de cómo habló Fermín) > PREGUNTA (`wa_preguntas` sin respuesta); generalizar y quitar datos personales; no tocar anti-metas; marcar `comercial`; no repetir lo de `aprendido`; un escenario de prueba por propuesta; responder solo JSON. Error de red/HTTP/JSON → `[]` con `console.error`.
- `whatsapp-aprender/index.ts`: POST con `x-vim-interno` (`secretoInternoValido`, 503 sin secreto). Arma el texto de las conversaciones con actividad en las últimas 24 h (mensajes con autor, estado y resumen de sus `wa_avisos_fermin`) más `wa_preguntas` del día; excluye la conversación del número de Fermín. Llama `proponer`, inserta las propuestas como `PENDIENTE`, y si insertó ≥ 1 y no hay `ENVIADA` → inserta el aviso de Global Constraints. Responde `200 "propuestas N"`.

- [ ] **Step 1:** Tests de `filtrarPropuestas`: 7 válidas → 5; una con `4771234567` en evidencia → fuera; tipo `OTRO` → fuera; `null`/basura → `[]` (Review Focus 4). Test de `proponer` con `fetch` falso: respuesta con texto JSON envuelto en prosa → se extrae; HTTP 500 → `[]`.
- [ ] **Step 2–4:** FAIL → implementar → PASS; `deno check` limpio.
- [ ] **Step 5:** Commit `feat(agente-aprende): revisor nocturno de conversaciones`.

### Task 7: /platform — «Aprendido»

**Files:**
- Create: `apps/platform/app/api/whatsapp/lecciones/route.ts` (GET lista; POST `{ accion: "quitar", id }` → `RETIRADA`)
- Create: `apps/platform/app/whatsapp/aprendido/page.tsx` y su componente en `apps/platform/app/components/whatsapp.tsx` (o archivo propio si crece)
- Modify: la bandeja `/whatsapp` con un enlace «Aprendido (N)»
- Test: `apps/platform/app/lib/__tests__/whatsapp.test.ts` (`etiquetaLeccion(estado)`, `etiquetaTipo(tipo)`)

**Interfaces:** `autorizar` + `auditar(sb, { accion: "wa.leccion_quitar", … })` como el resto; `esUuid` en el POST. Lista por estado (Aprobadas primero), con tipo, etiqueta «Comercial», texto, evidencia, fechas y botón **Quitar** en las aprobadas. Sin estilos nuevos (`docs/diseno/platform.md`).

- [ ] **Step 1–4:** vitest de etiquetas FAIL → implementar → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** Verificar en navegador contra el stack local aislado (procedimiento de la fase 1: copia de `supabase/` con `project_id` propio y puertos 546xx, `apps/platform/.env.local` de verificación, `platform-agente-wa` en `.claude/launch.json`), con lecciones sembradas.
- [ ] **Step 6:** Commit `feat(platform): lo aprendido por el agente`.

### Task 8: La evaluación incluye lo aprendido

**Files:**
- Modify: `supabase/functions/_shared/agente/evals/nucleo.ts` (`evaluarEscenario(esc, clave, aprendido = "")` pasa `aprendido` al agente y lo agrega a la información del juez)
- Create: `scripts/evals-agente/exportar-lecciones.mjs` + script npm `agente:lecciones` — lee las `APROBADA` de producción por REST con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del entorno y escribe `scripts/evals-agente/lecciones.json` (`{ lecciones: LeccionAprobada[], escenarios: Escenario[] }`, ids `leccion-<8 primeros del uuid>`, categoría `Aprendido`)
- Modify: `scripts/evals-agente/evaluar.mjs` (si existe `lecciones.json`: suma sus escenarios y pasa `bloqueAprendido(lecciones)` a cada corrida)

- [ ] **Step 1:** Sin `lecciones.json`, `ANTHROPIC_API_KEY=sk-falsa npm run agente:evaluar -- precio-basico` se comporta como hoy (401 controlado). Con un `lecciones.json` de prueba, el reporte lista la categoría «Aprendido».
- [ ] **Step 2:** Commit `test(agente-aprende): la evaluación incluye lo aprendido`.

### Task 9: Puesta en marcha (con Fermín)

- [ ] **Step 1:** Aplicar 0287 a producción (ver Global Constraints) y `supabase functions deploy whatsapp-webhook whatsapp-aprender --no-verify-jwt`.
- [ ] **Step 2: Verificar `context.id` por Kapso**: sembrar una lección `PENDIENTE` de prueba, Fermín escribe «VER» desde su número, desliza la lección y responde «sí». Confirmar en la base que quedó `APROBADA` por `respondeA`. Si Kapso no manda `context`, la numeración («SÍ 1») ya lo cubre: avisar a Fermín de usar números.
- [ ] **Step 3:** Probar desde otro teléfono que el agente usa la lección aprobada.
- [ ] **Step 4:** Correr el revisor a mano una vez (`curl` a `whatsapp-aprender` con el secreto interno no está a la mano: en su lugar, `select wa_aprender_cron();` desde el SQL) y revisar las propuestas que deja.
