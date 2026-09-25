"use client";
import { rangoLegible } from "@vim/fecha";
import { ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerVentasPorEvento, type FilaEvento } from "../../../lib/reportes";
import type { Columna } from "../../../lib/reporte-tabla";

const TIPO: Record<string, string> = {
  FERIA: "Feria", FESTIVAL: "Festival", CONCIERTO: "Concierto", PRIVADO: "Privado", CORPORATIVO: "Corporativo", OTRO: "Otro",
};

/** ¿Valió la pena la feria? Venta, comisión del organizador y neto por evento. */
export default function VentasPorEventoPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta(() => leerVentasPorEvento(), rango);
  // Era el único reporte sin rango. La vista ya viene por evento; se filtran los que tocan el
  // periodo elegido.
  const filas = (consulta.datos ?? []).filter((f) => !rango || (f.ultimoDia >= rango.desde && f.primerDia <= rango.hasta));

  const venta = filas.reduce((s, f) => s + f.total, 0);
  const comision = filas.reduce((s, f) => s + f.comision, 0);

  const cifras: Cifra[] = [
    { etiqueta: "Venta en eventos", valor: venta, tipo: "mxn" },
    { etiqueta: "Comisión a organizadores", valor: comision, tipo: "mxn" },
    { etiqueta: "Te quedó", valor: venta - comision, tipo: "mxn" },
    { etiqueta: "Eventos", valor: filas.length, tipo: "entero" },
  ];

  const columnas: Columna<FilaEvento>[] = [
    {
      id: "evento",
      titulo: "Evento",
      valor: (f) => f.evento,
      ancho: 30,
      celda: (f) => (
        <>
          <span className="font-medium">{f.evento}</span>
          {f.tipo && <span className="ml-2 whitespace-nowrap rounded-full bg-sel px-2 py-0.5 text-[12px] font-semibold text-ink-2">{TIPO[f.tipo] ?? f.tipo}</span>}
        </>
      ),
    },
    { id: "fechas", titulo: "Desde", tipo: "fecha", valor: (f) => f.primerDia, enfasis: "suave", celda: (f) => rangoLegible(f.primerDia, f.ultimoDia) },
    { id: "turnos", titulo: "Turnos", tipo: "entero", valor: (f) => f.turnos, total: "suma" },
    { id: "tickets", titulo: "Tickets", tipo: "entero", valor: (f) => f.tickets, total: "suma" },
    { id: "venta", titulo: "Venta", tipo: "mxn", valor: (f) => f.total, total: "suma" },
    { id: "comision", titulo: "Comisión", tipo: "mxn", valor: (f) => f.comision || null, total: "suma", enfasis: "suave" },
    // Sin verde: un neto positivo es lo normal, no una alerta.
    { id: "neto", titulo: "Neto", tipo: "mxn", valor: (f) => f.neto, total: "suma", enfasis: "fuerte" },
  ];

  return (
    <ReporteMarco
      titulo="Ventas por evento"
      subtitulo="Ferias, festivales y eventos privados: venta, comisión del organizador y lo que te quedó."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{
        columnas,
        filas,
        clave: (f) => `${f.evento}|${f.primerDia}`,
        orden: { id: "fechas", dir: "desc" },
        vacio: "No hubo eventos en estas fechas. Al abrir turno en la caja, marca «¿Es un evento o ubicación especial?» y aparecerá aquí.",
      }}
    />
  );
}
