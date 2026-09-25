"use client";
import { Barra, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerVentasPorMarca, type FilaMarca } from "../../../lib/reportes";
import type { Columna } from "../../../lib/reporte-tabla";

export default function VentasPorMarcaPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta((r) => leerVentasPorMarca(r.desde, r.hasta), rango);
  const filas = consulta.datos ?? [];

  const venta = filas.reduce((s, f) => s + f.total, 0);
  const tickets = filas.reduce((s, f) => s + f.tickets, 0);
  const pct = (n: number) => (venta > 0 ? (n / venta) * 100 : 0);

  const cifras: Cifra[] = [
    { etiqueta: "Venta neta", valor: venta, tipo: "mxn" },
    { etiqueta: "Tickets", valor: tickets, tipo: "entero" },
    { etiqueta: "Ticket promedio", valor: tickets > 0 ? venta / tickets : 0, tipo: "mxn" },
    { etiqueta: "Marcas con venta", valor: filas.filter((f) => f.total > 0).length, tipo: "entero" },
  ];

  const columnas: Columna<FilaMarca>[] = [
    {
      id: "marca",
      titulo: "Marca",
      valor: (f) => f.nombre,
      ancho: 26,
      celda: (f) => (
        <>
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: f.color }} aria-hidden="true" />
          {f.nombre}
        </>
      ),
    },
    { id: "tickets", titulo: "Tickets", tipo: "entero", valor: (f) => f.tickets, total: "suma" },
    { id: "venta", titulo: "Venta neta", tipo: "mxn", valor: (f) => f.total, total: "suma", enfasis: "fuerte" },
    { id: "promedio", titulo: "Ticket promedio", tipo: "mxn", valor: (f) => f.promedio, total: () => (tickets > 0 ? venta / tickets : 0), enfasis: "suave" },
    { id: "pct", titulo: "% de la venta", tipo: "pct", valor: (f) => pct(f.total), total: () => 100, celda: (f) => <Barra pct={pct(f.total)} /> },
  ];

  return (
    <ReporteMarco
      titulo="Ventas por marca virtual"
      subtitulo="Cómo le va a cada marca que opera desde tu cocina."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.clave, orden: { id: "venta", dir: "desc" }, vacio: "Ninguna marca vendió en estas fechas." }}
    />
  );
}
