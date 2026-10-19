# Belleza · Entrega 1 (agenda) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un salón, spa, peluquería, barbería o estudio de tatuajes dé de alta servicios, colaboradores (con horario y ausencias) y espacios, y que la recepción agende, mueva, atienda y marque citas en un calendario por colaborador, sin empalmes, con lista de espera, tolerancia, «No llegó», ficha de clienta y recordatorio por WhatsApp con botón, también en la caja instalada.

**Architecture:**
- **Un servicio es un producto** (`productos`, sin existencias, `tipo_venta = UNIDAD`, unidad SAT E48) más su renglón en `servicios_agenda` con duración y tipo de espacio. Así la entrega 2 lo cobra como cualquier renglón de ticket.
- **Un colaborador es un empleado** (`usuarios_perfil` + `usuarios_acceso`) con su renglón en `colaboradores_agenda` (color, sucursal, activo), su horario semanal y sus ausencias.
- **Una cita** (`citas`) tiene uno o varios renglones (`citas_servicios`), cada uno con servicio, colaborador, espacio y su tramo de tiempo. **El candado contra empalmes vive en la base:** dos restricciones `EXCLUDE USING gist` sobre `citas_servicios` (mismo colaborador / mismo espacio con tramos que se cruzan), con `btree_gist`.
- **Módulo de operación `agenda`** en `tenants.operacion` (ADR 0034): lo enciende el juego inicial de los giros de belleza; `modulos_efectivos` ya publica las llaves de operación.
- **La caja de belleza** reutiliza la caja de tienda (barra inferior, secciones, «Más») con su propia barra: Calendario · Cobrar · Clientes · Transacciones · Más. En esta entrega «Cobrar» es la caja de tienda de hoy; cobrar desde la cita es la entrega 2.

**Tech Stack:** PostgreSQL 15 (Supabase, `btree_gist`), smokes `.sql`, Next.js + Vitest (`apps/pos`, `apps/admin`), escritorio Node (`desktop/src`), `packages/db`.

**Spec:** `docs/superpowers/specs/2026-10-18-giros-belleza-design.md` — §2 giros, §3 «Citas y reservación», «Avisos» (WhatsApp con botón), «Servicios y precios», «Colaboradores» (horario), «Tatuajes»; §4 bocetos 1 y 3, Clientes, admin (servicios, colaboradores, espacios, tolerancia); §5; §6; §8 («No llegó» manual, empalmes con la caja sin internet, colores, un tipo de espacio por servicio, rama base). Bocetos: `docs/superpowers/bocetos-belleza/1-calendario.png`, `3-cita.png`.

## Global Constraints

- **Todo en local.** Rama `feat/belleza-agenda` encima de `feat/belleza-diseno` (que está encima de `feat/retail2-barra`). 0188–0215 no se editan. Nuevas: 0216 (solo `ADD VALUE`), 0217 (giros), 0218 (agenda), 0219 (sync); aplicadas al Docker local y registradas. Prohibido push, PR, merge, `db push`, desplegar o empaquetar.
- **Giros** (`vertical_tipo`): `SALON` «Salón de belleza», `SPA` «Spa», `PELUQUERIA` «Peluquería», `BARBERIA` «Barbería», `TATUAJES` «Tatuajes y piercings». En `packages/db/src/operacion.ts` con `ofrecido: false` (se abren en la entrega 4) y `GIROS_BELLEZA` / `esGiroBelleza`, espejo de `es_giro_belleza()` en SQL. `cambiar_giro` los rechaza con `GIRO_NO_DISPONIBLE`.
- **Juego inicial de belleza** (los cinco iguales): `mostrador`, `existencias` y `agenda` en `true`; todo lo demás `false`. Los restaurantes y tiendas reciben `agenda: false`.
- **Estados de cita** (enum `cita_estado`): `AGENDADA`, `EN_ESPERA`, `EN_CURSO`, `TERMINADA`, `NO_LLEGO`, `CANCELADA`. (`COBRADA` llega en la entrega 2.) Etiquetas visibles: «Por llegar», «En espera», «Atendiendo», «Terminada», «No llegó», «Cancelada».
- **Canal** (enum `cita_canal`): `CAJA`, `SIN_CITA`, `EN_LINEA` (este último lo usa la entrega 3).
- **Tolerancia:** `configuracion_tenant.agenda_tolerancia_min int NOT NULL DEFAULT 15 CHECK (BETWEEN 0 AND 120)`, con guardia de administrador como `configuracion_tenant_credito_guardia` (0208:23). «No llegó» es **manual**; pasada la tolerancia la cita solo se pinta «Pasó la tolerancia».
- **Zona horaria:** todo `timestamptz`; el «día» del calendario se calcula en `America/Mexico_City`. Nunca `CURRENT_DATE` contra fechas de negocio.
- **Colores de colaborador:** la paleta funcional de `docs/diseno/nucleo.md:114-124` (la de `PALETA_FALLBACK`, `apps/pos/app/lib/catalogo.ts:113`), asignada en orden al dar de alta; guardada en `colaboradores_agenda.color_hex`.
- **WhatsApp:** botón que abre `wa.me` con el mensaje escrito; mismo armado de enlace que las cotizaciones. Texto exacto: `Hola {nombre}, te recordamos tu cita en {negocio} el {día} a las {hora}: {servicios}.` (día como «jueves 6 de noviembre», hora «10:30»).
- **Restaurantes y tiendas no cambian.** Nada de agenda se ve sin el módulo `agenda`.
- Ponytail; español; sin `any`; dinero en `numeric(12,2)`. Suites: smokes, pos/admin/platform test y typecheck, tipografía, prueba 0040, escritorio (`cd desktop && npm test`; sus rojos de Windows conocidos no cuentan).

