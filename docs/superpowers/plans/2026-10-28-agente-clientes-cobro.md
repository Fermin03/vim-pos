# Agente de WhatsApp — cobro, renovación y reactivación · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente de VIM POS pague su mensualidad por WhatsApp con una liga de Mercado Pago y, al confirmarse, el pago quede registrado, la suscripción renovada y la cuenta reactivada (solo si se suspendió por falta de pago), sin que Fermín intervenga.

**Architecture:** Todo lo que decide dinero o identidad vive en Postgres (RPC `SECURITY DEFINER`, solo service_role), y el modelo nunca pasa un `tenant_id` ni un monto. Las herramientas nuevas del agente son envolturas delgadas sobre esas RPC (`_shared/agente/cobro/`). Una función nueva `cobro-vim-webhook` recibe los avisos de pago de Mercado Pago de VIM y aplica el pago en una sola transacción (`wa_aplicar_pago`).

**Tech Stack:** Postgres/Supabase (pgcrypto, RLS), Deno Edge Functions (TypeScript, pruebas con `node --test --experimental-strip-types`), Claude Messages API con herramientas, Mercado Pago Checkout Pro (API de preferencias), WhatsApp Cloud API vía Kapso, Next.js 15 (/platform, vitest).

**Spec:** `docs/superpowers/specs/2026-10-28-agente-clientes-cobro-design.md` (APROBADO 28 oct). Se apoya en `docs/superpowers/specs/2026-10-27-agente-whatsapp-design.md`.

## Global Constraints

- Worktree `D:/vwtCli`, rama `feat/agente-clientes` desde `origin/main` (5caf14ae). **Sin push, PR ni merge sin OK de Fermín.**
- Cargar la skill `ponytail` antes de escribir código: lo mínimo que funcione, el estilo del archivo vecino (comentarios cortos en español). No recorta validación ni seguridad.
- Monto = **plan vigente (con su promoción) + extras + IVA 16 %**, calculado en SQL; **cada periodo al precio de su fecha de inicio**; ANUAL = 12 × el total al mes; máx. **12** periodos por pago.
- Código de verificación: **6 dígitos**, hash con `crypt()`, **15 min**, **un uso**, **5 intentos**. Cupos: **3 por número por hora**, **5 por correo por día**. Verificado **30 días**.
- Liga: Checkout Pro (API de preferencias), **vence en 24 h**, **solo tarjeta de crédito/débito, sin meses** (`excluded_payment_types`: `ticket`, `atm`, `bank_transfer`; `installments: 1`), `binary_mode: true`.
- Reactivación automática **solo** si el negocio está `SUSPENDIDO` con `suspension_tipo = 'FALTA_DE_PAGO'`. Las suspensiones viejas cuentan como **Otro motivo**. `CANCELADO` nunca.
- El agente nunca nombra a Fermín: dice «un agente». Nunca revela nada del negocio antes de verificar. No comparte la CLABE.
- Migración nueva **0288** (main llega a 0287; confirma con `ls supabase/migrations` que nadie la tomó). Va a producción a mano **antes** del merge.
- Secretos nuevos (los carga Fermín con script; nunca en el chat): `MP_VIM_ACCESS_TOKEN`, `MP_VIM_WEBHOOK_SECRET`.
- Pruebas: `npm run test:functions` (raíz), `cd desktop && npm run smokes -- smoke_agente_cobro.sql`, `cd apps/platform && npx vitest run && npx tsc --noEmit`. **Nunca `next build`.**
- Commits pequeños por tarea, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Correo con mayúsculas o espacios** («  Dueno@Correo.com ») → encuentra al mismo dueño. Prueba en el smoke de la Tarea 1 (caso 2c).
2. **El mismo aviso de pago dos veces, o dos avisos a la vez** → un solo pago registrado; el segundo da `DUPLICADO`. Smoke de la Tarea 1 (caso 6b) + prueba de la Tarea 6.
3. **Pago aprobado después de que venció la liga** (el cliente abrió el checkout a tiempo y pagó tarde) → se aplica igual si el monto y la fecha cuadran: el dinero ya entró. Smoke de la Tarea 1 (caso 6e).
4. **Negocio que Fermín suspendió por otro motivo entre la liga y el pago** → se registra y renueva, **no** se reactiva y se avisa a Fermín. Smoke de la Tarea 1 (caso 6d) + prueba de la Tarea 6.
5. **Verificación de hace más de 30 días** → `consultar_adeudo` y `crear_liga_pago` piden verificar otra vez. Smoke de la Tarea 1 (caso 3d).

---

### Task 1: Migración 0288 y su smoke

**Files:**
- Create: `supabase/migrations/0288_agente_cobro.sql`
- Create: `supabase/scripts/smoke_agente_cobro.sql`

