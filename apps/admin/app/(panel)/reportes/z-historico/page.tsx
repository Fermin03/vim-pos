"use client";
import { useState } from "react";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { useSucursalReporte } from "../../../components/selector-sucursal";
import { leerZHistorico, type FilaZHistorico } from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";
import { Segmentos } from "../../../components/controles";

const cuadra = (n: number) => Math.abs(n) < 0.01;
// Faltante en rojo (es dinero que no está); sobrante en ámbar (hay que revisar, no se perdió nada).
const colorDif = (n: number) => (cuadra(n) ? "text-ink-2" : n < 0 ? "text-danger" : "text-warning");

export default function CortesDeTurnoPage() {
  const { rango, cambiar } = useRangoReporte();
  const sucursal = useSucursalReporte();
  const consulta = useConsulta((r) => leerZHistorico(r.desde, r.hasta, sucursal.id), sucursal.listo ? rango : null, sucursal.clave);
  const [soloDiferencia, setSoloDiferencia] = useState(false);
  const todas = consulta.datos ?? [];
  const filas = soloDiferencia ? todas.filter((f) => !cuadra(f.diferencia_efectivo)) : todas;

  const dif = todas.reduce((s, f) => s + f.diferencia_efectivo, 0);
  const conFaltante = todas.filter((f) => f.diferencia_efectivo < -0.01).length;
  const dias = new Set(todas.map((f) => f.dia_contable)).size;
  const porDia = dias > 0 ? todas.length / dias : 0;

  const cifras: Cifra[] = [
    {
      etiqueta: "Cortes",
      valor: todas.length,
      tipo: "entero",
      pie: dias > 0 ? `${porDia.toFixed(1).replace(/\.0$/, "")} por día` : "sin cierres en estas fechas",
    },
    { etiqueta: "Vendido", valor: todas.reduce((s, f) => s + f.total_ventas, 0), tipo: "mxn" },
    {
      etiqueta: "Diferencia de efectivo",
      valor: dif,
      tipo: "mxn",
      tono: todas.length === 0 ? "neutro" : cuadra(dif) ? "bien" : dif < 0 ? "mal" : "atencion",
      pie: todas.length === 0 ? undefined : cuadra(dif) ? "sin diferencia" : dif < 0 ? "faltante, sumando todos los cortes" : "sobrante, sumando todos los cortes",
    },
    {
      etiqueta: "Cortes con faltante",
      valor: `${conFaltante} de ${todas.length}`,
      tono: todas.length === 0 ? "neutro" : conFaltante > 0 ? "mal" : "bien",
      pie: todas.length === 0 ? undefined : conFaltante > 0 ? "revísalos con quien cerró" : "todo cuadrado",
    },
  ];

  const columnas: Columna<FilaZHistorico>[] = [
    { id: "folio", titulo: "Folio", valor: (f) => f.folio_z, ancho: 16, celda: (f) => <span className="font-mono text-13">{f.folio_z}</span> },
    { id: "dia", titulo: "Día", tipo: "fecha", valor: (f) => f.dia_contable, enfasis: "suave", ancho: 12 },
    { id: "caja", titulo: "Caja", valor: (f) => f.caja, enfasis: "suave" },
    { id: "cerro", titulo: "Cerró", valor: (f) => f.cerro, ancho: 18 },
    { id: "tickets", titulo: "Tickets", tipo: "entero", valor: (f) => f.total_tickets, total: "suma" },
    { id: "vendido", titulo: "Vendido", tipo: "mxn", valor: (f) => f.total_ventas, total: "suma" },
    { id: "propinas", titulo: "Propinas", tipo: "mxn", valor: (f) => f.total_propinas, total: "suma", enfasis: "suave" },
    { id: "esperado", titulo: "Efectivo esperado", tipo: "mxn", valor: (f) => f.efectivo_esperado, total: "suma", enfasis: "suave", ancho: 18 },
    { id: "contado", titulo: "Efectivo contado", tipo: "mxn", valor: (f) => f.efectivo_declarado, total: "suma", enfasis: "suave", ancho: 18 },
    {
      id: "diferencia",
      titulo: "Diferencia",
      tipo: "mxn",
      valor: (f) => f.diferencia_efectivo,
      total: "suma",
      celda: (f) => <span className={`font-semibold ${colorDif(f.diferencia_efectivo)}`}>{formatear(f.diferencia_efectivo, "mxn")}</span>,
    },
  ];

  const filtro = (
    <Segmentos
      grande
      etiqueta="Qué cortes mostrar"
      opciones={[{ v: false, l: "Todos" }, { v: true, l: "Con diferencia" }]}
      valor={soloDiferencia}
      onCambiar={setSoloDiferencia}
    />
  );

  return (
    <ReporteMarco
      sucursal={sucursal}
      titulo="Cortes de turno"
      subtitulo="Cada cierre de caja: lo vendido, el efectivo que debía haber contra el que se contó, y quién cerró."
      rango={{ valor: rango, cambiar }}
      filtros={filtro}
      consulta={consulta}
      cifras={cifras}
      tabla={{
        columnas,
        filas,
        clave: (f) => f.id,
        minimo: 1180,
        vacio: soloDiferencia && todas.length > 0 ? "Ningún corte de estas fechas tiene diferencia de efectivo." : "No hubo cortes en estas fechas.",
      }}
    >
      {soloDiferencia && todas.length > 0 && (
        <Nota>
          Mostrando {filas.length} de {todas.length} cortes. El Excel descarga lo que ves.
        </Nota>
      )}
    </ReporteMarco>
  );
}
