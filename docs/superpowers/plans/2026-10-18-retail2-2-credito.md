# Retail 2 · Entrega 2 (crédito) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una tienda venda a crédito a clientes autorizados, reciba abonos, vea quién debe y qué está vencido, sin que el corte cuente lo fiado, y que lo abonado de una venta cancelada vuelva en efectivo o como saldo a favor, según elija el dueño.

**Architecture:**
- **Cómo se registra.** Una venta a crédito es un **pago con método `CREDITO`**: el ticket queda PAGADO, con sus existencias y su folio. Solo entra por la RPC `pagar_a_credito`, que revisa el cliente, el límite y lo vencido, y pide PIN si hace falta.
- **Tablas propias:**
  - `clientes_credito`: límite y plazo del cliente. Va aparte de `clientes` para que el sync de la caja no lo pise.
  - `abonos_credito`: abonos y ajustes. Cada abono cuenta en el turno que lo recibe.
  - `saldo_favor_movimientos`: entradas y usos del saldo a favor.
- **El corte:**
  - suma los abonos en efectivo al efectivo esperado y los demás abonos a su método;
  - no pide declarar `CREDITO`.
- **El interruptor:** el dueño lo enciende en el admin (`configuracion_tenant.modulo_credito_activo`, con guardia de administrador como la lealtad). Llega a la caja por `modulos_efectivos`.

**Tech Stack:** PostgreSQL 15 (Supabase), smokes `.sql`, Next.js + Vitest (`apps/pos`, `apps/admin`), escritorio Node (`desktop/src`), `packages/db`.

**Spec:** `docs/superpowers/specs/2026-10-18-giros-retail-2-design.md`: §2 «Crédito», «Facturación del crédito», «Cancelar o devolver una venta a crédito con abonos», «Crédito y cotizaciones los enciende el dueño»; §3 (lealtad, permisos, límite sin internet, «el dueño elige»).

## Global Constraints

- **Todo en local.** Rama `feat/retail2-credito` encima de `feat/retail2-unidad` (HEAD f229779d). 0188–0206 no se editan. Las nuevas son 0207 (solo `ADD VALUE`) y 0208–0210, aplicadas al Docker local y registradas.
- **Valores nuevos de `metodo_pago`:** `CREDITO` y `SALDO_FAVOR`. Sus etiquetas en `packages/db/src/metodos-pago.ts` son «A crédito» y «Saldo a favor».
- **Permiso nuevo `venta.credito_excedido`** («Vender a crédito sobre el límite o con pagos vencidos»), nivel 3 y autorizable con PIN. Se siembra con el patrón de 0139:24-40, copiando `rol_permisos` de `venta.cancelar_pagada`.
- **Configuración del negocio:**
  - `configuracion_tenant.modulo_credito_activo boolean DEFAULT false`;
  - `configuracion_tenant.credito_abonos_al_cancelar text CHECK IN ('SALDO_FAVOR','EFECTIVO') DEFAULT 'SALDO_FAVOR'`.

  Solo un administrador del negocio las cambia (guardia como `configuracion_tenant_lealtad_guardia`, 0156:243-277). `modulos_efectivos` publica `credito`.
- **Reglas de dinero:**
  - el saldo deudor de una venta es su pago CREDITO menos sus abonos y ajustes;
  - el corte nunca cuenta el CREDITO como dinero recibido;
  - un abono en efectivo suma al efectivo esperado **del turno que lo recibe**;
  - no se puede abonar más de lo que se debe;
  - montos en `numeric(12,2)`, sin floats.
- **Venta a crédito:**
  - todo el ticket va a crédito, sin combinarse con otro pago;
  - requiere cliente asignado con crédito activo;
  - pide PIN de `venta.credito_excedido` si `saldo + monto > límite` o si el cliente tiene algo vencido (fecha de la venta + plazo < hoy y saldo > 0).
- **Lealtad:** una venta pagada con CREDITO no genera puntos.
- **Factura:** una venta con saldo de crédito > 0 no se factura (ni en el admin, ni en la autofactura, ni en la global). Al liquidarse, sí.
- **Cancelar o devolver** una venta con CREDITO:
  1. Primero se reduce la deuda pendiente.
  2. Lo que ya se abonó y se devuelve va **en efectivo** (sale del corte) o a **saldo a favor**, según `credito_abonos_al_cancelar`.