**Interfaces:**
- Produces (todas `SECURITY DEFINER`, `SET search_path = public, extensions, pg_temp`, `REVOKE ... FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE ... TO service_role`):
  - `wa_agente_id() RETURNS uuid` → la constante `'00000000-0000-0000-0000-00000000a6e7'` (firma `registrado_por` y `super_admin_id` de la auditoría).
  - `wa_pedir_codigo(p_conversacion_id uuid, p_correo text) RETURNS jsonb` → `{enviar: bool, correo: text|null, codigo: text|null}`.
  - `wa_verificar_codigo(p_conversacion_id uuid, p_codigo text) RETURNS jsonb` → `{ok: bool, motivo: 'SIN_CODIGO'|'VENCIDO'|'INCORRECTO'|'AGOTADO'|null, negocios: [{id, nombre}]}`.
  - `wa_elegir_negocio(p_conversacion_id uuid, p_nombre text) RETURNS jsonb` → `{ok: bool, negocio: text|null, opciones: [text]}`.
  - `wa_adeudo(p_conversacion_id uuid, p_adelanto boolean) RETURNS jsonb` → ver forma abajo.
  - `wa_guardar_factura(p_conversacion_id uuid, p_datos jsonb) RETURNS void`.
  - `wa_crear_intento(p_conversacion_id uuid, p_adelanto boolean) RETURNS jsonb` → `{ok, motivo, intento_id, total, periodos, reusado, preferencia_url}`.
  - `wa_fijar_preferencia(p_intento_id uuid, p_preferencia_id text, p_url text) RETURNS void`.
  - `wa_aplicar_pago(p_intento_id uuid, p_pago_id text, p_monto numeric, p_pagado_el date) RETURNS jsonb` → `{resultado: 'APLICADO'|'DUPLICADO'|'MONTO_DISTINTO'|'FECHA_MOVIDA'|'NO_EXISTE', reactivado: bool, sin_reactivar: bool, proxima_fecha_cobro: date|null, wa_id: text, conversacion_id: uuid, negocio: text, factura: jsonb|null, ultimo_cliente_en: timestamptz|null}`.
  - `wa_avisar_fermin(p_conversacion_id uuid, p_motivo text, p_resumen text) RETURNS void` → inserta en `wa_avisos_fermin` con `sale_en = wa_siguiente_horario(now())` **sin** cambiar estado ni pausa.
- Forma de `wa_adeudo`: `{verificado: bool, puede_cobrar: bool, motivo: 'SIN_VERIFICAR'|'ELEGIR_NEGOCIO'|'SIN_SUSCRIPCION'|'PRECIO_CERO'|'SUSPENDIDO_OTRO'|'CANCELADO'|'MAS_DE_12'|null, negocio: text, plan: text, ciclo: 'MENSUAL'|'ANUAL', estado_negocio: text, suspension_tipo: text|null, proxima_fecha_cobro: date, vencidos: int, periodos: [{desde: date, hasta: date, plan: numeric, extras: numeric, importe: numeric}], subtotal: numeric, iva: numeric, total: numeric, cubre_hasta: date}`.

- [ ] **Step 1: Escribe el smoke (falla porque nada existe)**

Mismo formato que `supabase/scripts/smoke_agente_aprende.sql` (`\set ON_ERROR_STOP on`, `BEGIN; DO $$ ... ASSERT ... $$; ROLLBACK;`). Siembra en la transacción: un dueño en `auth.users` con correo `dueno@prueba.mx`, dos tenants suyos (`A` ACTIVO y `B` SUSPENDIDO con `suspension_tipo='FALTA_DE_PAGO'`), un tenant `C` de otro dueño, suscripción MENSUAL de A con `precio_mensual_mxn=699`, `precio_promocional_mxn=499`, `promocion_hasta` = hoy−1 día (hora de México), `fecha_inicio` = hoy − 2 meses, `proxima_fecha_cobro` = hoy − 1 mes (así los periodos empiezan en hoy−1 mes y hoy, alineados con `_fecha_cobro_siguiente`); un extra vigente de 100 con `cantidad=2` y otro `incluido_en_plan=true` de 349; una conversación `wa_conversaciones`. Casos (cada uno con su `ASSERT ..., '<id>: <qué>'`):

