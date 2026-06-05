# F5.4 — Cierre de turno (arqueo + corte + Z) · Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Pasos con checkbox `- [ ]`.

**Goal:** Cerrar el turno desde el POS: arqueo (declarar efectivo contado), corte de caja (esperado vs declarado por método) y **Reporte Z** (cierra el turno, inmutable), con el Z imprimible reusando el motor de impresión de F5.3. Cierra la ruta crítica login→turno→venta→cobro→**cierre**.

**Architecture:** Las 3 RPCs ya existen en `0011` (`reporte_x` lectura, `arquear_caja` corte, `reporte_z` cierre). El front las cablea bajo RLS (como F5.0–F5.2). El cierre exige `autorizacion_pin_id` (D64): se reusa la primitiva de F5.2b — el CAJERO tiene `turno.cerrar_propio` → **autorización propia** (sin PIN de supervisor); si el rol no lo tuviera, PIN de supervisor (P-080). El Z se arma como un `PrintJob` (F5.3) y se auto-imprime como el ticket.

**Tech Stack:** Next 15 + React 19 + TS, Supabase JS (RLS), reusa `lib/autorizacion.ts` (F5.2b) y `lib/print/*` (F5.3), `vitest`.

**Spec/diseño:** este plan (compactado, con OK de Fermín). Mockups: P-101 arqueo, P-102 resultado-corte, P-103/104 cerrar+Z, P-106/P-226 reporte Z.

**Rama:** `f5.4-cierre-turno`. Merge `--no-ff` a `main` al cerrar.

**Decisiones (criterio profesional, ya tomadas):** esperado **visible** en la tabla (difiero el blind-count config); declarar efectivo (contado) + métodos con actividad (no-efectivo prellenado a su esperado, confirmable); el Z en pantalla se muestra como recibo 80mm imprimible (P-226 vía `ReciboPreview`), auto-impreso; reporte X como pantalla aparte, movimientos de caja, históricos admin → **diferido** (F7).

**Reglas:** dinero `numeric(12,2)` (sin float), `unknown`+cast tipado como el resto del POS, RLS frontera. Verificación: smoke SQL de las RPCs → golden del Z builder → E2E navegador → RLS PASS.

---

## Payload de `reporte_x` / `reporte_z` (referencia)

`reporte_x(turno_id)` → `{ turno_id, turno_estado, fondo_apertura_mxn, fecha_apertura, tickets:{total_tickets_pagados,total_tickets_cancelados,subtotal_neto_mxn,iva_neto_mxn,total_neto_mxn,descuentos_manuales_mxn,promociones_mxn,propina_total_mxn,ticket_promedio_mxn}, pagos_por_metodo:[{metodo_pago,monto_total_mxn,cantidad_pagos}], devoluciones:{cantidad,total_mxn}, movimientos_caja:[...], efectivo_esperado_mxn }`.

`reporte_z(...)` devuelve `{ estado:'GENERADO'|'YA_EXISTE', reporte_z_id, folio_z?, payload }` donde `payload` = el de X + `{ reporte_tipo:'Z', efectivo_declarado_mxn, diferencia_efectivo_mxn, fecha_cierre, propinas_distribuidas, nota }`.

---

## Task 1: Smoke SQL del cierre (verificar reporte_x + arquear_caja + reporte_z)

**Files:** Create `supabase/scripts/smoke_cierre.sql`