- **Saldo a favor:** se usa en la caja como forma de pago «Saldo a favor» del mismo cliente, hasta su saldo.
- **Los restaurantes no cambian.** El módulo viene apagado y nada de esto se ve sin él.
- Ponytail; español; sin `any`. Suites: smokes, pos/admin/platform test y typecheck, tipografía, prueba 0040, pruebas del escritorio (`cd desktop && npm test`; sus rojos de Windows conocidos no cuentan).

## Review Focus

1. **Corte con crédito y abonos:** vender $500 a crédito y abonar $200 en efectivo en otro turno. El primer corte no espera efectivo ni pide declarar crédito. El segundo espera $200 más. → Task 2 (smoke) y Task 6 (cierre).
2. **Caja sin internet:** el abono y la venta a crédito suben en el sync. Una venta vieja abonada (más de 60 días) no depende de que su ticket vuelva a subir. → Task 4.
3. **Cancelar una venta a crédito con abonos**, en sus dos modos (efectivo y saldo a favor). Vender $500, abonar $200 y cancelar: deuda 0. En modo efectivo se devuelven $200 del cajón; en modo saldo a favor el cliente queda con $200. → Task 3.
4. **Pagar con saldo a favor más de lo que hay** se rechaza. Usarlo baja el saldo y no cuenta como efectivo. → Task 3.
5. **Un abono no puede pasar de la deuda,** ni con dos abonos al mismo tiempo (bloqueo por cliente). → Task 2.

---

### Task 1: Métodos de pago nuevos (0207)

**Files:**
- Create: `supabase/migrations/0207_metodos_credito.sql`: solo `ALTER TYPE metodo_pago ADD VALUE IF NOT EXISTS 'CREDITO'` y `'SALDO_FAVOR'`, con un encabezado al estilo de la 0205.
- Modify: `packages/db/src/metodos-pago.ts:18`, para agregar las etiquetas; y `packages/db/src/database.types.ts`, a mano, con solo los dos valores.
- Smoke: `supabase/scripts/smoke_credito.sql` (nuevo) comprueba que los valores existen.

- [ ] Smoke que falla → 0207 → aplicar/registrar → smoke y typecheck de pos, admin y platform → commit `"BD: métodos de pago a crédito y saldo a favor (0207)"`.

### Task 2: Crédito en la base: clientes, venta, abonos y corte (0208)

**Files:**
- Create: `supabase/migrations/0208_credito.sql`:
  - **Configuración y módulo:** las dos columnas de `configuracion_tenant` con su guardia, y `modulos_efectivos` (cuerpo vigente de la 0189) publicando `credito` desde `modulo_credito_activo`.
  - **Tabla `clientes_credito`:** `tenant_id`, `cliente_id` (UNIQUE por negocio), `limite_mxn numeric(12,2) > 0`, `plazo_dias int > 0`, `activo bool`, auditoría.
    - RLS: lectura para el negocio; escritura solo si `es_admin_del_tenant()`.
  - **Tabla `abonos_credito`:** `id`, `tenant_id`, `sucursal_id`, `caja_id`, `turno_id` (el que recibe), `cliente_id`, `ticket_id`, `tipo` (`ABONO|AJUSTE_CANCELACION`), `metodo_pago` (NULL en un ajuste), `monto_mxn > 0`, `estado` (`APLICADO|CANCELADO`), `client_id_local` UNIQUE, `usuario_id` y `created_at`.
    - RLS por negocio; nadie la escribe directo, solo por RPC.
  - **`credito_saldo_ticket(p_ticket uuid) RETURNS numeric`:** pagos CREDITO aplicados menos abonos y ajustes aplicados.
  - **Vista `vw_creditos_cliente`:** por cliente: deuda, crédito disponible, venta más vieja con saldo y si hay algo vencido (`fecha_pago::date + plazo_dias < hoy` en la zona del negocio y saldo > 0).
  - **`pagar_a_credito(p_ticket_id, p_autorizacion_pin_id uuid DEFAULT NULL, p_client_id_local text DEFAULT NULL) RETURNS uuid`** (pago):
    - valida el módulo encendido, que el ticket esté ABIERTO, sin pagos previos, con cliente y crédito activo;
    - si excede o hay algo vencido, `consumir_autorizacion(p_autorizacion_pin_id, ARRAY['venta.credito_excedido'], ...)`;
    - termina en `aplicar_pago(..., 'CREDITO', total + propina, ...)`, y el ticket queda PAGADO.
    - Mensajes `DATOS_INVALIDOS: …` claros: «Este cliente no tiene crédito», «La venta pasa el límite de crédito: pide autorización», etc.
  - **Guardia:** disparador `BEFORE INSERT ON pagos` con `metodo_pago = 'CREDITO'`, que exige `current_setting('vim.pago_credito', true) = 'si'`. Ese valor lo pone `pagar_a_credito`, así que nadie mete un CREDITO por `aplicar_pago` directo. En modo réplica no corre, y la caja ya validó en local.
  - **`registrar_abono(p_cliente_id, p_monto, p_metodo metodo_pago, p_caja_id, p_turno_id, p_client_id_local) RETURNS jsonb`:**
    - bloquea al cliente (`clientes_credito ... FOR UPDATE`) y rechaza si el monto es mayor que la deuda;
    - reparte el abono de la venta más vieja a la más nueva, un renglón de `abonos_credito` por venta tocada;
    - es idempotente por `client_id_local` (con sufijo por renglón);
    - acepta EFECTIVO, TARJETA_DEBITO, TARJETA_CREDITO y TRANSFERENCIA;
    - devuelve `{abonado, deuda_restante, renglones}`.
  - **`calcular_efectivo_esperado`** (vigente en la 0042): suma los `abonos_credito` ABONO EFECTIVO APLICADO del turno.
  - **`reporte_x`** (vigente en la 0157): en `pagos_por_metodo` excluye `CREDITO` y suma los abonos del turno por método. Agrega `ventas_a_credito_mxn` (lo vendido a crédito en el turno) para mostrarlo sin declararlo.
  - **Permiso** `venta.credito_excedido`.
