"use client";
import Link from "next/link";
import { PageBody, PageHeader } from "../../components/page-header";

/**
 * Hub de reportes.
 *
 * Antes cada tarjeta mostraba la referencia interna del mockup con el que se diseñó —"P-181",
 * "doc 09", "Flujos FT §4"—. Para quien usa el sistema eso no significa nada: parece un código de
 * error o una versión inacabada, y ensucia una pantalla que debería inspirar confianza.
 *
 * En su lugar, las tarjetas se agrupan por la PREGUNTA que responden. Catorce reportes en una
 * rejilla plana obligan a leerlos todos para encontrar uno; agrupados, se salta directo al bloque
 * correcto. La trazabilidad con los mockups vive en el repositorio, que es donde le sirve a quien
 * desarrolla.
 */
type Reporte = { href: string; titulo: string; descripcion: string };
type Grupo = { titulo: string; ayuda: string; reportes: Reporte[] };

const GRUPOS: Grupo[] = [
  {
    titulo: "Qué se vende",
    ayuda: "Composición de la venta: por producto, por categoría y por canal.",
    reportes: [
      { href: "/reportes/ventas-producto", titulo: "Ventas por producto", descripcion: "Qué productos venden más, ingreso por producto y unidades." },
      { href: "/reportes/ventas-categoria", titulo: "Ventas por categoría", descripcion: "Mix de venta por categoría del catálogo." },
      { href: "/reportes/modo-servicio", titulo: "Ventas por tipo de servicio", descripcion: "Comer aquí, para llevar y drive-thru: mix y participación." },
      { href: "/reportes/ventas-marca", titulo: "Ventas por marca virtual", descripcion: "Desempeño por marca o concepto, para dark kitchen y foodtruck." },
      { href: "/reportes/apps-externas", titulo: "Ventas por apps externas", descripcion: "Rappi, Uber y DiDi: venta, comisión y estado de conciliación." },
      { href: "/reportes/eventos", titulo: "Ventas por evento", descripcion: "Ferias y eventos: venta, comisión del organizador y neto." },
    ],
  },
  {
    titulo: "Cómo va la operación",
    ayuda: "Cierres de caja, desempeño del equipo y tiempos de cocina.",
    reportes: [
      { href: "/reportes/z-historico", titulo: "Cortes de turno", descripcion: "Historial de cierres: ventas, propinas, tickets y diferencias de efectivo." },
      { href: "/reportes/ventas-mesero", titulo: "Ventas por mesero", descripcion: "Desempeño del equipo: tickets, venta y propinas." },
      { href: "/reportes/ventas-area", titulo: "Ventas por área de cocina", descripcion: "Carga de trabajo y venta por estación." },
      { href: "/reportes/tiempos-cocina", titulo: "Tiempos de cocina", descripcion: "Cumplimiento de los tiempos de preparación por modo de servicio." },
    ],
  },
  {
    titulo: "Qué vigilar",
    ayuda: "Señales que conviene revisar de cerca: descuentos, reimpresiones y reservas perdidas.",
    reportes: [
      { href: "/reportes/descuentos", titulo: "Descuentos por usuario", descripcion: "Quién otorga descuentos y cortesías, y por cuánto." },
      { href: "/reportes/reimpresiones", titulo: "Reimpresiones por cajero", descripcion: "Reimprimir comandas con frecuencia puede indicar salidas sin cobrar." },
      { href: "/reportes/no-shows", titulo: "Reservas que no llegaron", descripcion: "Tasa diaria de no-shows y comensales perdidos." },
    ],
  },
  {
    titulo: "Varias sucursales",
    ayuda: "Comparativo central de la cadena.",
    reportes: [
      { href: "/reportes/consolidado", titulo: "Consolidado por sucursal", descripcion: "Venta, tickets y participación de cada sucursal, una junto a otra." },
    ],
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
        <div className="flex flex-col gap-8">
          {GRUPOS.map((g) => (
            <section key={g.titulo}>
              <h2 className="font-display text-[15px] font-semibold tracking-tight">{g.titulo}</h2>
              <p className="mb-3 mt-0.5 text-[12.5px] text-ink-3">{g.ayuda}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.reportes.map((r) => (
                  <Link
                    key={r.href}
                    href={r.href}
                    className="group flex flex-col rounded-lg border border-line bg-surface p-5 transition hover:border-ink hover:shadow-[0_4px_14px_rgba(22,22,26,.06)]"
                  >
                    <span className="mb-1.5 font-display text-[16px] font-semibold tracking-tight">{r.titulo}</span>
                    <p className="flex-1 text-[12.5px] leading-snug text-ink-3">{r.descripcion}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-ink">
                      Abrir
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </PageBody>
    </>
  );
}
