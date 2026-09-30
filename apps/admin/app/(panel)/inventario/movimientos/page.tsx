"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Aviso } from "@vim/ui/styles";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { formatear, type Columna } from "../../../lib/reporte-tabla";
import { leerModuloInventario, listarSucursalesOpciones, type SucursalOpcion } from "../../../lib/inventario";
import {
  cifrasMovimientos,
  etiquetaTipo,
  fechaHoraMx,
  FILTROS_TIPO,
  leerMovimientos,
  leerTodosLosMovimientos,
  MOVIMIENTOS_POR_PAGINA,
  referenciaMovimiento,
  type FiltroTipo,
  type FiltrosMovimientos,
  type Movimiento,
} from "../../../lib/reportes-inventario";

const campo =
  "h-11 min-w-0 rounded border border-line-strong bg-surface px-2.5 text-13 outline-none focus:border-ink lg:h-9";
const botonPagina =
  "flex h-11 w-11 items-center justify-center rounded border border-line-strong text-15 font-semibold text-ink-2 transition hover:border-ink disabled:opacity-40 disabled:hover:border-line-strong lg:h-9 lg:w-9";

const veces = (n: number, uno: string, varios: string) => `${formatear(n, "entero")} ${n === 1 ? uno : varios}`;

/**
 * P-149 — Movimientos de inventario: todo lo que entró y salió, filtrable.
 *
 * A diferencia de los demás reportes, aquí no se baja el periodo entero: cada venta escribe un
 * movimiento por insumo de su receta y un mes son decenas de miles de filas. La tabla pide a la
 * base una página a la vez (ya filtrada y ordenada) y el Excel pide todas al descargar.
 */
