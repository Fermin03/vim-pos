# Belleza · Entrega 3 (reservas en línea) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la clienta de un salón aparte su cita sola desde el celular. Pasos:
1. Entra a `online.vimpos.com.mx/<negocio>`.
2. Elige uno o varios servicios, con colaborador o «quien esté libre».
3. Elige un horario libre y deja sus datos sin crear cuenta.
4. Paga el anticipo con Mercado Pago si el negocio lo pide.
5. Recibe confirmación y recordatorio por correo.
6. Puede cancelar o cambiar su cita desde el enlace dentro del límite del dueño. Si cancela a tiempo, el anticipo se le devuelve solo.

Además, toda la tienda en línea se muda a `online.vimpos.com.mx`, y `pedidos` redirige a la nueva dirección.

**Architecture:**
- **Mismo sitio, misma dirección.** La reserva vive en `apps/tienda`, con el mismo `tienda_config` (slug, logo, color y descripción) y la misma función `tienda` (secreto interno, Turnstile y cupos por IP). Para un negocio con el módulo `reservas` encendido, `/<negocio>` muestra el sitio de reservas en vez del menú.
- **Un solo complemento «En línea»:**
  - el permiso sale del add-on `TIENDA` que ya existe; Esencial lo compra y los demás planes lo incluyen;
  - el dueño enciende «Reservas en línea» con `configuracion_tenant.modulo_reservas_activo`;
  - `modulos_efectivos` publica `reservas` = add-on permitido **y** interruptor **y** `agenda`.
- **RPC de servidor con tenant explícito.** `guardar_cita` y `colaborador_libre` leen el tenant del JWT, que el sitio no tiene. Las RPC nuevas (`agenda_huecos`, `agenda_reservar_en_linea`, etc.) reciben `p_tenant`, son solo de `service_role` y reutilizan `_agenda_tramos`, con el mismo candado contra empalmes.
- **El anticipo en línea reutiliza los pagos de la tienda:**
  - `tienda_pagos` deja de exigir pedido y acepta un pago de cita (`pedido_id` o `cita_id`, exactamente uno);
  - la cadena de Mercado Pago (cobro, 3DS, webhook, barrido y devolución completa) atiende los dos;
  - al aprobarse el pago nace un `anticipos_cita` con método `PAGO_EN_LINEA`, **sin caja ni turno** (no entra al corte);
  - la caja lo aplica al cobrar como cualquier anticipo.
- **Correos por cola, como la tienda.** Hay una cola `agenda_correos` (confirmación, recordatorio un día antes, cancelación y cambio) que despacha el mismo cron y la misma función `tienda-correos`.

**Tech Stack:** PostgreSQL 15 (Supabase, pg_cron/pg_net, `btree_gist`), funciones Edge de Deno (no se pueden correr aquí; sus pruebas se escriben pero no se ejecutan), Next.js 15 + Vitest (`apps/tienda`, `apps/admin`, `apps/pos`), smokes `.sql`, escritorio Node.

**Spec:** `docs/superpowers/specs/2026-10-18-giros-belleza-design.md`:
- §3: «Citas y reservación», «Avisos», «Cobro», «Sitio de reservas», «Planes», «Tatuajes» (en línea solo cotización o valoración);
- §5: tienda en línea, sin cuenta, devolución completa;
- §8: un solo complemento «En línea»; varios servicios encadenados; «quien esté libre» se asigna solo; mudanza a `online`;
- «Entrega 1/2, hecha».

Referencia visual: `docs/superpowers/bocetos-belleza/referencia-reservas.webp` (la página de Square que eligió Fermín), con el design system de VIM POS.

## Global Constraints

- **Todo en local.** Rama `feat/belleza-reservas` encima de `feat/belleza-cobro` (HEAD 3e6e3830). 0188–0223 no se editan. Nuevas: 0224, 0225 y 0226, aplicadas al Docker local y registradas. Prohibido push, PR, merge, `db push`, desplegar funciones, cambiar DNS o Vercel, o empaquetar.
- **Dirección:**
  - `BASE_PUBLICA` y `BASE_TIENDA` = `online.vimpos.com.mx`;
  - las peticiones con host `pedidos.vimpos.com.mx` redirigen 308 a `https://online.vimpos.com.mx` con la misma ruta;
  - DNS, Vercel, `VIM_TIENDA_URL` y Turnstile son pasos del lanzamiento y se documentan, no se tocan.
