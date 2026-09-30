# Auditoría integral — 30 de septiembre de 2026

> Revisión de funciones, funcionamiento y seguridad de **todo** VIM POS (POS, KDS, admin,
> plataforma, portal de factura, base de datos, Edge Functions, escritorio, sitio web y CI), y
> reparación en la misma sesión. Rama `claude/vimpos-comprehensive-analysis-57h5d3`.
>
> Este documento es un **registro** (bitácora): no se edita. Lo que quede pendiente vive en
> `docs/producto/` o en issues.

## ⚠️ Antes que nada

1. **El repositorio es público** (`visibility: public` en la API de GitHub). Las migraciones y los
   commits de esta rama describen —como es costumbre en el repo— qué estaba mal y cómo se
   reproducía. Mientras no estén **desplegados**, esos huecos siguen abiertos en producción.
   Recomendación: **desplegar el mismo día en que se haga merge** (orden en §5), o poner el repo en
   privado antes del push.
2. Los arreglos de BD son migraciones **aditivas** (0131–0139). Ninguna migración aplicada se editó.
3. Nada de esto está desplegado. Lo de §5 es obligatorio para que surta efecto.

---

## 1. Resumen ejecutivo

| | Encontrados y confirmados | Arreglados en esta sesión | Parciales / decisión del dueño |
|---|---|---|---|
| 🔴 Críticos | 5 | 5 | — |
| 🟠 Altos | 13 | 13 | — |
| 🟡 Medios | 22 | 19 | 3 |
| 🔵 Bajos / info | 28 | 26 | 2 |
| **Total** | **68** | **63** | **5** |

**Los cinco críticos**, todos reproducidos en una base local antes de arreglarlos:

1. **Facturas con el sello de otro cliente.** Facturama Multiemisor es una sola cuenta de VIM y
   elige el CSD por el RFC del emisor, que salía de datos que el propio negocio edita. Un registro
   gratuito podía timbrar CFDI reales con el sello de cualquier otro cliente de VIM. → 0135.
2. **Una caja podía reescribir y quedarse con filas de otro negocio** vía `sync-push`
   (`ON CONFLICT (id) DO UPDATE` sin mirar el tenant existente). → 0131.
3. **Cualquier empleado reescribía dinero por REST**: total de un ticket pagado, monto de un pago,
   fondo del turno, precios, e incluso una devolución en efectivo inventada con el arqueo cuadrado.
   → 0133.
4. **Cualquier autorización PIN servía para cualquier acción**: una de "reimprimir comanda"
   cancelaba un ticket pagado y registraba al DUEÑO como autorizador. → 0134.
5. **Un dueño/admin se quitaba la suspensión, cambiaba de plan y de dueño** del negocio (billing
   bypass). → 0132.

**Riesgo (fórmula Cyber Neo):** antes de esta sesión, 100/100 (crítico). Con los arreglos
desplegados, los hallazgos abiertos son 3 medios y 2 bajos → **11/100 (bajo)**.

---

## 2. Método y herramientas

- **Skill de auditoría:** [Cyber Neo](https://github.com/Hainrixz/cyber-neo) (MIT, OWASP 2025
  Top 10 + CWE Top 25), instalada completa en `.claude/skills/cyber-neo/` y fijada al commit
  `dcac0a8`, con sus scripts revisados antes (solo lectura, sin red).
- **Herramientas:** Semgrep con las reglas oficiales `semgrep/semgrep-rules` (JS/TS, secretos,
  GitHub Actions); Gitleaks 8.21 sobre el **historial completo** (920 commits); `pnpm audit` y
  `npm audit`; `deno check` de las 22 Edge Functions; pgTAP/`pg_prove` y los 52 smokes de
  `supabase/scripts` sobre Postgres 16 con el shim de Supabase y las 139 migraciones.
- **Revisión:** seis auditores en paralelo (BD, Edge Functions, POS/KDS/factura, admin/plataforma,
  escritorio, sitio/CI/supply chain). Cada hallazgo se **reprodujo** (como `authenticated` con JWT
  simulado, en `BEGIN … ROLLBACK`) o se trazó en el código antes de aceptarlo; los falsos positivos
  se descartaron (§7).
