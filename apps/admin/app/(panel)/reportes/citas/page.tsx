"use client";
import { Cargando } from "@vim/ui/styles";
import { useState } from "react";
import { rangoLegible } from "@vim/fecha";
import { useModulos } from "../../../components/admin-shell";
import { Segmentos } from "../../../components/controles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { conAgenda } from "../../../lib/operacion";
import {
  agruparCitas, leerReporteCitas, recortarRango, tasaFalta, type AgruparCitas, type CanalCitas, type FilaCitas,
} from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

const TITULO = "Citas y faltas";
/** Lo más que acepta agenda_reporte_citas (0227). */
const DIAS_MAX = 367;

/** Reporte de belleza: un negocio sin agenda que llega por enlace directo no lee nada de él. */
export default function CitasPage() {
  const modulos = useModulos();
  if (modulos === null) return <PageBody><Cargando /></PageBody>;
  if (!conAgenda(modulos)) {
    return (
      <>
        <PageHeader titulo={TITULO} migas={[{ label: "Reportes", href: "/reportes" }, { label: TITULO }]} />
        <PageBody><p className="text-sm text-ink-2">Este reporte es para negocios con agenda.</p></PageBody>
      </>
    );
  }
  return <Reporte />;
}

function Reporte() {
  const { rango, cambiar } = useRangoReporte();
  const [por, setPor] = useState<AgruparCitas>("colaborador");
  const [canal, setCanal] = useState<CanalCitas>("");
  const recorte = rango ? recortarRango(rango.desde, rango.hasta, DIAS_MAX) : null;
  const consulta = useConsulta((r) => {
    const x = recortarRango(r.desde, r.hasta, DIAS_MAX);
    return leerReporteCitas(x.desde, x.hasta, canal);
  }, rango, canal);
  const filas = consulta.datos ? agruparCitas(consulta.datos, por) : [];

  const suma = (k: keyof Pick<FilaCitas, "atendidas" | "canceladasClienta" | "canceladasNegocio" | "noLlego" | "total">) => filas.reduce((s, f) => s + f[k], 0);
  const tasa = tasaFalta(suma("noLlego"), suma("total"));
  const cifras: Cifra[] = [
    { etiqueta: "Atendidas", valor: suma("atendidas"), tipo: "entero" },
    { etiqueta: "Canceladas", valor: suma("canceladasClienta") + suma("canceladasNegocio"), tipo: "entero" },
    { etiqueta: "No llegaron", valor: suma("noLlego"), tipo: "entero", pie: `${formatear(tasa, "pct")} de las citas`, tono: tasa >= 20 ? "atencion" : "neutro" },
  ];

  const columnas: Columna<FilaCitas>[] = [
    { id: "nombre", titulo: por === "colaborador" ? "Colaborador" : "Servicio", valor: (f) => f.nombre, ancho: 28 },
    { id: "atendidas", titulo: "Atendidas", tipo: "entero", valor: (f) => f.atendidas, total: "suma", enfasis: "fuerte" },
    { id: "cClienta", titulo: "Canceló la clienta", tipo: "entero", valor: (f) => f.canceladasClienta, total: "suma", enfasis: "suave", ancho: 18 },
    { id: "cNegocio", titulo: "Canceló el negocio", tipo: "entero", valor: (f) => f.canceladasNegocio, total: "suma", enfasis: "suave", ancho: 18 },
    { id: "noLlego", titulo: "No llegó", tipo: "entero", valor: (f) => f.noLlego, total: "suma" },
    { id: "total", titulo: "Total", tipo: "entero", valor: (f) => f.total, total: "suma" },
    {
      id: "tasa", titulo: "Tasa de falta", tipo: "pct", valor: (f) => f.tasa, total: () => tasa,
      celda: (f) => (
        <span className={`rounded px-2 py-0.5 text-13 font-semibold tabular-nums ${f.tasa >= 20 ? "bg-warning-soft text-warning" : "text-ink-2"}`}>
          {formatear(f.tasa, "pct")}
        </span>
      ),
    },
  ];

  return (
    <ReporteMarco
      titulo={TITULO}
      subtitulo="Cuántas citas se atendieron, cuántas se cancelaron y cuántas clientas no llegaron."
      rango={{ valor: rango, cambiar }}
      filtros={
        <>
          <Segmentos grande etiqueta="Agrupar por" opciones={[{ v: "colaborador", l: "Por colaborador" }, { v: "servicio", l: "Por servicio" }]} valor={por} onCambiar={setPor} />
          <Segmentos grande etiqueta="Canal" opciones={[{ v: "", l: "Todas" }, { v: "CAJA", l: "En caja" }, { v: "EN_LINEA", l: "En línea" }]} valor={canal} onCambiar={setCanal} />
        </>
      }
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.clave, orden: { id: "total", dir: "desc" }, minimo: 820, vacio: "No hubo citas en estas fechas." }}
    >
      {recorte?.recortado && (
        <p className="mt-4 rounded-lg border border-line bg-warning-soft px-4 py-3 text-14 text-ink">
          Este reporte abarca hasta un año: se muestran {rangoLegible(recorte.desde, recorte.hasta)}.
        </p>
      )}
      <Nota>
        Cuenta cada servicio de la cita: una cita con corte y tinte suma en los dos. No cuentan las citas por venir o en curso,
        ni las reservas en línea que vencieron sin pagar.
      </Nota>
    </ReporteMarco>
  );
}
