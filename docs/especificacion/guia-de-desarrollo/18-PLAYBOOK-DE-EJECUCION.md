# 18 — PLAYBOOK DE EJECUCIÓN — VIM POS

> **Versión:** v2.0 · **Documento VIVO** (plan + bitácora) · **Alcance: TODO el desarrollo hasta el producto comercial al 100% (6 verticales)**
> **Propietario:** Fermín — VIM Marketing
> **Propósito:** construir VIM POS por fases con gates de calidad/seguridad y paradas de decisión, de punta a punta: del esqueleto a un SaaS POS multi-vertical vendible.
> **Cómo se armó:** derivado de (1) el orden de dependencias de la arquitectura, (2) la Guía §13, (3) el roadmap del Plan Maestro §8, (4) los mockups. Cada fase = objetivo + pasos + gate + checkpoint + registro.

---

## 0. Cómo usar este playbook

- **Estados:** ⬜ pendiente · 🔄 en progreso · ✅ hecho · ⛔ bloqueado.
- **Planeación rolling-wave:** las fases cercanas van detalladas; las lejanas, como objetivo + gate (se detallan al llegar, porque cambiarán).
- **Cadencia de paradas (decidida):** checkpoint obligatorio al cerrar cada FASE + parada extra antes de pasos riesgosos/irreversibles (migración destructiva, cambio de esquema en remoto, borrado, rotación de secretos, deploy a producción).
- **En cada checkpoint te muestro:** (1) qué se hizo, (2) resultado de los gates, (3) **menú de cambios** (§2). Eliges seguir o ajustar.

---

## 1. Catálogo de GATES (definidos una vez)

> Seguridad en intensidad **ALTA**: el bloque 🔴 corre en cada fase (cobra sentido pleno cuando hay app/deps).

**🟡 GATE-DATOS** (si tocó esquema): `supabase db reset` limpio · `pnpm db:types` regenera sin romper typecheck.
**🟢 GATE-CORRECTITUD:** `pnpm typecheck` + `pnpm lint` limpios · unit (Vitest) de lo tocado · funciones SQL de dinero/estado · E2E de la ruta de esa fase.
**🔴 GATE-SEGURIDAD (ALTA):** RLS cross-tenant (`supabase test db`) · secret-scan (sin `service_role`/JWT en cliente ni en git) · `service_role` aislado (regla ESLint) · `pnpm audit` · skill **`security-review`** sobre el diff · skill **`cyber-neo`**.

> Gate que falla → se arregla antes de cerrar la fase; el hallazgo va a la **Bitácora** (§4).

---

## 2. MENÚ de tipos de cambio (en los checkpoints)

| Tipo | Ejemplos | Costo |
|---|---|---|
| Visual / UX | colores, copy, layout, flujo | Bajo |
| Alcance | mover a otra fase, agregar/quitar pantalla | Medio |
| Datos / seed | menú demo, planes, precios, fixtures | Bajo |
| Reglas de negocio | PIN, propinas, descuentos, folios | Medio |
| Esquema / migración | tablas, columnas, RLS, índices | Alto (aditivo) |
| Performance | índices, paginación, materializar | Medio |
| Seguridad | RLS, gating por rol, rotación de llaves | Medio-Alto |

---

## 3. FASES (4 épocas, alineadas al roadmap del Plan Maestro §8)

```
ÉPOCA A — MVP Quick Service → Go-live Knock-Out        F0–F11   (Fase MVP)
ÉPOCA B — Comercializar QS + endurecer                 F12–F15  (Fase 2)
ÉPOCA C — Offline robusto + apps móviles + verticales  F16–F21  (Fase 3)
ÉPOCA D — Crecimiento, Enterprise y cierre al 100%     F22–F25  (Fase 4/5)
```

---

### ÉPOCA A — MVP Quick Service (go-live Knock-Out, PWA online-first)

