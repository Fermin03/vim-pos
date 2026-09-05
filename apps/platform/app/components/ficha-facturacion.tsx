"use client";
import { useState } from "react";
import type { Detalle } from "../lib/tipos";
import { fmtMxn, input, label } from "../lib/formato";

type Accion = (b: Record<string, unknown>) => Promise<void>;

/** Facturación: datos fiscales a la izquierda; folios (paquete y ajuste) a la derecha. */
export function FichaFacturacion({ d, accion, busy }: { d: Detalle; accion: Accion; busy: boolean }) {
  const t = d.tenant;
  const [paqueteSel, setPaqueteSel] = useState("");
  const [folioAdj, setFolioAdj] = useState("");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-line p-3 text-[12.5px]">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">Fiscal</div>
        <div>RFC: <b>{String(t.rfc ?? "—")}</b></div>
        <div>Razón social: {String(t.razon_social ?? "—")}</div>
        <div>Régimen: {String(t.regimen_fiscal ?? "—")} · CP {String(t.codigo_postal_fiscal ?? "—")}</div>
        <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink-3">Folios</div>
        <div>
          Saldo de paquetes: <b>{d.foliosSaldo}</b>
          {d.foliosBase && (
            <> · base del mes: <b>{Math.max(d.foliosBase.mensuales - d.foliosBase.consumidos, 0)}</b> de {d.foliosBase.mensuales} ({d.foliosBase.periodo})</>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Acreditar un paquete de folios. La cantidad y el precio salen del catálogo, no de
            este formulario: aquí solo se elige cuál se le vendió. */}
        <div>
          <label className={label} htmlFor="paq">Acreditar paquete de folios</label>
          <div className="flex gap-2">
            <select id="paq" className={input} value={paqueteSel} onChange={(e) => setPaqueteSel(e.target.value)}>
              <option value="">Elige un paquete…</option>
              {d.paquetes.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {fmtMxn(Number(p.precio_mxn))}</option>)}
            </select>
            <button
              onClick={() => { if (paqueteSel) { void accion({ accion: "acreditar_paquete", paquete_id: paqueteSel }); setPaqueteSel(""); } }}
              disabled={busy || !paqueteSel}
              className="btn h-11 shrink-0 rounded bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Acreditar
            </button>
          </div>
          <p className="mt-1 text-[11.5px] text-ink-3">Queda como COMPRA_PAQUETE con su precio, auditado.</p>
        </div>

        {/* Ajuste manual: para correcciones y cortesías, no para vender. */}
        <div>
          <label className={label} htmlFor="adj">Ajuste manual de folios</label>
          <div className="flex gap-2">
            <input id="adj" className={input} inputMode="numeric" placeholder="+50 ó -10" value={folioAdj} onChange={(e) => setFolioAdj(e.target.value.replace(/[^0-9-]/g, ""))} />
            <button
              onClick={() => { const n = Number(folioAdj); if (n) { void accion({ accion: "ajustar_folios", cantidad: n, motivo: "Ajuste desde plataforma" }); setFolioAdj(""); } }}
              disabled={busy || !folioAdj}
              className="btn h-11 shrink-0 rounded bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
          <p className="mt-1 text-[11.5px] text-ink-3">Positivo = regalar folios · negativo = descontar. Queda como AJUSTE_MANUAL auditado.</p>
        </div>
      </div>
    </div>
  );
}
