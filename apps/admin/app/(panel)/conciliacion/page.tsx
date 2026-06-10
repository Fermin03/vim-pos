"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../components/page-header";
import {
  listarLiquidaciones, crearLiquidacion, conciliarLiquidacion, leerItemsConciliados,
  APPS, LABEL_APP, type Liquidacion, type ItemConciliado, type Renglon, type AppExterna,
} from "../../lib/conciliacion";

const mxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const input = "h-10 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink";

/** Parsea líneas "folio,monto,neto[,fecha]" del CSV pegado. */
function parsearRenglones(texto: string): Renglon[] {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [folio, monto, neto, fecha] = l.split(/[,;\t]/).map((c) => c.trim());
    const v = Number(monto), n = neto ? Number(neto) : Number(monto);
    if (!folio || Number.isNaN(v)) return null;
    return { folioExternoApp: folio, montoVentaMxn: v, montoComisionMxn: 0, montoPropinaMxn: 0, montoNetoMxn: n, fechaOrden: fecha || null };
  }).filter((r): r is Renglon => r !== null);
}

export default function ConciliacionPage() {
  const [list, setList] = useState<Liquidacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [sel, setSel] = useState<Liquidacion | null>(null);
  const [items, setItems] = useState<ItemConciliado[] | null>(null);

  async function recargar() {
    setError(null);
    try { setList(await listarLiquidaciones()); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }
  useEffect(() => { recargar(); }, []);

  async function abrirDetalle(l: Liquidacion) {
    setSel(l); setItems(null);
    try { setItems(await leerItemsConciliados(l.id)); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }

  return (
    <>
      <PageHeader titulo="Conciliación de apps" subtitulo="Cuadra los depósitos de Rappi/Uber/DiDi contra tus ventas del POS" migas={[{ label: "Delivery" }, { label: "Conciliación apps" }]} />
      <PageBody>
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setNueva(true)}>Nueva liquidación</Button>
        </div>
        {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}
        {!list ? (
          <p className="text-sm text-ink-3">Cargando…</p>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong py-16 text-center">
            <p className="text-[15px] font-semibold">Sin liquidaciones aún</p>
            <p className="mt-1 text-[13px] text-ink-3">Sube el reporte de Rappi/Uber/DiDi para cuadrarlo contra tus ventas del POS.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-sel text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-4 py-3 text-left">App</th><th className="px-4 py-3 text-left">Período</th>
                  <th className="px-4 py-3 text-right">Liquidado</th><th className="px-4 py-3 text-right">POS</th>
                  <th className="px-4 py-3 text-right">Diferencia</th><th className="px-4 py-3 text-center">Match</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {list.map((l) => (
                  <tr key={l.id} className="cursor-pointer border-t border-line hover:bg-hover" onClick={() => abrirDetalle(l)}>
                    <td className="px-4 py-3 font-semibold">{LABEL_APP[l.appExterna]}</td>
                    <td className="px-4 py-3 text-ink-2">{l.periodoInicio} – {l.periodoFin}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{mxn(l.totalLiquidadoMxn)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.totalPosMxn == null ? "—" : mxn(l.totalPosMxn)}</td>
                    <td className={["px-4 py-3 text-right tabular-nums font-semibold", (l.diferenciaMxn ?? 0) === 0 ? "text-ink-3" : "text-danger"].join(" ")}>
                      {l.diferenciaMxn == null ? "—" : mxn(l.diferenciaMxn)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{l.porcentajeMatch == null ? "—" : `${l.porcentajeMatch}%`}</td>
                    <td className="px-4 py-3"><EstadoChip estado={l.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>

      {nueva && <ModalNueva onCerrar={() => setNueva(false)} onCreada={() => { setNueva(false); recargar(); }} />}
      {sel && <ModalDetalle liq={sel} items={items} onCerrar={() => { setSel(null); setItems(null); }} />}
    </>
  );
}

function EstadoChip({ estado }: { estado: string }) {
  const ok = estado === "CONCILIADA";
  const pend = estado === "PENDIENTE" || estado === "EN_PROCESO";
  const cls = ok ? "bg-[#EAF3EE] text-success" : pend ? "bg-sel text-ink-3" : "bg-[#FBF1EF] text-danger";
  const txt = ok ? "Conciliada" : pend ? "Pendiente" : "Con diferencias";
  return <span className={["inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold", cls].join(" ")}>{txt}</span>;
}

function ModalNueva({ onCerrar, onCreada }: { onCerrar: () => void; onCreada: () => void }) {
  const [app, setApp] = useState<AppExterna>("APP_RAPPI");
  const [folio, setFolio] = useState("");
  const [ini, setIni] = useState("");
  const [fin, setFin] = useState("");
  const [liquidado, setLiquidado] = useState("");
  const [renglones, setRenglones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    const parsed = parsearRenglones(renglones);
    if (parsed.length === 0) { setError("Pega al menos un renglón válido (folio,monto,neto)."); return; }
    setGuardando(true);
    try {
      const id = await crearLiquidacion({ appExterna: app, folio, periodoInicio: ini, periodoFin: fin, totalLiquidadoMxn: Number(liquidado) || 0, renglones: parsed });
      await conciliarLiquidacion(id); // conciliar de inmediato
      onCreada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear"); setGuardando(false);
    }
  }

  return (
    <Modal open onClose={onCerrar} title="Nueva liquidación" className="w-[560px] rounded-lg border border-line bg-surface p-6 shadow-xl">
      <h2 className="mb-4 font-display text-xl font-semibold">Nueva liquidación</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12.5px] font-medium text-ink-2">App
          <select className={input} value={app} onChange={(e) => setApp(e.target.value as AppExterna)}>
            {APPS.map((a) => <option key={a} value={a}>{LABEL_APP[a]}</option>)}
          </select>
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Folio de la liquidación
          <input className={input} value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="LIQ-2026-05-22" />
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Período inicio
          <input type="date" className={input} value={ini} onChange={(e) => setIni(e.target.value)} />
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Período fin
          <input type="date" className={input} value={fin} onChange={(e) => setFin(e.target.value)} />
        </label>
        <label className="col-span-2 text-[12.5px] font-medium text-ink-2">Total depositado por la app
          <input className={input} inputMode="decimal" value={liquidado} onChange={(e) => setLiquidado(e.target.value)} placeholder="0.00" />
        </label>
        <label className="col-span-2 text-[12.5px] font-medium text-ink-2">Renglones del reporte (uno por línea: <code>folio,monto,neto,fecha</code>)
          <textarea className="mt-1 h-32 w-full rounded border border-line-strong p-2 font-mono text-[12px] outline-none focus:border-ink"
            value={renglones} onChange={(e) => setRenglones(e.target.value)}
            placeholder={"R-A4F92B,150.00,128.50,2026-05-22\nR-B81C03,200.00,171.00,2026-05-22"} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button onClick={guardar} disabled={guardando || !folio || !ini || !fin}>{guardando ? "Conciliando…" : "Crear y conciliar"}</Button>
      </div>
    </Modal>
  );
}

function ModalDetalle({ liq, items, onCerrar }: { liq: Liquidacion; items: ItemConciliado[] | null; onCerrar: () => void }) {
  const sinMatch = (items ?? []).filter((i) => !i.ticketIdMatch);
  return (
    <Modal open onClose={onCerrar} title="Detalle de conciliación" className="w-[620px] rounded-lg border border-line bg-surface p-6 shadow-xl">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">{LABEL_APP[liq.appExterna]} · {liq.periodoInicio}–{liq.periodoFin}</h2>
          <p className="text-[13px] text-ink-3">{liq.porcentajeMatch ?? 0}% conciliado · diferencia {liq.diferenciaMxn == null ? "—" : mxn(liq.diferenciaMxn)}</p>
        </div>
        <EstadoChip estado={liq.estado} />
      </div>
      {!items ? (
        <p className="py-6 text-center text-[13px] text-ink-3">Cargando…</p>
      ) : (
        <>
          {sinMatch.length > 0 && (
            <p className="mb-3 rounded border border-[#E8C5C0] bg-[#FBF1EF] px-3 py-2 text-[12.5px] font-medium text-danger">
              {sinMatch.length} registro(s) sin coincidencia en el POS — revisa o reclama a la plataforma.
            </p>
          )}
          <div className="max-h-[340px] overflow-y-auto rounded border border-line">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-sel text-[11px] font-bold uppercase text-ink-3">
                <tr><th className="px-3 py-2 text-left">Folio app</th><th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2 text-left">Ticket POS</th><th className="px-3 py-2 text-right">Dif.</th></tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-3 py-2 font-mono">{i.folioExternoApp}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{mxn(i.montoVentaMxn)}</td>
                    <td className="px-3 py-2">{i.ticketFolio ? <span className="text-ink-2">{i.ticketFolio} <span className="text-[10px] text-ink-3">({i.matchMetodo})</span></span> : <span className="font-semibold text-danger">Sin match</span>}</td>
                    <td className={["px-3 py-2 text-right tabular-nums", (i.diferenciaMxn ?? 0) === 0 ? "text-ink-3" : "text-danger"].join(" ")}>{i.diferenciaMxn == null ? "—" : mxn(i.diferenciaMxn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-5 flex justify-end"><Button variant="ghost" onClick={onCerrar}>Cerrar</Button></div>
    </Modal>
  );
}