#### F0 — Fundación ✅
Monorepo + esquema 1A + RLS + cadena de auth (pin-login→JWT→RLS), validados contra Postgres real. **Commit b14ba8b.**

#### F1 — Migraciones 1B–1F + plataforma + CFDI ✅
13 migraciones (catálogo, operación, post-venta, verticales, reportes, plataforma, CFDI) aplican limpias; RLS 8/8. 14 bugs cazados (§4). **Commit bd02740.**

#### F2 — Design system (`packages/ui`) ✅
Button, PinKeypad, Modal (focus-trap+role=dialog), StatusChip, cn; tokens desde mockups; a11y en componentes; build verde. **Commit b57f673.**

#### F3 — UI de autenticación ✅ (gate de seguridad pasado)
Arranque real del dispositivo → selector de empleados (RLS) → PIN → pin-login → home POS leyendo sucursales vía RLS. State machine completo en `apps/pos`. Build verde; bugs 15–19 (§4).
- ✅ Demo en navegador (next dev + Preview), flujo completo verificado headless
- ✅ Sesión de dispositivo real (`signInWithPassword`, JWT con `tenant_id`+`tipo_identidad='DISPOSITIVO'`) + rol de sistema `DISPOSITIVO` y cuenta de dispositivo en seed
- ✅ **Pantallas fieles a los mockups:** P-002 (shell + reloj + grid de usuarios + PIN como overlay), P-010 (lock con reloj grande + POS difuminado + "cambiar de usuario"), P-012 (modal de sesión expirada con re-PIN). PinKeypad enriquecido (shake/ok, backspace SVG, submit manual) + animaciones en el preset.
- ✅ E2E: login PIN ok + incorrecto (bloqueo con `intentos_restantes`). RLS cross-tenant 8/8 tras tocar políticas.
- ✅ **Gate de seguridad pasado:** `security-review` + `cyber-neo` (reporte en Desktop). Risk 26/100. Arreglados CN-001 (7 funciones `SECURITY DEFINER` con `search_path`) y CN-002/003 (binding caja→tenant + orden del lockout en `verificar_pin_login`); verificado. Deuda: CN-004 (rotar secretos cloud, go-live) + bajos (CORS allow-list, security headers Next, `deno.lock`, postcss vía Next bump).

#### F4 — Admin del tenant 🔄
🎯 Panel admin: shell + configuración + catálogo + usuarios. Orden acordado: **catálogo primero** (desbloquea F5).
- ✅ **F4.0 Cimiento:** scaffold `apps/admin` (Next 15, espejo de pos) + **login web (P-001)** (GoTrue email/pass → hook → JWT `ADMIN_WEB`) + fixture **DUEÑO** en seed (`dueno@knockout.dev` / `devadmin`). Verificado en navegador.
- ✅ **F4.1 Shell:** `AdminShell` (sidebar oscuro P-177 + main + guard + contexto de perfil), `PageHeader`/`PageBody` (breadcrumbs), `RoleGuard` básico por jerarquía, dashboard base + placeholders de rutas. Verificado.
- ✅ **F4.2 Catálogo COMPLETO:** categorías (`65af9a0`) + productos (`d5714ac`) + modificadores/grupos/opciones (`e97bb36`). Sub-nav 3 tabs. Núcleo del catálogo → **desbloquea F5.** [Pendiente enriquecimiento: precios por modo P-138, import CSV P-034–036]
- ✅ **F4.3 Usuarios** (commit `92ec461`): lista P-155 con KPIs + filtros, ModalNuevoUsuario P-156 (PIN inicial en vez de email-invite), ModalResetearPin P-159, activar/desactivar, cambiar rol. **Edge Functions** `crear-empleado` y `resetear-pin` (service_role server-side). **Migración 0014** con `es_admin_del_tenant()` + 3 policies RLS para gestión por admin. **Bug latente cazado:** policy `usuarios_perfil_mismo_tenant` exigía `activo=true` → admin perdía visibilidad de empleados desactivados; añadido `usuarios_perfil_select_admin`.
- 🔄 **F4.4 Config:** ✅ núcleo (commit `8f5dcbb`) — datos negocio P-162, sucursales P-165/166, cajas P-167/168 agrupadas, propinas P-173. Migración 0015 con policy `tenants_update_admin`. ⬜ Diferido: datos fiscales P-163, CFDI/PAC P-164, áreas/KDS P-169–170, editor mesas P-171 (Full Service no MVP), marcas virtuales P-172, impresión/tickets P-174–175. Atender en F2-fiscal y F5-cocina cuando sean accionables.
- ⬜ **F4.5 Inventario/recetas** (P-143–150) — opcional.
- ⬜ Unificar subnav de Reportes.
- **Decisión de arquitectura (F4):** mutaciones **client-side con el browser client (RLS por tenant/rol = frontera real) + validación Zod**, en vez de server actions. Razón: el auth del admin es client-side y el RLS ya es la seguridad (8/8 + fixes CN-001/002/003). **Desvía del gate "server actions"** → deuda: migrar a `@supabase/ssr` (cookies) + server actions si se quiere validación server-side.
- 🚪 CRUD con Zod · RLS por rol · 🔴 ALTA. 🛑 checkpoint al cerrar F4.x.