- **Configuración** (`configuracion_tenant`, con guardia de administrador como `configuracion_tenant_agenda_guardia`):
  - `modulo_reservas_activo boolean NOT NULL DEFAULT false`;
  - `agenda_dias_reserva int NOT NULL DEFAULT 30 CHECK 1..120`: cuántos días adelante se puede reservar;
  - `agenda_intervalo_min int NOT NULL DEFAULT 15 CHECK IN (5,10,15,20,30,60)`: cada cuánto empiezan los horarios ofrecidos;
  - `agenda_aviso_min_horas int NOT NULL DEFAULT 2 CHECK 0..72`: no se reserva en línea con menos de esas horas de anticipación.
- **Servicio en línea:** `servicios_agenda.en_linea boolean NOT NULL DEFAULT true`. Para tatuajes, el dueño deja en línea solo «Cotización» o «Valoración».
- **Horarios ofrecidos (`agenda_huecos`):**
  - empiezan cada `agenda_intervalo_min`, desde ahora + `agenda_aviso_min_horas` hasta hoy + `agenda_dias_reserva`, en `America/Mexico_City`;
  - la cadena de servicios entera cabe: cada tramo dentro del horario de su colaborador (fuera de comida), sin ausencia, sin empalme con ninguna cita activa (marcada o no) y con espacio libre de su tipo;
  - con «quien esté libre», basta con que exista uno por tramo.
- **Reserva:**
  - la cita nace `AGENDADA`, `canal = 'EN_LINEA'`;
  - el colaborador «libre» se asigna con la regla de `colaborador_libre` (menos citas ese día y luego `orden`);
  - la clienta queda en `clientes` por teléfono (busca por teléfono del negocio; si no existe, la crea);
  - idempotente por `clave` (`citas.client_id_local = 'web:' || clave`).
- **Enlace de la cita:** un código aleatorio de 22 caracteres. Solo se guarda su SHA-256 (`citas.enlace_hash`), igual que el seguimiento de los pedidos. Ruta: `/<negocio>/cita/<codigo>`.
- **Cancelar o cambiar en línea:**
  - permitido si faltan más de `agenda_cancelar_horas`; si no, la página dice «Para cambios, comunícate con el negocio» con su WhatsApp;
  - al cancelar a tiempo, el anticipo en línea se devuelve completo por Mercado Pago;
  - al cambiar, la cita conserva su anticipo.
- **Anticipo en línea:**
  - aplica si `agenda_cobro_modo` ≠ `AL_FINAL` y `anticipo_sugerido > 0`;
  - mientras se paga, la cita aparta el lugar con `citas.pago_hasta = now() + 15 min`; si no se paga a tiempo, un barrido la **cancela sola** («No se completó el pago»);
  - sin conexión de Mercado Pago o con el cobro en línea pausado, no se puede reservar si el anticipo es obligatorio; el sitio lo dice.
- **Correos** (`agenda_correos`, uno por cita y tipo):
  - `CONFIRMACION` al reservar (o al pagar);
  - `RECORDATORIO` 24 h antes, solo si se reservó con más de 24 h;
  - `CANCELACION` y `CAMBIO`.

  Cada uno lleva día y hora en MX, servicios, colaborador, dirección del negocio y el enlace. Si cancela el negocio, el correo lo dice y avisa del reembolso.
- **Privacidad:** el sitio nunca expone el id del tenant, ni datos de otras clientas, ni nombres completos de colaboradores (solo nombre y la inicial del apellido).
- **Los restaurantes y las tiendas no cambian.** Su tienda en línea funciona igual, salvo la dirección.
- Ponytail; español; sin `any`; dinero en `numeric(12,2)`. Suites: smokes, pruebas y typecheck de tienda, admin, pos y platform, tipografía, prueba 0040, escritorio.

## Review Focus

1. **Dos clientas, mismo horario:** la segunda reserva recibe «Ese horario ya no está disponible» y la lista se actualiza; nunca quedan dos citas empalmadas. → Task 1 (smoke con la restricción) y Task 4.
2. **Pago abandonado:** quien aparta y no paga en 15 minutos no bloquea el lugar, y un pago que llega tarde (después del barrido) se devuelve solo. → Task 2.
3. **Cancelar a tiempo vs. tarde:** a tiempo, el reembolso completo queda en POR_DEVOLVER y luego DEVUELTO. Tarde, no hay botón de cancelar y el anticipo lo resuelve la recepción (retener). → Task 1 y Task 2.
4. **Caja sin internet:** una cita reservada en línea baja a la caja. Su anticipo en línea se aplica al cobrar y no cuenta como efectivo del turno. → Task 2.
5. **Tienda de restaurante intacta:** el menú, los pedidos, los pagos y los correos de un restaurante siguen igual, y el cambio de dirección no rompe sesiones ni enlaces. → Task 2, Task 4 y Task 7.

