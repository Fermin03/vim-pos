# Belleza · Entrega 2 (cobro y comisiones) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la recepción cobre una cita desde la caja: sus servicios llegan al ticket con el colaborador de cada renglón y su precio, se agregan productos, se descuenta el anticipo y la cita queda «Cobrada». Que el dueño configure comisiones y sueldo y vea cuánto le toca a cada quien por periodo, y las ventas por colaborador y por servicio.

**Architecture:**
- **El colaborador va en el renglón.** `ticket_items.colaborador_id` lo pone `agregar_item_a_ticket` (parámetro nuevo opcional). Al insertar el renglón, un disparador **congela la regla de comisión** en el propio renglón (`comision_tipo`, `comision_valor`, `comision_base`). Así la comisión:
  - viaja con el sync genérico de `ticket_items`, sin tocar su SQL;
  - no cambia si el dueño edita las reglas después.
- **La comisión se calcula al leer** (vista `vw_comisiones_renglon`) a partir del renglón congelado, el estado del ticket y las devoluciones. No hay tabla de comisiones que mantener ni que sincronizar.
- **El anticipo es un dinero recibido antes de la venta.** Vive en `anticipos_cita` (molde: `abonos_credito`, 0208):
  - cuenta en el corte del turno que lo recibe;
  - al cobrar entra como el método `ANTICIPO`, que no es dinero ni se declara (molde: `SALDO_FAVOR`, 0209);
  - si se cancela, se **devuelve** o se **retiene**.
- **La cita queda «Cobrada»** cuando su ticket se paga: valor nuevo `COBRADA` en `cita_estado` y `citas.ticket_id`.

**Tech Stack:** PostgreSQL 15 (Supabase), smokes `.sql`, Next.js + Vitest (`apps/pos`, `apps/admin`), escritorio Node (`desktop/src`), `packages/db`.

**Spec:** `docs/superpowers/specs/2026-10-18-giros-belleza-design.md` — §3 «Cobro», «Servicios y precios», «Colaboradores» (sueldo + comisión; comisión por productos si el dueño lo activa; cálculo que decide el dueño), §4 boceto 2 (`docs/superpowers/bocetos-belleza/2-cobrar.png`), admin y reportes, §8 (anticipo: monto o porcentaje por servicio; en caja se devuelve como devolución normal; si el salón se lo queda entra al corte; sin CFDI de anticipo; sueldo fijo por periodo; comisión de quien atendió; anticipo perdido no genera comisión), «Entrega 1 (agenda), hecha» (pendientes: clave SAT, `ticket_id` en el sync).

## Global Constraints

- **Todo en local.** Rama `feat/belleza-cobro` encima de `feat/belleza-agenda` (HEAD 642ccd84). 0188–0219 no se editan. Nuevas: 0220 (solo `ADD VALUE`), 0221, 0222, 0223; aplicadas al Docker local y registradas. Prohibido push, PR, merge, `db push`, desplegar o empaquetar.
- **Valores nuevos:**
  - `cita_estado` gana `COBRADA`, con la etiqueta «Cobrada»;
  - `metodo_pago` gana `ANTICIPO`, con la etiqueta «Anticipo».

  Van en 0220, que trae solo `ADD VALUE`, como 0207.
- **Configuración del negocio** (`configuracion_tenant`, guardia de administrador como `configuracion_tenant_agenda_guardia`, 0218:20-42):
  - `agenda_cobro_modo text CHECK IN ('AL_FINAL','ANTICIPO','TODO') DEFAULT 'AL_FINAL'`. Etiquetas: «Al final», «Anticipo al apartar», «Todo por adelantado».
  - `agenda_cancelar_horas int DEFAULT 24 CHECK 0..168`: el límite para cancelar con devolución.
  - `agenda_comision_base text CHECK IN ('COBRADO','LISTA') DEFAULT 'COBRADO'`. Etiquetas: «Sobre lo cobrado (con descuentos, sin IVA)» y «Sobre el precio de lista (sin IVA)».
  - `agenda_comision_productos_pct numeric(5,2) NULL CHECK 0..100`: NULL significa que los productos no dan comisión.
  - `agenda_periodo_comisiones text CHECK IN ('SEMANAL','QUINCENAL') DEFAULT 'SEMANAL'`. La semana va de lunes a domingo; las quincenas son del 1 al 15 y del 16 a fin de mes.