Las RPCs de 0011 nunca se han ejecutado (riesgo #19/#20). Usan `current_tenant_id()` y `auth.uid()` → en el smoke (rol postgres) hay que simular el claim JWT con `sub`+`tenant_id`. `reporte_z` exige `autorizacion_pin_id` NOT NULL (FK a `autorizaciones_pin`) → insertar uno directo en el smoke.

- [ ] **Step 1: Escribir el smoke** (estructura como `smoke_propina.sql`)

```sql
-- Smoke F5.4 cierre (rol postgres). Crea turno+ticket+pago efectivo, corre reporte_x,
-- arquea y cierra con Z. Verifica efectivo esperado, corte y turno CERRADO. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-000000000001'::uuid;
  v_turno  uuid; v_ticket uuid; v_prod uuid; v_auth uuid;
  v_x jsonb; v_corte jsonb; v_z jsonb;
  v_esperado numeric; v_estado text;
BEGIN
  v_maria := '99999999-0000-0000-0000-000000000001';
  -- Simular empleado autenticado (auth.uid + current_tenant_id leen el claim)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-Z', CURRENT_DATE, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-z-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-z-item');
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 200, NULL, NULL, NULL, false, NULL, 'smoke-z-pago');

  -- reporte_x
  v_x := reporte_x(v_turno);
  v_esperado := (v_x->>'efectivo_esperado_mxn')::numeric;
  RAISE NOTICE 'efectivo_esperado=% (fondo 500 + venta efectivo 120 = 620)', v_esperado;
  IF v_esperado <> 620 THEN RAISE EXCEPTION 'efectivo esperado inesperado: %', v_esperado; END IF;

  -- autorizacion_pin directa (cajero cierra su propio turno; permiso turno.cerrar_propio)
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'cerrar_turno', 'turno.cerrar_propio', 'turno', v_turno, NULL, 'Cierre de turno')
  RETURNING id INTO v_auth;

  -- arquear (efectivo declarado 620, exacto)
  v_corte := arquear_caja(v_turno, jsonb_build_array(jsonb_build_object('metodo_pago','EFECTIVO','monto_declarado_mxn',620)), 'CIERRE_TURNO', v_maria, v_auth);
  RAISE NOTICE 'corte diferencia_total=%', v_corte->>'diferencia_total_mxn';
  IF (v_corte->>'diferencia_total_mxn')::numeric <> 0 THEN RAISE EXCEPTION 'corte no cuadra: %', v_corte; END IF;

  -- cerrar con Z
  v_z := reporte_z(v_turno, 620, v_auth, v_maria, NULL);
  RAISE NOTICE 'z estado=% folio=%', v_z->>'estado', v_z->'payload'->>'folio_z';
  SELECT estado INTO v_estado FROM turnos WHERE id=v_turno;
  IF v_estado <> 'CERRADO' THEN RAISE EXCEPTION 'turno no quedo CERRADO: %', v_estado; END IF;
  RAISE NOTICE 'SMOKE CIERRE OK: esperado=% corte_ok turno=%', v_esperado, v_estado;
END $$;
ROLLBACK;
```

- [ ] **Step 2: Ejecutar** (bash, bytes UTF-8 — NO el pipe de PowerShell)

Run: `docker exec -i supabase_db_vim-pos psql -U postgres -d postgres < supabase/scripts/smoke_cierre.sql 2>&1 | grep -iE "NOTICE|ERROR|EXCEPTION"`
Expected: `SMOKE CIERRE OK: esperado=620.00 corte_ok turno=CERRADO`.

- [ ] **Step 3: Si truena por columnas (patrón #19/#20)** → crear `supabase/migrations/00NN_fix_cierre.sql` con `CREATE OR REPLACE FUNCTION` corrigiendo la columna real (mapear con `\d <tabla>`), `supabase db reset`, re-correr. Documentar en bitácora.

- [ ] **Step 4: Commit**

```bash
git add supabase/scripts/smoke_cierre.sql supabase/migrations/00NN_fix_cierre.sql 2>/dev/null
git commit -m "test(db): smoke del cierre de turno (reporte_x + arquear_caja + reporte_z)"
```

---

## Task 2: `lib/cierre.ts` — wrappers de las RPCs

**Files:** Create `apps/pos/app/lib/cierre.ts`

- [ ] **Step 1: Implementar**

```ts
"use client";
import { employeeClient } from "./supabase";

export type PagoMetodo = { metodo: string; total: number; cantidad: number };
export type ReporteXResumen = {
  efectivoEsperado: number;
  fondoApertura: number;
  fechaApertura: string | null;
  ticketsPagados: number;
  ticketsCancelados: number;
  ventaNeta: number;
  iva: number;
  descuentos: number;
  propinaTotal: number;
  devoluciones: number;
  pagosPorMetodo: PagoMetodo[];
};

const num = (v: unknown) => Number(v ?? 0);

export async function leerReporteX(token: string, turnoId: string): Promise<ReporteXResumen> {
  const { data, error } = await employeeClient(token).rpc("reporte_x", { p_turno_id: turnoId });
  if (error) throw new Error(error.message);
  const x = data as Record<string, unknown>;
  const tk = (x.tickets ?? {}) as Record<string, unknown>;
  const dev = (x.devoluciones ?? {}) as Record<string, unknown>;
  const pagos = (x.pagos_por_metodo ?? []) as Record<string, unknown>[];
  return {
    efectivoEsperado: num(x.efectivo_esperado_mxn),
    fondoApertura: num(x.fondo_apertura_mxn),
    fechaApertura: (x.fecha_apertura as string) ?? null,
    ticketsPagados: num(tk.total_tickets_pagados),
    ticketsCancelados: num(tk.total_tickets_cancelados),
    ventaNeta: num(tk.total_neto_mxn),
    iva: num(tk.iva_neto_mxn),
    descuentos: num(tk.descuentos_manuales_mxn),
    propinaTotal: num(tk.propina_total_mxn),
    devoluciones: num(dev.total_mxn),
    pagosPorMetodo: pagos.map((p) => ({ metodo: String(p.metodo_pago), total: num(p.monto_total_mxn), cantidad: num(p.cantidad_pagos) })),
  };
}

export type DeclaracionMetodo = { metodoPago: string; montoDeclarado: number; nota?: string };
export type CorteDetalle = { metodo: string; esperado: number; declarado: number; diferencia: number };
export type CorteResultado = { corteCajaId: string; totalEsperado: number; totalDeclarado: number; diferenciaTotal: number; detalle: CorteDetalle[] };

export async function arquearCaja(
  token: string,
  args: { turnoId: string; declaraciones: DeclaracionMetodo[]; usuarioId: string; autorizacionPinId?: string | null },
): Promise<CorteResultado> {
  const { data, error } = await employeeClient(token).rpc("arquear_caja", {
    p_turno_id: args.turnoId,
    p_declaraciones: args.declaraciones.map((d) => ({ metodo_pago: d.metodoPago, monto_declarado_mxn: d.montoDeclarado, nota: d.nota ?? null })),
    p_motivo_corte: "CIERRE_TURNO",
    p_usuario_id: args.usuarioId,
    p_autorizacion_pin_id: args.autorizacionPinId ?? null,
  });
  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  const det = (r.detalle ?? []) as Record<string, unknown>[];
  return {
    corteCajaId: String(r.corte_caja_id),
    totalEsperado: num(r.total_esperado_mxn),
    totalDeclarado: num(r.total_declarado_mxn),
    diferenciaTotal: num(r.diferencia_total_mxn),
    detalle: det.map((d) => ({ metodo: String(d.metodo_pago), esperado: num(d.esperado), declarado: num(d.declarado), diferencia: num(d.diferencia) })),
  };
}

export type CierreZ = { estado: string; reporteZId: string; folioZ: string | null; payload: Record<string, unknown> };

export async function cerrarTurnoZ(
  token: string,
  args: { turnoId: string; efectivoDeclarado: number; autorizacionPinId: string; usuarioId: string; nota?: string | null },
): Promise<CierreZ> {
  const { data, error } = await employeeClient(token).rpc("reporte_z", {
    p_turno_id: args.turnoId,
    p_efectivo_declarado_mxn: args.efectivoDeclarado,
    p_autorizacion_pin_id: args.autorizacionPinId,
    p_cerrado_por_usuario_id: args.usuarioId,
    p_nota: args.nota ?? null,
  });
  if (error) throw new Error(error.message);
  const z = data as Record<string, unknown>;
  const payload = (z.payload ?? {}) as Record<string, unknown>;
  return {
    estado: String(z.estado),
    reporteZId: String(z.reporte_z_id),
    folioZ: (payload.folio_z as string) ?? null,
    payload,
  };
}
```

- [ ] **Step 2: Typecheck** `pnpm --filter @vim/pos build` → `Compiled successfully`.
- [ ] **Step 3: Commit** `feat(pos): lib/cierre — wrappers reporte_x/arquear_caja/reporte_z`.

---

## Task 3: `reporte-z-builder.ts` — Z imprimible (PrintJob) + golden

**Files:** Create `apps/pos/app/lib/print/reporte-z-builder.ts`, `apps/pos/app/lib/print/__tests__/reporte-z-builder.test.ts`

- [ ] **Step 1: Test golden (falla primero)**

```ts
import { describe, it, expect } from "vitest";
import { construirReporteZJob, type DatosReporteZ } from "../reporte-z-builder";

const D: DatosReporteZ = {
  negocio: "Knock-Out Burger", sucursal: "León Centro",
  folioZ: "Z-2026-000001", fechaCierre: "2026-06-04T23:30:00.000Z",
  cajero: "María G.", caja: "Caja 01",
  ticketsPagados: 87, ventaNeta: 24010, iva: 3310, descuentos: 420, propinaTotal: 900,
  pagosPorMetodo: [{ metodo: "Efectivo", total: 11230, cantidad: 60 }, { metodo: "Tarjeta de débito", total: 12780, cantidad: 27 }],
  efectivoEsperado: 11230, efectivoDeclarado: 11230, diferenciaEfectivo: 0,
  ancho: 80,
};

describe("construirReporteZJob", () => {
  it("arma el PrintJob del corte Z", () => {
    const job = construirReporteZJob(D);
    expect(job.tipo).toBe("TICKET");
    expect(job.bloques[0]).toEqual({ t: "texto", valor: "Knock-Out Burger", align: "centro", size: 2, bold: true });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "CORTE Z", align: "centro", size: 2, bold: true });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Folio Z", der: "Z-2026-000001" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Venta neta", der: "$24,010.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Efectivo", der: "$11,230.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Efectivo esperado", der: "$11,230.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Diferencia", der: "$0.00" });
    expect(job.bloques[job.bloques.length - 1]).toEqual({ t: "corte" });
  });
});
```

- [ ] **Step 2: Run → fail.** `pnpm --filter @vim/pos exec vitest run app/lib/print/__tests__/reporte-z-builder.test.ts`

- [ ] **Step 3: Implementar** (reusa `pesos` de ticket-builder)

```ts
import type { Bloque, PrintJob } from "./tipos";
import { pesos } from "./ticket-builder";

export type DatosReporteZ = {
  negocio: string; sucursal: string;
  folioZ: string; fechaCierre: string; cajero: string; caja: string;
  ticketsPagados: number; ventaNeta: number; iva: number; descuentos: number; propinaTotal: number;
  pagosPorMetodo: { metodo: string; total: number; cantidad: number }[];
  efectivoEsperado: number; efectivoDeclarado: number; diferenciaEfectivo: number;
  ancho: 58 | 80;
};

export function construirReporteZJob(d: DatosReporteZ): PrintJob {
  const f = new Date(d.fechaCierre);
  const fecha = `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
  const b: Bloque[] = [];
  b.push({ t: "texto", valor: d.negocio, align: "centro", size: 2, bold: true });
  b.push({ t: "texto", valor: d.sucursal, align: "centro", size: 1 });
  b.push({ t: "separador", estilo: "punteado" });
  b.push({ t: "texto", valor: "CORTE Z", align: "centro", size: 2, bold: true });
  b.push({ t: "fila", izq: "Folio Z", der: d.folioZ });
  b.push({ t: "fila", izq: "Cierre", der: fecha });
  b.push({ t: "fila", izq: "Cajero", der: d.cajero });
  b.push({ t: "fila", izq: "Caja", der: d.caja });
  b.push({ t: "separador", estilo: "punteado" });
  b.push({ t: "fila", izq: "Tickets pagados", der: String(d.ticketsPagados) });
  b.push({ t: "fila", izq: "Venta neta", der: pesos(d.ventaNeta) });
  b.push({ t: "fila", izq: "IVA", der: pesos(d.iva) });
  if (d.descuentos > 0) b.push({ t: "fila", izq: "Descuentos", der: `-${pesos(d.descuentos)}` });
  b.push({ t: "fila", izq: "Propinas", der: pesos(d.propinaTotal) });
  b.push({ t: "separador", estilo: "punteado" });
  b.push({ t: "texto", valor: "Cobrado por método", align: "izq", size: 1 });
  for (const p of d.pagosPorMetodo) b.push({ t: "fila", izq: p.metodo, der: pesos(p.total) });
  b.push({ t: "separador", estilo: "punteado" });
  b.push({ t: "fila", izq: "Efectivo esperado", der: pesos(d.efectivoEsperado) });
  b.push({ t: "fila", izq: "Efectivo declarado", der: pesos(d.efectivoDeclarado) });
  b.push({ t: "fila", izq: "Diferencia", der: `${d.diferenciaEfectivo < 0 ? "-" : ""}${pesos(d.diferenciaEfectivo)}` });
  b.push({ t: "separador", estilo: "solido" });
  b.push({ t: "texto", valor: "Reporte Z · inmutable", align: "centro", size: 1 });
  b.push({ t: "corte" });
  return { tipo: "TICKET", ancho: d.ancho, destino: "CAJA", abrir_cajon: false, bloques: b };
}
```

> Nota: `Diferencia` formatea con `pesos()` (que ya incluye el signo del valor); para negativos `pesos(-50)`→`-$50.00`, así que el prefijo manual `-` solo se aplica si hiciera falta. Ajustar en verde: usar `pesos(d.diferenciaEfectivo)` directo si `pesos` ya maneja el signo (el test espera `$0.00` para 0).

- [ ] **Step 4: Run → pass.** Ajustar el formato de `Diferencia` hasta que el test pase (`$0.00`).
- [ ] **Step 5: Commit** `feat(pos): reporte-z-builder (Corte Z -> PrintJob) + golden`.

---

## Task 4: `pantalla-cierre.tsx` — arqueo → corte → Z (P-101/102/106)

**Files:** Create `apps/pos/app/components/pantalla-cierre.tsx`

Componente con pasos internos: `"arqueo" | "resultado" | "cerrando" | "z"`. Props: `{ token, empleado, caja, turno, onCancelar, onCerrado }`.

- [ ] **Step 1: Implementar** (fiel a P-101/P-102; reusar estilos del POS)

Comportamiento:
1. `useEffect` → `leerReporteX(token, turno.id)` → `resumen`. Construye filas de declaración: **Efectivo** (siempre) + un row por cada `pagosPorMetodo` no-efectivo. Estado `declarado: Record<metodo, string>`; no-efectivo prellenado a su `total` (esperado).
2. **Arqueo (P-101):** tabla método | esperado (visible) | declarado (input `numeric`) | diferencia (declarado−esperado: ok/faltante/sobrante). Panel derecho = resumen del turno (tickets, venta neta, descuentos, propina, fondo, **efectivo esperado**). Botón "Generar corte" (habilitado con efectivo declarado) → `arquearCaja(...)` con todas las declaraciones → paso "resultado".
3. **Resultado (P-102):** muestra `CorteResultado` (esperado/declarado/diferencia por método y total). Botón "Cerrar turno" → paso autorización.
4. **Cerrar (autorización, reusa F5.2b):** `tienePermiso = ['CAJERO','SUPERVISOR','ADMIN','DUENO'].includes(empleado.rol)` (todos tienen `turno.cerrar_propio` salvo PERSONAL). Si `tienePermiso` → `autorizacionPropia(token, payloadCierre)`; si no → montar `<ModalAutorizacionPin .../>` (permiso `turno.cerrar_propio`). Con la `Autorizacion` → `cerrarTurnoZ(token, { turnoId, efectivoDeclarado, autorizacionPinId, usuarioId: empleado.id })` → paso "z".
   - `payloadCierre = { accion:'cerrar_turno', permisoCodigo:'turno.cerrar_propio', entidadTipo:'turno', entidadId: turno.id, monto:null, motivo:'Cierre de turno', cajaId: turno.caja_id, turnoId: turno.id }`.
5. **Z (P-106/P-226):** con `cierre.payload` arma `DatosReporteZ` y `construirReporteZJob` → muestra el Z con `<ReciboPreview job={zJob} onImprimir={...} onCerrar={onCerrado} onNuevoTicket={onCerrado}/>` (auto-impreso). "Finalizar" (= onNuevoTicket) → `onCerrado()`.

Mapa de etiquetas de método: reusar `METODO_LABEL` (copiar de `ticket-datos.ts` o exportarlo) para mostrar "Efectivo", "Tarjeta de débito", etc.

Autorización imports: `import { autorizacionPropia, type Autorizacion } from "../lib/autorizacion"; import { ModalAutorizacionPin } from "./modal-autorizacion-pin";`.

- [ ] **Step 2: Typecheck** → `Compiled successfully`.
- [ ] **Step 3: Commit** `feat(pos): pantalla-cierre (arqueo P-101 + corte P-102 + Z)`.

---

## Task 5: Cablear "Cerrar turno" en el POS

**Files:** Modify `apps/pos/app/components/home-pos.tsx`, `apps/pos/app/components/pantalla-turno.tsx`

- [ ] **Step 1: home-pos** — añadir botón "Cerrar turno" en `TopbarOperativa` (junto a Bloquear/Cambiar cajero, un botón con ícono de corte) que llama `onCerrarTurno`. Añadir prop `onCerrarTurno` a `HomePos` y a `TopbarOperativa`. Estado `cerrando: boolean`; si `cerrando` → renderizar `<PantallaCierre token={token} empleado={empleado} caja={caja} turno={turno} onCancelar={()=>setCerrando(false)} onCerrado={onCerrarTurno}/>` en vez del home (return temprano). El botón "Cerrar turno" hace `setCerrando(true)`.

- [ ] **Step 2: pantalla-turno** — pasar `onCerrarTurno={() => setTurno(null)}` a `HomePos`. Al cerrar, `setTurno(null)` → re-renderiza `AbrirTurno` (turno cerrado → abrir nuevo). 

- [ ] **Step 3: Typecheck** → `Compiled successfully`.
- [ ] **Step 4: Commit** `feat(pos): entrada "Cerrar turno" en topbar + retorno a apertura`.

---

## Task 6: E2E navegador + cierre

- [ ] **Step 1: vitest** `pnpm --filter @vim/pos exec vitest run` → todo PASS (ticket-builder + escpos + reporte-z-builder).
- [ ] **Step 2: E2E** (Docker + `supabase start` + `supabase functions serve pin-login autorizar-pin --no-verify-jwt --env-file supabase/functions/.env` + dev 3000):
  1. Login María → home (turno abierto). Hacer una venta para que haya datos.
  2. Topbar "Cerrar turno" → arqueo: declarar efectivo = esperado → "Generar corte" → resultado (diferencia $0) → "Cerrar turno".
  3. Como María tiene `turno.cerrar_propio` → autorización propia (sin PIN) → Z generado.
  4. Verificar: Z en pantalla con folio, venta neta, efectivo esperado/declarado/diferencia. Verificar en BD: `select estado from turnos where id=...` = CERRADO; `select folio_z from reportes_z_historico ...`.
  5. "Finalizar" → vuelve a "Abrir turno".
- [ ] **Step 3: RLS** `supabase test db` → PASS.
- [ ] **Step 4: Merge** `git checkout main && git merge --no-ff f5.4-cierre-turno && git push origin main && git branch -d f5.4-cierre-turno`. Actualizar MEMORY + Playbook (F5.4 ✅; ruta crítica login→venta→cobro→cierre cerrada).

---

## Self-review (cobertura)
- Arqueo (P-101) → Task 4. Corte (arquear_caja, P-102) → Tasks 2,4. Z (reporte_z, P-104/106) → Tasks 2,4. Z impreso (P-226, reusa F5.3) → Task 3,4. ✅
- Autorización del cierre (D64, reusa F5.2b; cajero→propia) → Task 4. ✅
- RPCs verificadas antes del front (smoke) → Task 1. ✅
- Retorno a apertura tras cerrar → Task 5. ✅
- Diferido (X screen, movimientos, históricos, blind-count) → sin tasks (correcto). ✅