## Review Focus

1. **Dos canales, mismo hueco:** dos citas para el mismo colaborador o el mismo espacio que se cruzan aunque sea un minuto se rechazan con `CITA_EMPALMADA: …` legible; las que solo se tocan (una termina 11:00, otra empieza 11:00) sí pasan. Una cita cancelada o «No llegó» libera su tramo. → Task 2 (smoke).
2. **Caja sin internet:** una cita creada en la caja que choca con otra de la nube al sincronizar **no se pierde**: las dos quedan con `empalme = true` y la recepción ve «Empalme». → Task 3.
3. **Cita de varios servicios:** manicure 45 min + pedicure 30 min con colaboradores distintos se encadena (el segundo empieza cuando termina el primero) y cada tramo se valida contra su colaborador y espacio. → Task 2 y Task 5.
4. **«Quien esté libre»:** asigna al colaborador que trabaja a esa hora, no está ausente, no tiene empalme y tiene **menos citas ese día**; si nadie puede, error claro «No hay quien esté libre a esa hora». → Task 2.
5. **Restaurante y tienda intactos:** un negocio QUICK_SERVICE o RETAIL no ve la barra de belleza, ni el calendario, ni «Agenda» en el admin, y su juego inicial trae `agenda: false`. → Task 1 y Task 4.

---

### Task 1: Giros de belleza y módulo «agenda» (0216, 0217)

**Files:**
- Create: `supabase/migrations/0216_belleza_valores.sql` — solo `ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS` ×5. Encabezado al estilo de 0205: va en el instalador antes de usarse.
- Create: `supabase/migrations/0217_belleza_giros.sql`:
  - `es_giro_belleza(p vertical_tipo) RETURNS boolean` IMMUTABLE, como `es_giro_tienda` (0206:10).
  - `juego_inicial_de_giro` (cuerpo vigente 0206:19-37) con la rama de los cinco giros y la llave `agenda` en **todas** las ramas (false salvo belleza) y en el ELSE.
  - `cambiar_giro` (cuerpo vigente 0215) con los cinco en la lista de `GIRO_NO_DISPONIBLE` junto a BAR, CAFETERIA, TAQUERIA.
  - `CREATE EXTENSION IF NOT EXISTS btree_gist;`
- Modify: `packages/db/src/operacion.ts` — los cinco giros (`ofrecido: false`), `GIROS_BELLEZA`, `esGiroBelleza`, y `"agenda"` en `CodigoOperacion` con su descripción («Calendario de citas por colaborador»). `packages/db/src/database.types.ts`: regenerar (`pnpm db:types`, conservar `__InternalSupabase`).
- Tests: `apps/admin/app/lib/__tests__/operacion-catalogo.test.ts` (los cinco existen y no se ofrecen; `esGiroBelleza` true para los cinco y false para RETAIL/QUICK_SERVICE). Smoke `supabase/scripts/smoke_belleza_agenda.sql` (nuevo): `juego_inicial_de_giro('SALON')` = mostrador/existencias/agenda true y el resto false; `juego_inicial_de_giro('RETAIL')->>'agenda' = 'false'`; `cambiar_giro` a SPA → `GIRO_NO_DISPONIBLE`.

