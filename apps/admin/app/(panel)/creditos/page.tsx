"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Cargando, Button, Modal } from "@vim/ui/styles";
import { etiquetaMetodoPago } from "@vim/db/metodos-pago";
import { PageBody, PageHeader } from "../../components/page-header";
import { useModulos } from "../../components/admin-shell";
import { listarDeudores, ventasCreditoCliente, type Deudor, type VentaCredito } from "../../lib/credito";
import { conCredito } from "../../lib/operacion";
import { mensajeError } from "../../lib/errores";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtDia = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)) : "—";

/** Quién le debe al negocio (0208): vencidos primero; al tocar un cliente, sus ventas y abonos. */
export default function CreditosPage() {
  const modulos = useModulos();
  const [deudores, setDeudores] = useState<Deudor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [de, setDe] = useState<Deudor | null>(null);
  const encendido = conCredito(modulos);

  useEffect(() => {
    if (!encendido) return;
    listarDeudores().then((d) => { setDeudores(d); setError(null); })
      .catch((e) => setError(mensajeError(e, "No se pudo cargar quién debe")));
  }, [encendido]);

  const total = deudores?.reduce((s, d) => s + Math.round(d.deuda * 100), 0) ?? 0;
  const vencidos = deudores?.filter((d) => d.vencido).length ?? 0;

  return (
    <>
      <PageHeader titulo="Créditos" subtitulo="Quién te debe, cuánto y desde cuándo." />
      <PageBody>
        {modulos === null ? (
          <Cargando />
        ) : !encendido ? (
          <div className="max-w-[640px] rounded-lg border border-line bg-surface p-5">
            <p className="text-14 font-semibold text-ink">La venta a crédito está apagada</p>
            <p className="mt-1 text-13 text-ink-2">
              Enciéndela en <Link href="/configuracion/credito" className="font-semibold text-ink underline">Configuración · Venta a crédito</Link>.
            </p>
          </div>
        ) : (
          <>
            {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
            {deudores === null ? (
              !error && <Cargando />
            ) : deudores.length === 0 ? (
              <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
                <p className="text-15 font-semibold text-ink-2">Nadie te debe</p>
                <p className="mt-1 text-13">Da crédito a un cliente desde Clientes → Editar.</p>
              </div>
            ) : (
              <>
                <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <div className="text-12 font-bold uppercase tracking-wide text-ink-3">Por cobrar</div>
                    <div className="mt-1 font-display text-2xl font-bold tabular-nums">{fmt(total / 100)}</div>
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <div className="text-12 font-bold uppercase tracking-wide text-ink-3">Con pagos vencidos</div>
                    <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${vencidos > 0 ? "text-danger" : ""}`}>{vencidos}</div>
                  </div>
                </div>
                <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
                  <table className="w-full text-14">
                    <thead>
                      <tr className="border-b border-line bg-sel text-left text-12 uppercase tracking-wide text-ink-3">
                        <th className="px-4 py-2.5 font-semibold">Cliente</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Debe</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Disponible</th>
                        <th className="px-4 py-2.5 font-semibold">Vencido</th>
                        <th className="px-4 py-2.5 font-semibold">Desde</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Saldo a favor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deudores.map((d) => (
                        <tr key={d.clienteId} className="border-b border-line last:border-b-0">
                          <td className="px-4 py-2.5">
                            <button type="button" onClick={() => setDe(d)} className="font-medium text-ink hover:underline">{d.nombre}</button>
                            {!d.activo && d.deuda > 0 && <span className="ml-2 rounded-full bg-hover px-2 py-0.5 text-11 font-bold text-ink-3">Crédito apagado</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium tabular-nums">{d.deuda > 0 ? fmt(d.deuda) : <span className="font-normal text-ink-3">—</span>}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{d.activo ? fmt(d.disponible) : "—"}</td>
                          <td className="px-4 py-2.5">
                            {d.vencido
                              ? <span className="rounded-full bg-danger-soft px-2 py-0.5 text-12 font-bold text-danger">Sí</span>
                              : <span className="text-ink-3">No</span>}
                          </td>
                          <td className="px-4 py-2.5 text-ink-2">{fmtDia(d.desde)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{d.saldoFavor > 0 ? fmt(d.saldoFavor) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </PageBody>
      {de && <DetalleCliente deudor={de} onCerrar={() => setDe(null)} />}
    </>
  );
}

function DetalleCliente({ deudor, onCerrar }: { deudor: Deudor; onCerrar: () => void }) {
  const [ventas, setVentas] = useState<VentaCredito[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    ventasCreditoCliente(deudor.clienteId)
      .then((v) => { if (vivo) setVentas(v); })
      .catch((e) => { if (vivo) setError(mensajeError(e, "No se pudieron leer sus ventas a crédito")); });
    return () => { vivo = false; };
  }, [deudor.clienteId]);

  const conSaldo = ventas?.filter((v) => v.saldo > 0) ?? [];
  const pagadas = ventas?.filter((v) => v.saldo <= 0) ?? [];

  return (
    <Modal open onClose={onCerrar} title={`Crédito de ${deudor.nombre}`}
      className="w-[620px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-13 text-ink-2">
        <span>Debe <b className="tabular-nums text-ink">{fmt(deudor.deuda)}</b></span>
        {deudor.activo && <span>Disponible <b className="tabular-nums text-ink">{fmt(deudor.disponible)}</b></span>}
        <span>Saldo a favor <b className="tabular-nums text-ink">{fmt(deudor.saldoFavor)}</b></span>
      </div>

      <div className="mt-4 max-h-[420px] overflow-y-auto">
        {error ? (
          <p className="text-13 font-medium text-danger" role="alert">{error}</p>
        ) : ventas === null ? (
          <Cargando en="linea" />
        ) : ventas.length === 0 ? (
          <p className="text-13 text-ink-3">No tiene ventas a crédito.</p>
        ) : (
          <>
            <Ventas titulo="Con saldo" ventas={conSaldo} />
            <Ventas titulo="Liquidadas o canceladas" ventas={pagadas} />
          </>
        )}
      </div>

      <div className="mt-5 flex justify-end border-t border-line pt-4">
        <Button variant="ghost" onClick={onCerrar}>Cerrar</Button>
      </div>
    </Modal>
  );
}

function Ventas({ titulo, ventas }: { titulo: string; ventas: VentaCredito[] }) {
  if (ventas.length === 0) return null;
  return (
    <>
      <h3 className="mb-2 mt-4 text-12 font-bold uppercase tracking-wide text-ink-3 first:mt-0">{titulo}</h3>
      <ul className="rounded border border-line">
        {ventas.map((v) => (
          <li key={v.ticketId} className="border-b border-line px-3 py-2 text-13 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink"><b className="font-mono">{v.folio}</b> · {fmtDia(v.fecha)} · {fmt(v.total)}</span>
              <span className={`flex-shrink-0 font-semibold tabular-nums ${v.saldo > 0 ? "text-ink" : "text-ink-3"}`}>
                {v.saldo > 0 ? `Debe ${fmt(v.saldo)}` : "Sin saldo"}
              </span>
            </div>
            {v.abonos.length > 0 && (
              <ul className="mt-1 flex flex-col gap-0.5 text-12 text-ink-3">
                {v.abonos.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span>{fmtDia(a.fecha)} · {a.tipo === "ABONO" ? `Abono${a.metodo ? ` en ${etiquetaMetodoPago(a.metodo).toLowerCase()}` : ""}` : "Ajuste por cancelación"}</span>
                    <span className="tabular-nums">−{fmt(a.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