```text
1a wa_agente_id() es el uuid fijo
2a wa_pedir_codigo con correo desconocido → enviar=false, codigo NULL, y NO inserta fila
2b con 'dueno@prueba.mx' → enviar=true, codigo ~ '^\d{6}$', y en wa_codigos solo hay el hash (codigo_hash <> codigo)
2c con '  Dueno@Prueba.MX ' → enviar=true
2d un tenant CANCELADO del dueño no cuenta: si es su único negocio → enviar=false
3a wa_verificar_codigo con el código correcto → ok, negocios = A y B (no C); la conversación queda verificada 30 días
3b el mismo código otra vez → ok=false, motivo 'SIN_CODIGO' (un solo uso)
3c 5 intentos incorrectos → el 6.º con el correcto da 'AGOTADO'; código vencido (expira_en en el pasado) → 'VENCIDO'
3d con verificado_hasta en el pasado → wa_adeudo da verificado=false, motivo 'SIN_VERIFICAR'
4a con dos negocios verificados y sin elegir → wa_adeudo motivo 'ELEGIR_NEGOCIO'; wa_elegir_negocio('a') con nombre ambiguo/inexistente → ok=false con opciones; con el nombre de C → ok=false
5a A con 2 periodos vencidos y promoción que acabó ayer: periodo 1 importe = 499+200, periodo 2 = 699+200 (el extra incluido no suma)
5b subtotal = 1598, iva = 255.68, total = 1853.68; vencidos = 2
5c p_adelanto=true → 3 periodos, el 3.º a 699+200
5d ANUAL: importe del periodo = 12 × (plan + extras)
5e B suspendido por falta de pago → puede_cobrar=true; con suspension_tipo='OTRO' o NULL → puede_cobrar=false, motivo 'SUSPENDIDO_OTRO'
5f sin suscripción ACTIVA/PAUSADA → 'SIN_SUSCRIPCION'; precio 0 → 'PRECIO_CERO'; más de 12 periodos → 'MAS_DE_12'
6a wa_crear_intento → intento PENDIENTE con total 1853.68, vence_en ≈ now()+24h, factura copiada de la conversación, proxima_al_crear guardada; conversación en 'PAGO_PENDIENTE' sin pausar; llamarlo otra vez → reusado=true, mismo id
6b wa_aplicar_pago(intento, 'mp-1', 1853.68, hoy) → 'APLICADO'; pagos_suscripcion con metodo 'TARJETA', referencia 'mp-1', registrado_por wa_agente_id(); proxima avanza 2 meses; repetirlo → 'DUPLICADO' y sigue habiendo 1 pago
6c monto 1853.00 → 'MONTO_DISTINTO', nada registrado; proxima cambiada a mano antes de aplicar → 'FECHA_MOVIDA', nada registrado
6d intento de B (FALTA_DE_PAGO) → reactivado=true: B queda ACTIVO, bloqueo_desde/bloqueo_mensaje/fecha_baja/motivo_baja NULL, y hay fila en super_admin_accesos con accion 'tenant.activo'; con suspension_tipo='OTRO' → APLICADO, reactivado=false, sin_reactivar=true, sigue SUSPENDIDO
6e intento con vence_en en el pasado → se aplica igual ('APLICADO')
7a anon y authenticated no leen wa_codigos ni wa_intentos_pago ni ejecutan wa_aplicar_pago (insufficient_privilege)
7b índice único: un segundo pago TARJETA con referencia 'mp-1' insertado a mano → unique_violation
7c wa_avisar_fermin inserta aviso y no toca estado ni pausado_hasta
```

- [ ] **Step 2: Corre el smoke y confirma que falla**

Run: `cd desktop && npm run smokes -- smoke_agente_cobro.sql` · Expected: FAIL (`function wa_agente_id() does not exist`).

- [ ] **Step 3: Escribe `0288_agente_cobro.sql`**

