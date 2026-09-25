"use client";
import Link from "next/link";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerVentasAppsExternas, type FilaAppExterna } from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

// Los estados de la conciliación como los diría el dueño. "Sin match" no le decía nada.
const ESTADO: Record<string, { label: string; cls: string }> = {
  CONCILIADO_OK: { label: "Cuadra", cls: "bg-success-soft text-success" },
  CONCILIADO_CON_DIFERENCIA: { label: "Con diferencia", cls: "bg-warning-soft text-warning" },
  EN_LIQUIDACION_SIN_MATCH: { label: "Falta en la liquidación", cls: "bg-warning-soft text-warning" },
  NO_LIQUIDADO_TODAVIA: { label: "Aún no liquida", cls: "bg-sel text-ink-2" },
};
const POR_REVISAR = new Set(["CONCILIADO_CON_DIFERENCIA", "EN_LIQUIDACION_SIN_MATCH"]);

export default function AppsExternasPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta((r) => leerVentasAppsExternas(r.desde, r.hasta), rango);
  const filas = consulta.datos ?? [];

  const venta = filas.reduce((s, f) => s + f.totalPos, 0);
  const comision = filas.reduce((s, f) => s + f.comision, 0);
  const neto = filas.reduce((s, f) => s + f.netoApp, 0);
  const revisar = filas.filter((f) => POR_REVISAR.has(f.estado)).length;

  const cifras: Cifra[] = [
    { etiqueta: "Venta por apps", valor: venta, tipo: "mxn", pie: `${formatear(filas.length, "entero")} pedidos` },
    { etiqueta: "Comisiones", valor: comision, tipo: "mxn", pie: venta > 0 ? `${formatear((comision / venta) * 100, "pct")} de la venta` : undefined },
    { etiqueta: "Depositado por las apps", valor: neto, tipo: "mxn" },
    { etiqueta: "Pedidos por revisar", valor: revisar, tipo: "entero", tono: revisar > 0 ? "atencion" : "bien", pie: revisar > 0 ? "con diferencia o sin liquidar" : "todo cuadra" },
  ];

  const columnas: Columna<FilaAppExterna>[] = [
    { id: "dia", titulo: "Día", tipo: "fecha", valor: (f) => f.dia, ancho: 12 },
    { id: "app", titulo: "App", valor: (f) => f.app, enfasis: "fuerte" },
    { id: "folio", titulo: "Folio", valor: (f) => f.folioPos },
    { id: "folioApp", titulo: "Folio de la app", valor: (f) => f.folioApp, enfasis: "suave", ancho: 18 },
    { id: "total", titulo: "Venta", tipo: "mxn", valor: (f) => f.totalPos, total: "suma", enfasis: "fuerte" },
    { id: "comision", titulo: "Comisión", tipo: "mxn", valor: (f) => f.comision || null, total: "suma", enfasis: "suave" },
    { id: "neto", titulo: "Depositado", tipo: "mxn", valor: (f) => f.netoApp || null, total: "suma", enfasis: "suave" },
    {
      id: "estado",
      titulo: "Conciliación",
      valor: (f) => ESTADO[f.estado]?.label ?? f.estado,
      ancho: 22,
      celda: (f) => {
        const e = ESTADO[f.estado] ?? { label: f.estado, cls: "bg-sel text-ink-2" };
        return <span className={`whitespace-nowrap rounded px-2 py-0.5 text-[12px] font-semibold ${e.cls}`}>{e.label}</span>;
      },
    },
  ];

  return (
    <ReporteMarco
      titulo="Ventas por apps de delivery"
      subtitulo="Pedidos de Uber Eats, Rappi y DiDi: lo que se cobró en la caja, la comisión y lo que la app depositó."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.ticketId, orden: { id: "dia", dir: "desc" }, vacio: "No hubo pedidos por apps en estas fechas." }}
    >
      <Nota>
        La liquidación de cada app se captura en{" "}
        <Link href="/conciliacion" className="font-semibold text-ink underline underline-offset-2">Conciliación de apps</Link>; aquí se ve el
        resultado pedido por pedido.
      </Nota>
    </ReporteMarco>
  );
}