#### F5 — POS operativo Quick Service 🔄
🎯 El corazón: turno → venta → cobro → ticket impreso.
- ✅ **F5.0 Apertura de turno** (P-058 modo TOTAL, commit `35537e4`): lib/turno con leerCaja + abrirTurno + código YYYY-MM-DD-CXX-NN. Pantalla AbrirTurno (sugerencias rápidas). PantallaTurno orquestador post-PIN: carga caja+turno, decide entre abrir o entrar operativo. Verificado: PIN→AbrirTurno→INSERT turnos→operativo; reentrada detecta turno existente.
- ✅ **F5.1 Home POS catálogo** (P-059, commit `f3027ab`) + **F5.2 carrito + cobro** (rama `f5.2-carrito-cobro`, 13 commits): modificadores (P-065), ticket (P-066), métodos efectivo/tarjeta/transferencia/app + **dividido** (P-069/070/074). Verificado E2E (venta real→PAGADO, totales BD=display). Bugs #19/#20 (0016/0017).
- ✅ **F5.2b descuento manual + propina** (rama `f5.2b-descuento-propina`, merge `2ac3546`): descuento %/monto con **autorización por PIN de supervisor** (Edge `autorizar-pin` + RPCs `verificar_autorizacion_pin`/`registrar_autorizacion_propia` en 0018; P-078 + P-080 reutilizable); propina en el cobro (P-075; `establecer_propina_ticket` + tope `total+propina` en 0020). Verificado E2E (descuento 120→108 con PIN Diego 4321, María 1234→SIN_PERMISO; propina 15%→138→cambio 62→PAGADO). Smokes `smoke_descuento`/`smoke_propina`, RLS 8/8.
- ✅ **F5.3 impresión: núcleo + vista previa del ticket** (rama `f5.3-impresion-ticket`, merge `ec5fe26`): modelo lógico `PrintJob` (doc 16) → `recibo-preview` (P-222, vía `PreviewAdapter` activo) + `escpos.ts` (bytes, golden-tested) + `EpsonEposAdapter` (red ePOS, **`@sin-verificar`**). Confirmación **P-077** enriquecida. `vitest` golden 8/8, E2E navegador (cobro→P-077→recibo P-222 con QR), RLS PASS. **Diferido:** comanda P-223 (F5.3b), cajón, cola reimpresión Dexie, logo ráster, portal CFDI/QR (F8), WebUSB/BT/Capacitor.
- ✅ **F5.3b comanda de cocina (P-223)** (rama `f5.3b-comanda-cocina`, merge `67a81cd`): `comanda-builder` (pura, golden) + `LineaImpresion.notaCocina` + `ReciboPreview` con toggle Cliente|Cocina; al cobrar arma ambos jobs (ticket+comanda). Comanda sin precios/QR, modo en grande, nota de cocina prominente. E2E navegador OK con nota persistida en BD. **Diferido:** áreas/KDS (doc 14), un job por área, reimpresión con PIN, separación papel.
- ✅ **F5.4 cierre de turno** (rama `f5.4-cierre-turno`, merge `4cd6bfe`): topbar "Cerrar turno" → arqueo P-101 (`reporte_x`) → corte P-102 (`arquear_caja`) → autorización (cajero tiene `turno.cerrar_propio` → propia; sin permiso → PIN supervisor, reusa F5.2b) → Z (`reporte_z`) auto-impreso reusando F5.3 (`construirReporteZJob` + `ReciboPreview`). Bugs #21/#22 en `0011` (fix aditivo `0021`). Smoke + vitest 10/10 + E2E navegador (Z folio KC-2026-000001, turno CERRADO). **Diferido (F7):** X aparte (P-105), movimientos de caja (P-096-100), blind-count, históricos admin (P-181+).
- ⬜ cliente/factura (P-076); pedidos en espera (P-081/082), cancelar ticket (P-083)
- ⬜ **Impresión REAL con hardware** (activar `EpsonEposAdapter`, code page, corte, cajón — checklist doc 16 §11) cuando llegue la Epson
- ✅ **E2E ruta crítica completa** (login→turno→venta→cobro→**cierre**) verificada en navegador. 🛑 hito grande **cerrado**.

