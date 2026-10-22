"use client";
import { Cargando } from "@vim/ui/styles";
import { useState } from "react";
import { useModulos } from "../../../components/admin-shell";
import { Segmentos } from "../../../components/controles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { conAgenda } from "../../../lib/operacion";
import { agruparVentasColaborador, leerVentasPorColaborador, type AgruparColaborador, type FilaVentaColaborador } from "../../../lib/reportes";
import { listarUsuarios } from "../../../lib/usuarios";
import type { Columna } from "../../../lib/reporte-tabla";

const TITULO = "Ventas por colaborador";

/** Reporte de belleza: un negocio sin agenda que llega por enlace directo no lee nada de él. */
export default function VentasPorColaboradorPage() {
  const modulos = useModulos();
  if (modulos === null) return <PageBody><Cargando /></PageBody>;
  if (!conAgenda(modulos)) {
    return (
      <>
        <PageHeader titulo={TITULO} migas={[{ label: "Reportes", href: "/reportes" }, { label: TITULO }]} />
        <PageBody><p className="text-sm text-ink-2">Este reporte es para negocios con agenda.</p></PageBody>
      </>
    );
  }
  return <Reporte />;
}

function Reporte() {
  const { rango, cambiar } = useRangoReporte();
  const [por, setPor] = useState<AgruparColaborador>("colaborador");
  const consulta = useConsulta(async (r) => {
    const [renglones, usuarios] = await Promise.all([leerVentasPorColaborador(r.desde, r.hasta), listarUsuarios()]);
    return { renglones, nombres: new Map(usuarios.map((u) => [u.id, u.nombre])) };
  }, rango);
  const filas = consulta.datos ? agruparVentasColaborador(consulta.datos.renglones, por, consulta.datos.nombres) : [];

  const ventas = filas.reduce((s, f) => s + f.ventas, 0);
  const tickets = new Set(consulta.datos?.renglones.map((r) => r.ticket_id)).size;
  const cifras: Cifra[] = [
    { etiqueta: "Ventas sin IVA", valor: ventas, tipo: "mxn" },
    { etiqueta: "Tickets", valor: tickets, tipo: "entero" },
    { etiqueta: "Ticket promedio sin IVA", valor: tickets > 0 ? ventas / tickets : 0, tipo: "mxn" },
  ];

  const columnas: Columna<FilaVentaColaborador>[] = [
    { id: "nombre", titulo: por === "colaborador" ? "Colaborador" : "Servicio o producto", valor: (f) => f.nombre, ancho: 28 },
    { id: "veces", titulo: "Vendidos", tipo: "entero", valor: (f) => f.veces, total: "suma" },
    { id: "tickets", titulo: "Tickets", tipo: "entero", valor: (f) => f.tickets, enfasis: "suave" },
    { id: "ventas", titulo: "Ventas sin IVA", tipo: "mxn", valor: (f) => f.ventas, total: "suma", enfasis: "fuerte" },
    {
      id: "pct", titulo: "% de las ventas", tipo: "pct",
      valor: (f) => (ventas > 0 ? (f.ventas / ventas) * 100 : 0), total: () => (ventas > 0 ? 100 : 0), enfasis: "suave",
    },
  ];

  return (
    <ReporteMarco
      titulo={TITULO}
      subtitulo="Qué vende cada colaborador y qué servicios se venden más."
      rango={{ valor: rango, cambiar }}
      filtros={<Segmentos grande etiqueta="Agrupar por" opciones={[{ v: "colaborador", l: "Por colaborador" }, { v: "servicio", l: "Por servicio" }]} valor={por} onCambiar={setPor} />}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.clave, orden: { id: "ventas", dir: "desc" }, vacio: "Ninguna venta con colaborador en estas fechas." }}
    >
      <Nota>Cuenta las ventas cobradas en las que la caja anotó quién atendió, sin IVA y ya con descuentos y devoluciones.</Nota>
    </ReporteMarco>
  );
}
