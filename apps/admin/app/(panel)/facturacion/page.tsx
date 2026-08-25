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
  listarPeriodosGlobales, periodoPorCerrar, timbrarFacturaGlobal,
  cancelarCfdi, MOTIVOS_CANCELACION,
  type PeriodoGlobal,
} from "../../lib/facturacion";
import { leerCfdiEmisor } from "../../lib/configuracion";
import { mensajeError } from "../../lib/errores";

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

  // ── Factura global ───────────────────────────────────────────────────────
  const [periodos, setPeriodos] = useState<PeriodoGlobal[]>([]);
  const [porCerrar, setPorCerrar] = useState<{ desde: string; hasta: string; nTickets: number; totalMxn: number } | null>(null);
  const [timbrandoGlobal, setTimbrandoGlobal] = useState(false);
  const [cancelando, setCancelando] = useState<TicketFacturable | null>(null);
  const [avisoGlobal, setAvisoGlobal] = useState<string | null>(null);

  const cargarGlobal = useCallback(async () => {
    try {
      const emisor = await leerCfdiEmisor();
      const [lista, pendiente] = await Promise.all([
        listarPeriodosGlobales(),
        periodoPorCerrar(emisor.periodicidad_global),
      ]);
      setPeriodos(lista);
      setPorCerrar(pendiente);
    } catch {
      // La global es una sección secundaria de esta pantalla: si no carga, no debe impedir
      // facturar un ticket, que es a lo que la gente entra aquí.
    }
  }, []);
  useEffect(() => { cargarGlobal(); }, [cargarGlobal]);

  async function emitirGlobal() {
    if (!porCerrar) return;
    const ok = confirm(
      `Vas a emitir la factura global del ${porCerrar.desde} al ${porCerrar.hasta}: ` +
        `${porCerrar.nTickets} ventas por ${fmtMxn(porCerrar.totalMxn)}.

` +
        "A partir de ese momento tus clientes YA NO podrán facturar esos tickets. ¿Continuar?",
    );
    if (!ok) return;
    setTimbrandoGlobal(true);
    setAvisoGlobal(null);
    try {
      const r = await timbrarFacturaGlobal(porCerrar.desde, porCerrar.hasta);
      setAvisoGlobal(
        !r.ok ? r.error
          : r.sinVentas ? "No había ventas sin facturar en ese periodo."
          : `Factura global timbrada: ${r.tickets} ventas por ${fmtMxn(r.total ?? 0)}.`,
      );
      cargarGlobal();
    } finally {
      setTimbrandoGlobal(false);
    }
  }

  const cargar = useCallback(async (d: string, h: string, f: string) => {
    setTickets(null); setError(null);
    try { setTickets(await listarTicketsFacturables(d, h, f || undefined)); }
    catch (e) { setError(mensajeError(e, "Error")); }
  }, []);
  useEffect(() => { cargar(desde, hasta, folio); }, [cargar, desde, hasta, folio]);

  return (
    <>
      <PageHeader titulo="Facturación" subtitulo="Emite el CFDI de un ticket pagado: captura los datos fiscales del cliente y timbra." migas={[{ label: "Facturación" }]} />
      <PageBody>
        {/* ── Factura global ────────────────────────────────────────────────
            Va arriba porque es una obligación con fecha límite —24 horas tras cerrar el periodo—
            mientras que facturar un ticket suelto es a demanda. */}
        <div className="mb-6 rounded-lg border border-line bg-surface p-5">
          <div className="mb-1 font-display text-[16px] font-semibold tracking-tight">Factura global</div>
          <p className="mb-4 text-[12.5px] text-ink-3">
            Ampara las ventas del periodo en las que nadie pidió factura. Debe emitirse dentro de las
            24 horas siguientes al cierre del periodo. <b>Al timbrarla, esos tickets dejan de poder
            facturarse por tus clientes.</b>
          </p>

          {porCerrar ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-bg px-4 py-3">
              <div>
                <div className="text-[13px] font-semibold">
                  Periodo del {porCerrar.desde} al {porCerrar.hasta}
                </div>
                <div className="text-[12px] text-ink-3">
                  {porCerrar.nTickets === 0
                    ? "Sin ventas pendientes de amparar"
                    : `${porCerrar.nTickets} ventas · ${fmtMxn(porCerrar.totalMxn)}`}
                </div>
              </div>
              <Button onClick={emitirGlobal} disabled={timbrandoGlobal || porCerrar.nTickets === 0}>
                {timbrandoGlobal ? "Timbrando… (puede tardar un minuto)" : "Emitir factura global"}
              </Button>
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-3">Configura tus datos fiscales para emitir la global.</p>
          )}

          {avisoGlobal && <p className="mt-3 text-[13px] font-medium">{avisoGlobal}</p>}

          {periodos.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-2 text-[12px] font-medium text-ink-2">Periodos anteriores</div>
              <div className="flex flex-col gap-1.5">
                {periodos.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="text-ink-2">{p.desde} → {p.hasta}</span>
                    <span className="flex items-center gap-3">
                      {p.estado === "TIMBRADA" && (
                        <span className="text-ink-3">{p.nTickets} ventas · {fmtMxn(p.totalMxn)}</span>
                      )}
                      <span className={[
                        "rounded px-2 py-0.5 text-[11.5px] font-medium",
                        p.estado === "TIMBRADA" ? "bg-[#EAF3EE] text-success"
                          : p.estado === "ERROR" ? "bg-[#FBECEA] text-danger"
                          : "bg-sel text-ink-2",
                      ].join(" ")}>
                        {p.estado === "TIMBRADA" ? "Timbrada"
                          : p.estado === "EN_PROCESO" ? "En proceso"
                          : p.estado === "ERROR" ? "Error" : "Abierto"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
          <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
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
                          ? (
                            <span className="flex items-center justify-end gap-3">
                              <span className="text-[12px] text-ink-3" title={t.cfdiUuid ?? ""}>UUID {t.cfdiUuid ? `${t.cfdiUuid.slice(0, 8)}…` : ""}</span>
                              <button
                                onClick={() => setCancelando(t)}
                                className="text-[12.5px] font-medium text-danger underline underline-offset-2"
                              >
                                Cancelar
                              </button>
                            </span>
                          )
                          : <Button size="md" onClick={() => setSel(t)}>Facturar</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {cancelando && (
          <PanelCancelar
            ticket={cancelando}
            onCerrar={(cambio) => { setCancelando(null); if (cambio) cargar(desde, hasta, folio); }}
          />
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
      setError(mensajeError(e, "Error al timbrar"));
    } finally {
      setProcesando(false);
    }
  }

  const input = "h-10 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink";
  const label = "mb-1 block text-[11.5px] font-bold uppercase tracking-wide text-ink-3";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="Facturar ticket">
      <div className="w-full max-w-xl rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2 sm:items-center">
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

/**
 * Cancelación de un CFDI ya timbrado.
 *
 * Deliberadamente incómodo de usar: exige elegir un motivo del catálogo del SAT y confirmar. No es
 * fricción gratuita — una cancelación es un acto fiscal, queda registrada ante el SAT y no se
 * deshace. Un botón directo sería más cómodo y más peligroso.
 */
function PanelCancelar({ ticket, onCerrar }: { ticket: TicketFacturable; onCerrar: (cambio: boolean) => void }) {
  const [motivo, setMotivo] = useState<string>("02");
  const [sustituto, setSustituto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const elegido = MOTIVOS_CANCELACION.find((m) => m.v === motivo);
  const faltaSustituto = motivo === "01" && sustituto.trim().length < 36;

  async function ejecutar() {
    setOcupado(true);
    setError(null);
    const r = await cancelarCfdi(ticket.cfdiId!, motivo, sustituto.trim() || undefined);
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    setAviso(r.mensaje);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-[440px] rounded-lg border border-line bg-surface p-5 shadow-lg">
        <div className="font-display text-[17px] font-semibold tracking-tight">Cancelar factura</div>
        <p className="mt-1 text-[12.5px] text-ink-3">
          Ticket {ticket.folio} · UUID {ticket.cfdiUuid?.slice(0, 8)}…
        </p>

        {aviso ? (
          <>
            <p className="mt-4 rounded border border-line bg-bg px-3 py-2.5 text-[13.5px] leading-relaxed">{aviso}</p>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => onCerrar(true)}>Entendido</Button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4">
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="motivo">Motivo</label>
              <select
                id="motivo"
                className="h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              >
                {MOTIVOS_CANCELACION.map((m) => <option key={m.v} value={m.v}>{m.v} · {m.l}</option>)}
              </select>
              {elegido && <p className="mt-1.5 text-[11.5px] text-ink-3">{elegido.ayuda}</p>}
            </div>

            {motivo === "01" && (
              <div className="mt-4">
                <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="sust">
                  Folio fiscal (UUID) del comprobante que lo sustituye
                </label>
                <input
                  id="sust"
                  className="h-11 w-full rounded border border-line-strong px-3 font-mono text-[13px] outline-none focus:border-ink"
                  value={sustituto}
                  onChange={(e) => setSustituto(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
                <p className="mt-1.5 text-[11.5px] text-ink-3">
                  Emite primero la factura correcta y pega aquí su folio fiscal.
                </p>
              </div>
            )}

            <p className="mt-4 rounded border border-[#F0DCC0] bg-[#FCF3E6] px-3 py-2 text-[12.5px] font-medium leading-relaxed text-warning">
              Si tu cliente ya usó esta factura, el SAT puede pedirle que acepte la cancelación. En
              ese caso queda <b>en proceso</b> hasta que responda.
            </p>

            {error && <p className="mt-3 text-[13px] font-medium text-danger" role="alert">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => onCerrar(false)}
                className="h-10 rounded border border-line-strong px-4 text-[13px] font-semibold transition hover:bg-hover"
              >
                Volver
              </button>
              <button
                onClick={ejecutar}
                disabled={ocupado || faltaSustituto}
                className="h-10 rounded bg-danger px-4 text-[13px] font-semibold text-white transition disabled:opacity-50"
              >
                {ocupado ? "Enviando…" : "Cancelar factura"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
