"use client";
import { Barra, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerVentasPorCategoria, type FilaCategoria } from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

export default function VentasPorCategoriaPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta((r) => leerVentasPorCategoria(r.desde, r.hasta), rango);
  const filas = consulta.datos ?? [];

  const venta = filas.reduce((s, f) => s + f.total_mxn, 0);
  const pct = (n: number) => (venta > 0 ? (n / venta) * 100 : 0);
  const lider = [...filas].sort((a, b) => b.total_mxn - a.total_mxn)[0];

  const cifras: Cifra[] = [
    { etiqueta: "Venta", valor: venta, tipo: "mxn" },
    { etiqueta: "Unidades vendidas", valor: filas.reduce((s, f) => s + f.unidades, 0), tipo: "entero" },
    {
      etiqueta: "Categoría que más vende",
      valor: lider?.categoria ?? "—",
      pie: lider ? `${formatear(pct(lider.total_mxn), "pct")} de la venta` : undefined,
    },
  ];

  const columnas: Columna<FilaCategoria>[] = [
    { id: "categoria", titulo: "Categoría", valor: (f) => f.categoria, ancho: 28 },
    { id: "unidades", titulo: "Unidades", tipo: "entero", valor: (f) => f.unidades, total: "suma" },
    // Un ticket con productos de dos categorías cuenta en las dos: no se suma (antes sí).
    { id: "tickets", titulo: "Tickets", tipo: "entero", valor: (f) => f.tickets, enfasis: "suave" },
    { id: "venta", titulo: "Venta", tipo: "mxn", valor: (f) => f.total_mxn, total: "suma", enfasis: "fuerte" },
    {
      id: "pct",
      titulo: "% de la venta",
      tipo: "pct",
      valor: (f) => pct(f.total_mxn),
      total: () => 100,
      celda: (f) => <Barra pct={pct(f.total_mxn)} />,
    },
  ];

  return (
    <ReporteMarco
      titulo="Ventas por categoría"
      subtitulo="La venta repartida por las categorías de tu menú."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.categoria, orden: { id: "venta", dir: "desc" }, vacio: "No hubo ventas en estas fechas." }}
    />
  );
}