#### F6 — Post-venta operativa ⬜
🎯 Descuentos, promociones, devoluciones, cancelaciones (con PIN).
- ✅ Descuento manual (P-078) + autorización PIN (P-080) → **hechos en F5.2b** (primitiva `autorizar-pin` reutilizable aquí). ⬜ Cortesía 100%, descuento por ítem, override de precio (reusan la primitiva); promociones (P-079)
- ⬜ Devoluciones (recibo P-228) y cancelaciones de ticket pagado; reverso de inventario
- 🚪 funciones de dinero (devolución/cancelación cuadran) · auditoría con PIN · 🔴 ALTA. 🛑 checkpoint.

#### F7 — Cierres y caja ⬜
🎯 Movimientos de caja, arqueo, corte, X y Z.
- ⬜ Sangría/depósito/inyección de fondo/pago proveedor (P-096–100) — enum ya enriquecido
- ⬜ Arqueo/corte (P-101/102), cerrar turno (P-103), X (P-105), Z (P-104/106) + impresión (P-225–227)
- 🚪 cuadre de cierre, inmutabilidad del Z · 🔴 ALTA. 🛑 checkpoint.

#### F8 — CFDI (timbrado) ⬜
🎯 Facturación real (doc 13) con Facturama.
- ⬜ Registrar CSD del tenant en Facturama Multiemisor; `tenant_cfdi_emisor`
- ⬜ Borrador→timbrado síncrono (mostrador) + cola (`cfdi-worker`) + reintentos
- ⬜ Folios (base + paquetes), consumo + reembolso; factura global mensual; cancelación con acuse; representación (P-229)
- 🚪 🔴 **hito de seguridad** (CSD/secretos, idempotencia) + timbrado real contra SAT de prueba. 🛑 checkpoint + parada de riesgo (fiscal).

#### F9 — KDS / comanda en vivo ⬜
🎯 Cocina en tiempo real (doc 14).
- ⬜ Trigger broadcast + canal por área; KDS (P-107–111) suscrito; alerta de vencido (cliente)
- ⬜ Impresión de comanda (P-223) + reimpresión con PIN
- 🚪 RLS sobre `realtime.messages` (cocina aislada por tenant) + E2E comanda · 🔴 ALTA. 🛑 checkpoint.

