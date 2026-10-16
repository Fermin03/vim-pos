"use client";
import { useModulos } from "../../../components/admin-shell";
import { PageBody, PageHeader } from "../../../components/page-header";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { useSucursalReporte } from "../../../components/selector-sucursal";
import { conExistencias } from "../../../lib/operacion";
import { leerVentasPorVariante, type FilaVariante } from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

const TITULO = "Ventas por talla y color";

/** Reporte del giro tienda: un restaurante que llega por enlace directo no lee nada de él. */
export default function VentasPorVariantePage() {
  const modulos = useModulos();
  if (modulos === null) return <PageBody><p className="text-13 text-ink-3">Cargando…</p></PageBody>;
  if (!conExistencias(modulos)) {
    return (
      <>
        <PageHeader titulo={TITULO} migas={[{ label: "Reportes", href: "/reportes" }, { label: TITULO }]} />
        <PageBody><p className="text-sm text-ink-2">Esta sección es para tiendas.</p></PageBody>
      </>
    );
  }
  return <Reporte />;
}

// Margen % de un grupo: solo con lo que tiene costo, para no mezclar subtotales sin margen.
function margenPct(filas: FilaVariante[]): number | null {
  let margen = 0, subtotal = 0;
  for (const f of filas) {
    if (f.margen_mxn === null) continue;
    margen += f.margen_mxn;
    subtotal += f.subtotal_mxn;
  }
  return subtotal > 0 ? (margen / subtotal) * 100 : null;
}

function Reporte() {
  const { rango, cambiar } = useRangoReporte();
  const sucursal = useSucursalReporte();
  const consulta = useConsulta((r) => leerVentasPorVariante(r.desde, r.hasta, sucursal.id), sucursal.listo ? rango : null, sucursal.clave);
  const filas = consulta.datos ?? [];

  const venta = filas.reduce((s, f) => s + f.venta_mxn, 0);
  const piezas = filas.reduce((s, f) => s + f.unidades, 0);
  const margen = filas.reduce((s, f) => s + (f.margen_mxn ?? 0), 0);
  const sinCosto = filas.filter((f) => f.costo_mxn === null).length;
  const top = filas[0];

  const cifras: Cifra[] = [
    { etiqueta: "Venta", valor: venta, tipo: "mxn" },
    { etiqueta: "Piezas", valor: piezas, tipo: "cantidad" },
    {
      etiqueta: "Margen",
      valor: Math.round(margen * 100) / 100,
      tipo: "mxn",
      pie: sinCosto > 0 ? `con el costo de hoy · ${sinCosto} sin costo` : "con el costo de hoy",
    },
    {
      etiqueta: "La que más vende",
      valor: top ? [top.producto, top.variante].filter(Boolean).join(" · ") : "—",
      pie: top ? `${formatear(top.unidades, "cantidad")} piezas · ${formatear(top.venta_mxn, "mxn")}` : undefined,
    },
  ];

  const columnas: Columna<FilaVariante>[] = [
    { id: "producto", titulo: "Producto", valor: (f) => f.producto, ancho: 30 },
    { id: "variante", titulo: "Variante", valor: (f) => f.variante || null, ancho: 20 },
    { id: "sku", titulo: "SKU", valor: (f) => f.sku, enfasis: "suave" },
    { id: "piezas", titulo: "Piezas", tipo: "cantidad", valor: (f) => f.unidades, total: "suma" },
    { id: "venta", titulo: "Venta", tipo: "mxn", valor: (f) => f.venta_mxn, total: "suma", enfasis: "fuerte" },
    { id: "costo", titulo: "Costo", tipo: "mxn", valor: (f) => f.costo_mxn, total: "suma", enfasis: "suave" },
    { id: "margen", titulo: "Margen", tipo: "mxn", valor: (f) => f.margen_mxn, total: "suma" },
    { id: "margen_pct", titulo: "Margen %", tipo: "pct", valor: (f) => f.margen_pct, total: margenPct, enfasis: "suave" },
  ];

  return (
    <ReporteMarco
      sucursal={sucursal}
      titulo={TITULO}
      subtitulo="Qué talla y color se vende más y cuánto te deja cada uno."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.producto_id, orden: { id: "venta", dir: "desc" }, vacio: "No hubo ventas en estas fechas." }}
    >
      <Nota>El margen usa el costo actual de cada producto, sin IVA.</Nota>
    </ReporteMarco>
  );
}