---

### Task 1: Reservas en la base (0224)

**Interfaces producidas:**
- Las columnas de configuración y `servicios_agenda.en_linea` de Global Constraints.
- `citas`:
  - `enlace_hash text NULL UNIQUE (tenant_id, enlace_hash)`;
  - `pago_hasta timestamptz NULL`;
  - `reservo_email text NULL`, para los correos.
- `modulos_efectivos` (vigente en 0218) publica `reservas` = `tenant_addon_activo(t,'TIENDA') AND modulo_reservas_activo AND operacion->agenda`.
- `reservas_negocio(p_slug text) RETURNS jsonb` (solo `service_role`). Devuelve NULL si no aplica. Si aplica, regresa:
  - `{tenant (interno), nombre, slug, logo_ruta, color, descripcion, whatsapp, sucursales[{id, nombre, direccion, ubicacion, horario}]}`;
  - `servicios[{producto_id, nombre, categoria, precio, duracion_min, anticipo_mxn}]` (solo `en_linea` y activos);
  - `colaboradores[{id, nombre_corto, sucursal_id, servicios[]}]`;
  - `reglas {cancelar_horas, dias_reserva, intervalo_min, aviso_min_horas, cobro_modo, pago_en_linea_disponible}`.
- `agenda_huecos(p_tenant uuid, p_sucursal uuid, p_dia date, p_servicios jsonb) RETURNS TABLE(inicia timestamptz)`. `p_servicios` es `[{producto_id, usuario_id|null}]` en orden. Aplica las reglas de Global Constraints.
- `agenda_reservar_en_linea(p_tenant uuid, p jsonb) RETURNS jsonb`:
  - `p` trae `{sucursal_id, inicia, servicios[{producto_id, usuario_id|null}], cliente{nombre, telefono, email}, nota?, clave}`;
  - revalida el hueco, asigna libres, crea o busca la clienta y crea la cita;
  - si lleva anticipo, pone `pago_hasta`;
  - devuelve `{cita_id, codigo (en claro, solo esta vez), anticipo_mxn, resumen}`;
  - el empalme se traduce a `HUECO_OCUPADO: Ese horario ya no está disponible`.
- `agenda_cita_publica(p_tenant uuid, p_enlace_hash text) RETURNS jsonb`: estado, día y hora, servicios, colaborador corto, anticipo, `puede_cambiar` y el WhatsApp del negocio.
- `agenda_cancelar_en_linea(p_tenant, p_enlace_hash)` y `agenda_mover_en_linea(p_tenant, p_enlace_hash, p_inicia timestamptz)`: aplican el límite de `agenda_cancelar_horas` y revalidan el hueco al mover.
- `agenda_vencer_reservas()`: cancela las citas con `pago_hasta < now()` y sin anticipo aprobado. Corre en el cron de `tienda-pagos` (0173:1715), extendido.
- Smoke `smoke_belleza_reservas.sql`:
  - los huecos respetan horario, comida, ausencia, empalme (también con una cita marcada), espacio, intervalo, aviso mínimo y días;
  - la cadena de dos servicios con colaboradores distintos;
  - «quien esté libre» cuando hay uno y cuando no hay ninguno;
  - la segunda reserva del mismo hueco da `HUECO_OCUPADO`;
  - la `clave` idempotente;
  - la clienta se reutiliza por teléfono;
  - cancelar y mover dentro y fuera del límite;
  - el vencimiento de la reserva sin pago;
  - otro negocio no ve ni toca nada;
  - `anon` y `authenticated` no ejecutan estas RPC;
  - `reservas` solo con add-on, interruptor y agenda.

- [ ] Smoke que falla → 0224 → aplicar/registrar → smokes completos y 0040 → commit `"BD: reservas en línea (0224)"`.

### Task 2: Anticipo en línea con Mercado Pago (0225)

