"use client";
import type { DatosReporteZ } from "../lib/print/reporte-z-builder";

/**
 * Reporte Z (corte de caja) — estilo "Soft Restaurant" (operativo, lo que
 * conoce el equipo de Knock-Out hoy).
 *
 * Estructura:
 *   1) Encabezado fiscal (razón social + nombre comercial + RFC + dirección)
 *   2) Identificación del corte (tipo + rango + turno + caja/estación)
 *   3) CAJA — flujo de efectivo (inicial, +ventas, +tarjeta, etc., -retiros, =saldo)
 *   4) FORMA DE PAGO VENTAS  (con TOTAL)
 *   5) FORMA DE PAGO PROPINA (con TOTAL)
 *   6) POR TIPO DE SERVICIO  (con %)
 *   7) Subtotales fiscales (SUBTOTAL/DESCUENTOS/VENTA NETA + IVA + IMPUESTOS TOTAL)
 *   8) VENTA RAPIDA POR TIPO (para llevar)
 *   9) Estadísticas (cuentas, promedio, comensales, folios)
 *  10) DECLARACION DE CAJERO (por método) + SOBRANTE/FALTANTE
 *  11) Firma GERENTE / CAJERO
 *  12) Sello inmutable VIM (SHA + folio Z + "TURNO CERRADO")
 *
 * Tipografía: cuerpo en JetBrains Mono (font-mono); encabezados de sección
 * y números importantes en Inter Tight (font-sans). Acordes al P-222/223/226.
 */
