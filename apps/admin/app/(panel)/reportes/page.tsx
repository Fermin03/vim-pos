"use client";
import { Icono } from "@vim/ui/styles";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageBody, PageHeader } from "../../components/page-header";
import { usePerfil } from "../../components/admin-shell";
import { leerReportesDisponibles, type ReportesDisponibles } from "../../lib/reportes";
import { GRUPOS, reporteVisible, type Reporte } from "../../lib/reportes-grupos";

/**
 * Índice de reportes, agrupado por la PREGUNTA que responde cada uno.
 *
 * El nombre de cada tarjeta es el título de su página: antes 6 de 15 no coincidían ("Cortes de
 * turno" abría "Cortes Z históricos", "Ventas por mesero" abría "Desempeño del equipo").
 *
 * Los reportes de módulos que el negocio no usa (marcas, eventos, reservaciones, apps, varias
 * sucursales, inventario) se esconden, con un enlace para verlos: una taquería con una sucursal
 * veía "Consolidado por sucursal" y "Ventas por marca virtual".
 *
 * Tampoco se enseña un reporte que el rol no puede abrir (costo de ventas pide administrador; el
 * historial vive en Inventario): una tarjeta que lleva a "no disponible para ti" solo estorba.
 */

export default function ReportesHub() {
  const perfil = usePerfil();
  const [disponibles, setDisponibles] = useState<ReportesDisponibles | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    leerReportesDisponibles()
      .then(setDisponibles)
      // Sin respuesta se muestran todos: esconder un reporte que sí usa confunde más.
      .catch(() => setDisponibles({ marcas: true, eventos: true, reservaciones: true, apps: true, variasSucursales: true, inventario: true, meseros: true, existencias: false, agenda: false }));
  }, []);

  // Sin perfil todavía se muestran todas: el guardián de rutas es quien decide al entrar.
  const jer = perfil?.jerarquia ?? null;
  const visible = (r: Reporte) => reporteVisible(r, disponibles, jer, verTodos);
  const ocultos = disponibles ? GRUPOS.flatMap((g) => g.reportes).filter((r) => reporteVisible(r, disponibles, jer, true) && !reporteVisible(r, disponibles, jer)).length : 0;

  return (
    <>
      <PageHeader titulo="Reportes" subtitulo="Cómo va tu negocio, desde la venta hasta los cierres de caja." migas={[{ label: "Reportes" }]} />
      <PageBody>
        <div className="flex flex-col gap-8">
          {GRUPOS.map((g) => {
            const reportes = g.reportes.filter(visible);
            if (reportes.length === 0) return null;
            return (
              <section key={g.id} id={g.id} className="scroll-mt-6">
                <h2 className="font-display text-15 font-semibold tracking-tight">{g.titulo}</h2>
                <p className="mb-3 mt-0.5 text-13 text-ink-2">{g.ayuda}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {reportes.map((r) => (
                    <Link
                      key={r.href}
                      href={r.href}
                      className="group flex flex-col rounded-lg border border-line bg-surface p-5 transition-[border-color,box-shadow,transform] duration-150 ease-vim hover:border-ink hover:shadow-[0_4px_14px_rgba(22,22,26,.06)] active:scale-[.98]"
                    >
                      <span className="mb-1.5 font-display text-16 font-semibold tracking-tight">{r.titulo}</span>
                      <p className="flex-1 text-13 leading-snug text-ink-2">{r.descripcion}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-13 font-semibold text-ink">
                        Abrir
                        <Icono nombre="flecha-derecha" className="h-3.5 w-3.5 transition-transform duration-150 ease-vim group-hover:translate-x-0.5" strokeWidth={2.5} />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}

          {ocultos > 0 && (
            <p className="text-14 text-ink-2">
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