**Interfaces producidas:**
- `tienda_pagos`:
  - `pedido_id` pasa a ser NULL y se agrega `cita_id uuid NULL → citas`, con `CHECK (num_nonnulls(pedido_id, cita_id) = 1)`;
  - índice único: un pago no extra por cita.
- Las RPC de la cadena se redefinen desde sus cuerpos **vigentes** (0173, 0175 y 0178; buscar con grep) para atender los dos casos, sin cambiar nada para pedidos: `tienda_pago_tomar_cobro`, `_descartar`, `_aplicar`, `_anotar`, `_verificacion`, `_abandonar`, `tienda_pagos_tomar`, `tienda_pago_devolucion`, `tienda_pago_conciliacion` y `tienda_pagos_barrer`.
- `anticipos_cita`:
  - `caja_id` y `turno_id` pasan a NULL solo si `metodo_pago = 'PAGO_EN_LINEA'` (CHECK);
  - el CHECK de método acepta `PAGO_EN_LINEA`;
  - columna `tienda_pago_id NULL`.
- Al aplicarse un pago de cita: se crea `anticipos_cita` VIGENTE `PAGO_EN_LINEA` con el monto aprobado y se limpia `citas.pago_hasta`. Si la cita ya estaba cancelada por vencimiento, el pago pasa a POR_DEVOLVER.
- **Reembolso:**
  - disparador en `citas` (a CANCELADA): si la cancelación es en línea a tiempo o la hizo el negocio, el `tienda_pagos` de la cita pasa a POR_DEVOLVER y el barrido lo devuelve;
  - al quedar DEVUELTO, el anticipo pasa a DEVUELTO;
  - `devolver_anticipo` sobre un anticipo `PAGO_EN_LINEA` no mueve el cajón: pone el pago en POR_DEVOLVER, sigue exigiendo permiso o PIN y no pide referencia;
  - `retener_anticipo` funciona sin turno para `PAGO_EN_LINEA`.
- **Corte:** los anticipos `PAGO_EN_LINEA` no cuentan como recibidos en ningún turno. `reporte_x` agrega `anticipos_en_linea_aplicados_mxn`, solo informativo. `pagar_con_anticipo` los aplica como cualquier anticipo.
- **Sync** (vigente en 0223): el aplicador de anticipos acepta `turno_id` NULL solo para `PAGO_EN_LINEA` y la caja no puede crear anticipos `PAGO_EN_LINEA`. El pull ya baja las citas EN_LINEA y sus anticipos.
- **Funciones** (`supabase/functions/_shared/tienda/pago-*.ts`, `tienda-webhook-mp`): `external_reference` = `tienda_pagos.id` (no cambia). Los tipos y el puerto aceptan un pago de cita. Se agregan pruebas `.test.ts` del flujo de cita, aunque no corren aquí.
- Smoke `smoke_belleza_reservas_pago.sql`:
  - pago aprobado → anticipo VIGENTE en línea;
  - pago tardío sobre una cita vencida → POR_DEVOLVER;
  - cancelar a tiempo → POR_DEVOLVER → DEVUELTO, y el anticipo DEVUELTO;
  - cancelar tarde no devuelve;
  - cobro en caja con anticipo en línea: el efectivo esperado no cambia;
  - un pedido de restaurante con pago en línea se comporta igual (regresión);
  - sync de un anticipo en línea aplicado en la caja.

- [ ] Smokes que fallan → 0225 y funciones → smokes completos, 0040 y escritorio en secuencia → commit `"BD: anticipo en línea con Mercado Pago (0225)"`.

### Task 3: Correos de la cita (0226 + función)

- 0226:
  - cola `agenda_correos (id, tenant_id, cita_id, tipo CONFIRMACION|RECORDATORIO|CANCELACION|CAMBIO, estado, intentos, siguiente_intento, UNIQUE(cita_id, tipo, version))`. `version` sube con cada cambio de horario, para que un cambio reprograme el recordatorio;
  - el enlace cifrado se guarda como `tienda_enlaces`, que vive 48 h; para citas debe durar hasta el día de la cita más 1 día;
  - disparadores en `citas` (al reservar o pagar, al cancelar, al mover) encolan el correo;
  - `agenda_recordatorios_encolar()` mete los RECORDATORIO de las citas de mañana (24 h ± el intervalo del cron);
  - los dos corren en el barrido de `tienda_correos_barrer` (0176), extendido.