#### F10 — Provisioning + panel plataforma (mínimo) ⬜
🎯 Alta de tenant + super-admin básico (doc 12).
- ⬜ `crear_tenant_con_owner` + `tenant_onboarding_estado`; script de alta (Knock-Out INTERNO)
- ⬜ `apps/platform` mínimo: listar/crear/suspender tenant, ajustar folios; `super_admin_accesos`
- 🚪 🔴 **hito de seguridad** (service_role, impersonación auditada). 🛑 checkpoint.

#### F11 — Go-live Knock-Out ⬜
🎯 Operación real del piloto.
- ⬜ Hardware: tablet Android + impresora Epson (probar impresión real) + cajón
- ⬜ Cargar menú/usuarios/datos fiscales/CSD reales; backups (R2) + observability (Sentry/alertas) activos
- ⬜ Venta de prueba real; verificar criterios de éxito (Plan Maestro §10)
- 🚪 🔴 **security-review + cyber-neo completos** · backups probados · CFDI real timbrado. 🛑 **checkpoint + parada de riesgo (producción).**

---

### ÉPOCA B — Comercializar QS + endurecer (Fase 2)

#### F12 — Onboarding self-service + 2º/3º tenant ⬜
Wizard completo (doc 10, 8 fases) usable por el dueño; alta de Chick'n Go y Camtaritos (multi-tenant real, 3 negocios). 🚪 onboarding < 30 min + RLS 3 tenants. 🛑

#### F13 — Reportes y analítica del admin ⬜
Dashboard (P-177/178), ventas por dimensión (P-184–189), tiempos (P-190/191), auditoría/seguridad agrupada (P-192–198), reservaciones/delivery/conciliación (P-199–211). 🚪 paginación (reporte_z y listas grandes) + 🔴 ALTA. 🛑

#### F14 — Endurecimiento (calidad/seguridad/ops) ⬜
Suite E2E ampliada, CI/CD GitHub Actions completo, observability total (Sentry + alertas críticas), backups PITR (gatillo del doc 15), dependency hygiene. 🚪 CI verde end-to-end. 🛑

#### F15 — Notificaciones push + KDS interactivo avanzado ⬜
Push de eventos críticos (CSD por vencer, sync atascado, etc.); KDS con tiempos por estación. 🚪 🔴 ALTA. 🛑

---

### ÉPOCA C — Offline robusto + apps móviles + verticales (Fase 3)

#### F16 — Offline robusto + Capacitor ⬜
Motor de sync completo (Dexie ↔ `sync_procesar_push`), cola y reintentos, **UI de resolución de conflictos** (P-214/215), banner offline (P-213); empaque **Capacitor** del POS (impresión nativa, hardware). 🚪 pruebas de corte de red + reconciliación; 🔴 ALTA. 🛑 hito.

#### F17 — Vertical Foodtruck ⬜
Offline-first nativo, captura ultra-rápida, multi-evento (doc 03). 🚪 E2E foodtruck offline. 🛑

#### F18 — Vertical Full Service + app de mesero ⬜
Mesas/mapa de salón (P-086–092), cuentas (P-093–095), propinas/reparto, reservaciones (P-199–203) + **app móvil de mesero** (P-120–127, doc 04). 🚪 E2E mesa→cuenta→cobro + reparto de propinas. 🛑

#### F19 — Delivery propio + app de repartidor ⬜
Asignaciones, ruta, entrega, liquidación (doc 22/1C.2) + **app de repartidor** (P-112–119). 🚪 E2E asignar→entregar→liquidar. 🛑

#### F20 — Vertical Café & Bar ⬜
Cuentas abiertas en barra, operación híbrida, happy hour (doc 05). 🚪 E2E barra. 🛑

#### F21 — Vertical Dark Kitchen ⬜
Marcas virtuales, canales (apps externas), captura manual, vista unificada de cocina, pausar/reanudar, conciliación (doc 06). 🚪 E2E multi-marca + conciliación. 🛑