- [ ] Smoke y pruebas que fallan → migraciones → aplicar/registrar → smokes, 0040, admin test, typecheck pos/admin/platform → commit `"BD: giros de belleza y módulo agenda (0216, 0217)"`.

### Task 2: Agenda en la base: catálogo, citas sin empalmes y RPC (0218)

**Files:** Create `supabase/migrations/0218_agenda.sql` (tipos `cita_estado`, `cita_canal`, tablas, disparadores, RPC); smoke `supabase/scripts/smoke_belleza_agenda.sql`.

**Interfaces producidas** (las usan las Tasks 3–6; nombres exactos):
- Tablas (todas con `tenant_id`, RLS de lectura por negocio, escritura de catálogo solo `es_admin_del_tenant()`, auditoría `created_at/updated_at`):
  - `servicios_agenda (producto_id PK → productos, tenant_id, duracion_min int CHECK 5..600, tipo_espacio_id NULL → tipos_espacio, activo bool)`.
  - `servicio_colaborador (producto_id, usuario_id, precio_mxn numeric(12,2) NULL, duracion_min int NULL, PK(producto_id, usuario_id))` — quién hace qué; precio/duración propios opcionales.
  - `colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex varchar(7), activo, orden int, PK(tenant_id, usuario_id))`.
  - `horarios_colaborador (id, tenant_id, usuario_id, dia_semana smallint 0..6 (0 = domingo), inicia time, termina time, comida_inicia time NULL, comida_termina time NULL, UNIQUE(tenant_id, usuario_id, dia_semana))`.
  - `ausencias_colaborador (id, tenant_id, usuario_id, desde date, hasta date, motivo text, CHECK hasta >= desde)`.
  - `tipos_espacio (id, tenant_id, nombre)` y `espacios (id, tenant_id, sucursal_id, tipo_espacio_id, nombre, activo, orden)`.
  - `citas (id, tenant_id, sucursal_id, cliente_id NULL, cliente_nombre, cliente_telefono, cliente_email, estado cita_estado, canal cita_canal, inicia timestamptz NULL, termina timestamptz NULL, llego_at, nota, empalme bool DEFAULT false, ticket_id NULL, client_id_local UNIQUE, created_by, created_at, updated_at)` — `inicia/termina` NULL solo en `EN_ESPERA`.
  - `citas_servicios (id, tenant_id, cita_id, orden smallint, producto_id, usuario_id, espacio_id NULL, inicia, termina, precio_mxn numeric(12,2), activa bool, empalme bool)` con:
    - `EXCLUDE USING gist (tenant_id WITH =, usuario_id WITH =, tstzrange(inicia, termina, '[)') WITH &&) WHERE (activa AND NOT empalme)`;
    - la misma con `espacio_id` (WHERE además `espacio_id IS NOT NULL`).
    - `activa` la mantiene un disparador desde `citas.estado` (false en CANCELADA, NO_LLEGO, EN_ESPERA).