- **Reglas por servicio y por colaborador:**
  - en `servicios_agenda`: `comision_tipo text CHECK IN ('PORCENTAJE','MONTO') NULL`, `comision_valor numeric(12,2) NULL`, `anticipo_tipo text CHECK IN ('PORCENTAJE','MONTO') NULL` y `anticipo_valor numeric(12,2) NULL`;
  - en `servicio_colaborador`: `comision_tipo` y `comision_valor` NULL, que son la excepción por colaborador;
  - en `colaboradores_agenda`: `sueldo_periodo_mxn numeric(12,2) NOT NULL DEFAULT 0`.
- **Cálculo de la comisión de un renglón**, sin floats:
  - **base COBRADO** = `total_item_mxn − iva_item_mxn`;
  - **base LISTA** = `precio_unitario_original_snapshot` (o `precio_unitario_snapshot` si no hubo override) × `cantidad`, sin IVA, según `iva_incluido_snapshot` y `tasa_iva_snapshot`;
  - **PORCENTAJE** = `round(base × valor / 100, 2)`;
  - **MONTO** = `round(valor × cantidad, 2)`;
  - solo cuenta en tickets PAGADO o FACTURADO, en renglones no cancelados, y menos la parte devuelta.
- **Precedencia de la regla congelada:**
  1. `servicio_colaborador`;
  2. `servicios_agenda`;
  3. si el producto no es servicio y `agenda_comision_productos_pct` no es NULL: PORCENTAJE con ese valor;
  4. si no, ninguna.

  La base es la de `configuracion_tenant` al momento de congelar.
- **Precio por colaborador:** si el renglón trae colaborador y `servicio_colaborador.precio_mxn` no es NULL, ese es el precio unitario del renglón.
- **Anticipo:**
  - no genera comisión ni puntos;
  - no se factura aparte (sin CFDI de anticipo);
  - **devolverlo** en efectivo sale del cajón del turno que devuelve (`DEVOLUCION_EFECTIVO`); con tarjeta o transferencia solo se marca devuelto, con referencia;
  - **retenerlo** («No llegó» o cancelación fuera del límite) lo deja como «Anticipo no reembolsable» en el corte y en los reportes.
- **Cita COBRADA:** es estado terminal. El sync no la regresa (`_vim_aplicar_citas_caja` la trata como TERMINADA) y su `ticket_id` sí se actualiza.
- **Los restaurantes y las tiendas no cambian.** `agregar_item_a_ticket` sin colaborador se comporta igual, y un renglón sin colaborador no tiene regla congelada.
- Ponytail; español; sin `any`; dinero en `numeric(12,2)`. Suites: smokes, pruebas y typecheck de pos, admin y platform, tipografía, prueba 0040, escritorio (`cd desktop && node --test src/*.test.mjs`; el rojo libuv conocido no cuenta).

## Review Focus

1. **Anticipo entre turnos:** $200 en efectivo en el turno A y la cita cobrada en el turno B con $500 de total. El corte de A espera $200 más. El de B espera solo los $300 en efectivo y no pide declarar ANTICIPO. → Task 3.
2. **Comisión estable y honesta:** el dueño cambia la regla después de la venta y la comisión de esa venta no cambia. Un ticket cancelado o un renglón cancelado no suma. Una devolución parcial reduce en proporción. → Task 2.
3. **Caja sin internet:** la venta con colaborador por renglón, el anticipo y la cita COBRADA suben en el sync, y la nube ve la cita con su `ticket_id`. → Task 4.
4. **Descuento y base:** corte de $180 con IVA 16 % incluido, comisión 40 %, descuento de 10 % en el renglón. Con base COBRADO: base = $162 − IVA = $139.66, comisión $55.86. Con base LISTA: base = $180 / 1.16 = $155.17, comisión $62.07. → Task 2.
5. **Restaurante intacto:** un ticket de restaurante sin colaborador no aparece en comisiones. `agregar_item_a_ticket` con la firma vieja sigue funcionando, porque la caja instalada vieja la llama así. → Task 2.

---

### Task 1: Valores nuevos (0220)

**Files:**
- Create: `supabase/migrations/0220_belleza_cobro_valores.sql` — solo `ALTER TYPE cita_estado ADD VALUE IF NOT EXISTS 'COBRADA'` y `ALTER TYPE metodo_pago ADD VALUE IF NOT EXISTS 'ANTICIPO'`, con encabezado como el de 0207.
- Modify:
  - `packages/db/src/metodos-pago.ts:23` — «Anticipo»;
  - `packages/db/src/agenda.ts` — `ETIQUETA_ESTADO_CITA.COBRADA = "Cobrada"`;
  - `apps/pos/app/lib/cierre.ts:29` — `NO_SE_DECLARA` con `"ANTICIPO"`;
  - el tipo `MetodoPago` de `apps/pos/app/lib/cobro.ts:15`;
  - `database.types.ts`, regenerado.