---

### ÉPOCA D — Crecimiento, Enterprise y cierre al 100% (Fase 4/5)

#### F22 — Billing / Stripe self-serve ⬜
Alta 100% en línea (Stripe Checkout → webhook → `crear_tenant_con_owner`), ciclo de suscripción, plan anual, dunning/recuperación de pago. 🚪 🔴 seguridad de webhooks + estados de tenant. 🛑

#### F23 — Migración + SSO + multi-PAC ⬜
Import desde otros POS (Toast/Square), SSO (Google/Microsoft) para empresariales, multi-PAC (redundancia de timbrado). 🛑

#### F24 — Vertical Enterprise ⬜
Multi-sucursal avanzado, reporteo central, franquicias, roles delegados, permisos personalizados completos. 🚪 🔴 ALTA. 🛑

#### F25 — Hardening final → "POS 100%" ⬜
Performance/carga (umbrales de materializar vistas, particionar por tenant), **auditoría de seguridad completa** (cyber-neo + pentest externo), cierre LFPDPPP (avisos, ARCO, retención), documentación de operación y soporte. 🚪 todos los gates en verde + criterios de "listo para vender a cualquier restaurante". 🛑 **CHECKPOINT FINAL.**

---

## 4. Bitácora global de bugs y hallazgos

| # | Fase | Hallazgo | Resolución | Doc |
|---|---|---|---|---|
| 1 | F0 | `EXCLUDE … IS NOT DISTINCT FROM` no válido | Índices únicos parciales | 1A v1.2 + migr. 0004 |
| 2 | F0 | Edge Functions rechazan prefijo `SUPABASE_` | `VIM_JWT_SECRET` | 1F + función |
| 3 | F1 | `EXCLUDE…IS NOT DISTINCT` también en 1B | Índices parciales | 0007 |
| 4 | F1 | `unaccent()` no IMMUTABLE en columna GENERATED | Wrapper `f_unaccent()` | 0001/0007 + 1B nota |
| 5 | F1 | Constraint `folio_unico_por_sucursal` duplicado | Renombrar el de tickets | 0008 + 1C.1 nota |
| 6 | F1 | `marcas_virtuales.color_hex` no existe | `color_primario_hex` | 0010 + 1B nota |
| 7 | F1 | Totales de ticket con nombres distintos en 1D/1E | Mapear a canónicos | 0009/10/11 + 1C.1 nota |
| 8 | F1 | `d.motivo` → `motivo_categoria` | Mapear | 0011 |
| 9 | F1 | Valores de enum inexistentes en 1E | Mapear a reales | 0011 |
| 10 | F1 | `modo_servicio LIKE` sin cast | `::text LIKE` | 0011 + 1D nota |
| 11 | F1 | `movimientos_caja.tipo_movimiento` → `tipo` | Mapear | 0011 |
| 12 | F1 | Enum `movimiento_tipo` grueso vs P-097–100 | Enriquecido (+2 valores) | 0005 + 1A §6 |
| 13 | F1 | Tabla `cortes_caja` ausente (1E la asumía de 1A) | Creada en reportes | 0011 + 1E nota |
| 14 | F1 | `turnos` sin `fondo_apertura_mxn`/`deleted_at` | `fondo_inicial_mxn` / quitar predicado | 0011 + 1E nota |
| 15 | F3 | Custom Access Token Hook sin `search_path` → `42P01` (`usuarios_acceso does not exist`) al invocarlo GoTrue como `supabase_auth_admin` | `SET search_path = ''` + calificar `public.*` en el hook | 0006 |
| 16 | F3 | Hook devuelve claims `null`: RLS de `usuarios_acceso`/`roles` filtra por `auth.uid()`, ausente durante la emisión del token | Políticas `FOR SELECT TO supabase_auth_admin USING (true)` (patrón oficial Supabase RBAC) | 0006 |
| 17 | F3 | `auth.users` sembrado a mano con columnas de token en `NULL` → GoTrue "Database error querying schema" (scan de `confirmation_token`) en grant de password | Normalizar a `''` (`confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`, `reauthentication_token`) | seed.sql |
| 18 | F3 | Embedding PostgREST `usuarios_acceso→usuarios_perfil` falla (`PGRST200`): no hay FK directa (ambas → `auth.users`) | Dos queries + join en cliente (embed a `roles` sí funciona) | apps/pos `listarEmpleados` |
| 19 | F3 | `PinKeypad`: disparar `onChange`/`onComplete` dentro del updater de `setState` → "Cannot update a component while rendering" + clicks síncronos leían PIN viejo | Valor con updater funcional + side effects en `useEffect` (callbacks por ref) | `packages/ui` pin-keypad |
| 20 | F3 (sec) | **CN-001** · 7 funciones `SECURITY DEFINER` sin `search_path` fijo (escalada de privilegios, CWE-426) | `SET search_path = public[, extensions], pg_temp` en las 7 (`verificar_pin_login` necesita `extensions` por `crypt`) | 0002/0006/0008/0009×3/0012 |
| 21 | F3 (sec) | **CN-002/003** · `verificar_pin_login` no valida caja→tenant y muta el lockout antes del chequeo de acceso → auth contra caja ajena + lockout cross-tenant por `usuario_id` | Resolver `caja.tenant_id`, exigir acceso del usuario en ese tenant, y mover la validación ANTES de tocar PIN/lockout | 0006 |
| 22 | F4.3 | Policy `usuarios_perfil_mismo_tenant` exige `ua.activo = true` en su EXISTS → al desactivar un empleado, el admin pierde visibilidad de su perfil | Política nueva `usuarios_perfil_select_admin TO authenticated USING es_admin_del_tenant(...)` (no filtra por activo) | 0014 |

