"use client";
import { useEffect, useRef, useState } from "react";
import { useModulos } from "../../../components/admin-shell";
import { Segmentos } from "../../../components/controles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { Nota, ReporteMarco, Tabla, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { conAgenda } from "../../../lib/operacion";
import {
  leerComisiones, leerPeriodosComision, leerRenglonesComision, type FilaComision, type Periodo, type RenglonComision,
} from "../../../lib/reportes";
import { mensajeError } from "../../../lib/errores";
import type { Columna } from "../../../lib/reporte-tabla";

const TITULO = "Comisiones";

/** Reporte de belleza: un negocio sin agenda que llega por enlace directo no lee nada de él. */
export default function ComisionesPage() {
  const modulos = useModulos();
  if (modulos === null) return <PageBody><p className="text-13 text-ink-3">Cargando…</p></PageBody>;
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

const clave = (u: string, d: string, h: string) => `${u}|${d}|${h}`;
const igual = (a: Periodo | undefined, d: string, h: string) => !!a && a.desde === d && a.hasta === h;

const columnasRenglon: Columna<RenglonComision>[] = [
  { id: "fecha", titulo: "Fecha", tipo: "fecha", valor: (r) => r.fecha },
  { id: "producto", titulo: "Servicio o producto", valor: (r) => r.producto, celda: (r) => <>{r.producto}{!r.esServicio && <span className="ml-2 text-12 text-ink-3">producto</span>}</> },
  { id: "venta", titulo: "Venta sin IVA", tipo: "mxn", valor: (r) => r.venta, total: "suma" },
  { id: "base", titulo: "Base de la comisión", tipo: "mxn", valor: (r) => r.base, total: "suma", enfasis: "suave" },
  { id: "comision", titulo: "Comisión", tipo: "mxn", valor: (r) => r.comision, total: "suma", enfasis: "fuerte" },
];

/** La URL tal como llegó. Se lee antes que useRangoReporte, que recorta a hoy el fin del periodo actual. */
function urlInicial(): { desde: string | null; hasta: string | null } {
  const p = new URLSearchParams(window.location.search);
  return { desde: p.get("desde"), hasta: p.get("hasta") };
}

function Reporte() {
  // Este efecto va ANTES de useRangoReporte: los efectos corren en orden y aquel reescribe la URL.
  const url = useRef<{ desde: string | null; hasta: string | null } | null>(null);
  useEffect(() => { url.current ??= urlInicial(); }, []);
  const { rango, cambiar } = useRangoReporte();
  const [periodos, setPeriodos] = useState<{ actual: Periodo; anterior: Periodo } | null>(null);
  const [errorPeriodos, setErrorPeriodos] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [renglones, setRenglones] = useState<{ de: string; filas: RenglonComision[] } | null>(null);
  const [errorRenglones, setErrorRenglones] = useState<string | null>(null);

  // Abre en el periodo que corre (es lo que se va a pagar), salvo que la URL traiga otro rango: si
  // es un periodo se respeta tal cual, aunque termine después de hoy; si es libre, ya viene recortado.
  // Hasta saberlo no se consulta.
  useEffect(() => {
    leerPeriodosComision()
      .then((p) => {
        setPeriodos(p);
        const u = url.current;
        const dePeriodo = [p.actual, p.anterior].find((x) => x.desde === u?.desde && x.hasta === u?.hasta);
        if (dePeriodo) cambiar(dePeriodo.desde, dePeriodo.hasta);
        else if (!u?.desde || !u.hasta) cambiar(p.actual.desde, p.actual.hasta);
      })
      .catch(() => setErrorPeriodos(true));
  }, [cambiar]);

  const listo = periodos !== null || errorPeriodos;
  const consulta = useConsulta((r) => leerComisiones(r.desde, r.hasta), listo ? rango : null);
  const filas = consulta.datos?.filas ?? [];

  // Los renglones del colaborador elegido, con el rango que se ve.
  useEffect(() => {
    if (!sel || !rango) return;
    const de = clave(sel, rango.desde, rango.hasta);
    let vigente = true;
    setErrorRenglones(null);
    leerRenglonesComision(sel, rango.desde, rango.hasta)
      .then((f) => { if (vigente) setRenglones({ de, filas: f }); })
      .catch((e) => { if (vigente) setErrorRenglones(mensajeError(e, "No se pudieron leer sus ventas")); });
    return () => { vigente = false; };
  }, [sel, rango]);

  const suma = (k: keyof Pick<FilaComision, "ventas" | "comisionServicios" | "comisionProductos" | "sueldo" | "total">) => filas.reduce((s, f) => s + f[k], 0);
  const cifras: Cifra[] = [
    { etiqueta: "Total a pagar", valor: suma("total"), tipo: "mxn" },
    { etiqueta: "Comisiones", valor: suma("comisionServicios") + suma("comisionProductos"), tipo: "mxn" },
    { etiqueta: "Sueldos", valor: suma("sueldo"), tipo: "mxn" },
    { etiqueta: "Ventas sin IVA", valor: suma("ventas"), tipo: "mxn" },
  ];

  const elegido = filas.find((f) => f.clave === sel) ?? null;
  const columnas: Columna<FilaComision>[] = [
    {
      id: "colaborador", titulo: "Colaborador", valor: (f) => f.nombre, ancho: 24,
      celda: (f) => (
        <button type="button" onClick={() => setSel((s) => (s === f.clave ? null : f.clave))} aria-expanded={sel === f.clave}
          className="text-left font-semibold underline-offset-2 hover:underline">
          {f.nombre}
        </button>
      ),
    },
    { id: "servicios", titulo: "Servicios", tipo: "entero", valor: (f) => f.servicios, total: "suma" },
    { id: "ventas", titulo: "Ventas sin IVA", tipo: "mxn", valor: (f) => f.ventas, total: "suma", enfasis: "suave" },
    { id: "comServicios", titulo: "Comisión servicios", tipo: "mxn", valor: (f) => f.comisionServicios, total: "suma" },
    { id: "comProductos", titulo: "Comisión productos", tipo: "mxn", valor: (f) => f.comisionProductos, total: "suma" },
    { id: "sueldo", titulo: "Sueldo", tipo: "mxn", valor: (f) => f.sueldo, total: "suma" },
    { id: "total", titulo: "Total", tipo: "mxn", valor: (f) => f.total, total: "suma", enfasis: "fuerte" },
  ];

  const enPeriodo = rango ? (igual(periodos?.actual, rango.desde, rango.hasta) ? "actual" : igual(periodos?.anterior, rango.desde, rango.hasta) ? "anterior" : "") : "";
  const filtro = periodos && (
    <Segmentos grande etiqueta="Periodo" valor={enPeriodo}
      opciones={[{ v: "actual", l: "Periodo actual" }, { v: "anterior", l: "Periodo anterior" }]}
      onCambiar={(v) => { const p = v === "actual" ? periodos.actual : periodos.anterior; cambiar(p.desde, p.hasta); }} />
  ) || (errorPeriodos && (
    <p role="alert" className="w-full text-14 font-medium text-danger lg:w-auto lg:max-w-[420px] lg:self-center">
      No se pudo calcular el periodo de comisiones. Elige las fechas a mano; el sueldo solo se suma con un periodo completo.
    </p>
  ));

  return (
    <ReporteMarco
      titulo={TITULO}
      subtitulo="Cuánto se le paga a cada colaborador: comisiones y sueldo. Toca un nombre para ver de dónde sale."
      rango={{ valor: rango, cambiar }}
      filtros={filtro}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.clave, orden: { id: "total", dir: "desc" }, minimo: 880, vacio: "Nadie tiene comisiones en estas fechas." }}
    >
      {consulta.datos && !consulta.datos.esPeriodo && (
        <p className="mt-4 rounded-lg border border-line bg-warning-soft px-4 py-3 text-14 text-ink">
          Estas fechas no son un periodo completo, así que el sueldo sale en $0. Elige «Periodo actual» o «Periodo anterior» para sumarlo.
        </p>
      )}
      {elegido && (
        <section aria-labelledby="renglones-titulo" className="mt-6">
          <h2 id="renglones-titulo" className="mb-3 font-display text-15 font-semibold tracking-tight">Ventas de {elegido.nombre}</h2>
          {errorRenglones ? (
            <p role="alert" className="text-14 font-medium text-danger">{errorRenglones}</p>
          ) : !rango || renglones?.de !== clave(sel!, rango.desde, rango.hasta) ? (
            <p className="text-14 text-ink-2">Cargando…</p>
          ) : (
            <Tabla columnas={columnasRenglon} filas={renglones.filas} clave={(r) => r.clave} orden={{ id: "fecha", dir: "asc" }} vacio="Sin ventas en estas fechas." />
          )}
        </section>
      )}
      <Nota>
        Montos sin IVA. La comisión de cada venta se calcula con la regla que había al venderla; las canceladas no cuentan y las devoluciones la reducen.
      </Nota>
    </ReporteMarco>
  );
}