- `configuracion_tenant.agenda_tolerancia_min` con su guardia.
- RPCs (SECURITY DEFINER con `search_path` fijo, validando `tenant_id` del JWT, como `guardar_cotizacion` de 0212):
  - `guardar_cita(p jsonb) RETURNS uuid` — crea o edita (si trae `id`). `p`: `{id?, sucursal_id, cliente_id?, cliente_nombre, cliente_telefono?, cliente_email?, inicia, nota?, canal, client_id_local, servicios:[{producto_id, usuario_id | null, espacio_id?}]}`. Encadena los servicios desde `inicia` con su duración (la de `servicio_colaborador` si existe, si no la de `servicios_agenda`); `usuario_id null` = «quien esté libre» (usa `colaborador_libre`); si el servicio pide tipo de espacio y no viene `espacio_id`, asigna el primer espacio libre de ese tipo por `orden`; si no hay, `CITA_EMPALMADA: no hay {tipo} libre a esa hora`. La violación del EXCLUDE se traduce a `CITA_EMPALMADA: {colaborador} ya tiene cita a esa hora`. Con colaborador elegido **no** se valida su horario ni sus ausencias (la recepción manda); solo el candado de empalmes. «Quien esté libre» sí respeta horario, comida y ausencias.
  - `colaborador_libre(p_sucursal uuid, p_producto uuid, p_inicia timestamptz, p_termina timestamptz) RETURNS uuid` — entre los que hacen el servicio, activos en esa sucursal, con horario que cubre el tramo (fuera de comida), sin ausencia ese día y sin empalme: el de **menos citas ese día** (desempate: `orden`). NULL si nadie.
  - `agregar_en_espera(p jsonb) RETURNS uuid` — `estado EN_ESPERA`, `canal SIN_CITA`, `llego_at = now()`, servicios con colaborador opcional y sin tramo.
  - `atender_cita(p_cita uuid, p_servicios jsonb DEFAULT NULL)` — de `AGENDADA` o `EN_ESPERA` a `EN_CURSO`, `llego_at = now()`; desde espera, el tramo empieza ahora (con la misma asignación y candado que `guardar_cita`).
  - `terminar_cita(p_cita)` — `EN_CURSO → TERMINADA`.
  - `marcar_no_llego(p_cita)` — solo desde `AGENDADA` y con `now() >= inicia`; si no, `DATOS_INVALIDOS: la cita todavía no empieza`.
  - `cancelar_cita(p_cita, p_motivo text)` — desde `AGENDADA` o `EN_ESPERA`.
  - `resolver_empalme(p_cita)` — quita `empalme` de la cita si ya no choca (si sigue chocando, `CITA_EMPALMADA`).
  - `faltas_cliente(p_cliente uuid) RETURNS int` — citas `NO_LLEGO` del cliente.
- Smoke `smoke_belleza_agenda.sql`, casos: catálogo con 2 colaboradores, 1 cabina; cita 10:00–11:00 con Ana; otra 10:30 con Ana → `CITA_EMPALMADA`; otra 11:00 con Ana pasa; misma cabina cruzada con otro colaborador → rechazada; cancelar libera el tramo; varios servicios se encadenan (manicure 45 + pedicure 30 → 10:00–10:45 y 10:45–11:15); «quien esté libre» elige al de menos citas y respeta horario, comida y ausencia, y sin nadie da el error; `marcar_no_llego` antes de `inicia` se rechaza; espera → atender asigna tramo desde ahora; RLS: un cajero no escribe el catálogo, otro negocio no lee citas; un anon no ve nada.

- [ ] Smoke que falla → 0218 → aplicar/registrar → smokes completos y 0040 → commit `"BD: agenda — servicios, colaboradores, espacios y citas sin empalmes (0218)"`.

### Task 3: La agenda viaja con la caja instalada (0219 + escritorio)

**Files:**
- Create: `supabase/migrations/0219_agenda_sync.sql`:
  - `sync_pull_snapshot` (vigente 0210:167) baja el catálogo completo (`servicios_agenda`, `servicio_colaborador`, `colaboradores_agenda`, `horarios_colaborador`, `ausencias_colaborador` vigentes o futuras, `tipos_espacio`, `espacios`) y las citas con `inicia >= hoy − 7 días` o `EN_ESPERA`, con sus `citas_servicios`.
  - `sync_push_snapshot` (vigente 0213:113) acepta `citas` + `citas_servicios` de la caja con un aplicador `_vim_aplicar_citas_caja` (molde: `_vim_aplicar_cotizaciones_caja`, 0213:~20): upsert por `id`, valida que `tenant_id`, `sucursal_id`, `cliente_id`, `producto_id`, `usuario_id`, `espacio_id` sean del negocio; **si un renglón choca con el EXCLUDE**, lo guarda con `empalme = true` y marca `empalme = true` también en la cita de la nube con la que choca y en la entrante. Nunca borra ni cancela. No acepta el catálogo desde la caja.
- Modify: `desktop/src/sync-pull.mjs` (`PULL_ORDER` :12, las tablas después de `productos`, `clientes` y `usuarios_acceso`) y `desktop/src/sync-push.mjs` (`LIBRETAS` :273: `citas: {libreta: "_vim_citas_ok", col: "cita_id"}`; viaja por huella, como las cotizaciones; los `citas_servicios` dentro de su cita).
- Tests: escritorio (cita editada en la caja vuelve a subir por huella; sin cambio no se reenvía); smoke `smoke_belleza_agenda_sync.sql`: push repetido no duplica; push de otro negocio se rechaza; push que choca deja ambas con `empalme = true` y ninguna borrada; `resolver_empalme` tras mover una la limpia.

