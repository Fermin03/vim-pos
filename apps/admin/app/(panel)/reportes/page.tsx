"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageBody, PageHeader } from "../../components/page-header";
import { leerReportesDisponibles, type ReportesDisponibles } from "../../lib/reportes";

/**
 * Índice de reportes, agrupado por la PREGUNTA que responde cada uno.
 *
 * El nombre de cada tarjeta es el título de su página: antes 6 de 15 no coincidían ("Cortes de
 * turno" abría "Cortes Z históricos", "Ventas por mesero" abría "Desempeño del equipo").
 *
 * Los reportes de módulos que el negocio no usa (marcas, eventos, reservaciones, apps, varias
 * sucursales) se esconden, con un enlace para verlos: una taquería con una sucursal veía
 * "Consolidado por sucursal" y "Ventas por marca virtual".
 */
type Modulo = keyof ReportesDisponibles;
type Reporte = { href: string; titulo: string; descripcion: string; modulo?: Modulo };
type Grupo = { titulo: string; ayuda: string; reportes: Reporte[] };

const GRUPOS: Grupo[] = [
  {
    titulo: "Qué se vende",
    ayuda: "La venta desglosada por producto, por categoría y por canal.",
    reportes: [
      { href: "/reportes/ventas-producto", titulo: "Ventas por producto", descripcion: "Qué se vende más: unidades, venta y la parte que aporta cada producto." },
      { href: "/reportes/ventas-categoria", titulo: "Ventas por categoría", descripcion: "La venta repartida por las categorías de tu menú." },
      { href: "/reportes/modo-servicio", titulo: "Ventas por tipo de servicio", descripcion: "Comer aquí, para llevar, a domicilio y apps: cuánto aporta cada uno." },
      { href: "/reportes/apps-externas", titulo: "Ventas por apps de delivery", descripcion: "Uber Eats, Rappi y DiDi: venta, comisión y lo que depositó cada app.", modulo: "apps" },
      { href: "/reportes/ventas-marca", titulo: "Ventas por marca virtual", descripcion: "Cómo le va a cada marca que opera desde tu cocina.", modulo: "marcas" },
      { href: "/reportes/eventos", titulo: "Ventas por evento", descripcion: "Ferias y eventos: venta, comisión del organizador y lo que te quedó.", modulo: "eventos" },
    ],
  },
  {
    titulo: "Cómo va la operación",
    ayuda: "Cierres de caja, el equipo y los tiempos de cocina.",
    reportes: [
      { href: "/reportes/z-historico", titulo: "Cortes de turno", descripcion: "Cada cierre de caja: lo vendido, el efectivo esperado contra el contado y quién cerró." },
      { href: "/reportes/ventas-mesero", titulo: "Ventas por mesero", descripcion: "Tickets, venta y propinas de cada mesero." },
      { href: "/reportes/ventas-area", titulo: "Ventas por estación", descripcion: "Cuánto prepara y cuánto vende cada estación de la cocina." },
      { href: "/reportes/tiempos-cocina", titulo: "Tiempos de cocina", descripcion: "Cuánto tarda en salir la comida contra tu objetivo." },
    ],
  },
  {
    titulo: "Qué vigilar",
    ayuda: "Señales que conviene revisar de cerca.",
    reportes: [
      { href: "/reportes/descuentos", titulo: "Descuentos por usuario", descripcion: "Quién da descuentos y cortesías, y cuánto suman frente a la venta." },
      { href: "/reportes/reimpresiones", titulo: "Reimpresiones por cajero", descripcion: "Reimprimir mucho puede esconder producto que salió sin cobrar." },
      { href: "/reportes/no-shows", titulo: "Reservas que no llegaron", descripcion: "Reservas que se quedaron esperando y comensales perdidos.", modulo: "reservaciones" },
    ],
  },
  {
    titulo: "Varias sucursales",
    ayuda: "Tu cadena, sucursal por sucursal.",
    reportes: [
      { href: "/reportes/consolidado", titulo: "Consolidado por sucursal", descripcion: "Venta, tickets y participación de cada sucursal, una junto a otra.", modulo: "variasSucursales" },
    ],
  },
];

export default function ReportesHub() {
  const [disponibles, setDisponibles] = useState<ReportesDisponibles | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    leerReportesDisponibles()
      .then(setDisponibles)
      // Sin respuesta se muestran todos: esconder un reporte que sí usa confunde más.
      .catch(() => setDisponibles({ marcas: true, eventos: true, reservaciones: true, apps: true, variasSucursales: true }));
  }, []);

  const visible = (r: Reporte) => verTodos || !r.modulo || !disponibles || disponibles[r.modulo];
  const ocultos = disponibles ? GRUPOS.flatMap((g) => g.reportes).filter((r) => r.modulo && !disponibles[r.modulo]).length : 0;

  return (
    <>
      <PageHeader titulo="Reportes" subtitulo="Cómo va tu negocio, desde la venta hasta los cierres de caja." migas={[{ label: "Reportes" }]} />
      <PageBody>
        <div className="flex flex-col gap-8">
          {GRUPOS.map((g) => {
            const reportes = g.reportes.filter(visible);
            if (reportes.length === 0) return null;
            return (
              <section key={g.titulo}>
                <h2 className="font-display text-[15px] font-semibold tracking-tight">{g.titulo}</h2>
                <p className="mb-3 mt-0.5 text-[13px] text-ink-2">{g.ayuda}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {reportes.map((r) => (
                    <Link
                      key={r.href}
                      href={r.href}
                      className="group flex flex-col rounded-lg border border-line bg-surface p-5 transition-[border-color,box-shadow,transform] duration-150 ease-vim hover:border-ink hover:shadow-[0_4px_14px_rgba(22,22,26,.06)] active:scale-[.98]"
                    >
                      <span className="mb-1.5 font-display text-[16px] font-semibold tracking-tight">{r.titulo}</span>
                      <p className="flex-1 text-[13px] leading-snug text-ink-2">{r.descripcion}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink">
                        Abrir
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 transition-transform duration-150 ease-vim group-hover:translate-x-0.5" aria-hidden="true">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}

          {ocultos > 0 && (
            <p className="text-[13.5px] text-ink-2">
              {verTodos
                ? "Se muestran también los reportes de funciones que tu negocio no usa."
                : `${ocultos === 1 ? "Hay 1 reporte" : `Hay ${ocultos} reportes`} de funciones que tu negocio no usa.`}{" "}
              <button
                type="button"
                onClick={() => setVerTodos((v) => !v)}
                className="font-semibold text-ink underline underline-offset-2"
              >
                {verTodos ? "Ocultarlos" : "Verlos"}
              </button>
            </p>
          )}
        </div>
      </PageBody>
    </>
  );
}