- `supabase/functions/tienda-correos/index.ts` también despacha `agenda_correos` (RPC `agenda_correos_tomar` y `agenda_correo_resultado`), con plantillas nuevas en `_shared/tienda/correo-cita.ts` y su `.test.ts`. Mismo estilo que `correo-estado.ts`. Textos:
  - asunto de confirmación: «Tu cita en {negocio} quedó apartada»;
  - recordatorio: «Mañana es tu cita en {negocio}»;
  - cancelación: «Tu cita en {negocio} se canceló»;
  - cambio: «Tu cita en {negocio} cambió de horario».
- Smoke: encolado por tipo, sin duplicados, el recordatorio solo una vez por versión y nada para citas de la caja sin correo.

- [ ] Smoke que falla → 0226 y función → smokes y 0040 → commit `"Correos de la cita en línea (0226)"`.

### Task 4: Función `tienda` y API del sitio

- `supabase/functions/tienda/index.ts`: acciones nuevas, que resuelven el negocio con `reservas_negocio` (no con `tienda_negocio`):
  - `reservas` (el catálogo) y `huecos` (`{sucursal, dia, servicios}`);
  - `reservar`, con Turnstile y cupo, que llama `agenda_reservar_en_linea` y, si hay anticipo, `cobrarPago` con el pago de cita (misma respuesta de `pago` y `VERIFICACION` que los pedidos);
  - `confirmar_pago` y `verificacion` reutilizados para la cita;
  - `cita` (`{codigo}` → `agenda_cita_publica` con el hash), `cita_cancelar` y `cita_mover`.

  El código en claro nunca se guarda ni se registra en logs.
- `apps/tienda/app/api/tienda/route.ts`: agregar esas acciones y sus campos a la lista permitida.
- `apps/tienda/app/lib/contrato.ts`: los parsers `reservasDe`, `huecosDe` y `citaDe`, más sus pruebas.
- Pruebas: los parsers y el route (acciones y campos permitidos o rechazados).

- [ ] Pruebas → implementar → tienda test y typecheck → commit `"Tienda: acciones de reservas"`.

### Task 5: Sitio de reservas (apps/tienda)

**Files:**
- `apps/tienda/app/[negocio]/page.tsx`: si el negocio tiene `reservas`, pinta `<SitioReservas>`; si no, la tienda de hoy.
- `apps/tienda/app/components/reservas/*` y `apps/tienda/app/lib/reservas.ts`, con la referencia `referencia-reservas.webp` en el design system de VIM:
  - **Inicio:**
    - logo, nombre, dirección con «Cambiar ubicación» si hay varias sucursales, botón «Reservar cita», descripción, ubicación y horario;
    - servicios por categoría (pestañas «Todos» y luego cada categoría) con precio, duración y «Reservar».
  - **Armar la cita:**
    - lista de servicios elegidos (agregar o quitar), cada uno con «¿Con quién?»: «Quien esté libre» o los colaboradores que lo hacen;
    - tira de días y horarios disponibles (`huecos`), con «No hay horarios este día» y el siguiente día con lugar.
  - **Tus datos:** nombre, celular de 10 dígitos y correo (obligatorio, porque ahí llega el enlace) y nota opcional. Se muestra el resumen con anticipo y «Pagas el resto en el negocio».
  - **Anticipo:** los componentes de tarjeta y 3DS de la tienda (`tarjeta.tsx`, `verificacion.ts`).
  - **Confirmación:** «Tu cita quedó apartada», día, hora, servicios, colaborador y «Te mandamos el enlace a tu correo», con botón «Ver mi cita».
  - **`/[negocio]/cita/[codigo]`:** estado, datos y, si `puede_cambiar`, «Cambiar horario» (con los mismos huecos) y «Cancelar cita», con confirmación. Si no, el aviso con WhatsApp.
- Accesible y para celular primero; controles de 44 px como mínimo; textos cortos (feedback de Fermín).
- Pruebas: armado de la cadena y del payload, validación de datos, formato de fecha y hora en MX, y el estado de «puede cambiar».

- [ ] Pruebas → implementar → tienda test, typecheck y tipografía → navegador (controlador): reservar dos servicios con «quien esté libre», pagar un anticipo con la tarjeta de prueba local (si no hay Mercado Pago local, el flujo sin anticipo), ver la cita, cambiarla y cancelarla → commit `"Tienda: sitio de reservas"`.

### Task 6: Admin — reservas en línea