- Smoke `smoke_credito.sql`:
  - el cliente sin crédito se rechaza;
  - una venta de $500 dentro del límite queda PAGADO, sin PIN;
  - una venta que excede o con algo vencido se rechaza sin PIN y pasa con autorización;
  - `aplicar_pago` directo con CREDITO se rechaza;
  - abonar $200 en efectivo en otro turno: el efectivo esperado de ese turno sube $200 y el del primero no cambia;
  - abonar más de la deuda se rechaza;
  - un abono de $600 sobre dos ventas de $500 queda repartido 500 + 100 por antigüedad;
  - `reporte_x` no trae CREDITO entre los métodos a declarar y sí trae `ventas_a_credito_mxn`;
  - RLS: un cajero no escribe `clientes_credito` y otro negocio no lo lee.

- [ ] Smokes que fallan → 0208 → aplicar/registrar → suite completa de smokes y 0040 → commit `"BD: crédito por cliente, venta a crédito, abonos y corte (0208)"`.

### Task 3: Lealtad, factura, cancelación y saldo a favor (0209)

**Files:**
- Create: `supabase/migrations/0209_credito_reglas.sql`:
  - **`lealtad_acumular_por_ticket`** (vigente en la 0200): `RETURN 0` si el ticket tiene un pago CREDITO aplicado.
  - **`ticket_con_credito_pendiente(p_ticket) RETURNS boolean`** (`credito_saldo_ticket > 0`). Bloquea la factura en:
    - un disparador `BEFORE INSERT ON tickets_cfdi`, como `trg_cfdi_sin_premio` (0158:38-54), con el mensaje «Esta venta tiene saldo de crédito: se factura al liquidarse»;
    - `ticket_autofacturable` (0082:174);
    - `tickets_de_periodo_global` (vigente en la 0158).
  - **Tabla `saldo_favor_movimientos`:** `tenant_id`, `cliente_id`, `tipo` (`ENTRADA_CANCELACION|USO`), `monto_mxn > 0`, `ticket_id`, `turno_id`, `client_id_local` UNIQUE, `created_at`. Más la vista `vw_saldo_favor_cliente`.
  - **Cancelar o devolver una venta con CREDITO.** La 0196 crea la devolución con medio EFECTIVO y `trg_devolucion_pago_efectivo` (0033:13) mete un DEVOLUCION_EFECTIVO por todo lo devuelto. Al confirmarse la devolución de una venta con CREDITO:
    1. `por_deuda = LEAST(devuelto, saldo de crédito)` se registra como `abonos_credito` tipo AJUSTE_CANCELACION, sin método y sin dinero;
    2. `abonado_devuelto = devuelto − por_deuda`;
    3. si `credito_abonos_al_cancelar = 'EFECTIVO'`, solo esa parte sale como DEVOLUCION_EFECTIVO;
    4. si es `'SALDO_FAVOR'`, no sale efectivo y entra `saldo_favor_movimientos` ENTRADA_CANCELACION.

    Se implementa modificando `trg_devolucion_pago_efectivo`, cuerpo vigente de la 0033: para un ticket sin CREDITO queda idéntico.
  - **`pagar_con_saldo_favor(p_ticket_id, p_monto, p_client_id_local)`:**
    - exige cliente asignado y `p_monto <= saldo a favor` (bloqueo por cliente);
    - inserta el USO y llama `aplicar_pago(..., 'SALDO_FAVOR', ...)`;
    - el disparador de la Task 2 se amplía para que SALDO_FAVOR también solo entre por esta RPC.
    - SALDO_FAVOR no suma al efectivo esperado y en `reporte_x` sale como método informativo, sin declararse.
