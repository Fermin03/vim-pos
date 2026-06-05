"use client";
import { QRCodeSVG } from "qrcode.react";
import type { DatosTicketImpresion } from "../lib/print/tipos";

/**
 * Render fiel del ticket de venta P-222 desde los datos crudos del ticket.
 * El PrintJob (escpos.ts) se mantiene como fuente para el papel; este componente
 * es exclusivamente la representación en pantalla (mismo origen de datos).
 *
 * Tipografía: cuerpo en JetBrains Mono (font-mono); nombre del negocio,
 * "Gracias…" y TOTAL en Inter Tight (font-sans). Igual que el mockup.
 */
export function ReciboTicket({ datos }: { datos: DatosTicketImpresion }) {
  const f = new Date(datos.meta.fechaIso);
  const fecha = `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
  const folioCorto = datos.meta.folio.replace(/^[^-]+-/, "").replace(/^0+/, "");

  return (
    <ReciboPapel>
      {/* Cabecera del negocio */}
      <div className="text-center">
        <div className="mx-auto mb-2.5 flex h-[46px] w-[46px] items-center justify-center rounded-[10px] bg-[#1A1A1A]">
          <span className="font-display text-[24px] font-bold tracking-[-0.04em] text-white">V</span>
        </div>
        <div className="font-sans text-[16px] font-bold tracking-[-0.01em] text-[#1A1A1A]">{datos.negocio.nombre}</div>
        {(datos.sucursal.direccion || datos.sucursal.telefono || datos.negocio.rfc) && (
          <div className="mt-1 text-[10.5px] leading-[1.55] text-[#333]">
            {datos.sucursal.direccion && <>{datos.sucursal.direccion}<br /></>}
            {datos.sucursal.telefono && <>Tel. {datos.sucursal.telefono}<br /></>}
            {datos.negocio.rfc && <>RFC {datos.negocio.rfc}</>}
          </div>
        )}
      </div>

      <DividerDashed />

      {/* Meta */}
      <div className="text-[10.5px] leading-[1.7]">
        <MetaRow label="Fecha:" value={fecha} />
        <MetaRow label="Ticket:" value={`#${folioCorto}`} />
        <MetaRow label="Cajero:" value={datos.meta.cajero} />
        <MetaRow label="Caja:" value={datos.meta.caja} />
        {datos.meta.modoServicio && <MetaRow label="Servicio:" value={datos.meta.modoServicio} />}
      </div>

      <DividerDashed />

      {/* Items */}
      <div className="text-[11px]">
        {datos.lineas.map((l, i) => (
          <div key={i} className="mb-[9px]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <span className="font-bold">{l.cantidad}×</span> {l.nombre}
              </div>
              <span className="whitespace-nowrap font-bold">{fmt(l.totalMxn)}</span>
            </div>
            {l.modificadores.map((m, j) => (
              <div key={j} className="pl-[18px] text-[10px] leading-[1.45] text-[#555]">+ {m}</div>
            ))}
            {l.notaCocina && l.notaCocina.trim().length > 0 && (
              <div className="pl-[18px] text-[10px] leading-[1.45] italic text-[#555]">» {l.notaCocina.trim()}</div>
            )}
          </div>
        ))}
      </div>

      <DividerDashed />

      {/* Totales */}
      <div className="text-[11px]">
        <TotRow label="Subtotal" value={fmt(datos.totales.subtotal)} />
        {datos.totales.descuentos > 0 && (
          <TotRow label="Descuento" value={`−${fmt(datos.totales.descuentos)}`} className="text-[#C0392B]" />
        )}
        <TotRow label="IVA (16%)" value={fmt(datos.totales.iva)} />
        <div className="mt-1 flex items-baseline justify-between border-t border-[#888] pt-2 pb-1.5">
          <span className="font-sans text-[15px] font-bold">TOTAL</span>
          <span className="font-sans text-[19px] font-bold tabular-nums">{fmt(datos.totales.total)}</span>
        </div>
      </div>

      <DividerDashed />

      {/* Pago */}
      <div className="text-[10.5px] leading-[1.7]">
        {datos.pagos.map((p, i) => (
          <div key={i}>
            <PayRow label="Forma de pago:" value={p.metodo} />
            {p.recibidoMxn != null && (
              <>
                <PayRow label="Recibido:" value={fmt(p.recibidoMxn)} />
                <PayRow label="Cambio:" value={fmt(p.cambioMxn)} />
              </>
            )}
          </div>
        ))}
        {datos.totales.propina > 0 && <PayRow label="Propina:" value={fmt(datos.totales.propina)} />}
      </div>

      <hr className="my-3.5 border-0 border-t border-[#888]" />

      {/* Pie + QR fiscal */}
      <div className="text-center">
        <div className="mb-2.5 font-sans text-[12.5px] font-semibold">¡Gracias por su compra!</div>
        <div className="mb-2 text-[9.5px] leading-[1.5] text-[#555]">
          ¿Necesitas factura? Escanea el código<br />o visita el portal con tu folio.
        </div>
        <div className="mx-auto mb-1.5 w-[84px] bg-white p-[5px]">
          <QRCodeSVG value={datos.qrUrl} size={74} level="M" />
        </div>
        <div className="break-all text-[9.5px] text-[#333]">{datos.qrUrl.replace(/^https?:\/\//, "")}</div>
      </div>

      {/* Corte */}
      <div className="mt-3.5 text-center text-[9px] tracking-[0.2em] text-[#999]">— — — — — — — — — —</div>
    </ReciboPapel>
  );
}

function ReciboPapel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[302px] bg-white px-5 pb-[26px] pt-[22px] font-mono text-[#1A1A1A] shadow-[0_4px_24px_rgba(0,0,0,.25)]">
      <PaperEdge top />
      {children}
      <PaperEdge />
    </div>
  );
}

/** Borde dentado de papel térmico (P-222/P-223). */
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

function DividerDashed() {
  return <hr className="my-3.5 border-0 border-t border-dashed border-[#B0B0B0]" />;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#555]">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function TotRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={["flex justify-between py-0.5", className ?? ""].join(" ")}>
      <span className={className ? "" : "text-[#444]"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function PayRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#555]">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}