export function ReciboZ({ datos }: { datos: DatosReporteZ }) {
  const apertura = datos.fechaApertura ? fmtFechaCorta(datos.fechaApertura) : null;
  const cierreCorto = fmtFechaCorta(datos.fechaCierre);
  const cierreCompleto = fmtFechaCompleta(datos.fechaCierre);

  // Caja (flujo efectivo)
  const saldoFinal = round2(
    datos.efectivoInicial + datos.ventasEfectivo + datos.depositosEfectivo - datos.retirosEfectivo - datos.propinasPagadas,
  );
  const efectivoFinal = saldoFinal; // sin separación adicional en MVP

  // Total formas de pago ventas
  const totalFormasPago = round2(datos.pagosPorMetodo.reduce((s, p) => s + p.total, 0));
  const totalFormasPagoPropina = round2(datos.pagosPropinaPorMetodo.reduce((s, p) => s + p.total, 0));

  // Subtotales fiscales
  const subtotalSinIva = round2(datos.ventaNeta - datos.iva);
  const ventaConImp = datos.ventaNeta;

  // Estadísticas
  const cuentaPromedio = datos.ticketPromedio;

  // Arqueo
  const diff = datos.diferenciaTotal;
  const diffEstado: "ok" | "short" | "over" = diff === 0 ? "ok" : diff < 0 ? "short" : "over";
  const diffSigno = diff === 0 ? "" : diff > 0 ? "+" : "-";

  return (
    <div className="relative mx-auto w-[302px] bg-white px-5 pb-[26px] pt-[22px] font-mono text-[#1A1A1A] text-[10.5px] leading-[1.5] shadow-[0_4px_24px_rgba(0,0,0,.25)]">
      <PaperEdge top />

      {/* 1) Encabezado fiscal */}
      <div className="text-left">
        <div className="font-sans text-[12px] font-bold uppercase tracking-tight">{datos.negocio.toUpperCase()}</div>
        {datos.razonSocial && (
          <div className="font-sans text-[12px] font-bold uppercase tracking-tight">{datos.razonSocial.toUpperCase()}</div>
        )}
        {datos.rfc && <div className="mt-0.5">RFC: {datos.rfc}</div>}
        {datos.direccionSucursal && (
          <div className="mt-0.5 leading-[1.45] text-[10px]">{datos.direccionSucursal}</div>
        )}
      </div>

      {/* 2) Identificación */}
      <div className="mt-3 text-center text-[11px] font-bold">CORTE DE CAJA Z</div>
      <div className="mt-1 text-left">
        <div>DEL {fmtFechaHoraLarga(datos.fechaApertura ?? datos.fechaCierre)}</div>
        <div>AL {fmtFechaHoraLarga(datos.fechaCierre)}</div>
        <div className="mt-0.5">TURNO: {datos.codigoTurno} CAJA - ESTACION: {datos.estacionCaja}</div>
      </div>

      <DividerSolid />

      {/* 3) CAJA — flujo de efectivo */}
      <SectionTitle>CAJA</SectionTitle>
      <FlujoRow label="+EFECTIVO INICIAL:" value={fmt(datos.efectivoInicial)} />
      <FlujoRow label="+EFECTIVO:" value={fmt(datos.ventasEfectivo)} />
      <FlujoRow label="+TARJETA:" value={fmt(datos.ventasTarjeta)} />
      <FlujoRow label="+VALES:" value={fmt(datos.ventasVales)} />
      <FlujoRow label="+OTROS:" value={fmt(datos.ventasOtros)} />
      <FlujoRow label="+DEPÓSITOS EFECTIVO:" value={fmt(datos.depositosEfectivo)} />
      <FlujoRow label="-RETIROS EFECTIVO:" value={fmt(datos.retirosEfectivo)} />
      <FlujoRow label="-PROPINAS PAGADAS:" value={fmt(datos.propinasPagadas)} />
      <FlujoRow label="=SALDO FINAL:" value={fmt(saldoFinal)} bold />
      <FlujoRow label="EFECTIVO FINAL:" value={fmt(efectivoFinal)} bold />

      <DividerSolid />

      {/* 4) FORMA DE PAGO VENTAS */}
      <SectionTitle>FORMA DE PAGO VENTAS</SectionTitle>
      {datos.pagosPorMetodo.map((p, i) => (
        <FlujoRow key={i} label={`${p.metodo}:`} value={fmt(p.total)} />
      ))}
      <FlujoRow label="TOTAL FORMAS DE PAGO" value={fmt(totalFormasPago)} bold />

      <DividerSolid />

      {/* 5) FORMA DE PAGO PROPINA */}
      <SectionTitle>FORMA DE PAGO PROPINA</SectionTitle>
      <FlujoRow label="TOTAL FORMAS PAGO PROPINA" value={fmt(totalFormasPagoPropina)} bold />

      <DividerSolid />

      {/* 6) POR TIPO DE SERVICIO */}
      <SectionTitle>VENTA (NO INCLUYE IMPUESTOS)</SectionTitle>
      <div className="-mt-1 text-center text-[10.5px] font-semibold">POR TIPO DE SERVICIO</div>
      {datos.ventaPorModoServicio.length === 0 ? (
        <div className="text-center text-[10px] text-[#666]">— sin ventas —</div>
      ) : (
        datos.ventaPorModoServicio.map((m, i) => (
          <FlujoRow
            key={i}
            label={`${m.modo}:`}
            value={`${fmt(m.total)}  (${m.porcentaje}%)`}
          />
        ))
      )}

      <div className="mt-2" />
      <FlujoRow label="SUBTOTAL    :" value={fmt(subtotalSinIva)} />
      <FlujoRow label="-DESCUENTOS :" value={fmt(datos.descuentos)} />
      <FlujoRow label="VENTA NETA  :" value={fmt(ventaConImp)} bold />

      <div className="mt-2" />
      <FlujoRow label="VENTA 16%   :" value={fmt(subtotalSinIva)} />
      <FlujoRow label="IMPUESTO 16%:" value={fmt(datos.iva)} />

      <div className="mt-2" />
      <FlujoRow label="IMPUESTOS TOTAL:" value={fmt(datos.iva)} bold />
      <FlujoRow label="VENTAS CON IMP.:" value={fmt(ventaConImp)} bold />

      {/* 7) VENTA RAPIDA POR TIPO (separa para llevar) */}
      {datos.ventaPorModoServicio.some((m) => /LLEVAR|RAPIDO|DRIVE/i.test(m.modo)) && (
        <>
          <DividerDashed />
          <SectionTitle>VENTA RAPIDA POR TIPO</SectionTitle>
          {datos.ventaPorModoServicio
            .filter((m) => /LLEVAR|RAPIDO|DRIVE/i.test(m.modo))
            .map((m, i) => (
              <FlujoRow key={i} label={`${m.modo}`} value={fmt(m.total)} />
            ))}
        </>
      )}

      <DividerDashed />

      {/* 8) Estadísticas */}
      <FlujoRow label="CUENTAS NORMALES" value={`: ${datos.ticketsPagados}`} />
      <FlujoRow label="CUENTAS CANCELADAS" value={`: ${datos.ticketsCancelados}`} />
      <FlujoRow label="CUENTAS CON DESCUENTO" value={`: ${datos.cuentasConDescuento}`} />
      <FlujoRow label="CUENTA PROMEDIO" value={`: ${fmt(cuentaPromedio)}`} />
      <FlujoRow label="CONSUMO PROMEDIO" value={`: ${fmt(cuentaPromedio)}`} />
      <FlujoRow label="COMENSALES" value={`: ${datos.comensales}`} />
      <FlujoRow label="PROPINAS" value={`: ${fmt(datos.propinaTotal)}`} />
      {datos.folioInicial && <FlujoRow label="FOLIO INICIAL" value={`: ${datos.folioInicial}`} />}
      {datos.folioFinal && <FlujoRow label="FOLIO FINAL" value={`: ${datos.folioFinal}`} />}

      {/* Devoluciones (si las hubo) */}
      {datos.devolucionesCantidad > 0 && (
        <>
          <DividerDashed />
          <SectionTitle>DEVOLUCIONES</SectionTitle>
          <FlujoRow label={`${datos.devolucionesCantidad} ticket(s)`} value={`−${fmt(datos.devolucionesMonto)}`} />
        </>
      )}

      <DividerSolid />

      {/* 9) DECLARACION DE CAJERO */}
      <SectionTitle>DECLARACION DE CAJERO</SectionTitle>
      {datos.declaracionPorMetodo.map((d, i) => (
        <FlujoRow key={i} label={`${d.metodo}:`} value={fmt(d.declarado)} />
      ))}
      <FlujoRow label="TOTAL:" value={fmt(datos.totalDeclarado)} bold />
      <div
        className={[
          "mt-0.5 flex items-center justify-between text-[11px] font-bold",
          diffEstado === "short" ? "text-[#C0392B]" : diffEstado === "over" ? "text-[#9A6B12]" : "text-[#2E7D52]",
        ].join(" ")}
      >
        <span>SOBRANTE(+) O FALTANTE(-):</span>
        <span className="tabular-nums">{diff === 0 ? fmt(0) : `${diffSigno}${fmt(Math.abs(diff))}`}</span>
      </div>

      <hr className="my-4 border-0 border-t border-[#888]" />

      {/* 10) Firma */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div className="border-t border-[#1A1A1A] pt-1 text-center">GERENTE</div>
        <div className="border-t border-[#1A1A1A] pt-1 text-center">CAJERO: {datos.cajero}</div>
      </div>

      {/* 11) Sello inmutable VIM */}
      <div className="mt-4 border border-dashed border-[#888] p-2 text-center">
        <div className="font-sans text-[10px] font-extrabold tracking-[0.08em]">✶ TURNO CERRADO · VIM POS ✶</div>
        <div className="mt-0.5 text-[9.5px]">Folio Z: {datos.folioZ}</div>
        <div className="mt-0.5 break-all text-[9px] text-[#555]">SHA: {datos.sello}</div>
        <div className="mt-0.5 text-[9.5px] text-[#444]">Sellado {cierreCompleto}</div>
      </div>

      <div className="mt-3 text-center text-[9px] tracking-[0.2em] text-[#999]">— — — — — — — — — —</div>

      <PaperEdge />
    </div>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-center text-[10.5px] font-bold uppercase tracking-[0.04em]">{children}</div>;
}

function FlujoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={["flex justify-between py-[1.5px]", bold ? "font-bold" : ""].join(" ")}>
      <span>{label}</span>
      <span className="whitespace-nowrap tabular-nums">{value}</span>
    </div>
  );
}

function DividerSolid() {
  return <div className="my-2 text-center tracking-[0.05em] text-[10px] text-[#888]">==============================</div>;
}

function DividerDashed() {
  return <hr className="my-2.5 border-0 border-t border-dashed border-[#B0B0B0]" />;
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

// ── helpers ───────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

function fmtFechaCorta(iso: string): string {
  const f = new Date(iso);
  return `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
}

function fmtFechaCompleta(iso: string): string {
  const f = new Date(iso);
  return `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}:${String(f.getSeconds()).padStart(2, "0")}`;
}

function fmtFechaHoraLarga(iso: string): string {
  const f = new Date(iso);
  const dd = String(f.getDate()).padStart(2, "0");
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const yyyy = f.getFullYear();
  let hh = f.getHours();
  const am = hh < 12;
  hh = hh % 12 || 12;
  const min = String(f.getMinutes()).padStart(2, "0");
  const ss = String(f.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${String(hh).padStart(2, "0")}:${min}:${ss} ${am ? "AM" : "PM"}`;
}
