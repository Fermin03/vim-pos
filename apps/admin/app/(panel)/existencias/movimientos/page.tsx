"use client";
import { useMemo, useState } from "react";
import { Button, Icono } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { ExistenciasTabs } from "../../../components/existencias-tabs";
import { RangoFechas } from "../../../components/rango-fechas";
import { SelectorSucursal, useSucursalReporte } from "../../../components/selector-sucursal";
import { Cifras, Tabla, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { descargarXlsx } from "../../../lib/excel";
import { formatear, hojaDeReporte, nombreArchivo, type Columna } from "../../../lib/reporte-tabla";
import { fechaHoraMx } from "../../../lib/reportes-inventario";
import { listarMovimientosProducto, type MovimientoProducto } from "../../../lib/existencias";

const TIPO: Record<string, string> = {
  VENTA: "Venta",
  DEVOLUCION: "Devolución",
  ENTRADA: "Entrada",
  AJUSTE: "Ajuste",
  CONTEO: "Conteo",
  MERMA: "Merma",
  TRASPASO_SALIDA: "Sale a otra sucursal",
  TRASPASO_ENTRADA: "Llega de otra sucursal",
};

const FILTROS = [
  { id: "todos", etiqueta: "Todos", tipos: [] },
  { id: "ventas", etiqueta: "Ventas", tipos: ["VENTA"] },
  { id: "devoluciones", etiqueta: "Devoluciones", tipos: ["DEVOLUCION"] },
  { id: "entradas", etiqueta: "Entradas", tipos: ["ENTRADA"] },
  { id: "ajustes", etiqueta: "Ajustes y conteos", tipos: ["AJUSTE", "CONTEO"] },
  { id: "mermas", etiqueta: "Mermas", tipos: ["MERMA"] },
  { id: "traspasos", etiqueta: "Traspasos", tipos: ["TRASPASO_SALIDA", "TRASPASO_ENTRADA"] },
] as const;
type Filtro = (typeof FILTROS)[number]["id"];

const campo = "h-11 min-w-0 rounded border border-line-strong bg-surface px-2.5 text-13 outline-none focus:border-ink lg:h-9";

export default function MovimientosExistenciasPage() {
  const { rango, cambiar } = useRangoReporte();
  const sucursal = useSucursalReporte();
  const consulta = useConsulta((r) => listarMovimientosProducto(r.desde, r.hasta, sucursal.id), sucursal.listo ? rango : null, sucursal.clave);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [texto, setTexto] = useState("");

  const todos = consulta.datos ?? [];
  const visibles = useMemo(() => {
    const tipos: readonly string[] = FILTROS.find((f) => f.id === filtro)!.tipos;
    const t = texto.trim().toLowerCase();
    return todos.filter((m) => (tipos.length === 0 || tipos.includes(m.tipo)) && (!t || m.producto.toLowerCase().includes(t)));
  }, [todos, filtro, texto]);

  let entradas = 0, salidas = 0;
  for (const m of visibles) {
    if (m.cantidad > 0) entradas += m.cantidad;
    else salidas -= m.cantidad;
  }
  const cifras: Cifra[] = [
    { etiqueta: "Entradas", valor: entradas, tipo: "cantidad", pie: "piezas" },
    { etiqueta: "Salidas", valor: salidas, tipo: "cantidad", pie: "piezas" },
    { etiqueta: "Movimientos", valor: visibles.length, tipo: "entero" },
  ];

  const nombreSucursal = new Map(sucursal.sucursales.map((s) => [s.id, s.nombre]));
  const conSucursal = sucursal.id === null && sucursal.sucursales.length > 1;
  const columnas: Columna<MovimientoProducto>[] = [
    {
      id: "fecha",
      titulo: "Fecha y hora",
      valor: (m) => fechaHoraMx(m.creado_at),
      enfasis: "suave",
      ancho: 20,
      celda: (m) => <span className="whitespace-nowrap">{fechaHoraMx(m.creado_at)}</span>,
    },
    { id: "producto", titulo: "Producto", valor: (m) => m.producto, ancho: 32 },
    ...(conSucursal ? [{ id: "sucursal", titulo: "Sucursal", valor: (m: MovimientoProducto) => nombreSucursal.get(m.sucursal_id) ?? "—", enfasis: "suave" as const, ancho: 18 }] : []),
    { id: "tipo", titulo: "Tipo", valor: (m) => TIPO[m.tipo] ?? m.tipo, ancho: 22 },
    {
      id: "cantidad",
      titulo: "Cantidad",
      tipo: "cantidad",
      enfasis: "fuerte",
      valor: (m) => m.cantidad,
      celda: (m) => (
        <span className={`whitespace-nowrap ${m.cantidad > 0 ? "text-success" : ""}`}>
          {m.cantidad > 0 ? "+" : ""}
          {formatear(m.cantidad, "cantidad")}
        </span>
      ),
    },
    { id: "costo", titulo: "Costo unitario", tipo: "mxn", valor: (m) => m.costo_unitario_mxn, enfasis: "suave" },
    { id: "motivo", titulo: "Motivo", valor: (m) => m.motivo, enfasis: "suave", ancho: 30 },
  ];

  function exportar() {
    descargarXlsx(
      hojaDeReporte({ titulo: "Movimientos de existencias", rango, alcance: sucursal.alcance, cifras, columnas, filas: visibles }),
      nombreArchivo("Movimientos de existencias", rango, sucursal.alcance),
    );
  }

  return (
    <>
      <PageHeader
        titulo="Movimientos"
        subtitulo="Todo lo que entró y salió de tus existencias."
        right={
          <Button variant="ghost" onClick={exportar} disabled={visibles.length === 0}>
            <Icono nombre="descargar" className="h-4 w-4" />
            Descargar Excel
          </Button>
        }
      />
      <ExistenciasTabs />
      <PageBody>
        <div className="mb-5 flex flex-wrap items-start gap-3">
          <SelectorSucursal sucursal={sucursal} className="w-full lg:w-auto lg:self-center" />
          {rango && <RangoFechas desde={rango.desde} hasta={rango.hasta} onCambio={cambiar} />}
          <div className="flex w-full flex-col gap-2 rounded-lg border border-line bg-surface p-3 lg:w-auto lg:flex-row lg:items-center">
            <input
              type="search"
              className={`${campo} lg:w-[200px]`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar producto…"
              aria-label="Buscar producto"
              maxLength={60}
            />
            <select className={campo} value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Tipo de movimiento">
              {FILTROS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        {consulta.error && (
          <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
            <p className="flex-1 text-14 font-medium text-danger">{consulta.error}</p>
            <Button variant="ghost" onClick={consulta.reintentar} disabled={consulta.cargando}>
              {consulta.cargando ? "Reintentando…" : "Reintentar"}
            </Button>
          </div>
        )}

        {consulta.datos === null && !consulta.error && <p className="text-14 text-ink-2">Cargando…</p>}

        {consulta.datos !== null && (
          <div aria-busy={consulta.cargando} className={`transition-opacity duration-150 ${consulta.cargando ? "opacity-60" : ""}`}>
            <Cifras cifras={cifras} />
            <Tabla
              columnas={columnas}
              filas={visibles}
              clave={(m) => m.id}
              ordenable={false}
              minimo={conSucursal ? 1100 : 960}
              vacio={todos.length === 0 ? "Sin movimientos en estas fechas." : "Nada coincide con el filtro."}
            />
          </div>
        )}
      </PageBody>
    </>
  );
}
