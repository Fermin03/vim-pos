"use client";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerReimpresionesPorCajero, type FilaReimpresion } from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

/** Reimpresiones por ticket a partir de las cuales conviene hablar con el cajero. */
const UMBRAL = 2;
const razon = (f: FilaReimpresion) => (f.ticketsDistintos > 0 ? f.reimpresiones / f.ticketsDistintos : 0);

/** Antifraude: cajeros que reimprimen comandas con frecuencia (posible salida sin cobrar). */
export default function ReimpresionesPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta((r) => leerReimpresionesPorCajero(r.desde, r.hasta), rango);
  const filas = consulta.datos ?? [];

  const reimpresiones = filas.reduce((s, f) => s + f.reimpresiones, 0);
  const tickets = filas.reduce((s, f) => s + f.ticketsDistintos, 0);
  const aRevisar = filas.filter((f) => razon(f) >= UMBRAL).length;

  const cifras: Cifra[] = [
    { etiqueta: "Reimpresiones", valor: reimpresiones, tipo: "entero" },
    { etiqueta: "Tickets reimpresos", valor: tickets, tipo: "entero" },
    { etiqueta: "Por ticket", valor: tickets > 0 ? `${(reimpresiones / tickets).toFixed(1)}×` : "—", pie: "en promedio" },
    {
      etiqueta: "Cajeros a revisar",
      valor: aRevisar,
      tipo: "entero",
      tono: aRevisar > 0 ? "atencion" : "bien",
      pie: aRevisar > 0 ? `reimprimen ${UMBRAL} veces o más por ticket` : "nadie reimprime de más",
    },
  ];

  const columnas: Columna<FilaReimpresion>[] = [
    { id: "cajero", titulo: "Cajero", valor: (f) => f.cajero, ancho: 24 },
    { id: "reimpresiones", titulo: "Reimpresiones", tipo: "entero", valor: (f) => f.reimpresiones, total: "suma", enfasis: "fuerte" },
    { id: "tickets", titulo: "Tickets distintos", tipo: "entero", valor: (f) => f.ticketsDistintos, total: "suma" },
    {
      id: "razon",
      titulo: "Por ticket",
      tipo: "decimal",
      valor: razon,
      total: () => (tickets > 0 ? reimpresiones / tickets : 0),
      celda: (f) => (
        <span className={`rounded px-2 py-0.5 text-[12.5px] font-semibold tabular-nums ${razon(f) >= UMBRAL ? "bg-warning-soft text-warning" : "text-ink-2"}`}>
          {formatear(razon(f), "decimal")}×
        </span>
      ),
    },
  ];

  return (
    <ReporteMarco
      titulo="Reimpresiones por cajero"
      subtitulo="Reimprimir comandas con frecuencia puede esconder producto que salió sin cobrar."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.clave, orden: { id: "reimpresiones", dir: "desc" }, vacio: "Nadie reimprimió comandas en estas fechas." }}
    >
      <Nota>
        Con {UMBRAL} reimpresiones o más por ticket conviene revisar con el cajero. Cada reimpresión queda registrada con
        su fecha y su ticket.
      </Nota>
    </ReporteMarco>
  );
}
