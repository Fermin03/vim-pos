"use client";
import { useState } from "react";
import { Barra, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerConsolidadoPorSucursal, type AgruparPor, type FilaConsolidado } from "../../../lib/consolidado";
import type { Columna } from "../../../lib/reporte-tabla";
import { Segmentos } from "../../../components/controles";

/** Comparativo de la cadena: cada sucursal (o franquicia) una junto a otra. */
export default function ConsolidadoPage() {
  const { rango, cambiar } = useRangoReporte();
  const [agrupar, setAgrupar] = useState<AgruparPor>("sucursal");
  const consulta = useConsulta((r) => leerConsolidadoPorSucursal(r.desde, r.hasta, agrupar), rango, agrupar);
  const datos = consulta.datos;
  const filas = datos?.filas ?? [];
  const t = datos?.total;

  const cifras: Cifra[] = [
    { etiqueta: "Venta de la cadena", valor: t?.venta ?? 0, tipo: "mxn" },
    { etiqueta: "Tickets", valor: t?.tickets ?? 0, tipo: "entero" },
    { etiqueta: "Ticket promedio", valor: t?.ticketPromedio ?? 0, tipo: "mxn" },
    { etiqueta: "Propinas", valor: t?.propinas ?? 0, tipo: "mxn" },
  ];

  const nombre = agrupar === "sucursal" ? "Sucursal" : "Franquicia";
  const columnas: Columna<FilaConsolidado>[] = [
    { id: "nombre", titulo: nombre, valor: (f) => f.sucursal, ancho: 24 },
    { id: "tickets", titulo: "Tickets", tipo: "entero", valor: (f) => f.tickets, total: "suma" },
    { id: "venta", titulo: "Venta", tipo: "mxn", valor: (f) => f.venta, total: "suma", enfasis: "fuerte" },
    { id: "promedio", titulo: "Ticket promedio", tipo: "mxn", valor: (f) => f.ticketPromedio, total: () => t?.ticketPromedio ?? 0, enfasis: "suave" },
    { id: "propinas", titulo: "Propinas", tipo: "mxn", valor: (f) => f.propinas, total: "suma", enfasis: "suave" },
    { id: "descuentos", titulo: "Descuentos", tipo: "mxn", valor: (f) => f.descuentos, total: "suma", enfasis: "suave" },
    { id: "lealtad", titulo: "Lealtad", tipo: "mxn", valor: (f) => f.lealtad, total: "suma", enfasis: "suave" },
    { id: "devoluciones", titulo: "Devoluciones", tipo: "mxn", valor: (f) => f.devoluciones, total: "suma", enfasis: "suave" },
    { id: "pct", titulo: "% de la venta", tipo: "pct", valor: (f) => f.participacionPct, total: () => 100, celda: (f) => <Barra pct={f.participacionPct} /> },
  ];

  const filtro = (
    <Segmentos
      grande
      etiqueta="Agrupar por"
      opciones={[{ v: "sucursal", l: "Por sucursal" }, { v: "franquicia", l: "Por franquicia" }]}
      valor={agrupar}
      onCambiar={setAgrupar}
    />
  );

  return (
    <ReporteMarco
      titulo="Consolidado por sucursal"
      subtitulo="Venta, tickets y participación de cada sucursal, una junto a otra."
      rango={{ valor: rango, cambiar }}
      filtros={filtro}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.sucursalId, orden: { id: "venta", dir: "desc" }, minimo: 960, vacio: "No hubo ventas en estas fechas." }}
    />
  );
}