- `apps/admin/app/(panel)/tienda/*`. Para un negocio con agenda, la sección se llama «En línea» y las pestañas son General, **Reservas**, Pagos y Sucursales; sin Menú ni pedidos si no vende comida. En la pestaña **Reservas**:
  - el interruptor «Reservas en línea»;
  - días hacia adelante, cada cuántos minutos y anticipación mínima;
  - la lista de servicios con el interruptor «Se reserva en línea» (`servicios_agenda.en_linea`);
  - el enlace para compartir (`online.vimpos.com.mx/<negocio>`, con copiar y WhatsApp).
- `apps/admin/app/(panel)/agenda/servicios/page.tsx`: la casilla «Se reserva en línea».
- `apps/admin/app/lib/tienda-plan.ts` y `apps/platform/app/lib/addons.ts`: la etiqueta del add-on «En línea (tienda y reservas)». El plan no cambia.
- Pruebas: esquemas, rutas visibles según los módulos y la etiqueta.

- [ ] Pruebas → implementar → admin y platform test y typecheck → navegador (controlador) → commit `"Admin: reservas en línea"`.

### Task 7: Mudanza a online.vimpos.com.mx

- `apps/tienda/app/lib/sitio.ts:2` y `apps/admin/app/lib/tienda-reglas.ts:4` pasan a `online.vimpos.com.mx`, con sus pruebas (`sesion`, `servidor`, `cuenta`, `tienda-reglas`, `correo-*.test.ts`).
- `apps/tienda/next.config.mjs`: `redirects()` con `has: [{type:'host', value:'pedidos.vimpos.com.mx'}]` → `https://online.vimpos.com.mx/:path*`, permanente (308). Prueba de la configuración.
- Documentos con la nueva dirección:
  - `docs/operacion/tienda-*.md`: más un **paso de lanzamiento** con el orden:
    1. DNS `online`;
    2. dominio en el proyecto `vim-tienda` de Vercel;
    3. `pedidos` en el mismo proyecto para que redirija;
    4. `VIM_TIENDA_URL`;
    5. `TURNSTILE_HOSTNAMES`, sin quitar `admin`;
    6. el widget de Turnstile.

    Aviso: las sesiones de cuenta de la tienda se cierran una vez por la cookie `__Host-`.
  - `docs/legal/*`;
  - `docs/diseno/admin.md`;
  - ADR 0032, con una nota.
- Pruebas: tienda y admin, y que no quede `pedidos.vimpos.com.mx` en el código salvo la redirección (búsqueda con grep en la prueba o en un smoke de texto).

- [ ] Pruebas → implementar → tienda y admin test y typecheck → commit `"La tienda en línea se muda a online.vimpos.com.mx"`.

### Task 8: Documentos y revisión final

- `docs/diseno/tienda.md` (o el documento de la tienda que exista): el sitio de reservas.
- `docs/legal/reservas-terminos-para-la-clienta.md` (borrador para Fermín): apartar, anticipo, cancelar o cambiar dentro del límite, reembolso por Mercado Pago, retención por no llegar o cancelar tarde, y datos que se guardan. Las páginas `privacidad` y `terminos` del sitio de un negocio con reservas enlazan a ese texto cuando Fermín lo apruebe; mientras tanto, a los términos actuales.
- ADR `0040-la-reserva-en-linea-usa-la-tienda.md`: misma app y slug, un complemento, RPC con tenant explícito, pago de cita en `tienda_pagos` y anticipo sin turno.
- El spec de belleza: «Entrega 3, hecha». Orden de lanzamiento:
  - 0224–0226 a la nube antes del merge;
  - desplegar `tienda`, `tienda-correos` y `tienda-webhook-mp` antes del merge;
  - los pasos de dirección de la Task 7;
  - textos legales de reservas para revisión de Fermín.
- Suites completas, revisión de toda la rama y commit.

## Rulings de este plan (Fermín puede corregirlos)

- **El correo es obligatorio** al reservar en línea, porque ahí llega el enlace para ver, cambiar o cancelar. El celular también.
- **El lugar se aparta 15 minutos** mientras se paga el anticipo; si no se paga, la cita se cancela sola.
- **No se reserva en línea con menos de 2 horas** de anticipación, a menos que el dueño lo cambie.
- **La clienta en línea queda registrada en Clientes por su teléfono**, igual que en la caja.
- **Los textos legales** (términos de la reserva y del anticipo) se escriben como borrador para que Fermín los revise; no salen sin su visto bueno.
