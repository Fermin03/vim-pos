"use client";
import type { DatosComanda } from "../lib/print/comanda-builder";

/**
 * Render fiel de la comanda de cocina P-223 desde los datos crudos.
 * TODO grande para legibilidad en cocina.
 * Mods: "Queso extra" (add) → "+ Queso extra" en negrita; "SIN CEBOLLA" (remove) →
 * caja con borde grueso; nota → cursiva con "» " (sin caja).
 */
export function ReciboComanda({ datos }: { datos: DatosComanda }) {
  const f = new Date(datos.fechaIso);
  const hora = `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
  // Cocina solo necesita los últimos 4 dígitos para identificar el pedido (más rápido de leer).
  const folioCorto = datos.folio.slice(-4);

  return (
    <div className="relative mx-auto w-[302px] bg-white pt-5 pb-6 font-mono text-[#1A1A1A] shadow-[0_4px_24px_rgba(0,0,0,.25)]">
      <PaperEdge top />

      {/* Modo invertido (negro pleno) — el grito visual de la comanda */}
      <div className="mx-[18px] bg-[#1A1A1A] py-2.5 text-center font-sans text-[22px] font-extrabold tracking-[0.02em] text-white">
        {datos.modoServicio.toUpperCase()}
      </div>

      {/* Orden + Hora */}
      <div className="mt-3 flex items-end justify-between px-[18px]">
        <div className="font-sans text-[15px] font-bold leading-none">
          Orden
          <span className="mt-0.5 block font-sans text-[34px] font-extrabold leading-[0.9]">#{folioCorto}</span>
        </div>
        <div className="text-right text-[12px] leading-[1.5]">
          {hora}
          <span className="block font-sans text-[17px] font-bold">comanda</span>
        </div>
      </div>

      <hr className="mx-[18px] my-3.5 border-0 border-t-2 border-dashed border-[#999]" />

      {/* Items grandes */}
      <div className="px-[18px]">
        {datos.lineas.map((l, i) => (
          <div key={i} className={["py-2.5", i < datos.lineas.length - 1 ? "border-b border-dashed border-[#CCC]" : ""].join(" ")}>
            <div className="flex items-baseline gap-2.5">
              <span className="min-w-[42px] font-sans text-[26px] font-extrabold leading-none">{l.cantidad}×</span>
              <span className="font-sans text-[20px] font-bold leading-[1.15]">{l.nombre}</span>
            </div>
            {(l.modificadores.length > 0 || l.notaCocina) && (
              <div className="mt-[7px] flex flex-col gap-1 pl-[52px]">
                {l.modificadores.map((m, j) => (
                  <ModRender key={j} texto={m} />
                ))}
                {l.notaCocina && l.notaCocina.trim().length > 0 && (
                  <span className="font-sans text-[14px] font-semibold italic text-[#444]">
                    <span className="not-italic">» </span>{l.notaCocina.trim()}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <hr className="mx-[18px] my-3.5 border-0 border-t-2 border-dashed border-[#999]" />

      {/* Pie */}
      <div className="px-[18px] text-center text-[11px] text-[#777]">
        Cajero: {datos.cajero} · {datos.caja}
      </div>
      <div className="mt-3 px-[18px] text-center text-[9px] tracking-[0.2em] text-[#999]">— — — — — — — — — —</div>

      <PaperEdge />
    </div>
  );
}

/** Render por tipo de modificador (heurística simple por convención de mockup):
 * - "Sin X" / "SIN X" / "Sin ", "no ", "quitar " → REMOVE (caja con borde)
 * - cualquier otro → ADD ("+ X")
 */
function ModRender({ texto }: { texto: string }) {
  const t = texto.trim();
  const esRemove = /^(sin |no |quitar )/i.test(t);
  if (esRemove) {
    return (
      <span className="inline-block w-fit border-[1.5px] border-[#1A1A1A] bg-[#F5E6E2] px-2 py-0.5 font-sans text-[14px] font-extrabold uppercase">
        {t}
      </span>
    );
  }
  return (
    <span className="font-sans text-[14px] font-semibold">
      <span className="font-extrabold">+ </span>{t}
    </span>
  );
}

function PaperEdge({ top }: { top?: boolean }) {
  return (
    <div
      aria-hidden
      className="absolute left-0 right-0 h-2"
      style={{
        top: top ? "-8px" : undefined,
        bottom: !top ? "-8px" : undefined,
        transform: top ? undefined : "rotate(180deg)",
        backgroundImage:
          "linear-gradient(45deg, transparent 33.3%, #fff 33.3%, #fff 66.6%, transparent 66.6%), linear-gradient(-45deg, transparent 33.3%, #fff 33.3%, #fff 66.6%, transparent 66.6%)",
        backgroundSize: "12px 16px",
        backgroundRepeat: "repeat-x",
      }}
    />
  );
}
