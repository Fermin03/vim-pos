"use client";
import type { DatosDevolucion } from "../lib/print/devolucion-builder";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

/** Render en pantalla del comprobante de devolución (P-228). Mismo estilo de papel térmico. */
export function ReciboDevolucion({ d }: { d: DatosDevolucion }) {
  const f = new Date(d.fechaIso);
  const fecha = `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
  const folioCorto = d.folioOriginal.replace(/^[^-]+-/, "").replace(/^0+/, "");

  return (
    <div className="relative mx-auto w-[302px] bg-white px-5 pb-[26px] pt-[22px] font-mono text-[#1A1A1A] shadow-[0_4px_24px_rgba(0,0,0,.25)]">
      <div className="text-center">
        <div className="mx-auto mb-2.5 flex h-[46px] w-[46px] items-center justify-center rounded-[10px] bg-[#1A1A1A]">
          <span className="font-display text-[24px] font-bold tracking-[-0.04em] text-white">V</span>
        </div>
        <div className="font-sans text-[16px] font-bold tracking-[-0.01em]">{d.negocio.nombre}</div>
        {(d.sucursal.direccion || d.sucursal.telefono || d.negocio.rfc) && (
          <div className="mt-1 text-[10.5px] leading-[1.55] text-[#333]">
            {d.sucursal.direccion && <>{d.sucursal.direccion}<br /></>}
            {d.sucursal.telefono && <>Tel. {d.sucursal.telefono}<br /></>}
            {d.negocio.rfc && <>RFC {d.negocio.rfc}</>}
          </div>
        )}
      </div>

      <Hr />
      <div className="text-center text-[12.5px] font-bold tracking-[0.04em]">COMPROBANTE DE DEVOLUCIÓN</div>
      <Hr dashed />

      <div className="text-[10.5px] leading-[1.7]">
        <Row label="Fecha:" value={fecha} />
        <Row label="Ticket orig.:" value={`#${folioCorto}`} />
        <Row label="Cajero:" value={d.cajero} />
        <Row label="Caja:" value={d.caja} />
        {d.autorizo && <Row label="Autorizó:" value={d.autorizo} />}
      </div>

      <Hr dashed />

      <div className="text-[11px]">
        {d.items.map((i, idx) => (
          <div key={idx} className="mb-[7px] flex items-start justify-between gap-2">
            <div className="flex-1"><span className="font-bold">{i.cantidad}×</span> {i.nombre}</div>
            <span className="whitespace-nowrap font-bold">{fmt(i.totalMxn)}</span>
          </div>
        ))}
      </div>

      <Hr />

      <div className="flex items-baseline justify-between pb-1.5">
        <span className="font-sans text-[15px] font-bold">REEMBOLSO</span>
        <span className="font-sans text-[19px] font-bold tabular-nums text-[#C0392B]">−{fmt(d.totalReembolso)}</span>
      </div>
      <div className="text-[10.5px] leading-[1.7]">
        <Row label="Medio:" value={d.medio} />
        <Row label="Motivo:" value={d.motivo} />
      </div>

      <Hr dashed />
      <div className="text-center text-[10px] leading-[1.5] text-[#555]">
        Conserve este comprobante.<br />La venta original permanece en el historial.
      </div>
      <div className="mt-3 text-center text-[9px] tracking-[0.2em] text-[#999]">— — — — — — — — — —</div>
    </div>
  );
}

function Hr({ dashed }: { dashed?: boolean }) {
  return <hr className={`my-3 border-0 border-t ${dashed ? "border-dashed border-[#B0B0B0]" : "border-[#888]"}`} />;
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#555]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

/** Overlay a pantalla completa con el comprobante + Imprimir/Cerrar (mismo patrón que ReciboPreview). */
export function OverlayReciboDevolucion({ d, onImprimir, onCerrar }: { d: DatosDevolucion; onImprimir: () => void; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink/70">
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[14px] font-semibold text-white">Comprobante de devolución</span>
        <div className="flex gap-2">
          <button type="button" onClick={onImprimir} className="rounded border border-white/40 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-white/10">Imprimir</button>
          <button type="button" onClick={onCerrar} className="rounded bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-hover">Cerrar</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-6">
        <ReciboDevolucion d={d} />
      </div>
    </div>
  );
}