- Smoke `smoke_credito.sql`, más casos:
  - una venta a crédito no genera puntos;
  - con saldo no se puede facturar (CFDI, autofactura y global); liquidada, sí;
  - vender $500 a crédito, abonar $200 y cancelar con dinero:
    - en modo EFECTIVO, deuda 0, DEVOLUCION_EFECTIVO de $200 en el turno que cancela y sin saldo a favor;
    - en modo SALDO_FAVOR, deuda 0, sin movimiento de caja y saldo a favor de $200;
  - pagar $150 con saldo a favor deja $50; $300 se rechaza;
  - una venta sin CREDITO cancelada con dinero se comporta igual que antes (regresión).

- [ ] Smokes → 0209 → aplicar → suite y 0040 → commit `"BD: crédito sin puntos, factura al liquidar, cancelación y saldo a favor (0209)"`.

### Task 4: El crédito viaja con la caja instalada (0210 + escritorio)

**Files:**
- Create: `supabase/migrations/0210_credito_sync.sql`:
  - `sync_pull_snapshot` (vigente en la 0195:169-240) baja:
    - `clientes_credito` del negocio;
    - `abonos_credito` de ventas con saldo > 0 o de los últimos 90 días;
    - `saldo_favor_movimientos` de clientes con saldo;
    - la configuración nueva de `configuracion_tenant`, si no baja ya entera.
  - `sync_push_snapshot` (vigente en la 0195:251) acepta `abonos_credito` y `saldo_favor_movimientos` creados en la caja:
    - idempotente por `id`;
    - validando que `tenant_id`, `cliente_id`, `ticket_id` y `turno_id` sean del negocio;
    - **no** acepta `clientes_credito` desde la caja (lo maneja solo el admin).
- Modify: `desktop/src/sync-pull.mjs` (`PULL_ORDER` :12) y `desktop/src/sync-push.mjs`. Los abonos y los movimientos de saldo viajan **por turno**, como `movimientos_caja` (:713), no con su ticket. Así un abono a una venta de hace más de 60 días sube igual. Usa las libretas `_vim_*_ok` existentes.
- Tests: `desktop` (`sync-push.test.mjs` / `sync-pull.test.mjs`): un abono a un ticket viejo sube en el lote de su turno, y un push repetido no duplica. Smoke: aplicar dos veces un JSON de push con un abono no lo duplica, y uno de otro negocio se rechaza.

- [ ] Pruebas que fallan → 0210 y escritorio → `cd desktop && npm test` y smokes → commit `"Sync: abonos y saldo a favor viajan con la caja (0210)"`.

### Task 5: Admin: encender el crédito, darlo a clientes y ver quién debe

**Files:**
- Modify: la página de configuración donde vive la lealtad (o una nueva `(panel)/configuracion/credito/page.tsx`, siguiendo el patrón de `apps/admin/app/lib/lealtad.ts:180-185`) con:
  - el interruptor «Vender a crédito»;
  - la opción «Al cancelar una venta a crédito con abonos: Dejar como saldo a favor / Regresar en efectivo».
- Modify: el modal de cliente en `apps/admin/app/(panel)/clientes/page.tsx` (:313) y `lib/clientes.ts`. Con el módulo encendido y un administrador, aparece la sección **Crédito**: activo, límite ($) y plazo (días), con upsert a `clientes_credito`.
- Create: `apps/admin/app/(panel)/creditos/page.tsx`, más su entrada en el menú, visible solo con el módulo encendido:
  - lista de clientes con deuda (nombre, debe, disponible, vencido sí/no, desde cuándo), ordenada con los vencidos primero;
  - al tocar un cliente, sus ventas a crédito con su saldo y sus abonos;
  - el saldo a favor de cada cliente.
