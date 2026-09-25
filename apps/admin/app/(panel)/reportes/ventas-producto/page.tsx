"use client";
import { ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerVentasPorProducto, type FilaProducto } from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

export default function VentasPorProductoPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta((r) => leerVentasPorProducto(r.desde, r.hasta), rango);
  const filas = consulta.datos ?? [];

  const venta = filas.reduce((s, f) => s + f.total_mxn, 0);
  const unidades = filas.reduce((s, f) => s + f.unidades, 0);
  const pct = (n: number) => (venta > 0 ? (n / venta) * 100 : 0);
  const top = filas[0];

  const cifras: Cifra[] = [
    { etiqueta: "Venta de productos", valor: venta, tipo: "mxn" },
    { etiqueta: "Unidades vendidas", valor: unidades, tipo: "entero" },
    { etiqueta: "Productos distintos", valor: filas.length, tipo: "entero" },
    {
      etiqueta: "El que más vende",
      valor: top?.producto_nombre ?? "—",
      pie: top ? `${formatear(top.total_mxn, "mxn")} · ${formatear(pct(top.total_mxn), "pct")} de la venta` : undefined,
    },
  ];

  const columnas: Columna<FilaProducto>[] = [
    { id: "producto", titulo: "Producto", valor: (f) => f.producto_nombre, ancho: 34 },
    { id: "unidades", titulo: "Unidades", tipo: "entero", valor: (f) => f.unidades, total: "suma" },
    // Un ticket con dos productos cuenta en los dos: esta columna no se suma.
    { id: "tickets", titulo: "Tickets", tipo: "entero", valor: (f) => f.tickets_con_producto, enfasis: "suave" },
    { id: "venta", titulo: "Venta", tipo: "mxn", valor: (f) => f.total_mxn, total: "suma", enfasis: "fuerte" },
    { id: "pct", titulo: "% de la venta", tipo: "pct", valor: (f) => pct(f.total_mxn), total: () => 100, enfasis: "suave" },
  ];

  return (
    <ReporteMarco
      titulo="Ventas por producto"
      subtitulo="Qué se vende más: unidades, venta y la parte que aporta cada producto."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.producto_id, orden: { id: "venta", dir: "desc" }, vacio: "No hubo ventas en estas fechas." }}
    />
  );
}
