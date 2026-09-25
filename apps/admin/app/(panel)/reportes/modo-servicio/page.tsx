"use client";
import { Barra, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerVentasPorModo, type FilaModo } from "../../../lib/reportes";
import { etiquetaModo } from "../../../lib/modo-servicio";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

export default function VentasPorModoServicioPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta((r) => leerVentasPorModo(r.desde, r.hasta), rango);
  const filas = consulta.datos ?? [];

  const venta = filas.reduce((s, f) => s + f.total_mxn, 0);
  const tickets = filas.reduce((s, f) => s + f.tickets, 0);
  const pct = (n: number) => (venta > 0 ? (n / venta) * 100 : 0);
  const principal = [...filas].sort((a, b) => b.total_mxn - a.total_mxn)[0];

  const cifras: Cifra[] = [
    { etiqueta: "Venta", valor: venta, tipo: "mxn" },
    { etiqueta: "Tickets", valor: tickets, tipo: "entero" },
    { etiqueta: "Ticket promedio", valor: tickets > 0 ? venta / tickets : 0, tipo: "mxn" },
    {
      etiqueta: "Lo que más vende",
      valor: principal ? etiquetaModo(principal.modo) : "—",
      pie: principal ? `${formatear(pct(principal.total_mxn), "pct")} de la venta` : undefined,
    },
  ];

  const columnas: Columna<FilaModo>[] = [
    { id: "modo", titulo: "Tipo de servicio", valor: (f) => etiquetaModo(f.modo), ancho: 24 },
    { id: "tickets", titulo: "Tickets", tipo: "entero", valor: (f) => f.tickets, total: "suma" },
    { id: "venta", titulo: "Venta", tipo: "mxn", valor: (f) => f.total_mxn, total: "suma", enfasis: "fuerte" },
    {
      id: "promedio",
      titulo: "Ticket promedio",
      tipo: "mxn",
      valor: (f) => (f.tickets > 0 ? f.total_mxn / f.tickets : 0),
      total: () => (tickets > 0 ? venta / tickets : 0),
      enfasis: "suave",
    },
    { id: "pct", titulo: "% de la venta", tipo: "pct", valor: (f) => pct(f.total_mxn), total: () => 100, celda: (f) => <Barra pct={pct(f.total_mxn)} /> },
  ];

  return (
    <ReporteMarco
      titulo="Ventas por tipo de servicio"
      subtitulo="Comer aquí, para llevar, a domicilio y apps de delivery: cuánto aporta cada uno."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.modo, orden: { id: "venta", dir: "desc" }, vacio: "No hubo ventas en estas fechas." }}
    />
  );
}