- Tests: esquemas y armado de datos (lib), con las convenciones del admin.

- [ ] Pruebas → implementar → `pnpm --filter @vim/admin test` y typecheck → navegador (controlador) → commit `"Admin: crédito por cliente y quién debe"`.

### Task 6: Caja: vender a crédito, abonar, saldo a favor y corte

**Files:**
- Modify: `apps/pos/app/components/modal-cobro.tsx` (`METODOS` :101, :240, :579):
  - **«A crédito»** aparece si `modulos.credito` está encendido y el ticket tiene cliente con crédito activo. Muestra «Disponible: $X». Al confirmar llama `pagar_a_credito`. Si la base pide autorización, abre el PIN (`autorizarConPin`, `lib/autorizacion.ts:31`) y reintenta.
  - **«Saldo a favor»** aparece si el cliente tiene saldo a favor y llama `pagar_con_saldo_favor`. Puede cubrir parte del ticket; el resto se cobra con otro método. Ese es el único cobro combinado que se permite con estos métodos.
- Modify: `apps/pos/app/lib/cobro.ts:7` (tipo `MetodoPago`) y lo necesario para las dos RPC.
- Create: `apps/pos/app/components/seccion-creditos.tsx`:
  - lista de clientes con deuda (buscar por nombre o teléfono): debe, vencido;
  - al tocar uno, sus ventas con saldo y **«Registrar abono»** (monto y método, efectivo/tarjeta/transferencia) → `registrar_abono`;
  - al terminar, aviso con el abono y lo que queda por pagar.
  - Entrada temporal en la sección Configuración de la tienda: `contenido-menu.tsx` (prop `onCreditos?` y un `TileMenu` en «Operación», con `modulos.credito` encendido) y `home-pos.tsx:3220`. La entrega 4 la mueve a «Más».
- Modify: `apps/pos/app/components/pantalla-cierre.tsx:126,135`: CREDITO y SALDO_FAVOR no se declaran. Se muestran como «Vendido a crédito $X» y «Pagado con saldo a favor $Y», solo informativo. Los abonos con tarjeta o transferencia se declaran en su método, como cualquier pago.
- Modify: el ticket impreso (`lib/print/ticket-datos.ts:257-273`): «Forma de pago: A crédito», y debajo «Por pagar: $X» con la fecha límite (fecha de la venta + plazo).
- Tests:
  - armado de métodos visibles: sin módulo no aparece «A crédito»; sin cliente con crédito tampoco; con saldo a favor aparece «Saldo a favor»;
  - el cierre no incluye CREDITO entre lo declarable;
  - el aviso del abono;
  - el renglón del ticket impreso con «Por pagar».

- [ ] Pruebas → implementar → `pnpm --filter @vim/pos test`, typecheck y tipografía → navegador (controlador): vender a crédito, pasar del límite con PIN, abonar en otro turno y ver el corte → commit `"Caja: venta a crédito, abonos, saldo a favor y corte"`.

### Task 7: Documentos y revisión final

- `docs/diseno/pos-retail.md`: «A crédito», «Saldo a favor», Créditos y el cierre.
- El spec de retail 2: «Entrega 2, hecha», con migraciones y orden de lanzamiento. La 0207 va en el instalador **antes** de que alguien venda a crédito, porque un valor de enum desconocido tumba el pull.
- `docs/especificacion/arquitectura/09-MATRIZ-ROLES-PERMISOS.md`: el permiso nuevo.
- Suites completas, revisión de toda la rama y commit.

## Rulings de este plan (Fermín puede corregirlos)

- Todo el ticket va a crédito; no se combina con efectivo. Lo único que se combina es «Saldo a favor» con otro método.
- No hay comprobante impreso del abono en esta versión; la caja muestra el aviso y el admin el historial. Se agrega si se pide.
- El crédito vive en su propia tabla (`clientes_credito`), no en `clientes`, para que el sync de la caja no lo pise.
- Un abono se reparte de la venta más vieja a la más nueva.
- «Vencido» es: fecha de la venta + plazo < hoy, con saldo.
