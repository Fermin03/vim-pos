"use client";
import { LogoVim } from "@vim/ui/styles";
import { esEscritorio } from "../lib/actualizacion";
import type { Cotizacion, Encabezado } from "../lib/cotizaciones";
import { fechaHora } from "../lib/print/cotizacion-builder";
import { fechaCorta } from "../lib/lealtad-reglas";
import { aGranel, fmtCantidad, precioConUnidad, tipoDesdeSat } from "../lib/unidades";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

/** La cotización en pantalla, con el mismo papel que el ticket (molde: `ReciboDevolucion`). */
export function ReciboCotizacion({ c, e }: { c: Cotizacion; e: Encabezado }) {
  return (
    <div className="relative mx-auto w-[302px] bg-white px-5 pb-[26px] pt-[22px] font-mono text-[#1A1A1A] shadow-[0_4px_24px_rgba(0,0,0,.25)]">
      <div className="text-center">
        <LogoVim className="mx-auto mb-2.5 h-[46px] w-[46px]" />
        <div className="font-sans text-[16px] font-bold tracking-[-0.01em]">{e.negocio}</div>
        {(e.direccion || e.telefono || e.rfc) && (
          <div className="mt-1 text-[10.5px] leading-[1.55] text-[#333]">
            {e.direccion && <>{e.direccion}<br /></>}
            {e.telefono && <>Tel. {e.telefono}<br /></>}
            {e.rfc && <>RFC {e.rfc}</>}
          </div>
        )}
      </div>

      <Hr />
      <div className="text-center text-[12.5px] font-bold tracking-[0.04em]">COTIZACIÓN</div>
      <Hr dashed />

      <div className="text-[10.5px] leading-[1.7]">
        <Row label="Folio:" value={c.folio} />
        <Row label="Fecha:" value={fechaHora(c.creadaIso)} />
        <Row label="Válida hasta:" value={fechaCorta(c.vigenteHasta)} />
        {c.cliente && <Row label="Cliente:" value={c.cliente.nombre} />}
      </div>

      <Hr dashed />

      <div className="text-[11px]">
        {c.items.map((i, idx) => {
          const tipo = tipoDesdeSat(i.unidadSat);
          return (
            <div key={idx} className="mb-[7px]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1"><span className="font-bold">{aGranel(tipo) ? fmtCantidad(i.cantidad, tipo) : `${i.cantidad}×`}</span> {i.nombre}</div>
                <span className="whitespace-nowrap font-bold">{fmt(i.total)}</span>
              </div>
              {aGranel(tipo) && <div className="pl-3 text-[10px] text-[#555]">{precioConUnidad(fmt(i.precioUnitario), tipo)}</div>}
            </div>
          );
        })}
      </div>

      <Hr />
      <div className="text-[10.5px] leading-[1.7]">
        <Row label="Subtotal" value={fmt(c.subtotal)} />
        <Row label="IVA" value={fmt(c.iva)} />
      </div>
      <div className="flex items-baseline justify-between pt-1">
        <span className="font-sans text-[15px] font-bold">TOTAL</span>
        <span className="font-sans text-[19px] font-bold tabular-nums">{fmt(c.total)}</span>
      </div>

      <Hr dashed />
      <div className="text-center text-[10px] leading-[1.5] text-[#555]">Precios sujetos a cambio después de la vigencia.</div>
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

/** La vista de la cotización: Imprimir, Mandar por WhatsApp y Cerrar (patrón de `OverlayReciboDevolucion`). */
export function OverlayReciboCotizacion({ c, e, whatsapp, onImprimir, onCerrar }: {
  c: Cotizacion;
  e: Encabezado;
  /** wa.me ya armado. El escritorio abre los `https:` con `target=_blank` en el navegador del sistema. */
  whatsapp: string;
  onImprimir: () => void;
  onCerrar: () => void;
}) {
  const boton = "flex h-11 items-center rounded-lg px-4 text-14 font-semibold transition-[transform,background-color] duration-150 ease-vim active:scale-[.97]";
  return (
    <div data-overlay-imprimible className="fixed inset-0 z-[60] flex flex-col bg-ink/70" role="dialog" aria-modal="true" aria-label={`Cotización ${c.folio}`}>
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <div>
          <span className="text-15 font-semibold text-white">Cotización {c.folio}</span>
          {/* El enlace abre la nube, y la caja instalada sube la cotización en su siguiente ciclo. */}
          {esEscritorio() && <p className="text-13 text-white/70">El enlace funciona en cuanto la caja se sincronice (unos minutos).</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onImprimir} className={`${boton} border border-white/40 text-white hover:bg-white/10`}>Imprimir</button>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${boton} border border-white/40 text-white hover:bg-white/10`}>Mandar por WhatsApp</a>
          <button type="button" onClick={onCerrar} className={`${boton} bg-white text-ink hover:bg-hover`}>Cerrar</button>
        </div>
      </div>
      <div data-imprimible className="min-h-0 flex-1 overflow-y-auto py-6">
        <ReciboCotizacion c={c} e={e} />
      </div>
    </div>
  );
}