- Smoke `supabase/scripts/smoke_belleza_cobro.sql` (nuevo): los dos valores existen.

- [ ] Smoke → 0220 → aplicar/registrar → smokes, typecheck pos/admin/platform → commit `"BD: valores de cobro de belleza (0220)"`.

### Task 2: Colaborador por renglón, comisiones y cita cobrada (0221)

**Interfaces producidas:**
- Las columnas de configuración y de reglas de Global Constraints.
- `ticket_items`:
  - `colaborador_id uuid NULL → usuarios_perfil(id)`;
  - `comision_tipo text NULL`, `comision_valor numeric(12,2) NULL` y `comision_base text NULL`, congeladas por el disparador `ticket_items_congelar_comision` (BEFORE INSERT).
- `agregar_item_a_ticket(p_ticket_id, p_producto_id, p_cantidad, p_nota_cocina, p_modificadores, p_client_id_local, p_colaborador_id uuid DEFAULT NULL) RETURNS uuid`:
  - es el cuerpo vigente de 0152:246 más el parámetro, el precio por colaborador y la validación «colaborador activo del negocio» (mismo criterio que `_agenda_tramos`, 0219);
  - en la misma migración, `DROP FUNCTION agregar_item_a_ticket(uuid, uuid, numeric, text, jsonb, varchar)` y luego se crea la de 7 parámetros: si quedaran las dos, una llamada con 6 argumentos sería ambigua; la caja vieja la sigue llamando con 6 y el default la cubre;
  - mantiene los permisos.
- `vincular_cita_ticket(p_cita uuid, p_ticket uuid)`: pone `citas.ticket_id`, valida el mismo negocio, que la cita esté en EN_CURSO, TERMINADA o AGENDADA, y que el ticket esté ABIERTO o BORRADOR.
- Disparador en `tickets` (AFTER UPDATE OF estado, a PAGADO): las citas con ese `ticket_id` pasan a `COBRADA`. Si el ticket se cancela, vuelven a `TERMINADA`.
- Vista `vw_comisiones_renglon` (`security_invoker`): `tenant_id`, `ticket_id`, `ticket_item_id`, `colaborador_id`, `fecha_negocio` (fecha de pago en `America/Mexico_City`), `producto_nombre`, `es_servicio`, `base_mxn`, `comision_mxn`, aplicando las reglas de Global Constraints y descontando lo devuelto.
- `comisiones_periodo(p_desde date, p_hasta date) RETURNS TABLE(usuario_id uuid, nombre text, servicios int, ventas_mxn numeric, comision_servicios_mxn numeric, comision_productos_mxn numeric, sueldo_mxn numeric, total_mxn numeric)`:
  - SECURITY INVOKER bajo RLS;
  - un administrador ve a todos; un colaborador ve solo su fila (lo usa la entrega 4);
  - el sueldo es el de `colaboradores_agenda` si el rango es exactamente un periodo del negocio, y 0 si no;
  - ayudante `periodo_comisiones(p_fecha date) RETURNS daterange`.
- Smoke `smoke_belleza_cobro.sql`:
  - un renglón con colaborador congela la regla de `servicio_colaborador` antes que la de `servicios_agenda`;
  - un producto con `agenda_comision_productos_pct` congela PORCENTAJE;
  - el precio por colaborador se aplica;
  - el caso del Review Focus 4 con las dos bases;
  - cambiar la regla después no cambia la comisión;
  - un ticket cancelado y un renglón cancelado no suman;
  - una devolución parcial reduce;
  - la cita pasa a COBRADA al pagar;
  - la firma vieja sin colaborador sigue funcionando y no congela nada;
  - otro negocio no ve las comisiones;
  - `periodo_comisiones` en lunes, domingo y en las quincenas.

- [ ] Smoke que falla → 0221 → aplicar/registrar → smokes completos y 0040 → commit `"BD: colaborador por renglón, comisiones y cita cobrada (0221)"`.

### Task 3: Anticipos y corte (0222)

