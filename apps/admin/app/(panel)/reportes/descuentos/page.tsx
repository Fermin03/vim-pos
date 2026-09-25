"use client";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerDescuentosPorUsuario, leerVentaDelPeriodo, type FilaDescuento } from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

export default function DescuentosPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta(
    async (r) => {
      const [filas, venta] = await Promise.all([leerDescuentosPorUsuario(r.desde, r.hasta), leerVentaDelPeriodo(r.desde, r.hasta)]);
      return { filas, venta };
    },
    rango,
  );
  const filas = consulta.datos?.filas ?? [];
  const venta = consulta.datos?.venta ?? 0;

  const total = filas.reduce((s, f) => s + f.total, 0);
  const cantidad = filas.reduce((s, f) => s + f.cantidad, 0);
  const mayor = filas[0];

  const cifras: Cifra[] = [
    { etiqueta: "Total descontado", valor: total, tipo: "mxn", pie: `${formatear(cantidad, "entero")} descuentos` },
    // Antes solo se daba el monto: sin la venta al lado no se sabe si $2,000 es mucho o poco.
    { etiqueta: "Frente a la venta", valor: venta > 0 ? (total / venta) * 100 : 0, tipo: "pct", pie: `de ${formatear(venta, "mxn")} vendidos` },
    { etiqueta: "Cortesías", valor: filas.reduce((s, f) => s + f.cortesias, 0), tipo: "entero", pie: "descuentos con motivo cortesía" },
    { etiqueta: "Quién descontó más", valor: mayor?.usuario ?? "—", pie: mayor ? formatear(mayor.total, "mxn") : undefined },
  ];

  const columnas: Columna<FilaDescuento>[] = [
    { id: "usuario", titulo: "Usuario", valor: (f) => f.usuario, ancho: 24 },
    { id: "cantidad", titulo: "Descuentos", tipo: "entero", valor: (f) => f.cantidad, total: "suma" },
    { id: "cortesias", titulo: "Cortesías", tipo: "entero", valor: (f) => f.cortesias, total: "suma", enfasis: "suave" },
    { id: "total", titulo: "Total descontado", tipo: "mxn", valor: (f) => f.total, total: "suma", enfasis: "fuerte", ancho: 18 },
    { id: "promedio", titulo: "Promedio", tipo: "mxn", valor: (f) => f.promedio, total: () => (cantidad > 0 ? total / cantidad : 0), enfasis: "suave" },
    { id: "pct", titulo: "% de lo descontado", tipo: "pct", valor: (f) => (total > 0 ? (f.total / total) * 100 : 0), total: () => 100, enfasis: "suave", ancho: 18 },
  ];

  return (
    <ReporteMarco
      titulo="Descuentos por usuario"
      subtitulo="Quién da descuentos y cortesías, y cuánto suman frente a la venta."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.clave, orden: { id: "total", dir: "desc" }, vacio: "No hubo descuentos en estas fechas." }}
    >
      <Nota>Cada descuento queda registrado con su motivo y su ticket. Si algo no cuadra, revísalo con la persona.</Nota>
    </ReporteMarco>
  );
}
