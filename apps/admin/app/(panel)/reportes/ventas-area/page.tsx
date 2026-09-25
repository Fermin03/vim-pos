"use client";
import { Barra, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerVentasPorArea, type FilaArea } from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

// Sin estación asignada, la vista agrupa bajo "General".
const nombreEstacion = (a: string) => (a === "General" ? "Sin estación" : a);

export default function VentasPorEstacionPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta((r) => leerVentasPorArea(r.desde, r.hasta), rango);
  const filas = consulta.datos ?? [];

  const venta = filas.reduce((s, f) => s + f.total, 0);
  const pct = (n: number) => (venta > 0 ? (n / venta) * 100 : 0);
  const mayor = [...filas].sort((a, b) => b.unidades - a.unidades)[0];

  const cifras: Cifra[] = [
    { etiqueta: "Venta", valor: venta, tipo: "mxn" },
    { etiqueta: "Unidades preparadas", valor: filas.reduce((s, f) => s + f.unidades, 0), tipo: "entero" },
    {
      etiqueta: "La estación con más trabajo",
      valor: mayor ? nombreEstacion(mayor.area) : "—",
      pie: mayor ? `${formatear(mayor.unidades, "entero")} unidades` : undefined,
    },
  ];

  const columnas: Columna<FilaArea>[] = [
    { id: "estacion", titulo: "Estación", valor: (f) => nombreEstacion(f.area), ancho: 24 },
    { id: "unidades", titulo: "Unidades", tipo: "entero", valor: (f) => f.unidades, total: "suma" },
    // Un ticket que pasa por dos estaciones cuenta en las dos: no se suma.
    { id: "tickets", titulo: "Tickets", tipo: "entero", valor: (f) => f.tickets, enfasis: "suave" },
    { id: "venta", titulo: "Venta", tipo: "mxn", valor: (f) => f.total, total: "suma", enfasis: "fuerte" },
    { id: "pct", titulo: "% de la venta", tipo: "pct", valor: (f) => pct(f.total), total: () => 100, celda: (f) => <Barra pct={pct(f.total)} /> },
  ];

  return (
    <ReporteMarco
      titulo="Ventas por estación"
      subtitulo="Cuánto prepara y cuánto vende cada estación. Sirve para repartir el trabajo de la cocina."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.clave, orden: { id: "unidades", dir: "desc" }, vacio: "No hubo ventas en estas fechas." }}
    />
  );
}