**Interfaces producidas:**
- Tabla `anticipos_cita`:
  - columnas: `id`, `tenant_id`, `sucursal_id`, `caja_id`, `turno_id` (el que recibe), `cita_id`, `metodo_pago` (EFECTIVO, TARJETA_DEBITO, TARJETA_CREDITO o TRANSFERENCIA), `monto_mxn > 0`, `estado` (`VIGENTE|APLICADO|DEVUELTO|RETENIDO`), `ticket_id NULL`, `turno_resuelve_id NULL`, `referencia_devolucion text NULL`, `client_id_local UNIQUE (tenant_id, client_id_local)`, `usuario_id` y fechas;
  - RLS de lectura por negocio y escritura solo por RPC.
- `registrar_anticipo(p_cita uuid, p_monto numeric, p_metodo metodo_pago, p_caja_id uuid, p_turno_id uuid, p_client_id_local text) RETURNS uuid`:
  - la cita debe estar en AGENDADA o EN_ESPERA;
  - idempotente.
- `anticipo_sugerido(p_cita uuid) RETURNS numeric`: suma por servicio según `anticipo_tipo` y `anticipo_valor`. Con `agenda_cobro_modo = 'TODO'` es el total de la cita, y con `'AL_FINAL'` es 0.
- `pagar_con_anticipo(p_ticket_id uuid, p_cita_id uuid, p_client_id_local text) RETURNS numeric`:
  - toma `LEAST(anticipos VIGENTE de la cita, saldo del ticket)`, lo aplica como pago `ANTICIPO` y marca los anticipos APLICADO con su `ticket_id`;
  - si sobra anticipo, el sobrante queda VIGENTE;
  - guardia: amplía `pagos_metodo_solo_por_rpc` (cuerpo vigente de 0209:430) y sus dos disparadores para que `ANTICIPO` solo entre por esta RPC (`vim.pago_anticipo`).
- `devolver_anticipo(p_anticipo uuid, p_caja_id uuid, p_turno_id uuid, p_referencia text DEFAULT NULL)`:
  - si es EFECTIVO, inserta `DEVOLUCION_EFECTIVO` en el turno que devuelve, con el motivo «Anticipo devuelto · {clienta}»;
  - si es de otro método, exige referencia;
  - el anticipo queda DEVUELTO.
- `retener_anticipo(p_anticipo uuid, p_turno_id uuid)`: el anticipo queda RETENIDO.
- Funciones del corte:
  - `calcular_efectivo_esperado` (vigente en 0208:549) suma los anticipos EFECTIVO por `turno_id` (recibidos);
  - `reporte_x` (vigente en 0209:471):
    - suma los anticipos por método al recibirlos, como los abonos;
    - excluye `ANTICIPO` de `pagos_por_metodo`;
    - agrega `pagado_con_anticipo_mxn`, `anticipos_recibidos_mxn`, `anticipos_devueltos_mxn` y `anticipos_retenidos_mxn`;
  - `arquear_caja` (vigente en 0209:~640) suma los anticipos recibidos por método al esperado.
- Smoke en `smoke_belleza_cobro.sql`:
  - el Review Focus 1;
  - devolver en efectivo resta del esperado del turno que devuelve;
  - devolver con tarjeta sin referencia se rechaza;
  - retener aparece en `anticipos_retenidos_mxn`;
  - `pagar_con_anticipo` con un anticipo mayor que el saldo deja el sobrante VIGENTE;
  - ANTICIPO por `aplicar_pago` directo se rechaza;
  - un anticipo no genera puntos ni comisión;
  - otro negocio no ve ni toca anticipos.

- [ ] Smoke que falla → 0222 → aplicar/registrar → smokes completos y 0040 → commit `"BD: anticipos de cita y corte (0222)"`.

### Task 4: Sync (0223 + escritorio)

**Files:**
- Create: `supabase/migrations/0223_belleza_cobro_sync.sql`:
  - **`_vim_aplicar_citas_caja`** (vigente en 0219, con sus correcciones):
    - `ticket_id = COALESCE(EXCLUDED.ticket_id, c.ticket_id)` en el SET;
    - `COBRADA` es terminal: no se regresa, pero sí acepta el paso a COBRADA.
  - **`sync_push_snapshot`** (vigente en 0219:492) acepta `anticipos_cita`:
    - por `id`, idempotente;
    - valida `tenant_id`, `cita_id`, `turno_id`, `caja_id` y `ticket_id`;
    - un anticipo de la nube ya resuelto no se regresa a VIGENTE.
  - **`sync_pull_snapshot`** (vigente en 0219:367) baja los anticipos VIGENTE de las citas que baja.
  - Las columnas nuevas de `ticket_items` viajan solas (`_vim_apply_rows_detalle` es genérico). Hay que confirmar con un smoke que un renglón con `colaborador_id` sube completo.