- **Reparación:** siete equipos con archivos y números de migración disjuntos. Regla: cada arreglo
  de seguridad trae una prueba que **falla sin el arreglo y pasa con él**. Luego una verificación
  integrada desde cero y una revisión independiente de regresiones en flujos con PIN y escrituras
  directas.

---

## 3. Hallazgos y cómo se arreglaron

Estado: ✅ arreglado · 🟨 parcial · ⏸️ requiere decisión.

### 🔴 Críticos

| # | Hallazgo | Arreglo | Prueba |
|---|---|---|---|
| C1 | Suplantación del emisor CFDI (RFC editable → sello ajeno) | ✅ `rfc_verificado`, escrito solo por `cargar-csd` tras subir .cer+.key+contraseña; los tres puntos que timbran lo exigen (`SIN_SELLO_VERIFICADO`/`EMISOR_NO_COINCIDE`); trigger que fuerza el emisor | pgTAP 0020, `emisor.test.ts` |
| C2 | `sync-push` sobrescribe/roba filas de otro negocio; hijos colgados de padres ajenos (FKs apagadas en réplica) | ✅ 0131: `DO UPDATE … WHERE tenant_id = $2`, validación manual de FKs, rechazo reportado | pgTAP 0016 (5/7 fallan sin arreglo) |
| C3 | Escritura REST directa a tablas de dinero | ✅ 0133: guardián BEFORE en 21 tablas; solo pasa la lista blanca de lo que el POS hace hoy, con reglas de estado; DELETE nunca; catálogo solo con `config.productos` | pgTAP 0018 (16/26) |
| C4 | Autorizaciones PIN no ligadas a la acción | ✅ 0134: `consumir_autorizacion()` — permiso, negocio, entidad, monto, vigencia 10 min, un uso, solicitante = sesión; en 11 RPCs y el trigger de movimientos | pgTAP 0019 (28/31) |
| C5 | Dueño/admin se quita la suspensión, cambia plan y dueño | ✅ 0132: UPDATE de `tenants` solo por columna | pgTAP 0017 |

### 🟠 Altos

| # | Hallazgo | Arreglo |
|---|---|---|
| A1 | Un cajero reescribía la matriz de permisos (overrides y permisos personalizados) | ✅ 0132: solo DUEÑO/ADMIN, nunca sobre DUEÑO, nadie sobre sí mismo |
| A2 | ADMIN se promovía a DUEÑO, desactivaba al dueño, re-vinculaba accesos de otro negocio y reescribía `pin_hash` | ✅ 0132: grants por columna + triggers de protección |
| A3 | Todo empleado leía el `pin_hash` del equipo (crack offline del PIN de supervisor) | ✅ 0132 (SELECT por columna) + escritorio (el arranque ya no re-otorga todo) |
| A4 | `consumir_folio_cfdi` quemaba folios de otro negocio | ✅ 0132/0135: solo service_role + chequeo interno |
| A5 | `transicionar_estado_cocina_con_autorizacion` cambiaba tickets de otro negocio (sin triggers) | ✅ 0132: sin EXECUTE |
| A6 | `cargar-csd` borraba el sello de otro cliente en la cuenta compartida | ✅ 0135: solo el `rfc_verificado` propio |
| A7 | Autofactura enumerable: recorrer folios, ver totales y facturar tickets ajenos a RFC falsos | ✅ token HMAC en el QR (o total exacto como segundo factor) + límite en BD por IP y por negocio |
| A8 | Cobro dividido con propina: el ticket se cerraba antes y el siguiente pago fallaba | ✅ 0134 (cierra con total + propina) + POS (si ya quedó PAGADO, se da por cobrado) |
| A9 | Escritorio: cualquier sesión podía escribir las tablas del sync (borrar `_vim_migraciones` = la caja no vuelve a arrancar; marcar filas como subidas sin subirlas) | ✅ `privilegios.mjs` + event trigger en el shim |
| A10 | Escritorio: login local con contraseña de cualquier usuario, sin límite, en `0.0.0.0` (fuerza bruta de la contraseña del dueño desde el Wi-Fi) + el sync bajaba los hashes de todos | ✅ solo cuentas DISPOSITIVO, freno 429; 0136: el pull solo baja hashes de DISPOSITIVO y **borra** los ya copiados |
| A11 | Electron 43.4.0 con avisos altos (y CI no lo auditaba) | ✅ `^43.7.7`; paso de CI que audita electron |
| A12 | El outbox web congelado aplicaba renglones y pagos con precio/monto del cliente | ✅ 0138: ya no aplica; guarda para revisión, reenvío idempotente |
| A13 | `delivery-accion` en el escritorio respondía **siempre** 503 (aceptar/pausar Uber no funcionaba) | ✅ el gateway lee el proveedor de nube vivo |