---

## 5. Pendientes transversales (se atienden en su fase)
- ⬜ **Rotar service_role + JWT secret** (se expusieron en setup) — antes de cloud/go-live (F11).
- ⬜ A11y estructural → resuelta en F2 (componentes); aplicar al construir cada pantalla.
- ⬜ Unificar subnav de Reportes → F4.
- ✅ Back-port de los fixes de F1 a los docs fuente (1A §6 + notas en 1B/1C.1/1D/1E).
- ✅ Demo en navegador del esqueleto de login + sesión de dispositivo + lock/expiración (F3 funcional).
- ✅ **Security-review + cyber-neo del módulo de auth** (gate de F3): CN-001 + CN-002/003 arreglados y verificados. Reporte en `~/Desktop/cyber-neo-report-vim-pos-2026-06-01.md`.
- ⬜ **Hardening bajo (de cyber-neo, diferido):** CORS allow-list en `pin-login` (CN-006), security headers en Next (CN-007), `deno.lock` para imports de la Edge Function (CN-008), bump de Next.js para limpiar postcss CVE (CN-005). Considerar `enable_signup=false` y reglas `*.pem/*.key/credentials*.json` en `.gitignore` antes del trabajo de CSD.
- ⬜ Defensa en profundidad (auth): que `pin-login` derive `caja_id`/tenant del JWT del dispositivo verificado (hoy el binding se valida en `verificar_pin_login`).

---

## Changelog
| Versión | Fecha | Cambios |
|---|---|---|
| v2.0 | Jun 2026 | **Ampliado a todo el desarrollo (producto comercial, 6 verticales).** Reorganizado en 4 épocas (A MVP QS → B comercializar → C offline+móvil+verticales → D enterprise+cierre), F0–F25, rolling-wave. F0–F2 ✅, F3 🔄. Bitácora F1 (14 bugs) + back-port marcado hecho. |
| v1.0 | Jun 2026 | Playbook inicial (11 fases, gates, checkpoints, bitácora). |