- Modify: `desktop/src/sync-push.mjs`:
  - `anticipos_cita` en `LIBRETAS_POR_ID` (:240), por id, como `abonos_credito`;
  - y en `sync-pull.mjs`, `PULL_ORDER` después de `citas`.
- Tests:
  - escritorio: un anticipo sube una vez y no se duplica;
  - smoke `smoke_belleza_cobro_sync.sql`:
    - el push de una venta con colaborador, del anticipo APLICADO y de la cita COBRADA con `ticket_id` llega completo;
    - repetirlo no duplica;
    - un anticipo de otro negocio se rechaza.

- [ ] Pruebas que fallan → 0223 y escritorio → pruebas en secuencia → commit `"Sync: cobro de belleza viaja con la caja (0223)"`.

### Task 5: Admin — reglas de cobro, comisiones, sueldo y reportes

**Files:**
- Modify: `apps/admin/app/(panel)/configuracion/agenda/page.tsx` y `apps/admin/app/lib/agenda.ts`. Se agregan las secciones **Cobro** (cuándo se cobra y límite para cancelar con devolución) y **Comisiones** (base, comisión por productos sí/no con su %, y periodo semanal o quincenal).
- Modify: `apps/admin/app/(panel)/agenda/servicios/page.tsx`:
  - por servicio: comisión (porcentaje o monto), anticipo (porcentaje o monto) y **Clave SAT**, con el buscador existente (`apps/admin/app/lib/clave-sat.ts`), guardada en `productos.clave_sat`;
  - en «Quién lo hace»: la comisión propia de cada colaborador.
- Modify: `apps/admin/app/(panel)/agenda/colaboradores/page.tsx`: «Sueldo por periodo».
- Create: `apps/admin/app/(panel)/reportes/comisiones/page.tsx`:
  - selector de periodo (actual, anterior o rango) con `comisiones_periodo`;
  - una fila por colaborador: servicios, ventas, comisión de servicios, comisión de productos, sueldo y total;
  - al tocar una fila, sus renglones (`vw_comisiones_renglon`).
- Create: `apps/admin/app/(panel)/reportes/ventas-colaborador/page.tsx`: ventas por colaborador y por servicio en el rango. Molde: `reportes/ventas-mesero/page.tsx` con `ReporteMarco`, `useConsulta` y `useRangoReporte`.
- Modify: el índice de `reportes/page.tsx` y `lib/reportes.ts`. Ambos reportes solo se ven con el módulo `agenda` (`lib/operacion.ts`).
- Tests:
  - esquemas: comisión 0..100 % o monto ≥ 0, anticipo, horas 0..168;
  - armado de filas;
  - rutas ocultas sin agenda.

- [ ] Pruebas → implementar → admin test y typecheck → navegador (controlador) → commit `"Admin: cobro, comisiones, sueldo y reportes de belleza"`.

### Task 6: Caja — cobrar la cita con colaborador por renglón

**Files:**
- Modify: `apps/pos/app/lib/carrito.ts:23`:
  - `LineaCarrito` gana `colaboradorId?: string` y `citaServicioId?: string`;
  - acción `CARGAR_CITA` (reemplaza el carrito con los servicios de la cita, cada uno con su colaborador);
  - acción `FIJAR_COLABORADOR` (cambia el colaborador de un renglón).
- Modify: `apps/pos/app/lib/cobro.ts` (`persistirTicket`, alrededor de :160): pasa `p_colaborador_id`, y si el carrito viene de una cita, llama `vincular_cita_ticket` después de `abrir_ticket`.
- Modify: el panel «Cobrar» de la caja de belleza (`home-pos.tsx` y su lado izquierdo). Pestañas **Citas de hoy · Servicios · Productos**, boceto 2:
  - «Citas de hoy» lista **Termina pronto** (EN_CURSO y TERMINADA sin cobrar), **En espera** y **Cobradas hoy**;
  - tocar una cita la carga (`CARGAR_CITA`) y la clienta queda asignada a la cuenta;
  - un servicio o producto agregado a mano toma el colaborador de la cita cargada, o se elige en el renglón;
  - los productos pueden quedar sin colaborador.
