"use client";
import type { DatosReporteZ } from "../lib/print/reporte-z-builder";

/**
 * Render fiel del Reporte Z impreso P-226 desde los datos crudos del cierre.
 * El PrintJob (escpos.ts) se mantiene para el papel; este componente es solo la
 * representación en pantalla. Mismo origen de datos.
 *
 * Tipografía: cuerpo JetBrains Mono; "REPORTE Z", folio, secciones, "DIFERENCIA",
 * sello → Inter Tight (font-sans). Fiel al mockup.
 */
export function ReciboZ({ datos }: { datos: DatosReporteZ }) {
  const apertura = datos.fechaApertura ? fmtFecha(datos.fechaApertura) : null;
  const cierre = fmtFecha(datos.fechaCierre);
  const cierreCompleto = fmtFechaCompleta(datos.fechaCierre);

  const diff = datos.diferenciaEfectivo;
  const diffEstado: "ok" | "short" | "over" = diff === 0 ? "ok" : diff < 0 ? "short" : "over";
  const diffLabel = diffEstado === "ok" ? "CUADRADO" : diffEstado === "short" ? "FALTANTE" : "SOBRANTE";
  const diffColor = diffEstado === "ok" ? "text-[#2E7D52]" : diffEstado === "short" ? "text-[#C0392B]" : "text-[#9A6B12]";

  // Total ventas = suma por método
  const totalVentas = datos.pagosPorMetodo.reduce((s, p) => s + p.total, 0);

  return (
    <div className="relative mx-auto w-[302px] bg-white px-5 pb-[26px] pt-[22px] font-mono text-[#1A1A1A] text-[11.5px] leading-[1.5] shadow-[0_4px_24px_rgba(0,0,0,.25)]">
      <PaperEdge top />

      {/* Cabecera */}
      <div className="text-center">
        <div className="font-sans text-[15px] font-bold">{datos.negocio}</div>
        <div className="mt-2 border-y-2 border-[#1A1A1A] py-[9px]">
          <div className="font-sans text-[22px] font-extrabold tracking-[0.04em]">REPORTE Z</div>
          <div className="mt-0.5 text-[11px] font-bold tracking-[0.08em]">CIERRE DE TURNO</div>
        </div>
        <div className="mt-2 font-sans text-[13px] font-bold">Folio Z: {datos.folioZ}</div>
      </div>

      <DividerDashed />

      {/* Meta */}
      <div className="text-[10.5px] leading-[1.7]">
        <MetaRow label="Sucursal:" value={datos.sucursal} />
        <MetaRow label="Caja:" value={datos.caja} />
        <MetaRow label="Turno:" value={datos.codigoTurno} />
        <MetaRow label="Cajero:" value={datos.cajero} />
        {apertura && <MetaRow label="Apertura:" value={apertura} />}
        <MetaRow label="Cierre:" value={cierre} />
      </div>

      <DividerDashed />

      {/* Ventas por método */}
      <SecTitle>Ventas por método</SecTitle>
      {datos.pagosPorMetodo.map((p, i) => (
        <DataRow key={i} label={p.metodo} value={fmt(p.total)} />
      ))}
      <DataRow label="Total ventas" value={fmt(totalVentas)} subtotal />

      <DividerDashed />

      {/* Operación */}
      <SecTitle>Operación</SecTitle>
      <DataRow label="Tickets emitidos" value={String(datos.ticketsEmitidos)} />
      <DataRow
        label="Devoluciones"
        value={datos.devolucionesCantidad > 0 ? `${datos.devolucionesCantidad} · −${fmt(datos.devolucionesMonto)}` : "0"}
      />
      <DataRow label="Cancelaciones" value={String(datos.ticketsCancelados)} />
      {datos.descuentos > 0 && <DataRow label="Descuentos" value={`−${fmt(datos.descuentos)}`} />}

      {/* Propinas (si hay) */}
      {datos.propinaTotal > 0 && (
        <>
          <DividerDashed />
          <SecTitle>Propinas distribuidas</SecTitle>
          {datos.propinasDistribuidas.length > 0 ? (
            datos.propinasDistribuidas.map((p, i) => <DataRow key={i} label={p.nombre} value={fmt(p.monto)} />)
          ) : (
            <DataRow label={`${datos.cajero} (cajero)`} value={fmt(datos.propinaTotal)} />
          )}
          <DataRow label="Total propinas" value={fmt(datos.propinaTotal)} subtotal />
        </>
      )}

      <hr className="my-3.5 border-0 border-t border-[#888]" />

      {/* Arqueo de efectivo */}
      <SecTitle>Arqueo de efectivo</SecTitle>
      <div className="mt-1.5 border-[1.5px] border-[#1A1A1A] px-[13px] py-3">
        <ReconcileRow label="Efectivo esperado" value={fmt(datos.efectivoEsperado)} />
        <ReconcileRow label="Efectivo declarado" value={fmt(datos.efectivoDeclarado)} />
        <div className="mt-1.5 flex items-baseline justify-between border-t-[1.5px] border-[#1A1A1A] pt-2 pb-0.5">
          <span className={["font-sans text-[13px] font-extrabold", diffColor].join(" ")}>DIFERENCIA</span>
          <span className={["font-sans text-[17px] font-extrabold tabular-nums", diffColor].join(" ")}>
            {diff === 0 ? fmt(0) : diff < 0 ? `−${fmt(Math.abs(diff))}` : `+${fmt(diff)}`}
          </span>
        </div>
        <div className={["mt-1.5 text-center text-[10px] font-bold tracking-[0.05em]", diffColor].join(" ")}>{diffLabel}</div>
      </div>

      {/* Sello */}
      <div className="mt-4 border border-dashed border-[#888] p-2.5 text-center">
        <div className="font-sans text-[11px] font-extrabold tracking-[0.08em]">✶ TURNO CERRADO ✶</div>
        <div className="mt-1 break-all text-[9.5px] text-[#555]">SHA: {datos.sello}</div>
        <div className="mt-1 text-[10px] text-[#444]">Sellado {cierreCompleto}</div>
      </div>

      {/* Pie */}
      <div className="mt-3 text-center text-[10px] leading-[1.5] text-[#666]">
        Documento de cierre definitivo.<br />
        El turno no admite más operaciones.
      </div>

      <div className="mt-3 text-center text-[9px] tracking-[0.2em] text-[#999]">— — — — — — — — — —</div>

      <PaperEdge />
    </div>
  );
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 font-sans text-[11px] font-bold uppercase tracking-[0.04em]">{children}</div>;
}

function DataRow({ label, value, subtotal }: { label: string; value: string; subtotal?: boolean }) {
  return (
    <div
      className={[
        "flex justify-between text-[11px]",
        subtotal ? "mt-1 border-t border-[#CCC] pt-[5px] font-bold" : "py-[2.5px]",
      ].join(" ")}
    >
      <span className={subtotal ? "" : "text-[#444]"}>{label}</span>
      <span className="whitespace-nowrap font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ReconcileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-[3px] text-[11px]">
      <span className="text-[#444]">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#555]">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function DividerDashed() {
  return <hr className="my-3 border-0 border-t border-dashed border-[#B0B0B0]" />;
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

function fmtFecha(iso: string): string {
  const f = new Date(iso);
  return `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
}

function fmtFechaCompleta(iso: string): string {
  const f = new Date(iso);
  return `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}:${String(f.getSeconds()).padStart(2, "0")}`;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}