- [ ] Pruebas que fallan → 0219 y escritorio → `cd desktop && npm test` y smokes → commit `"Sync: la agenda viaja con la caja (0219)"`.

### Task 4: Admin — servicios, colaboradores, espacios y tolerancia

**Files:**
- Create: `apps/admin/app/lib/agenda.ts` (+ `__tests__/agenda.test.ts`): esquemas Zod y lectura/escritura de las tablas de catálogo; `siguienteColor(usados: string[]): string` sobre la paleta funcional.
- Create: `apps/admin/app/(panel)/agenda/servicios/page.tsx` — lista de servicios (producto + duración + tipo de espacio + quién lo hace, con precio/duración propios por colaborador). Alta de servicio = crea el producto (categoría elegida, `controla_existencias = false`, unidad SAT E48) y su `servicios_agenda`.
- Create: `apps/admin/app/(panel)/agenda/colaboradores/page.tsx` — elegir empleados del negocio, color, sucursal, horario por día con comida, ausencias (desde/hasta/motivo), servicios que hace.
- Create: `apps/admin/app/(panel)/agenda/espacios/page.tsx` — tipos de espacio y espacios por sucursal.
- Create: `apps/admin/app/(panel)/configuracion/agenda/page.tsx` — «Tolerancia para llegar (minutos)», molde `configuracion/cotizaciones/page.tsx`.
- Modify: `admin-shell.tsx:36-63` (grupo «Agenda» con icono `calendario`: Servicios, Colaboradores, Espacios), `lib/operacion.ts:25-40` (`conAgenda(m)` oculta `/agenda/*` y `/configuracion/agenda` sin el módulo), `components/config-sidenav.tsx`.
- Tests: esquemas (duración 5–600, horario `termina > inicia`, comida dentro del horario, ausencia `hasta >= desde`), `siguienteColor`, `rutasOcultas` sin agenda oculta `/agenda/servicios` y con agenda no.

- [ ] Pruebas → implementar → `pnpm --filter @vim/admin test` y typecheck → navegador (controlador) → commit `"Admin: agenda — servicios, colaboradores, espacios y tolerancia"`.

### Task 5: Caja de belleza — barra y calendario

**Files:**
- Create: `packages/db/src/agenda.ts` — funciones puras compartidas (sus pruebas en `apps/pos/app/lib/__tests__/agenda-puro.test.ts`, como las de `operacion.ts` viven en el admin; exportarlo igual que `operacion`):
  - `tramosEncadenados(inicia: Date, duraciones: number[]): {inicia: Date; termina: Date}[]`;
  - `seCruzan(a, b): boolean` (intervalos `[)`);
  - `pasoTolerancia(inicia: Date, ahora: Date, toleranciaMin: number): boolean`;
  - `ETIQUETA_ESTADO_CITA: Record<CitaEstado, string>` con las etiquetas de Global Constraints;
  - `mensajeRecordatorio(datos: {nombre; negocio; inicia: Date; servicios: string[]}): string` con el texto exacto de Global Constraints.
- Modify: `apps/pos/app/lib/tienda.ts` — `esBelleza(caja)`; `SeccionTienda` agrega `"calendario"` y `"clientes"`; `destinosDe(caja)` devuelve la barra de belleza (calendario/«Calendario»/calendario, panel/«Cobrar»/caja, clientes/«Clientes»/clientes, transacciones/«Transacciones»/recibo, configuracion/«Más»/menu) o la de tienda.
- Modify: `apps/pos/app/components/barra-tienda.tsx` (recibe `destinos`) y `home-pos.tsx` (:606 la caja de belleza también es «tienda»; sección inicial `calendario` si es belleza; render en :3335-3425).
- Create: `apps/pos/app/lib/agenda.ts` — lectura del día (`citasDelDia(token, sucursalId, dia)`), catálogo y llamadas a las RPC de la Task 2.
- Create: `apps/pos/app/components/seccion-calendario.tsx` — boceto 1: tira de días de la semana, columna por colaborador activo (con su color), horas del horario del negocio, línea roja de la hora actual, citas posicionadas por tramo con estado y «Pasó la tolerancia» en rojo; chip «N en espera»; «+ Nueva cita»; marca «Empalme» visible. Tocar una cita abre la ficha (Task 6).
- Tests: funciones puras en `agenda-puro.test.ts` (tramos, cruce, tolerancia, mensaje exacto con fecha en zona MX); barra de belleza (las cinco etiquetas en orden) y la de tienda intacta; posición de una cita en la columna (función pura de layout).

