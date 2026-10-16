"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Icono, Modal } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../components/page-header";
import { ExistenciasTabs } from "../../components/existencias-tabs";
import { SelectorSucursal, useSucursalReporte } from "../../components/selector-sucursal";
import { Cifras, Tabla, useConsulta, type Cifra, type Rango } from "../../components/reporte";
import { AccionFila, Segmentos } from "../../components/controles";
import { input, label } from "../../components/campos";
import { mensajeError } from "../../lib/errores";
import { descargarXlsx } from "../../lib/excel";
import { formatear, hojaDeReporte, nombreArchivo, type Columna } from "../../lib/reporte-tabla";
import {
  estadoExistencia,
  fijarMinimo,
  listarExistencias,
  registrarMovimientoProducto,
  resumenExistencias,
  type FilaExistencia,
} from "../../lib/existencias";

// useConsulta solo lee con un rango; esta pantalla no tiene fechas.
const SIN_RANGO: Rango = { desde: "", hasta: "" };

type Filtro = "todas" | "bajo" | "agotadas" | "negativas";
const FILTROS: { v: Filtro; l: string }[] = [
  { v: "todas", l: "Todas" },
  { v: "bajo", l: "Bajo mínimo" },
  { v: "agotadas", l: "Agotadas" },
  { v: "negativas", l: "Negativas" },
];

function pasaFiltro(f: FilaExistencia, filtro: Filtro): boolean {
  const e = estadoExistencia(f.cantidad, f.minimo);
  if (filtro === "bajo") return f.minimo !== null && (e === "bajo" || e === "agotada");
  if (filtro === "agotadas") return e === "agotada";
  if (filtro === "negativas") return e === "negativa";
  return true;
}

const COLOR_ESTADO = { negativa: "text-danger", agotada: "text-warning", bajo: "text-warning", ok: "" } as const;

const campoBuscar =
  "h-11 w-full min-w-0 rounded border border-line-strong bg-surface pl-9 pr-3 text-13 outline-none transition-colors focus:border-ink lg:h-9 lg:w-72";

