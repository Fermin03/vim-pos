"use client";
import Link from "next/link";
import { PageBody, PageHeader } from "../../components/page-header";

type Reporte = {
  href: string;
  titulo: string;
  descripcion: string;
  /** Etiqueta del mockup de referencia (para trazabilidad). */
  ref: string;
};

const REPORTES: Reporte[] = [
  {
    href: "/reportes/z-historico",
    titulo: "Reporte Z histórico",
    descripcion: "Cierres de turno: ventas, propinas, tickets, diferencias de efectivo.",
    ref: "P-181",
  },
  {
    href: "/reportes/ventas-producto",
    titulo: "Ventas por producto",
    descripcion: "Qué productos venden más, ingreso por producto, unidades.",
    ref: "P-185",
  },
  {
    href: "/reportes/ventas-categoria",
    titulo: "Ventas por categoría",
    descripcion: "Mix de venta por categoría del catálogo.",
    ref: "P-184",
  },
  {
    href: "/reportes/modo-servicio",
    titulo: "Ventas por tipo de servicio",
    descripcion: "Comer aquí · Para llevar · Drive-thru. Mix y participación %.",
    ref: "P-188",
  },
];

export default function ReportesHub() {
  return (
    <>
      <PageHeader
        titulo="Reportes"
        subtitulo="Indicadores de operación y venta del negocio."
        migas={[{ label: "Reportes" }]}
      />
      <PageBody>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {REPORTES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="group rounded-lg border border-line bg-surface p-5 transition hover:border-ink hover:shadow-[0_4px_14px_rgba(22,22,26,.06)]"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-display text-[16px] font-semibold tracking-tight">{r.titulo}</span>
                <span className="rounded-full bg-sel px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-3">{r.ref}</span>
              </div>
              <p className="text-[12.5px] leading-snug text-ink-3">{r.descripcion}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-ink transition-colors group-hover:text-ink">
                Abrir →
              </span>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
