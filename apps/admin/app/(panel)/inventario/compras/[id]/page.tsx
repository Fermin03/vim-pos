"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader, TablaScroll } from "../../../../components/page-header";
import { anularCompra, obtenerCompra, type CompraDetalle } from "../../../../lib/compras";
import { mensajeError } from "../../../../lib/errores";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export default function CompraDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [compra, setCompra] = useState<CompraDetalle | null | undefined>(undefined);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    try { setCompra(await obtenerCompra(params.id)); }
    catch (e) { setError(mensajeError(e, "No se pudo cargar la compra")); setCompra(null); }
  }
  useEffect(() => { cargar(); }, [params.id]);

  async function confirmarAnulacion() {
    if (!compra) return;
    setError(null);
    if (!motivo.trim()) { setError("Escribe el motivo de la anulación."); return; }
    setOcupado(true);
    try { await anularCompra(compra.id, motivo.trim()); setAnulando(false); await cargar(); }
    catch (e) { setError(mensajeError(e, "No se pudo anular la compra")); }
    finally { setOcupado(false); }
  }

  return (
    <>
      <PageHeader
        titulo={compra ? `Compra ${compra.folio}` : "Compra"}
        subtitulo={compra ? `${compra.proveedorNombre} · ${compra.fecha} · ${compra.sucursalNombre}` : undefined}
        migas={[{ label: "Inventario", href: "/inventario" }, { label: "Compras", href: "/inventario/compras" }, { label: compra?.folio ?? "…" }]}
        right={<div className="flex gap-2"><Button variant="ghost" onClick={() => router.push("/inventario/compras")}>Volver</Button>{compra?.estado === "CONFIRMADA" && <Button variant="danger" onClick={() => { setError(null); setAnulando(true); }}>Anular compra</Button>}</div>}
      />
      <PageBody>
        {compra === undefined && <p className="text-sm text-ink-3">Cargando…</p>}
        {compra === null && <p className="text-sm text-danger">Compra no encontrada.</p>}
        {error && !anulando && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}
        {compra && (
          <div className="grid gap-5">
            {compra.estado === "ANULADA" && (
              <p className="rounded border border-danger/30 bg-[#FBECEA] p-3 text-sm text-danger">Anulada. Motivo: {compra.motivoAnulacion ?? "—"}. Las existencias se regresaron; el costo promedio no se modificó.</p>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
              <div><dt className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">Referencia</dt><dd>{compra.referencia ?? "—"}</dd></div>
              <div><dt className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">Origen</dt><dd>{compra.origen === "XML" ? "Factura XML" : "Captura manual"}</dd></div>
              <div className="col-span-2"><dt className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">UUID fiscal</dt><dd className="font-mono text-[12.5px]">{compra.cfdiUuid ?? "—"}</dd></div>
              {compra.notas && <div className="col-span-2 md:col-span-4"><dt className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">Notas</dt><dd>{compra.notas}</dd></div>}
            </dl>
            <TablaScroll min={860}>
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                    <th className="py-2 pr-3 font-semibold">Insumo</th>
                    <th className="py-2 pr-3 font-semibold">Descripción de origen</th>
                    <th className="py-2 pr-3 text-right font-semibold">Capturado</th>
                    <th className="py-2 pr-3 text-right font-semibold">En unidad del insumo</th>
                    <th className="py-2 pr-3 text-right font-semibold">Costo unitario</th>
                    <th className="py-2 text-right font-semibold">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {compra.lineas.map((l, i) => (
                    <tr key={i} className="h-10 border-b border-line-soft">
                      <td className="pr-3 font-medium">{l.insumoNombre}</td>
                      <td className="pr-3 text-ink-2">{l.descripcionOrigen ?? "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{l.cantidadCapturada} {l.unidadCapturada}</td>
                      <td className="pr-3 text-right tabular-nums">{l.cantidad} {l.unidadInsumo}</td>
                      <td className="pr-3 text-right tabular-nums">{fmt(l.costoUnitario)}</td>
                      <td className="text-right tabular-nums">{fmt(l.importe)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} className="py-1 pr-3 text-right text-ink-2">Subtotal</td><td className="py-1 text-right tabular-nums">{fmt(compra.subtotal)}</td></tr>
                  <tr><td colSpan={5} className="py-1 pr-3 text-right text-ink-2">IVA</td><td className="py-1 text-right tabular-nums">{fmt(compra.iva)}</td></tr>
                  <tr className="border-t border-line font-semibold"><td colSpan={5} className="py-2 pr-3 text-right">Total</td><td className="py-2 text-right tabular-nums">{fmt(compra.total)}</td></tr>
                </tfoot>
              </table>
            </TablaScroll>
          </div>
        )}

        {anulando && compra && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
            <div role="dialog" aria-modal="true" aria-label="Anular compra" className="w-full max-w-md rounded-lg bg-surface p-5 shadow-xl">
              <h2 className="mb-2 font-display text-lg font-bold">Anular la compra {compra.folio}</h2>
              <p className="mb-4 text-sm text-ink-2">Se regresarán las existencias de {compra.lineas.length} insumo{compra.lineas.length === 1 ? "" : "s"} en {compra.sucursalNombre}. El costo promedio no se modifica.</p>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="motivo">Motivo</label>
              <textarea id="motivo" className="min-h-[70px] w-full rounded border border-line-strong p-2 text-sm" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              {error && <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAnulando(false)} disabled={ocupado}>Cancelar</Button>
                <Button variant="danger" onClick={confirmarAnulacion} disabled={ocupado}>{ocupado ? "Anulando…" : "Anular compra"}</Button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
