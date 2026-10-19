"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageBody, PageHeader } from "../../components/page-header";
import { useModulos } from "../../components/admin-shell";
import { Segmentos } from "../../components/controles";
import {
  filtrarPorEstado, listarCotizaciones, totalesCotizaciones,
  type EstadoCotizacion, type FiltroCotizacion, type ListaCotizaciones,
} from "../../lib/cotizaciones";
import { conCotizaciones } from "../../lib/operacion";
import { fmtMxn } from "../../lib/reportes";
import { mensajeError } from "../../lib/errores";

const fmtDia = (iso: string, zona: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: zona, day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

const ETIQUETA: Record<EstadoCotizacion, string> = { VIGENTE: "Vigente", VENCIDA: "Vencida", CONVERTIDA: "Convertida en venta", CANCELADA: "Cancelada" };
const FILTROS: { v: FiltroCotizacion; l: string }[] = [
  { v: "TODAS", l: "Todas" }, { v: "VIGENTE", l: "Vigentes" }, { v: "VENCIDA", l: "Vencidas" },
  { v: "CONVERTIDA", l: "Convertidas" }, { v: "CANCELADA", l: "Canceladas" },
];

/** Las cotizaciones del negocio (0212): lo cotizado este mes, lo que se volvió venta y la lista. */
export default function CotizacionesPage() {
  const modulos = useModulos();
  const [datos, setDatos] = useState<ListaCotizaciones | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroCotizacion>("TODAS");
  const encendido = conCotizaciones(modulos);

  useEffect(() => {
    if (!encendido) return;
    listarCotizaciones().then((d) => { setDatos(d); setError(null); })
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar las cotizaciones")));
  }, [encendido]);

  const totales = useMemo(() => datos && totalesCotizaciones(datos.cotizaciones, datos.hoy, datos.zona), [datos]);
  const filas = useMemo(() => (datos ? filtrarPorEstado(datos.cotizaciones, filtro) : []), [datos, filtro]);

  return (
    <>
      <PageHeader titulo="Cotizaciones" subtitulo="Lo que se ha cotizado y lo que se volvió venta." />
      <PageBody>
        {modulos === null ? (
          <p className="text-sm text-ink-3">Cargando…</p>
        ) : !encendido ? (
          <div className="max-w-[640px] rounded-lg border border-line bg-surface p-5">
            <p className="text-14 font-semibold text-ink">Las cotizaciones están apagadas</p>
            <p className="mt-1 text-13 text-ink-2">
              Enciéndelas en <Link href="/configuracion/cotizaciones" className="font-semibold text-ink underline">Configuración · Cotizaciones</Link>.
            </p>
          </div>
        ) : (
          <>
            {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
            {datos === null || totales === null ? (
              !error && <p className="text-sm text-ink-3">Cargando…</p>
            ) : datos.cotizaciones.length === 0 ? (
              <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
                <p className="text-15 font-semibold text-ink-2">Aún no hay cotizaciones</p>
                <p className="mt-1 text-13">Se hacen desde la caja, con «Cotizar».</p>
              </div>
            ) : (
              <>
                <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <div className="text-12 font-bold uppercase tracking-wide text-ink-3">Cotizado este mes</div>
                    <div className="mt-1 font-display text-2xl font-bold tabular-nums">{fmtMxn(totales.cotizado)}</div>
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <div className="text-12 font-bold uppercase tracking-wide text-ink-3">Convertido en venta</div>
                    <div className="mt-1 font-display text-2xl font-bold tabular-nums">{fmtMxn(totales.convertido)}</div>
                  </div>
                </div>
                <div className="mb-3">
                  <Segmentos<FiltroCotizacion> etiqueta="Estado" opciones={FILTROS} valor={filtro} onCambiar={setFiltro} />
                </div>
                {filas.length === 0 ? (
                  <p className="text-13 text-ink-3">Ninguna cotización en este estado.</p>
                ) : (
                  <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
                    <table className="w-full text-14">
                      <thead>
                        <tr className="border-b border-line bg-sel text-left text-12 uppercase tracking-wide text-ink-3">
                          <th className="px-4 py-2.5 font-semibold">Folio</th>
                          <th className="px-4 py-2.5 font-semibold">Fecha</th>
                          <th className="px-4 py-2.5 font-semibold">Cliente</th>
                          <th className="px-4 py-2.5 font-semibold">Sucursal</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                          <th className="px-4 py-2.5 font-semibold">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((c) => (
                          <tr key={c.id} className="border-b border-line last:border-b-0">
                            <td className="px-4 py-2.5 font-mono font-medium">{c.folio}</td>
                            <td className="px-4 py-2.5 text-ink-2">{fmtDia(c.creada, datos.zona)}</td>
                            <td className="px-4 py-2.5">{c.cliente ?? <span className="text-ink-3">Sin cliente</span>}</td>
                            <td className="px-4 py-2.5 text-ink-2">{c.sucursal}</td>
                            <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtMxn(c.total)}</td>
                            <td className="px-4 py-2.5">
                              <span className={c.estado === "VENCIDA" ? "font-semibold text-danger" : c.estado === "VIGENTE" ? "font-semibold text-ink" : "text-ink-3"}>
                                {ETIQUETA[c.estado]}
                              </span>
                              {c.estado === "CONVERTIDA" && c.folioVenta && <span className="ml-1.5 font-mono text-13 text-ink-2">{c.folioVenta}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
