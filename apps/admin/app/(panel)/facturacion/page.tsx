"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../components/page-header";
import { RangoFechas } from "../../components/rango-fechas";
import { fmtMxn, rangoUltimosDias } from "../../lib/reportes";
import { REGIMENES_FISCALES } from "../../lib/configuracion";
import {
  facturarTicket, FORMAS_PAGO_SAT, listarTicketsFacturables, RECEPTOR_PUBLICO_GENERAL,
  receptorSchema, USOS_CFDI, type ReceptorInput, type ResultadoTimbrado, type TicketFacturable,
} from "../../lib/facturacion";

const ESTADO_CFDI_BADGE: Record<string, { label: string; cls: string }> = {
  TIMBRADO: { label: "Facturado", cls: "bg-[#EAF3EE] text-success" },
  BORRADOR: { label: "Borrador", cls: "bg-sel text-ink-2" },
  EN_PROCESO_TIMBRADO: { label: "En proceso", cls: "bg-sel text-ink-2" },
  ERROR_TIMBRADO: { label: "Error", cls: "bg-[#FBECEA] text-danger" },
  CANCELADO: { label: "Cancelado", cls: "bg-sel text-ink-3" },
};

/** Facturación — punto de entrada del flujo CFDI: ticket PAGADO → receptor → timbrar. */
export default function FacturacionPage() {
  const r0 = rangoUltimosDias(7);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [folio, setFolio] = useState("");
  const [tickets, setTickets] = useState<TicketFacturable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<TicketFacturable | null>(null);

  const cargar = useCallback(async (d: string, h: string, f: string) => {
    setTickets(null); setError(null);
    try { setTickets(await listarTicketsFacturables(d, h, f || undefined)); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta, folio); }, [cargar, desde, hasta, folio]);

  return (
    <>
      <PageHeader titulo="Facturación" subtitulo="Emite el CFDI de un ticket pagado: captura los datos fiscales del cliente y timbra." migas={[{ label: "Facturación" }]} />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} />
          <input
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
            placeholder="Buscar por folio…"
            className="h-10 w-56 rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
          />
        </div>

        {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
        {tickets === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {tickets !== null && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2.5">Folio</th><th className="px-4 py-2.5">Día</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5">CFDI</th><th className="px-4 py-2.5 text-right">Acción</th>
              </tr></thead>
              <tbody>
                {tickets.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-3">Sin tickets pagados en el rango.</td></tr>}
                {tickets.map((t) => {
                  const badge = t.cfdiEstado ? ESTADO_CFDI_BADGE[t.cfdiEstado] ?? { label: t.cfdiEstado, cls: "bg-sel text-ink-2" } : null;
                  return (
                    <tr key={t.ticketId} className="border-b border-line">
                      <td className="px-4 py-2.5 font-semibold">{t.folio ?? "—"}</td>
                      <td className="px-4 py-2.5 text-ink-2">{t.diaContable}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMxn(t.total)}</td>
                      <td className="px-4 py-2.5">
                        {badge
                          ? <span className={`rounded px-2 py-0.5 text-[11.5px] font-bold ${badge.cls}`} title={t.cfdiUuid ?? undefined}>{badge.label}</span>
                          : <span className="text-ink-3">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {t.cfdiEstado === "TIMBRADO"
                          ? <span className="text-[12px] text-ink-3" title={t.cfdiUuid ?? ""}>UUID {t.cfdiUuid ? `${t.cfdiUuid.slice(0, 8)}…` : ""}</span>
                          : <Button size="md" onClick={() => setSel(t)}>Facturar</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sel && (
          <PanelFacturar
            ticket={sel}
            onCerrar={(facturado) => { setSel(null); if (facturado) cargar(desde, hasta, folio); }}
          />
        )}
      </PageBody>
    </>
  );
}

// ─── Panel de captura del receptor + timbrado ────────────────────────────────

function PanelFacturar({ ticket, onCerrar }: { ticket: TicketFacturable; onCerrar: (facturado: boolean) => void }) {
  const [form, setForm] = useState<ReceptorInput>({
    rfc: "", razon_social: "", uso_cfdi: "G03", codigo_postal: "",
    regimen_fiscal: "601", email: "", forma_pago_sat: ticket.formaPagoSugerida,
  });
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoTimbrado | null>(null);

  const set = (k: keyof ReceptorInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function publicoGeneral() {
    setForm((f) => ({
      ...f,
      rfc: RECEPTOR_PUBLICO_GENERAL.rfc,
      razon_social: RECEPTOR_PUBLICO_GENERAL.razon_social,
      uso_cfdi: RECEPTOR_PUBLICO_GENERAL.uso_cfdi,
      regimen_fiscal: RECEPTOR_PUBLICO_GENERAL.regimen_fiscal,
    }));
  }

  async function timbrar() {
    setError(null);
    const parsed = receptorSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Datos incompletos"); return; }
    setProcesando(true);
    try {
      const res = await facturarTicket(ticket.ticketId, parsed.data);
      setResultado(res);
      if (!res.ok) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al timbrar");
    } finally {
      setProcesando(false);
    }
  }

  const input = "h-10 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink";
  const label = "mb-1 block text-[11.5px] font-bold uppercase tracking-wide text-ink-3";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="Facturar ticket">
      <div className="w-full max-w-xl rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Facturar {ticket.folio ?? "ticket"} · {fmtMxn(ticket.total)}</h2>
          <button type="button" onClick={() => onCerrar(resultado?.ok === true)} className="rounded px-2 py-1 text-[13px] font-semibold text-ink-3 hover:bg-hover hover:text-ink">Cerrar</button>
        </div>

        {resultado?.ok ? (
          <div className="rounded-lg border border-success/40 bg-[#EAF3EE] p-5 text-center">
            <div className="text-[15px] font-bold text-success">CFDI timbrado correctamente</div>
            <div className="mt-2 break-all font-mono text-[13px] text-ink-2">UUID: {resultado.uuidFiscal}</div>
            {resultado.serie && <div className="mt-1 text-[13px] text-ink-2">Serie {resultado.serie} · Folio {resultado.folioFiscal}</div>}
            <Button className="mt-4" onClick={() => onCerrar(true)}>Listo</Button>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <button type="button" onClick={publicoGeneral} className="rounded border border-line-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
                Usar “Público en general” (XAXX010101000)
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><span className={label}>RFC del cliente</span><input className={input} value={form.rfc} onChange={set("rfc")} maxLength={13} placeholder="XAXX010101000" /></div>
              <div><span className={label}>Razón social</span><input className={input} value={form.razon_social} onChange={set("razon_social")} maxLength={250} placeholder="Como aparece en su constancia" /></div>
              <div>
                <span className={label}>Uso CFDI</span>
                <select className={input} value={form.uso_cfdi} onChange={set("uso_cfdi")}>
                  {USOS_CFDI.map((u) => <option key={u.codigo} value={u.codigo}>{u.label}</option>)}
                </select>
              </div>
              <div>
                <span className={label}>Régimen fiscal del cliente</span>
                <select className={input} value={form.regimen_fiscal} onChange={set("regimen_fiscal")}>
                  {REGIMENES_FISCALES.map((r) => <option key={r.codigo} value={r.codigo}>{r.codigo} · {r.label}</option>)}
                  <option value="616">616 · Sin obligaciones fiscales</option>
                </select>
              </div>
              <div><span className={label}>Código postal fiscal</span><input className={input} value={form.codigo_postal} onChange={set("codigo_postal")} maxLength={5} placeholder="37000" /></div>
              <div>
                <span className={label}>Forma de pago</span>
                <select className={input} value={form.forma_pago_sat} onChange={set("forma_pago_sat")}>
                  {FORMAS_PAGO_SAT.map((f) => <option key={f.codigo} value={f.codigo}>{f.label}</option>)}
                </select>
              </div>
              <div className="md:col-span-2"><span className={label}>Correo para enviar la factura (opcional)</span><input className={input} value={form.email} onChange={set("email")} maxLength={255} placeholder="cliente@correo.com" /></div>
            </div>
            {error && <p className="mt-3 text-[13px] font-medium text-danger" role="alert">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onCerrar(false)} disabled={procesando}>Cancelar</Button>
              <Button onClick={timbrar} disabled={procesando}>{procesando ? "Timbrando…" : "Crear y timbrar CFDI"}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