export default function ExistenciasPage() {
  const sucursal = useSucursalReporte();
  const consulta = useConsulta(() => listarExistencias(sucursal.id), sucursal.listo ? SIN_RANGO : null, sucursal.clave);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState<{ fila: FilaExistencia; que: "minimo" | "ajuste" } | null>(null);

  const todas = consulta.datos ?? [];
  const r = resumenExistencias(todas);
  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return todas.filter(
      (f) =>
        pasaFiltro(f, filtro) &&
        (!t || `${f.nombre_completo} ${f.producto_nombre} ${f.codigo_interno ?? ""} ${f.codigo_barras ?? ""}`.toLowerCase().includes(t)),
    );
  }, [todas, filtro, texto]);

  const variasSucursales = sucursal.sucursales.length > 1;
  const enTodas = sucursal.id === null;

  const cifras: Cifra[] = [
    { etiqueta: "Piezas", valor: r.piezas, tipo: "cantidad" },
    { etiqueta: "Valor del inventario", valor: r.valor_mxn, tipo: "mxn", pie: "con el costo de hoy" },
    { etiqueta: "Bajo mínimo", valor: r.bajo, tipo: "entero", tono: r.bajo > 0 ? "atencion" : "neutro" },
    { etiqueta: "En negativo", valor: r.negativas, tipo: "entero", tono: r.negativas > 0 ? "mal" : "neutro" },
  ];

  const columnas: Columna<FilaExistencia>[] = [
    {
      id: "producto",
      titulo: "Producto",
      valor: (f) => f.nombre_completo || f.producto_nombre,
      ancho: 32,
      celda: (f) => (
        <>
          <span className="block">{f.producto_nombre}</span>
          {f.variante && <span className="block text-13 font-normal text-ink-2">{f.variante}</span>}
        </>
      ),
    },
    { id: "sku", titulo: "SKU", valor: (f) => f.codigo_interno, enfasis: "suave" },
    ...(enTodas && variasSucursales ? [{ id: "sucursal", titulo: "Sucursal", valor: (f: FilaExistencia) => f.sucursal_nombre }] : []),
    {
      id: "existencia",
      titulo: "Existencia",
      tipo: "cantidad",
      enfasis: "fuerte",
      valor: (f) => f.cantidad,
      celda: (f) => <span className={COLOR_ESTADO[estadoExistencia(f.cantidad, f.minimo)]}>{formatear(f.cantidad, "cantidad")}</span>,
    },
    { id: "minimo", titulo: "Mínimo", tipo: "cantidad", valor: (f) => f.minimo },
    { id: "costo", titulo: "Costo", tipo: "mxn", valor: (f) => f.costo_mxn, enfasis: "suave" },
    { id: "valor", titulo: "Valor", tipo: "mxn", valor: (f) => f.valor_mxn },
  ];
  const conAcciones: Columna<FilaExistencia>[] = [
    ...columnas,
    {
      id: "acciones",
      titulo: "",
      valor: () => null,
      celda: (f) => (
        <span className="flex justify-end gap-3 whitespace-nowrap">
          <AccionFila disabled={enTodas} onClick={() => setEditando({ fila: f, que: "minimo" })}>Mínimo</AccionFila>
          <AccionFila disabled={enTodas} onClick={() => setEditando({ fila: f, que: "ajuste" })}>Ajustar</AccionFila>
        </span>
      ),
    },
  ];

  function exportar() {
    descargarXlsx(
      hojaDeReporte({ titulo: "Existencias", alcance: sucursal.alcance, cifras, columnas, filas: visibles }),
      nombreArchivo("Existencias", null, sucursal.alcance),
    );
  }

  const hecho = () => {
    setEditando(null);
    consulta.reintentar();
  };

  return (
    <>
      <PageHeader
        titulo="Existencias"
        subtitulo="Cuánto te queda de cada producto en cada sucursal y cuánto vale."
        right={
          <Button variant="ghost" onClick={exportar} disabled={visibles.length === 0}>
            <Icono nombre="descargar" className="h-4 w-4" />
            Descargar Excel
          </Button>
        }
      />
      <ExistenciasTabs />
      <PageBody>
        {consulta.error && (
          <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
            <p className="flex-1 text-14 font-medium text-danger">{consulta.error}</p>
            <Button variant="ghost" onClick={consulta.reintentar} disabled={consulta.cargando}>
              {consulta.cargando ? "Reintentando…" : "Reintentar"}
            </Button>
          </div>
        )}

        {consulta.datos === null && !consulta.error && <p className="text-14 text-ink-2">Cargando…</p>}

        {consulta.datos !== null && todas.length === 0 && (
          <p className="max-w-xl text-14 text-ink-2">
            Todavía no hay productos que lleven existencias. Márcalos en el producto o impórtalos desde{" "}
            <Link href="/catalogo/importar-tienda" className="font-semibold text-ink underline underline-offset-2">
              Catálogo → Importar tienda
            </Link>
            .
          </p>
        )}

        {consulta.datos !== null && todas.length > 0 && (
          <div aria-busy={consulta.cargando} className={`transition-opacity duration-150 ${consulta.cargando ? "opacity-60" : ""}`}>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <SelectorSucursal sucursal={sucursal} className="w-full lg:w-auto" />
              <Segmentos etiqueta="Mostrar" opciones={FILTROS} valor={filtro} onCambiar={setFiltro} grande />
              <label className="relative w-full lg:w-auto">
                <span className="sr-only">Buscar</span>
                <Icono nombre="buscar" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input className={campoBuscar} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, SKU o código" />
              </label>
            </div>
            <Cifras cifras={cifras} />
            {enTodas && variasSucursales && <p className="mb-3 text-13 text-ink-2">Elige una sucursal para ajustar.</p>}
            <Tabla columnas={conAcciones} filas={visibles} clave={(f) => `${f.sucursal_id}:${f.producto_id}`} ordenable={false} vacio="Nada coincide con el filtro." />
          </div>
        )}

        {editando?.que === "minimo" && <ModalMinimo fila={editando.fila} onHecho={hecho} onCerrar={() => setEditando(null)} />}
        {editando?.que === "ajuste" && <ModalAjuste fila={editando.fila} onHecho={hecho} onCerrar={() => setEditando(null)} />}
      </PageBody>
    </>
  );
}

const tarjeta = "w-full max-w-[420px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]";

function Encabezado({ titulo, fila }: { titulo: string; fila: FilaExistencia }) {
  return (
    <div className="mb-4">
      <p aria-hidden="true" className="font-display text-xl font-semibold tracking-tight">{titulo}</p>
      <p className="mt-0.5 text-13 text-ink-3">
        {fila.nombre_completo || fila.producto_nombre} · {fila.sucursal_nombre} · hay {formatear(fila.cantidad, "cantidad")}
      </p>
    </div>
  );
}