Contenido, en este orden:
- `tenants.suspension_tipo text NULL CHECK (suspension_tipo IN ('FALTA_DE_PAGO','OTRO'))`.
- `wa_conversaciones`: estados del CHECK + `'PAGO_PENDIENTE','PAGO_POR_CONFIRMAR'`; columnas `verificado_tenants uuid[]`, `verificado_hasta timestamptz`, `tenant_id uuid REFERENCES tenants(id)`, `factura jsonb`.
- `wa_codigos (id, conversacion_id → wa_conversaciones ON DELETE CASCADE, correo text, codigo_hash text, tenants uuid[], intentos int DEFAULT 0, expira_en timestamptz, usado_en timestamptz, creado_en)`.
- `wa_intentos_pago (id, conversacion_id, tenant_id, periodos int CHECK 1..12, desglose jsonb, subtotal, iva, total numeric(10,2), factura jsonb, estado text CHECK IN ('PENDIENTE','PAGADO','RECHAZADO'), proxima_al_crear date, preferencia_id text, preferencia_url text, pago_id text, vence_en timestamptz, pagado_en timestamptz, creado_en)`.
- RLS habilitado sin políticas en las dos tablas nuevas (como `wa_*` en 0286).
- `CREATE UNIQUE INDEX pagos_suscripcion_referencia_tarjeta ON pagos_suscripcion (referencia) WHERE metodo = 'TARJETA';`
- Las RPC de **Interfaces**. Reglas que el smoke no deja adivinar:
  - Correo: `lower(btrim(p_correo)) = lower(u.email)` contra `auth.users u` vía `tenants.usuario_dueno_id`, `estado <> 'CANCELADO'`.
  - Código: 6 dígitos con `gen_random_bytes` (no `random()`), `crypt(codigo, gen_salt('bf'))`. Un código nuevo invalida los pendientes de la conversación.
  - Al verificar con un solo negocio, fija `tenant_id`; con varios, `tenant_id` NULL hasta `wa_elegir_negocio` (compara `lower(nombre_comercial)` exacto contra los de `verificado_tenants`).
  - Periodos: `d0 = COALESCE(proxima_fecha_cobro, fecha_inicio)`, `d(i+1) = _fecha_cobro_siguiente(fecha_inicio, d(i), meses)` con `meses = 12` si ANUAL, si no 1. Vencidos = los `d(i) <= hoy` (hoy = `(now() AT TIME ZONE 'America/Mexico_City')::date`). Al corriente y `p_adelanto` → 1; con vencidos y `p_adelanto` → vencidos+1. Importe del periodo = `(precio_vigente_suscripcion(lista, promo, promo_hasta, d(i)) + Σ extras vigentes en d(i)) × meses`, donde un extra cuenta si `activo AND fecha_inicio <= d AND (fecha_fin IS NULL OR fecha_fin >= d) AND NOT incluido_en_plan`, por `COALESCE(cantidad,1)` (mismo criterio que `totalMensual` de `packages/db/src/cobro.ts`). Redondeo a 2 decimales; `iva = round(subtotal * 0.16, 2)`.
  - `wa_aplicar_pago`: `SELECT ... FOR UPDATE` del intento; si `estado = 'PAGADO'` → DUPLICADO; `abs(p_monto - total) > 0.005` → MONTO_DISTINTO; `proxima_fecha_cobro` actual ≠ `proxima_al_crear` → FECHA_MOVIDA (en los dos casos el intento pasa a RECHAZADO); si no, llama `registrar_pago_suscripcion(tenant, total, 'TARJETA', p_pagado_el, periodos, p_pago_id, 'Pago por WhatsApp', wa_agente_id())`, reactiva si corresponde (mismo patch que `apps/platform/app/api/tenants/[id]/route.ts:151` + `suspension_tipo = NULL` + fila en `super_admin_accesos` con `accion 'tenant.activo'`, `motivo 'Pago con tarjeta por WhatsApp'`, `payload {pago_id, intento_id}`), marca PAGADO, deja la conversación en `ACTIVA`.

- [ ] **Step 4: Aplica en el stack local y corre el smoke**

Run: `cd desktop && npm run smokes -- smoke_agente_cobro.sql` · Expected: PASS. Después, `npm run smokes` completo: los 115+ siguen en verde.

- [ ] **Step 5: Commit** — `feat(agente-cobro): 0288 — verificación, adeudo, intentos de pago y aplicar pago`

---

### Task 2: /platform — tipo de suspensión

**Files:**
- Modify: `apps/platform/app/api/tenants/[id]/route.ts` (bloque `cambiar_estado`, ~132-157)
- Modify: `apps/platform/app/components/zona-peligrosa.tsx` (diálogo «Suspender»)
- Modify: `apps/platform/app/api/tenants/[id]/route.ts` GET: agrega `suspension_tipo` a las columnas
- Create: `apps/platform/app/lib/__tests__/ruta-suspension.test.ts`

**Interfaces:**
- Consumes: `tenants.suspension_tipo` (Task 1).
- Produces: el cuerpo PATCH `{accion:"cambiar_estado", estado:"SUSPENDIDO", tipo_suspension:"FALTA_DE_PAGO"|"OTRO", ...}`.

- [ ] **Step 1: Pruebas que fallan** (mock de `../server` como `rutas-operacion.test.ts`, con `sb.from().update()` que anota el patch):

```ts
it("suspender exige el tipo", ...)            // sin tipo_suspension → 400 { error: "TIPO_REQUERIDO" }, sin update
it("suspender por falta de pago lo guarda", ...) // patch incluye suspension_tipo: "FALTA_DE_PAGO"; auditoría con payload.suspension_tipo
it("reactivar limpia el tipo", ...)          // estado ACTIVO → patch.suspension_tipo === null
it("cancelar no pide tipo", ...)             // CANCELADO sin tipo_suspension → 200
```