### 🟡 Medios

| # | Hallazgo | Arreglo |
|---|---|---|
| M1 | Rutas de Storage y `pac_referencia` editables → leer cualquier objeto con service_role / cancelar CFDI ajenos | ✅ 0135: `tickets_cfdi` de solo lectura; rutas calculadas desde el id; políticas de Storage sobrantes eliminadas |
| M2 | Fuerza bruta del PIN de supervisor y oráculo `SIN_PERMISO` | ✅ 0132: misma respuesta, bloqueo por solicitante |
| M3 | Límites de tasa en memoria y por la primera IP de `X-Forwarded-For` | ✅ 0136: `consumir_cupo` en BD + `_shared/limite.ts` |
| M4 | `signup-tenant` sin límite ni verificación | 🟨 límite ✅; verificación de correo ⏸️ (§6) |
| M5 | Clave compartida de provisión válida para siempre | ✅ `PROVISION_INTERNAL_SECRET` + límite de fallos |
| M6 | Formulario de demo inundable (agota el correo que también manda invitaciones) | ✅ límite por IP + tope global sin correo |
| M7 | DNS rebinding en el escritorio | ✅ Host permitido en gateway y ui-server |
| M8 | DoS sin autenticación en el escritorio (`/__folios`, cuerpos sin tope, SSE) | ✅ token cacheado, topes 413, SSE con tope y **token obligatorio** (el POS y el KDS lo mandan y reabren al caducar) |
| M9 | Espejo de delivery muerto tras reiniciar el backend | ✅ pool vigente |
| M10 | Un accept fallido de Uber nunca se reintentaba (la cocina preparaba un pedido cancelado) | ✅ lista `aAceptar` |
| M11 | Manifiesto de actualización sin firma | 🟨 https + versión validadas; firma Ed25519 **preparada, apagada** hasta generar la llave (§6) |
| M12 | Reintentos del cobro duplicaban pagos o cambiaban el método | ✅ client id estable por pago; se quitan los que entraron |
| M13 | Ticket huérfano al fallar a medio guardar; el reintento abría otro | ✅ `ErrorTicketParcial` con el id; se completa el mismo ticket |
| M14 | Nota de alergias, nombre y dirección podían perderse sin aviso | ✅ se revisa el error |
| M15 | Propina editable en tickets ya cobrados | ✅ 0134 |
| M16 | KDS guardaba la contraseña del dispositivo en `localStorage` | ✅ solo el correo; sesión de supabase-js |
| M17 | "Top productos" del dashboard mal sumado en multi-sucursal | ✅ se agrega por producto |
| M18 | CI no corría las pruebas del sitio ni auditaba electron | ✅ |
| M19 | Aviso de privacidad remitía al INAI (extinto) | 🟨 corregido; faltan nombre legal y domicilio ⏸️ (§6) |
| M20 | `descuento.override_precio` no existía: cambiar precio y repreciar zona fallaban siempre | ✅ 0139 |
| M21 | El PIN del costo de envío no protegía nada (UPDATE directo sin PIN) | ✅ 0139: `cambiar_costo_zona` consume el PIN |
| M22 | `timbrar-global` aceptaba rangos inventados (globales sin límite) | ✅ solo periodos reales y cerrados |

### 🔵 Bajos / info (todos ✅ salvo dos)