export default function MovimientosInventarioPage() {
  const { rango, cambiar } = useRangoReporte();
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [descuenta, setDescuenta] = useState<boolean | null>(null);
  const [sucursalId, setSucursalId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  // Lo que se teclea y lo que se consulta: una consulta por pausa, no una por letra.
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    listarSucursalesOpciones().then(setSucursales).catch(() => {});
    leerModuloInventario().then(setDescuenta).catch(() => setDescuenta(null));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setBusqueda(texto);
      setPagina(1);
    }, 300);
    return () => clearTimeout(id);
  }, [texto]);

  const filtros: FiltrosMovimientos = { sucursalId, busqueda, tipo };
  const consulta = useConsulta((r) => leerMovimientos(r, filtros, pagina), rango, JSON.stringify([sucursalId, busqueda, tipo, pagina]));
  const datos = consulta.datos;
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / MOVIMIENTOS_POR_PAGINA));
  const c = cifrasMovimientos(datos?.resumen ?? []);
  const variasSucursales = sucursales.length > 1;
  const filtrando = busqueda.trim() !== "" || tipo !== "todos";

  // Cualquier filtro nuevo regresa a la primera página: la 7 de otro filtro puede no existir.
  const cambiarRango = (desde: string, hasta: string) => {
    setPagina(1);
    cambiar(desde, hasta);
  };

  const cifras: Cifra[] = [
    {
      etiqueta: "Compras",
      valor: c.compras,
      tipo: "mxn",
      pie: c.comprasMovs > 0 ? veces(c.comprasMovs, "entrada", "entradas") : "sin compras en estas fechas",
    },
    {
      etiqueta: "Consumo por ventas",
      valor: c.consumoVenta,
      tipo: "mxn",
      pie:
        c.ventaMovs > 0
          ? `${veces(c.ventaMovs, "movimiento", "movimientos")}, ya sin lo que regresó`
          : descuenta === false
            ? "el descuento al vender está apagado"
            : "sin ventas que descontaran",
    },
    {
      etiqueta: "Mermas",
      valor: c.mermas,
      tipo: "mxn",
      tono: c.mermas > 0 ? "atencion" : "neutro",
      pie: c.mermasMovs > 0 ? veces(c.mermasMovs, "registrada", "registradas") : "sin mermas",
    },
    {
      etiqueta: "Ajustes",
      valor: c.ajustes,
      tipo: "mxn",
      pie: c.ajustesMovs === 0 ? "sin ajustes" : c.ajustes >= 0 ? "a favor, en neto" : "en contra, en neto",
    },
  ];

  const columnas: Columna<Movimiento>[] = [
    {
      id: "fecha",
      titulo: "Fecha",
      valor: (m) => fechaHoraMx(m.fecha),
      enfasis: "suave",
      ancho: 20,
      celda: (m) => <span className="whitespace-nowrap">{fechaHoraMx(m.fecha)}</span>,
    },
    { id: "insumo", titulo: "Insumo", valor: (m) => m.insumo, ancho: 26 },
    { id: "tipo", titulo: "Movimiento", valor: (m) => etiquetaTipo(m.tipo), ancho: 20 },
    {
      id: "cantidad",
      titulo: "Cantidad",
      tipo: "cantidad",
      valor: (m) => m.cantidad,
      // Con signo y unidad: "+2 pza" entró, "-0.15 kg" salió (el mismo signo que el costo de al
      // lado). En el Excel la unidad va en su columna.
      celda: (m) => (
        <span className={`whitespace-nowrap ${m.cantidad > 0 ? "text-success" : ""}`}>
          {m.cantidad > 0 ? "+" : ""}
          {formatear(m.cantidad, "cantidad")} {m.unidad}
        </span>
      ),
    },
    { id: "unidad", titulo: "Unidad", valor: (m) => m.unidad || null, pantalla: false, ancho: 8 },
    { id: "costo", titulo: "Costo", tipo: "mxn", valor: (m) => m.costo, enfasis: "suave" },
    { id: "referencia", titulo: "Referencia", valor: (m) => referenciaMovimiento(m), enfasis: "suave", ancho: 40 },
    ...(variasSucursales ? [{ id: "sucursal", titulo: "Sucursal", valor: (m: Movimiento) => m.sucursal, enfasis: "suave" as const, ancho: 18 }] : []),
    { id: "usuario", titulo: "Quién", valor: (m) => m.usuario, enfasis: "suave", ancho: 18 },
  ];

  const filtrosUi = (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-line bg-surface p-3 lg:w-auto lg:flex-row lg:items-center">
      <input
        type="search"
        className={`${campo} lg:w-[200px]`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar insumo…"
        aria-label="Buscar insumo"
        maxLength={60}
      />
      <select
        className={campo}
        value={tipo}
        onChange={(e) => {
          setTipo(e.target.value as FiltroTipo);
          setPagina(1);
        }}
        aria-label="Tipo de movimiento"
      >
        {FILTROS_TIPO.map((f) => (
          <option key={f.id} value={f.id}>
            {f.etiqueta}
          </option>
        ))}
      </select>
      {variasSucursales && (
        <select
          className={campo}
          value={sucursalId ?? ""}
          onChange={(e) => {
            setSucursalId(e.target.value || null);
            setPagina(1);
          }}
          aria-label="Sucursal"
        >
          <option value="">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const primera = total === 0 ? 0 : (pagina - 1) * MOVIMIENTOS_POR_PAGINA + 1;
  const ultima = Math.min(total, pagina * MOVIMIENTOS_POR_PAGINA);

  return (
    <ReporteMarco
      titulo="Movimientos de inventario"
      subtitulo="Todo lo que entró y salió de tu inventario: compras, ventas, mermas y ajustes."
      migas={[{ label: "Inventario", href: "/inventario" }, { label: "Movimientos" }]}
      rango={{ valor: rango, cambiar: cambiarRango }}
      filtros={filtrosUi}
      consulta={consulta}
      cifras={cifras}
      antes={
        descuenta === false && (
          <Aviso tono="info" role="status" className="mb-4">
            El descuento de inventario al vender está apagado: mientras siga así, las ventas no
            aparecen aquí.{" "}
            <Link href="/inventario" className="underline underline-offset-2">
              Encenderlo en Inventario
            </Link>
          </Aviso>
        )
      }
      tabla={{
        columnas,
        filas,
        clave: (m) => m.id,
        ordenable: false,
        minimo: variasSucursales ? 1240 : 1100,
        vacio: filtrando ? "No hay movimientos que coincidan con tu búsqueda o filtro." : "No hubo movimientos en estas fechas.",
      }}
      filasExcel={rango ? () => leerTodosLosMovimientos(rango, filtros) : undefined}
    >
      {total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-13 text-ink-2 tabular-nums">
            Mostrando {formatear(primera, "entero")}–{formatear(ultima, "entero")} de {veces(total, "movimiento", "movimientos")}. El Excel
            descarga todos.
          </p>
          {paginas > 1 && (
            <div className="flex items-center gap-1">
              <button type="button" className={botonPagina} onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1 || consulta.cargando} aria-label="Página anterior">
                ‹
              </button>
              <span className="px-2 text-13 font-semibold tabular-nums">
                {pagina} / {paginas}
              </span>
              <button type="button" className={botonPagina} onClick={() => setPagina((p) => Math.min(paginas, p + 1))} disabled={pagina === paginas || consulta.cargando} aria-label="Página siguiente">
                ›
              </button>
            </div>
          )}
        </div>
      )}
      <Nota>
        Cantidades y costos son los que quedaron escritos en cada movimiento. «Regreso de venta» es
        lo que volvió al inventario por una cancelación o una devolución. Lo que se vende en la caja
        aparece aquí cuando la caja sincroniza.
      </Nota>
    </ReporteMarco>
  );
}