function ModalMinimo({ fila, onHecho, onCerrar }: { fila: FilaExistencia; onHecho: () => void; onCerrar: () => void }) {
  const [valor, setValor] = useState(fila.minimo === null ? "" : String(fila.minimo));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(minimo: number | null) {
    setError(null);
    if (minimo !== null && !(Number.isFinite(minimo) && minimo >= 0)) {
      setError("Escribe un mínimo de 0 o más");
      return;
    }
    setGuardando(true);
    try {
      await fijarMinimo(fila.sucursal_id, fila.producto_id, minimo);
      onHecho();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar el mínimo"));
      setGuardando(false);
    }
  }

  return (
    <Modal open hideTitle onClose={onCerrar} title="Mínimo" className={tarjeta}>
      <Encabezado titulo="Mínimo" fila={fila} />
      <div className="mb-4">
        <label className={label} htmlFor="e-min">Avisar cuando queden</label>
        <input id="e-min" className={input} value={valor} inputMode="decimal" onChange={(e) => setValor(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
      </div>
      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {fila.minimo !== null && (
          <Button variant="ghost" className="mr-auto" onClick={() => void guardar(null)} disabled={guardando}>Quitar mínimo</Button>
        )}
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button onClick={() => void guardar(valor.trim() === "" ? Number.NaN : Number(valor))} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </Modal>
  );
}

type TipoAjuste = "ENTRADA" | "MERMA" | "AJUSTE";
const TIPOS: { v: TipoAjuste; l: string }[] = [
  { v: "ENTRADA", l: "Entrada" },
  { v: "MERMA", l: "Merma" },
  { v: "AJUSTE", l: "Ajuste" },
];

function ModalAjuste({ fila, onHecho, onCerrar }: { fila: FilaExistencia; onHecho: () => void; onCerrar: () => void }) {
  const [tipo, setTipo] = useState<TipoAjuste>("ENTRADA");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState(fila.costo_mxn === null ? "" : String(fila.costo_mxn));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function registrar() {
    setError(null);
    const cant = Number(cantidad);
    if (cantidad.trim() === "" || !Number.isFinite(cant) || cant === 0 || (tipo !== "AJUSTE" && cant < 0)) {
      setError(tipo === "AJUSTE" ? "Escribe una cantidad distinta de 0" : "Escribe una cantidad mayor a 0");
      return;
    }
    const c = tipo === "ENTRADA" && costo.trim() !== "" ? Number(costo) : null;
    if (c !== null && !(Number.isFinite(c) && c >= 0)) {
      setError("Revisa el costo");
      return;
    }
    setProcesando(true);
    try {
      await registrarMovimientoProducto(fila.sucursal_id, fila.producto_id, tipo, cant, c, motivo.trim() || null);
      onHecho();
    } catch (e) {
      setError(mensajeError(e, "No se pudo registrar"));
      setProcesando(false);
    }
  }

  return (
    <Modal open hideTitle onClose={onCerrar} title="Ajustar existencia" className={tarjeta}>
      <Encabezado titulo="Ajustar existencia" fila={fila} />
      <Segmentos etiqueta="Tipo" opciones={TIPOS} valor={tipo} onCambiar={setTipo} className="mb-3 flex w-full [&>button]:flex-1" />
      <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="e-cant">Cantidad</label>
          <input
            id="e-cant"
            className={input}
            value={cantidad}
            inputMode={tipo === "AJUSTE" ? "text" : "decimal"}
            onChange={(e) => setCantidad(e.target.value.replace(tipo === "AJUSTE" ? /[^0-9.-]/g : /[^0-9.]/g, ""))}
            placeholder={tipo === "AJUSTE" ? "-2 o 3" : "0"}
          />
        </div>
        {tipo === "ENTRADA" && (
          <div>
            <label className={label} htmlFor="e-costo">Costo unitario · opcional</label>
            <input id="e-costo" className={input} value={costo} inputMode="decimal" onChange={(e) => setCosto(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" />
          </div>
        )}
      </div>
      {tipo === "AJUSTE" && <p className="mb-3 text-13 text-ink-3">Con signo menos, resta.</p>}
      <div className="mb-4">
        <label className={label} htmlFor="e-mot">Motivo · opcional</label>
        <input id="e-mot" className={input} value={motivo} maxLength={150} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. prenda dañada" />
      </div>
      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Cancelar</Button>
        <Button onClick={() => void registrar()} disabled={procesando}>{procesando ? "Registrando…" : "Registrar"}</Button>
      </div>
    </Modal>
  );
}