Pagos negativos aceptados (0134) · políticas de Storage sobrantes (0135) · oráculos para anon (0132)
· webhook de Uber guardaba cuerpos con firma inválida y leía antes de medir (0136) · tenant elegido
con `.limit(1)` en cinco funciones (0136) · `listUsers` tope 1000 (0136) · errores internos devueltos
al cliente (0136) · reportes truncados a 1000 filas · alta de suscripción no atómica y precios sin
validar (0137) · impersonar sin motivo · caché del catálogo sin tenant · redondeo distinto al de
Postgres y costo de envío sin centavos · `crypto.randomUUID` fuera de https · 404 sin estilos en rutas
anidadas · CSP de `.htaccess` distinta a la de Vercel · textos que mandaban a WhatsApp · `.npmrc`
prometía una allow-list que no existía · sin Dependabot · Node equivocado en el job del escritorio ·
PIDs matados a ciegas tras un corte de luz · restaurar un respaldo con la clave de fábrica · ventana
de Electron sin sandbox ni límites de navegación · `confirmar_devolucion` aceptaba el autor del
cliente (0139) · 17 errores de tipos que ya existían en 6 Edge Functions (nadie corría `deno check`)
· IP de confianza en el panel de plataforma · textos del límite de registro.

Abiertos: 🟨 6 vulnerabilidades **moderadas** en dependencias de desarrollo (vitest 3 → 4 es salto
mayor) · ⏸️ teléfono de soporte en `pantalla-bloqueada.tsx` en un repo público (¿es personal?).

---

## 4. Verificación final (integrada, desde cero)

| Batería | Resultado |
|---|---|
| Migraciones 0001–0139 + seed sobre Postgres 16 limpio | ✅ aplican |
| Smokes de negocio (`supabase/scripts/smoke_*.sql`) | ✅ 52/52 |
| pgTAP (`supabase/tests`, 23 archivos) | ✅ 301/301 |
| Vitest (pos 369 · admin 185 · platform 87 · fecha 20) | ✅ 661/661 |
| Edge Functions (`pnpm test:functions`) | ✅ 224/224 |
| `deno check` de las 22 Edge Functions | ✅ 0 errores (antes: 17 en 6 funciones) |
| Escritorio (`node --test`, 8 contra Postgres real) | ✅ 147/147 |
| Sitio (`pnpm test:sitio`) | ✅ 49/49 |
| Typecheck de las 5 apps · build de producción · escala tipográfica | ✅ |
| `pnpm audit --prod` · `npm audit` (escritorio, incluido dev) | ✅ 0 vulnerabilidades |
| Gitleaks, historial completo (920 commits) | ✅ solo llaves `anon` públicas, la demo local y ejemplos de proveedores |

**No se pudo probar aquí:** Electron en ventana real ni el instalador de Windows; las Edge
Functions contra un runtime de Supabase o contra Facturama; que el PostgREST del escritorio fije
`request.path` (lo hace desde la v10; si no, el guardián de 0133 no actúa allí pero tampoco rompe).

---

## 5. Despliegue — orden obligatorio

1. **Secretos nuevos** (antes de desplegar funciones):
   - `PROVISION_INTERNAL_SECRET` = `openssl rand -hex 32`, **el mismo valor** en Vercel (platform) y
     en `supabase secrets set`. Primero Vercel + deploy del panel; después Supabase + deploy de
     `provisionar-tenant`; al final `supabase secrets unset PLATFORM_PROVISION_KEY` (en Vercel se queda).
   - Opcional: `VIM_IP_CABECERA` si en producción no llega `cf-connecting-ip`
     (comprobarlo una vez como indica `_shared/limite.ts`).
2. **Migraciones 0131–0139** (`supabase db push`), luego `pnpm db:types` y commit de los tipos
   (no se pudo regenerar aquí: la CLI necesita Docker).
3. **Edge Functions** — **inmediatamente después** de la 0135/0136, y las seis de CFDI juntas
   (`timbrar-cfdi`, `timbrar-global`, `autofacturar`, `cargar-csd`, `descargar-cfdi`,
   `cancelar-cfdi`): con la migración sola, las viejas no pueden marcar el timbrado; con las
   funciones solas, falta `rfc_verificado`. El resto: `solicitar-demo`, `signup-tenant`,
   `delivery-*`, `sync-pull`, `sync-push`, `provisionar-*`, `enviar-push`, `crear-empleado`,
   `pin-login`, `resetear-pin`, `caja-latido`, `autorizar-pin`.
4. **Tras la 0135:** cruzar las filas con `rfc_verificado` contra la lista de CSD de la cuenta de
   Facturama (consulta en la cabecera de la migración).
