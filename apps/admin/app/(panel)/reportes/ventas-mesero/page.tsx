"use client";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerVentasPorMesero, type FilaMesero } from "../../../lib/reportes";
import type { Columna } from "../../../lib/reporte-tabla";

export default function VentasPorMeseroPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta((r) => leerVentasPorMesero(r.desde, r.hasta), rango);
  const filas = consulta.datos ?? [];

  const venta = filas.reduce((s, f) => s + f.total, 0);
  const tickets = filas.reduce((s, f) => s + f.tickets, 0);
  const propinas = filas.reduce((s, f) => s + f.propinas, 0);

  const cifras: Cifra[] = [
    { etiqueta: "Venta atendida", valor: venta, tipo: "mxn" },
    { etiqueta: "Tickets", valor: tickets, tipo: "entero" },
    { etiqueta: "Ticket promedio", valor: tickets > 0 ? venta / tickets : 0, tipo: "mxn" },
    { etiqueta: "Propinas", valor: propinas, tipo: "mxn", pie: venta > 0 ? `${((propinas / venta) * 100).toFixed(1)}% de la venta` : undefined },
  ];

  const columnas: Columna<FilaMesero>[] = [
    { id: "mesero", titulo: "Mesero", valor: (f) => f.nombre, ancho: 24 },
    { id: "tickets", titulo: "Tickets", tipo: "entero", valor: (f) => f.tickets, total: "suma" },
    { id: "venta", titulo: "Venta", tipo: "mxn", valor: (f) => f.total, total: "suma", enfasis: "fuerte" },
    { id: "promedio", titulo: "Ticket promedio", tipo: "mxn", valor: (f) => f.promedio, total: () => (tickets > 0 ? venta / tickets : 0), enfasis: "suave" },
    { id: "propinas", titulo: "Propinas", tipo: "mxn", valor: (f) => f.propinas, total: "suma" },
    {
      id: "propinaPct",
      titulo: "Propina / venta",
      tipo: "pct",
      valor: (f) => (f.total > 0 ? (f.propinas / f.total) * 100 : 0),
      total: () => (venta > 0 ? (propinas / venta) * 100 : 0),
      enfasis: "suave",
    },
  ];

  return (
    <ReporteMarco
      titulo="Ventas por mesero"
      subtitulo="Tickets, venta y propinas de cada mesero."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.clave, orden: { id: "venta", dir: "desc" }, vacio: "Ningún ticket con mesero en estas fechas." }}
    >
      <Nota>Cuenta solo los tickets con mesero asignado, es decir, las cuentas de mesa.</Nota>
    </ReporteMarco>
  );
}
