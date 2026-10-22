"use client";
import { useState } from "react";
import { rangoLegible } from "@vim/fecha";
import { useModulos } from "../../../components/admin-shell";
import { Segmentos } from "../../../components/controles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { Barra, Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { conAgenda } from "../../../lib/operacion";
import {
  agruparOcupacion, leerOcupacion, ocupacionTotal, recortarRango, type AgruparOcupacion, type FilaOcupacion,
} from "../../../lib/reportes";
import type { Columna } from "../../../lib/reporte-tabla";

const TITULO = "Ocupación";
/** Lo más que acepta agenda_ocupacion (0227). */
const DIAS_MAX = 93;

/** Reporte de belleza: un negocio sin agenda que llega por enlace directo no lee nada de él. */
export default function OcupacionPage() {
  const modulos = useModulos();
  if (modulos === null) return <PageBody><p className="text-13 text-ink-3">Cargando…</p></PageBody>;
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

const horas = (min: number) => min / 60;

function Reporte() {
  const { rango, cambiar } = useRangoReporte();
  const [por, setPor] = useState<AgruparOcupacion>("colaborador");
  const recorte = rango ? recortarRango(rango.desde, rango.hasta, DIAS_MAX) : null;
  const consulta = useConsulta((r) => {
    const x = recortarRango(r.desde, r.hasta, DIAS_MAX);
    return leerOcupacion(x.desde, x.hasta);
  }, rango);
  const renglones = consulta.datos ?? [];
  const filas = agruparOcupacion(renglones, por);
  const total = ocupacionTotal(renglones);

  const cifras: Cifra[] = [
    { etiqueta: "Ocupación", valor: total, tipo: "pct" },
    { etiqueta: "Horas agendadas", valor: horas(renglones.reduce((s, r) => s + r.minutos_agendados, 0)), tipo: "decimal" },
    { etiqueta: "Horas de horario", valor: horas(renglones.reduce((s, r) => s + r.minutos_horario, 0)), tipo: "decimal" },
  ];

  const columnas: Columna<FilaOcupacion>[] = [
    { id: "colaborador", titulo: "Colaborador", valor: (f) => f.colaborador, ancho: 24 },
    ...(por === "dia" ? [{ id: "dia", titulo: "Día", tipo: "fecha", valor: (f) => f.dia, ancho: 12 } satisfies Columna<FilaOcupacion>] : []),
    { id: "agendadas", titulo: "Horas agendadas", tipo: "decimal", valor: (f) => horas(f.agendados), total: "suma", ancho: 16 },
    { id: "horario", titulo: "Horas de horario", tipo: "decimal", valor: (f) => horas(f.horario), total: "suma", enfasis: "suave", ancho: 16 },
    {
      id: "pct", titulo: "Ocupación", tipo: "pct", valor: (f) => f.pct, total: () => total, enfasis: "fuerte",
      celda: (f) => (f.pct === null ? <span className="text-ink-3">—</span> : <Barra pct={f.pct} />),
    },
  ];

  return (
    <ReporteMarco
      titulo={TITULO}
      subtitulo="Qué parte del horario de cada colaborador estuvo agendada."
      rango={{ valor: rango, cambiar }}
      filtros={<Segmentos grande etiqueta="Ver" opciones={[{ v: "colaborador", l: "Por colaborador" }, { v: "dia", l: "Por día" }]} valor={por} onCambiar={setPor} />}
      consulta={consulta}
      cifras={cifras}
      tabla={{
        columnas, filas, clave: (f) => f.clave,
        orden: por === "dia" ? { id: "dia", dir: "desc" } : { id: "pct", dir: "desc" },
        vacio: "Nadie tiene horario ni citas en estas fechas.",
      }}
    >
      {recorte?.recortado && (
        <p className="mt-4 rounded-lg border border-line bg-warning-soft px-4 py-3 text-14 text-ink">
          Este reporte abarca hasta 93 días: se muestran {rangoLegible(recorte.desde, recorte.hasta)}.
        </p>
      )}
      <Nota>
        El horario descuenta la comida y los días de ausencia. Una cita fuera de horario cuenta como agendada, pero ningún día pasa
        del 100 %. Un día sin horario sale «—».
      </Nota>
    </ReporteMarco>
  );
}