- [ ] Pruebas → implementar → `pnpm --filter @vim/pos test`, typecheck y tipografía → navegador (controlador) → commit `"Caja de belleza: barra y calendario"`.

### Task 6: Caja de belleza — nueva cita, ficha, espera y Clientes

**Files:**
- Create: `apps/pos/app/components/modal-cita.tsx` — nueva/editar (modal al 80 %): clienta (buscar o nueva: nombre, teléfono, correo), uno o varios servicios, cada uno con «Quien esté libre» o colaborador, día y hora de inicio, nota; muestra los tramos encadenados antes de guardar; errores `CITA_EMPALMADA` en el modal.
- Create: `apps/pos/app/components/ficha-cita.tsx` — boceto 3: estado (con «tolerancia hasta HH:MM»), clienta con faltas, fecha y horario, canal, servicios (colaborador · espacio · duración · precio), nota; acciones: **Llegó · empezar** (`atender_cita`), **Recordar por WhatsApp** (enlace con `mensajeRecordatorio`), **Mover de horario** (abre `modal-cita` en edición), **Terminé** (si EN_CURSO), **No llegó · liberar lugar** (`marcar_no_llego`, con confirmación), **Cancelar cita** (con motivo). Con `empalme`, aviso y «Ya lo moví» (`resolver_empalme`).
- Create: `apps/pos/app/components/panel-espera.tsx` — lista de espera (quién, desde cuándo, servicio, preferencia) con «Atender» (elige colaborador o «quien esté libre») y «Agregar a la espera».
- Create: `apps/pos/app/components/seccion-clientes.tsx` — buscar clienta; ficha con visitas (citas TERMINADA), servicios anteriores y con quién, notas (`clientes.notas_internas`, editable), faltas, puntos de lealtad si el módulo está encendido, y «Agendar cita» (abre `modal-cita` con la clienta).
- Modify: `home-pos.tsx` — secciones nuevas y sus capas de Escape (pila compartida, `reference_arbitraje_escape_pos`).
- Tests: armado del payload de `guardar_cita` (varios servicios, «quien esté libre» = `usuario_id: null`); acciones visibles por estado (AGENDADA antes de la hora no ofrece «No llegó»; EN_CURSO ofrece «Terminé»); enlace de WhatsApp con el texto exacto; la ficha de clienta cuenta visitas y faltas.

- [ ] Pruebas → implementar → pos test, typecheck y tipografía → navegador (controlador): agendar dos servicios encadenados, intentar empalmar, espera → atender, «No llegó» tras la tolerancia, WhatsApp, ficha de clienta → commit `"Caja de belleza: citas, ficha, espera y clientes"`.

### Task 7: Documentos y revisión final

- `docs/diseno/pos-belleza.md` (nuevo, molde `pos-retail.md`): barra, calendario, ficha, espera, Clientes.
- `docs/decisiones/0038-la-cita-es-un-ticket-por-venir.md` (ADR): servicio = producto + `servicios_agenda`; candado de empalmes en la base con `btree_gist`; empalmes del sync se marcan, no se borran.
- El spec de belleza: «Entrega 1, hecha», con migraciones y orden de lanzamiento (0216 en el instalador antes de usarse; `btree_gist` existe en la caja instalada — verificado en `@embedded-postgres/windows-x64`).
- Suites completas, revisión de toda la rama y commit.

## Rulings de este plan (Fermín puede corregirlos)

- En la caja, con colaborador elegido, se puede agendar **fuera de su horario o en su ausencia** (la recepción manda). «Quien esté libre» y la reserva en línea (entrega 3) sí los respetan.
- Un servicio sin tipo de espacio no ocupa espacio.
- El calendario muestra el día; la semana es la tira para cambiar de día (sin vista semanal completa en esta entrega).
- «Cobrar» en la barra de belleza es la caja de tienda de hoy hasta la entrega 2.
- Los giros nuevos no se ofrecen en el registro todavía; para probar, el tenant local se pone en SALON por SQL.