- [ ] **Step 2:** `cd apps/platform && npx vitest run ruta-suspension` · Expected: FAIL.
- [ ] **Step 3:** En la ruta, valida `tipo_suspension` solo para SUSPENDIDO y escríbelo en el patch; en la rama de reactivar, `suspension_tipo = null`. En el diálogo «Suspender», dos opciones (radio) obligatorias: «Falta de pago (se reactiva sola cuando pague por WhatsApp)» y «Otro motivo». Usa los componentes y tokens de `docs/diseno/platform.md`; sin estilos nuevos.
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit` · Expected: PASS (288+4).
- [ ] **Step 5: Commit** — `feat(platform): al suspender se elige falta de pago u otro motivo`

---

### Task 3: Cliente de Mercado Pago de VIM

**Files:**
- Create: `supabase/functions/_shared/agente/cobro/mp-vim.ts`
- Create: `supabase/functions/_shared/agente/cobro/mp-vim.test.ts`
- Modify: `package.json` raíz: agrega `supabase/functions/_shared/agente/cobro/*.test.ts` a `test:functions`

**Interfaces:**
- Produces:
  - `crearPreferencia(d: { intentoId: string; total: number; titulo: string; venceEn: Date; notificacion: string }, token: string, f?: typeof fetch): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string }>`
  - `consultarPago(pagoId: string, token: string, f?: typeof fetch): Promise<{ ok: true; estado: string; referencia: string | null; monto: number; moneda: string; aprobadoEl: string | null } | { ok: false; error: string }>`
  - Reusa `firmaValida` de `_shared/terminal/mercado-pago.ts` (no la copies).

- [ ] **Step 1: Pruebas que fallan** (fetch falso que guarda la petición):

```ts
test("la preferencia solo acepta tarjeta, sin meses, y vence en 24 h", ...)
// POST https://api.mercadopago.com/checkout/preferences con Bearer token y X-Idempotency-Key = intentoId;
// body.external_reference === intentoId; body.items = [{ title, quantity: 1, unit_price: 1853.68, currency_id: "MXN" }];
// body.payment_methods = { excluded_payment_types: [{id:"ticket"},{id:"atm"},{id:"bank_transfer"}], installments: 1 };
// body.binary_mode === true; body.expires === true; body.expiration_date_to === venceEn en ISO con -06:00;
// body.notification_url === notificacion. Devuelve { ok:true, id, url: init_point }.
test("error de Mercado Pago vuelve como ok:false, nunca lanza", ...) // 400 y fetch que lanza
test("consultarPago lee estado, referencia, monto y fecha", ...)     // GET /v1/payments/{id}: status, external_reference, transaction_amount, currency_id, date_approved
```

- [ ] **Step 2:** `npm run test:functions` · Expected: FAIL en `mp-vim.test.ts`.
- [ ] **Step 3:** Implementa con `fetch` inyectable y `AbortSignal.timeout(15000)`, como `clienteMp`.
- [ ] **Step 4:** `npm run test:functions` · Expected: PASS.
- [ ] **Step 5: Commit** — `feat(agente-cobro): cliente de Checkout Pro para la cuenta de VIM`

---

### Task 4: Herramientas de cobro del agente (cerebro + reglas)

**Files:**
- Modify: `supabase/functions/_shared/agente/cerebro.ts` (tipo `Herramientas`, `HERRAMIENTAS`, `invalido`, despacho, `ESTADOS`)
- Modify: `supabase/functions/_shared/agente/cerebro.test.ts`
- Modify: `supabase/functions/_shared/agente/reglas.md` (sección «Clientes: pagos»)
- Modify: `supabase/functions/_shared/agente/conocimiento.gen.ts` (regenerado con `npm run agente:conocimiento`)
- Modify: `supabase/functions/_shared/agente/evals/nucleo.ts` (`herramientasFalsas`) y `evals/escenarios.json`

**Interfaces:**
- Produces, en `Herramientas`:
  - `pedirCodigo(correo: string): Promise<string>`
  - `verificarCodigo(codigo: string): Promise<string>`
  - `elegirNegocio(nombre: string): Promise<string>`
  - `consultarAdeudo(adelanto: boolean): Promise<string>`
  - `guardarDatosFactura(d: { rfc: string; razon_social: string; regimen: string; codigo_postal: string; uso_cfdi: string }): Promise<string>`
  - `crearLigaPago(adelanto: boolean): Promise<string>`
  - `pasarAFermin` acepta también `estado: "PAGO_POR_CONFIRMAR"`.
- Nombres de herramienta para el modelo: `pedir_codigo`, `verificar_codigo`, `elegir_negocio`, `consultar_adeudo`, `guardar_datos_factura`, `crear_liga_pago`. Ninguna recibe `tenant_id` ni monto.

- [ ] **Step 1: Pruebas que fallan** en `cerebro.test.ts` (mismo patrón de fetch falso que las existentes):

```ts
test("pedir_codigo con correo sin @ vuelve como error al modelo y no llama la herramienta", ...)
test("verificar_codigo exige 6 dígitos", ...)               // "12345" y "abcdef" → is_error
test("guardar_datos_factura valida RFC y CP", ...)           // RFC /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i, CP /^\d{5}$/
test("crear_liga_pago y consultar_adeudo solo reciben adelanto (boolean)", ...) // input con tenant_id o monto se ignora: la herramienta se llama solo con el boolean
test("pasar_a_fermin acepta PAGO_POR_CONFIRMAR", ...)
```

- [ ] **Step 2:** `npm run test:functions` · Expected: FAIL.
- [ ] **Step 3:** Agrega las seis herramientas, su validación en `invalido` y su despacho. En `reglas.md`, sección nueva (James revisa el tono en la Tarea 7): pide correo → `pedir_codigo`; no dice nada del negocio antes de `verificar_codigo`; el monto **solo** lo repite de `consultar_adeudo`; pregunta factura antes de `crear_liga_pago`; si el cliente dice que ya transfirió o manda comprobante: si está bloqueado, ofrece la liga; si no la quiere o no está bloqueado, `pasar_a_fermin` con `PAGO_POR_CONFIRMAR`; si el resultado de una herramienta dice que no se puede cobrar, `pasar_a_fermin` con `URGENTE_SOPORTE`; cambios de plan, extras o cancelación → `pasar_a_fermin`; si el cliente manda constancia (`[document]`/`[imagen]`), pide los cinco datos por escrito. Regenera con `npm run agente:conocimiento`.
- [ ] **Step 4:** En `nucleo.ts`, `herramientasFalsas` implementa las nuevas con datos fijos (un negocio «Tacos Prueba», total $810.84) y anota la llamada. En `escenarios.json`, 4 escenarios categoría «Cliente: pago»: (a) «quiero pagar» → `debe: ["pedir_codigo"]`, `no_debe: ["consultar_adeudo"]`, criterio: no menciona montos antes de verificar; (b) cliente verificado pide pagar → `debe: ["consultar_adeudo","crear_liga_pago"]`, criterio: el monto es exactamente el de la herramienta y preguntó por factura antes de la liga; (c) «ya les transferí, aquí está el comprobante» → `debe: ["pasar_a_fermin:PAGO_POR_CONFIRMAR"]`; (d) «quiero cambiarme de plan» → `debe: ["pasar_a_fermin"]`, `no_debe: ["crear_liga_pago"]`.
- [ ] **Step 5:** `npm run test:functions` · Expected: PASS.
- [ ] **Step 6: Commit** — `feat(agente-cobro): herramientas de verificación, adeudo, factura y liga de pago`

---

### Task 5: Implementación de las herramientas en el webhook

**Files:**
- Create: `supabase/functions/_shared/agente/cobro/herramientas.ts`
- Create: `supabase/functions/_shared/agente/cobro/herramientas.test.ts`
- Modify: `supabase/functions/whatsapp-webhook/index.ts` (`herramientas()` agrega las seis; `pasarAFermin` sin cambios)

**Interfaces:**
- Consumes: RPC de Task 1; `crearPreferencia` (Task 3); `enviarCorreo`, `soloAscii` de `_shared/correo.ts`; `consumirCupos` de `_shared/limite.ts`.
- Produces: `herramientasCobro(conversacionId: string, waId: string, d: DepsCobro): Pick<Herramientas, "pedirCodigo"|"verificarCodigo"|"elegirNegocio"|"consultarAdeudo"|"guardarDatosFactura"|"crearLigaPago">` con
  `DepsCobro = { rpc(fn: string, args: Record<string, unknown>): Promise<any>; cupo(claves: { clave: string; ventanaSeg: number; max: number }[]): Promise<boolean>; correo(to: string, subject: string, html: string): Promise<{ enviado: boolean }>; preferencia: typeof crearPreferencia; token: string; notificacion: string; ahora(): Date }`.

- [ ] **Step 1: Pruebas que fallan** (deps falsos):

```ts
test("pedirCodigo responde igual exista o no el correo", ...)
// con {enviar:false} y con {enviar:true}: mismo texto devuelto; solo en el segundo se llama correo(), con asunto ASCII y el código en el html
test("pedirCodigo respeta los cupos", ...)   // cupo con claves "wa:cod:h:<waId>" (3600 s, 3) y "wa:cod:d:<correo en minúsculas>" (86400 s, 5); sin cupo → texto de «espera un rato», sin rpc
test("verificarCodigo con varios negocios pide elegir y lista los nombres", ...)
test("consultarAdeudo arma el desglose mes por mes solo si los precios difieren", ...) // dos periodos 699 y 899 → dos renglones; iguales → «2 meses de $899»; siempre subtotal, IVA y total con $ y 2 decimales
test("consultarAdeudo sin verificar o sin poder cobrar lo dice como instrucción para el modelo", ...) // SIN_VERIFICAR → «Primero verifica…»; SUSPENDIDO_OTRO → «No cobres; pasa a un agente…»
test("crearLigaPago reusa la liga si el intento ya tiene una", ...) // reusado + preferencia_url → no llama preferencia()
test("crearLigaPago guarda la preferencia y devuelve la liga y el total", ...) // wa_fijar_preferencia con id y url; venceEn = ahora + 24 h
test("crearLigaPago con Mercado Pago caído no inventa liga", ...) // ok:false → texto que pide pasar a un agente
```

- [ ] **Step 2:** `npm run test:functions` · Expected: FAIL.
- [ ] **Step 3:** Implementa. Correo: asunto `"Tu codigo de VIM POS"`, cuerpo «Tu código para el WhatsApp de VIM POS es **NNNNNN**. Vence en 15 minutos. Si no lo pediste, ignora este correo.» Los textos que devuelve cada herramienta son instrucciones cortas para el modelo, no mensajes al cliente. En `whatsapp-webhook/index.ts`, `herramientas()` mezcla `herramientasCobro(...)` con deps reales: `admin.rpc`, `consumirCupos(admin, claves, "abrir")`, `enviarCorreo`, `crearPreferencia`, `Deno.env.get("MP_VIM_ACCESS_TOKEN")`, `notificacion = ${SUPABASE_URL}/functions/v1/cobro-vim-webhook`.
- [ ] **Step 4:** `npm run test:functions` · Expected: PASS.
- [ ] **Step 5: Commit** — `feat(agente-cobro): el webhook ejecuta las herramientas de cobro`

---

### Task 6: Función `cobro-vim-webhook`

**Files:**
- Create: `supabase/functions/_shared/agente/cobro/pago.ts`
- Create: `supabase/functions/_shared/agente/cobro/pago.test.ts`
- Create: `supabase/functions/cobro-vim-webhook/index.ts`
- Modify: `supabase/config.toml` (`[functions.cobro-vim-webhook] verify_jwt = false`)

**Interfaces:**
- Consumes: `wa_aplicar_pago`, `wa_avisar_fermin`, `wa_pasar_a_fermin` (Task 1/0286); `consultarPago`, `firmaValida`; `enviar`, `cuerpoTexto`, `cuerpoPlantilla` de `_shared/whatsapp/enviar.ts`.
- Produces: `atenderPago(pagoId: string, d: DepsPago): Promise<"APLICADO"|"DUPLICADO"|"IGNORADO"|"RECHAZADO">` con
  `DepsPago = { consultar(pagoId: string): ReturnType<typeof consultarPago>; rpc(fn: string, args: Record<string, unknown>): Promise<any>; enviar(cuerpo: object): Promise<{ ok: boolean; wamid: string | null }>; registrarSalida(conversacionId: string, wamid: string, texto: string): Promise<void>; ahora(): Date }`.

- [ ] **Step 1: Pruebas que fallan**:

```ts
test("solo aplica pagos approved en MXN con referencia uuid", ...)       // pending, rejected, USD o referencia rara → IGNORADO, sin rpc
test("aplicado: confirma por WhatsApp con la próxima fecha", ...)          // texto incluye la fecha legible («28 de noviembre de 2026»); se registra la salida como AGENTE
test("aplicado y reactivado: dice que la caja se desbloquea en unos minutos", ...)
test("con factura: avisa a Fermín sin pausar (wa_avisar_fermin) con RFC y razón social", ...)
test("más de 24 h desde el último mensaje del cliente: usa la plantilla pago_confirmado", ...) // cuerpoPlantilla(waId, "pago_confirmado", [fecha])
test("MONTO_DISTINTO, FECHA_MOVIDA o sin_reactivar: pasa a Fermín como URGENTE_SOPORTE y no felicita al cliente", ...)
test("DUPLICADO no envía nada", ...)
```

- [ ] **Step 2:** `npm run test:functions` · Expected: FAIL.
- [ ] **Step 3:** Implementa `atenderPago` en `pago.ts` (fecha en `es-MX`, zona `America/Mexico_City`; `pagado_el` = fecha de `aprobadoEl` en México). En `cobro-vim-webhook/index.ts`: solo POST; sin `MP_VIM_WEBHOOK_SECRET` o `MP_VIM_ACCESS_TOKEN` → 503; `data.id` de la query (o del cuerpo); `type`/`topic` distinto de `payment` → 200 sin hacer nada; firma mala → 401; `atenderPago` en línea y 200 (Mercado Pago reintenta si falla: un error de base → 500). Errores con `registrarError("cobro-vim-webhook", ...)`. Comentario de cabecera con ruta, firma y SECRETOS, como `whatsapp-webhook`.
- [ ] **Step 4:** `npm run test:functions` · Expected: PASS.
- [ ] **Step 5: Commit** — `feat(agente-cobro): webhook de Mercado Pago de VIM registra, renueva y reactiva`

---

### Task 7: /platform — estados de pago e intentos en la conversación, y tono

**Files:**
- Modify: `apps/platform/app/lib/whatsapp.ts` (`ESTADOS_WA`, `ETIQUETA`, `COLOR_ESTADO_WA`)
- Modify: `apps/platform/app/api/whatsapp/[id]/route.ts` (GET agrega `intentos` de `wa_intentos_pago`: estado, periodos, total, factura, preferencia_url, pagado_en, creado_en)
- Modify: `apps/platform/app/whatsapp/[id]/page.tsx` (bloque «Pagos por WhatsApp» con esos datos; la factura con sus 5 campos para copiarlos)
- Modify: `apps/platform/app/components/barra-lateral.tsx:72` (el contador suma `PAGO_POR_CONFIRMAR`)
- Test: el test existente de `lib/whatsapp` (o uno nuevo `app/lib/__tests__/whatsapp-estados.test.ts`)

- [ ] **Step 1:** Prueba que falla: `etiquetaEstado("PAGO_PENDIENTE") === "Pago pendiente"`, `etiquetaEstado("PAGO_POR_CONFIRMAR") === "Pago por confirmar"` y ambos tienen color (ámbar para por confirmar, neutro para pendiente).
- [ ] **Step 2:** `npx vitest run whatsapp` · Expected: FAIL.
- [ ] **Step 3:** Implementa. Sin estilos nuevos: tokens de `docs/diseno/platform.md`.
- [ ] **Step 4:** Pasa la sección «Clientes: pagos» de `reglas.md`, el correo del código y los mensajes de confirmación de `pago.ts` a **James** (agente `james`) para el tono; aplica sus cambios y regenera el conocimiento.
- [ ] **Step 5:** `npx vitest run && npx tsc --noEmit` y `npm run test:functions` · Expected: PASS.
- [ ] **Step 6: Commit** — `feat(platform): pagos por WhatsApp en la conversación y estados de pago`

---

### Task 8: Prueba de punta a punta con el modo de prueba de Mercado Pago

Necesita a Fermín: cuenta de Mercado Pago de VIM con una **aplicación de Checkout Pro nueva**, credenciales de prueba y la URL de webhook de la aplicación apuntando a `.../functions/v1/cobro-vim-webhook` (los pagos de prueba **no** mandan avisos por `notification_url`; solo por la configuración de la aplicación).

- [ ] **Step 1:** Script `scripts/cargar-secretos-cobro-vim.ps1` (pide `MP_VIM_ACCESS_TOKEN` y `MP_VIM_WEBHOOK_SECRET` sin mostrarlos y corre `supabase secrets set`), igual que los scripts de secretos del agente. Fermín lo corre.
- [ ] **Step 2:** En el stack local o en un proyecto de prueba: crear una preferencia real con `crearPreferencia` y abrir la liga; confirmar que solo ofrece tarjeta y sin meses. Anota en `docs/integraciones/mercado-pago-checkout-pro/05-verificado-cobro-vim.md` lo comprobado (forma real del aviso `payment`, firma, `data.id`).
- [ ] **Step 3:** Pago con tarjeta de prueba → el aviso llega, `wa_aplicar_pago` da APLICADO, la conversación recibe la confirmación. Repite el aviso con «Simular» → DUPLICADO.
- [ ] **Step 4:** Con un negocio de prueba SUSPENDIDO por falta de pago → queda ACTIVO y la caja se desbloquea en su siguiente latido. Con «Otro motivo» → sigue suspendido y llega el aviso a Fermín.
- [ ] **Step 5: Commit** del documento de verificación y del script.

---

## Salida (después del plan, con OK de Fermín en cada paso)

1. Lista de lo que se publica → OK de Fermín.
2. `0288` a producción con `db push` (copiar temporalmente la 0261 de la demo, como en 0286/0287) **antes** del merge.
3. Desplegar `whatsapp-webhook` y `cobro-vim-webhook` con `--no-verify-jwt`; secretos de producción por el script.
4. Plantilla `pago_confirmado` (Utility, es_MX), cuerpo: «Tu pago a VIM POS quedó registrado. Tu próxima fecha de pago es el {{1}}.» — la crea Fermín en Kapso/Meta.
5. PR con CI en verde → OK → merge. Primer cobro real pequeño con VIM Pruebas.