5. **Apps (Vercel):** pos, admin, platform, factura, kds.
6. **Escritorio:** nueva versión (Electron 43.7, privilegios, gateway). Seguir **"Antes de
   empaquetar"** de `desktop/RUNBOOK.md` (`postgrest.exe`, ≥155 MB). Probar en una caja real:
   ventana con sandbox, cobro con PIN, cocina en tiempo real (si falla, `VIM_KDS_STREAM_AUTH=0` y
   avisar).

---

## 6. Pendientes que requieren al dueño

| Tema | Por qué no se hizo | Qué hace falta |
|---|---|---|
| Nombre legal, RFC y domicilio en el aviso de privacidad | La LFPDPPP lo exige; no se inventan | El dato y, idealmente, revisión legal |
| Verificación de correo en el alta | Cambia el onboarding (hoy entra directo a `/bienvenida`) | Decidir: enlace mágico + TRIAL restringido hasta confirmar |
| Primer mes de la suscripción sin cubrir por ningún pago | Regla de negocio | Confirmar si es intencional |
| Aislamiento por sucursal (un empleado de la sucursal 1 opera la 2) | RLS es por negocio; ¿la matriz lo exige? | Decidir con `09-MATRIZ-ROLES-PERMISOS` |
| Firma de actualizaciones del escritorio | No se inventa una llave | Generar el par Ed25519 (RUNBOOK) y poner la pública en `updater.mjs` |
| Tokens de empleado no revocables (12 h) | Diseño stateless | Decidir si se acorta o se añade lista de revocación |
| Cualquier operador de plataforma puede restablecer a otro | No hay roles de operador | Decidir si hace falta un rol "superoperador" |
| Repo público con documentación de proveedores (Uber, DiDi, Rappi, Facturama) y un teléfono | Licencias/NDA y privacidad | Revisar y, si aplica, poner el repo en privado |
| vitest 3 → 4 (6 moderadas de dev) | Salto mayor | PR aparte |
| `deno check` en CI | El `.npmrc` (`@vim:registry`) hace fallar a Deno 2.5 dentro del repo | Paso de CI que copie `supabase/functions` a un directorio temporal o `deno.json` con `nodeModulesDir: none` probado contra `supabase functions deploy` |
| Pruebas del escritorio contra Postgres en CI | Necesitan `VIM_TEST_PG*` | Añadir un servicio Postgres al job `desktop` |

---

## 7. Falsos positivos descartados (para no volver a perseguirlos)

- Semgrep `detected-jwt-token` en `vim.js`, `desktop/src/main.mjs`: llaves **anon** (públicas por
  diseño); en `scripts/auditar-consultas.mjs`: la llave `service_role` de la **demo local** de
  Supabase, conocida por todos.
- Semgrep `html-in-template-string` en `excel.ts` (celdas `inlineStr`, XML escapado),
  `epson-epos-adapter.ts` (todo pasa por `esc()`), `solicitar-demo` (todo pasa por `esc()`),
  `ui-server.mjs` (valor siempre null / `JSON.stringify`).
- Semgrep `remote-property-injection` en `gateway.mjs` (lista fija de cabeceras),
  `js-open-redirect` y `unsafe-dynamic-method` en `vim.js` (constantes).
- `spawn(..., {shell:true})` en `desktop/scripts/*` (argumentos estáticos; no se empaqueta).
- Contraseñas de `seed.sql` y fixtures: el instalador **no** aplica el seed (`seedIfEmpty=false`
  cuando hay `resDir`).
- Las 27 vistas son `security_invoker`; los 45 SECURITY DEFINER previos fijan `search_path`.

---

## 8. Commits de esta sesión

`6b8bde9` skill · `176e7f6` 0131 sync · `55a69f8` POS/KDS · `3031849` 0132 RLS · `34c878f`
admin/plataforma/sitio/CI + 0137 · `b0ec8e0` prueba de grants · `c325712` Edge públicas + 0136 ·
`31af51b` CFDI + 0135 · `db276d6` escritorio · `afb8504` 0133/0134 dinero · `17cc8f3` 0138/0139 ·
`3b24b71` registro e IP del panel.
