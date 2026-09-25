"use client";
import { ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerNoShows, type FilaNoShow } from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

/** Reservaciones: cuánta gente reserva y no llega, por día. */
export default function ReservasQueNoLlegaronPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta((r) => leerNoShows(r.desde, r.hasta), rango);
  const filas = consulta.datos ?? [];

  const reservas = filas.reduce((s, f) => s + f.total, 0);
  const noLlegaron = filas.reduce((s, f) => s + f.noShows, 0);
  const tasa = reservas > 0 ? (noLlegaron / reservas) * 100 : 0;

  const cifras: Cifra[] = [
    { etiqueta: "Reservas", valor: reservas, tipo: "entero" },
    { etiqueta: "No llegaron", valor: noLlegaron, tipo: "entero", pie: `${formatear(tasa, "pct")} de las reservas` },
    { etiqueta: "Comensales perdidos", valor: filas.reduce((s, f) => s + f.comensalesPerdidos, 0), tipo: "entero" },
    {
      etiqueta: "Canceladas con aviso",
      valor: filas.reduce((s, f) => s + f.canceladas, 0),
      tipo: "entero",
      pie: "estas sí liberaron la mesa",
    },
  ];

  const columnas: Columna<FilaNoShow>[] = [
    { id: "dia", titulo: "Día", tipo: "fecha", valor: (f) => f.dia, ancho: 12 },
    { id: "reservas", titulo: "Reservas", tipo: "entero", valor: (f) => f.total, total: "suma" },
    { id: "llegaron", titulo: "Llegaron", tipo: "entero", valor: (f) => f.llegaron + f.terminadas, total: "suma" },
    { id: "canceladas", titulo: "Canceladas", tipo: "entero", valor: (f) => f.canceladas, total: "suma", enfasis: "suave" },
    { id: "noLlegaron", titulo: "No llegaron", tipo: "entero", valor: (f) => f.noShows, total: "suma", enfasis: "fuerte" },
    {
      id: "tasa",
      titulo: "% que no llegó",
      tipo: "pct",
      valor: (f) => f.tasaPct,
      total: () => tasa,
      celda: (f) => (
        <span className={`rounded px-2 py-0.5 text-[12.5px] font-semibold tabular-nums ${f.tasaPct >= 20 ? "bg-warning-soft text-warning" : "text-ink-2"}`}>
          {formatear(f.tasaPct, "pct")}
        </span>
      ),
    },
    { id: "comensales", titulo: "Comensales perdidos", tipo: "entero", valor: (f) => f.comensalesPerdidos, total: "suma", enfasis: "suave", ancho: 20 },
  ];

  return (
    <ReporteMarco
      titulo="Reservas que no llegaron"
      subtitulo="Cuántas reservas se quedaron esperando, día por día, y cuántos comensales se perdieron."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.dia, orden: { id: "dia", dir: "desc" }, vacio: "No hubo reservaciones en estas fechas." }}
    />
  );
}