- Modify: el renglón del ticket (`sidebar-ticket.tsx`): debajo del nombre, «Adriana C.» y se puede cambiar al tocarlo. El ticket impreso (`lib/print/ticket-datos.ts`) muestra el colaborador bajo el servicio.
- Modify: los sitios que todavía usan solo `esTienda`, para que la caja de belleza se comporte como tienda:
  - `pantalla-devoluciones.tsx:73`;
  - `pantalla-cuentas-modo.tsx:930`;
  - `pantalla-inicio.tsx:183`;
  - `lib/print/ticket-datos.ts:372`.
- Tests:
  - `CARGAR_CITA` arma los renglones con colaborador y precio;
  - `FIJAR_COLABORADOR`;
  - `persistirTicket` manda `p_colaborador_id` y vincula la cita;
  - los grupos de «Citas de hoy» por estado;
  - el renglón impreso con colaborador;
  - la caja de tienda, sin cambios.

- [ ] Pruebas → implementar → pos test, typecheck y tipografía → navegador (controlador): cobrar la cita de Laura con un producto agregado y ver la cita «Cobrada» → commit `"Caja de belleza: cobrar la cita con colaborador por renglón"`.

### Task 7: Caja — anticipos

**Files:**
- Modify: `apps/pos/app/components/ficha-cita.tsx`:
  - acción **«Cobrar anticipo»** (monto sugerido por `anticipo_sugerido`, editable, y método) → `registrar_anticipo`;
  - muestra «Anticipo pagado $X».
  - Al guardar una cita nueva en `modal-cita.tsx`, si `agenda_cobro_modo ≠ AL_FINAL`, la caja ofrece cobrar el anticipo. Se puede omitir.
- Modify: `modal-cobro.tsx`, como en `CFG_SALDO_FAVOR` (:159): si el ticket viene de una cita con anticipos VIGENTE, aparece **«Anticipo»** con el monto, que se aplica primero (`pagar_con_anticipo`); el resto se cobra con otro método. Esto es lo que dibuja el boceto 2: «Anticipo −$390», «Por cobrar».
- Modify: `ficha-cita.tsx`. Al **Cancelar** o marcar **No llegó** una cita con anticipo VIGENTE, se pregunta **«¿Qué hacemos con el anticipo de $X?»**: «Devolver» o «Retener». La opción sugerida es:
  - **Devolver** si cancela el salón o falta más que `agenda_cancelar_horas`;
  - **Retener** si no llegó o canceló tarde.

  Con tarjeta o transferencia, «Devolver» pide referencia.
- Modify: `pantalla-cierre.tsx` y `lib/cierre.ts`: «Anticipos recibidos», «Pagado con anticipo», «Anticipos devueltos» y «Anticipos retenidos (no reembolsables)» se muestran como información y no se declaran.
- Tests:
  - la regla sugerida de devolver o retener (salón, a tiempo, tarde, no llegó);
  - «Anticipo» visible solo con anticipos vigentes;
  - el cierre no incluye ANTICIPO entre lo declarable;
  - los textos exactos.

- [ ] Pruebas → implementar → pos test, typecheck y tipografía → navegador (controlador): anticipo en efectivo, cobrar con anticipo y cancelar otra cita con «Retener» → commit `"Caja de belleza: anticipos"`.

### Task 8: Documentos y revisión final

- `docs/diseno/pos-belleza.md`: Cobrar, colaborador por renglón y anticipos.
- ADR `0039-la-comision-se-congela-en-el-renglon.md`.
- El spec de belleza: «Entrega 2, hecha», con migraciones y orden de lanzamiento. 0216–0223 van a la nube a mano, en orden y cada una en su transacción (0220 antes de 0221), antes del merge; el instalador va después. Una caja vieja no se afecta (ver el spec).
- Suites completas, revisión de toda la rama y commit.

## Rulings de este plan (Fermín puede corregirlos)

- **La comisión se calcula al leer**, con la regla congelada en el renglón; no hay tabla de comisiones.
- **Un anticipo retenido no se convierte en venta ni en factura** en esta entrega. Aparece en el corte y en los reportes como «Anticipo no reembolsable». *Nota fiscal para Fermín:* ese dinero se recibió y no se facturó; hay que ver con el contador si va en la factura global.
- **Clave SAT de los servicios:** el dueño la elige por servicio con el buscador existente. Si no la elige, la factura sigue saliendo como «servicios de restaurante» (90101500). *Para Fermín:* conviene definir con el contador la clave por defecto de belleza.
- **El sueldo** solo se suma cuando el rango del reporte es exactamente un periodo del negocio. En rangos libres se muestran solo las comisiones.
- **Los productos pueden ir sin colaborador**, y entonces no dan comisión.
