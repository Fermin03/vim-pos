"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Aviso, StatusChip, type TonoEstado } from "@vim/ui/styles";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { formatear, type Columna } from "../../../lib/reporte-tabla";
import { leerModuloInventario, listarSucursalesOpciones, type SucursalOpcion } from "../../../lib/inventario";
import {
  agruparCostoVentas,
  estadoCosto,
  leerCostoVentas,
  margenDe,
  totalesCostoVentas,
  type AgruparPor,
  type FilaCosto,
} from "../../../lib/reportes-inventario";

const campo = "h-11 min-w-0 rounded border border-line-strong bg-surface px-2.5 text-13 outline-none focus:border-ink lg:h-9";
const mxn = (n: number) => formatear(n, "mxn");
const pct = (n: number) => formatear(n, "pct");

type Etiqueta = { texto: string; tono: TonoEstado };

/**
 * Lo que hay que saber de una fila antes de creerle el margen. Lo normal (todo con costo, nada
 * estimado) no lleva etiqueta: así las que sí llevan se ven.
 */
function etiquetas(f: FilaCosto, por: AgruparPor): Etiqueta[] {
  const out: Etiqueta[] = [];
  if (por === "categoria") {
    if (f.productosSinCosto > 0) out.push({ texto: `${f.productosSinCosto} sin costo`, tono: "warning" });
  } else {
    const e = estadoCosto(f);
    if (e === "sin_producto") out.push({ texto: "Sin producto", tono: "neutral" });
    if (e === "sin_receta") out.push({ texto: "Sin receta: sin costo", tono: "neutral" });
    if (e === "sin_consumo") out.push({ texto: "Sin consumo registrado", tono: "warning" });
    if (e === "parcial") {
      out.push({ texto: `Costo en ${formatear(f.unidadesConCosto, "cantidad")} de ${formatear(f.unidades, "cantidad")}`, tono: "warning" });
    }
  }
  if (f.insumoSinCosto) out.push({ texto: "Insumo sin costo", tono: "warning" });
  if (f.costoRepartido > 0 && !f.sinProducto) out.push({ texto: "Receta cambió", tono: "info" });
  if (f.costoEstimado > 0) out.push({ texto: "Costo estimado", tono: "info" });
  return out;
}

/**
 * P-150 — Costo de ventas y margen por periodo.
 *
 * El cálculo vive en la base (reporte_costo_ventas, 0129) y explica ahí sus reglas; esta pantalla
 * solo agrupa, suma y, sobre todo, NO presenta como margen del 100 % la venta que no tiene costo.
 */
export default function CostoVentasPage() {
  const { rango, cambiar } = useRangoReporte();
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [sucursalId, setSucursalId] = useState<string | null>(null);
  const [agrupar, setAgrupar] = useState<AgruparPor>("producto");
  const [descuenta, setDescuenta] = useState<boolean | null>(null);

  useEffect(() => {
    listarSucursalesOpciones().then(setSucursales).catch(() => {});
    leerModuloInventario().then(setDescuenta).catch(() => setDescuenta(null));
  }, []);

  const consulta = useConsulta((r) => leerCostoVentas(r.desde, r.hasta, sucursalId), rango, sucursalId ?? "");
  const crudas = consulta.datos;
  const porProducto = useMemo(() => agruparCostoVentas(crudas ?? [], "producto"), [crudas]);
  const filas = useMemo(() => (agrupar === "producto" ? porProducto : agruparCostoVentas(crudas ?? [], "categoria")), [agrupar, porProducto, crudas]);
  const t = totalesCostoVentas(porProducto);
  const hayCosto = t.ventaConCosto > 0 || t.costo > 0;

  const cifras: Cifra[] = [
    { etiqueta: "Venta sin IVA", valor: t.venta, tipo: "mxn", pie: "ya sin descuentos ni devoluciones" },
    {
      etiqueta: "Costo de lo vendido",
      valor: t.costo,
      tipo: "mxn",
      pie: t.costoPct === null ? "sin consumo registrado" : `${pct(t.costoPct)} de la venta con costo`,
    },
    {
      etiqueta: "Margen bruto",
      valor: hayCosto ? t.margen : null,
      tipo: "mxn",
      tono: hayCosto && t.margen < 0 ? "mal" : "neutro",
      pie: t.margenPct === null ? "falta costo para calcularlo" : `${pct(t.margenPct)} sobre la venta con costo`,
    },
    {
      etiqueta: "Venta sin costo",
      valor: t.ventaSinCosto,
      tipo: "mxn",
      tono: t.ventaSinCosto > 0 ? "atencion" : t.venta > 0 ? "bien" : "neutro",
      pie:
        t.productosSinCosto > 0
          ? `${formatear(t.productosSinCosto, "entero")} ${t.productosSinCosto === 1 ? "producto" : "productos"} sin receta o sin consumo`
          : t.venta > 0
            ? "todo lo vendido tiene costo"
            : undefined,
    },
  ];

  const porCategoria = agrupar === "categoria";
  const columnas: Columna<FilaCosto>[] = [
    { id: "nombre", titulo: porCategoria ? "Categoría" : "Producto", valor: (f) => f.nombre, ancho: 30 },
    porCategoria
      ? { id: "productos", titulo: "Productos", tipo: "entero", valor: (f) => f.productos, enfasis: "suave" }
      : { id: "categoria", titulo: "Categoría", valor: (f) => f.categoria, enfasis: "suave", ancho: 18 },
    { id: "unidades", titulo: "Unidades", tipo: "cantidad", valor: (f) => f.unidades, total: "suma" },
    { id: "venta", titulo: "Venta sin IVA", tipo: "mxn", valor: (f) => f.venta, total: "suma" },
    // El margen se calcula contra esta: en pantalla lo explica la etiqueta "Costo en X de Y".
    { id: "venta-costo", titulo: "Venta con costo", tipo: "mxn", valor: (f) => f.ventaConCosto, total: "suma", pantalla: false },
    {
      id: "costo",
      titulo: "Costo",
      tipo: "mxn",
      valor: (f) => (f.costo === 0 && f.unidadesConCosto <= 0 ? null : f.costo),
      total: () => (hayCosto ? t.costo : null),
    },
    {
      id: "margen",
      titulo: "Margen",
      tipo: "mxn",
      valor: (f) => margenDe(f).pesos,
      total: () => (hayCosto ? t.margen : null),
      enfasis: "fuerte",
      celda: (f) => {
        const m = margenDe(f).pesos;
        return <span className={m !== null && m < 0 ? "text-danger" : ""}>{formatear(m, "mxn")}</span>;
      },
    },
    {
      id: "margen-pct",
      titulo: "Margen %",
      tipo: "pct",
      valor: (f) => margenDe(f).pct,
      total: () => t.margenPct,
      celda: (f) => {
        const p = margenDe(f).pct;
        return <span className={p !== null && p < 0 ? "text-danger" : ""}>{formatear(p, "pct")}</span>;
      },
    },
    {
      id: "estado",
      titulo: "Estado",
      valor: (f) => etiquetas(f, agrupar).map((e) => e.texto).join(" · ") || null,
      ancho: 30,
      celda: (f) => {
        const es = etiquetas(f, agrupar);
        if (es.length === 0) return <span className="text-ink-3">—</span>;
        // -my-0.5: la etiqueta es más alta que una línea de texto y alargaba solo esos renglones.
        return (
          <span className="-my-0.5 flex flex-wrap gap-1">
            {es.map((e) => (
              <StatusChip key={e.texto} tone={e.tono}>
                {e.texto}
              </StatusChip>
            ))}
          </span>
        );
      },
    },
  ];

  const filtrosUi = (
    <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-start">
      <div role="group" aria-label="Agrupar por" className="inline-flex gap-0.5 self-start rounded border border-line bg-hover p-[3px]">
        {(["producto", "categoria"] as const).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={agrupar === a}
            onClick={() => setAgrupar(a)}
            className={`min-h-[40px] whitespace-nowrap rounded-[4px] px-3 text-13 font-semibold transition-colors ${agrupar === a ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
          >
            {a === "producto" ? "Por producto" : "Por categoría"}
          </button>
        ))}
      </div>
      {sucursales.length > 1 && (
        <select className={campo} value={sucursalId ?? ""} onChange={(e) => setSucursalId(e.target.value || null)} aria-label="Sucursal">
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

  return (
    <ReporteMarco
      titulo="Costo de ventas y margen"
      subtitulo="Cuánto te costó lo que vendiste y cuánto te quedó, producto por producto."
      rango={{ valor: rango, cambiar }}
      filtros={filtrosUi}
      consulta={consulta}
      cifras={cifras}
      antes={
        descuenta === false && (
          <Aviso tono="warning" role="status" className="mb-4">
            El descuento de inventario al vender está apagado: las ventas no registran lo que
            consumen y por eso no tienen costo.{" "}
            <Link href="/inventario" className="underline underline-offset-2">
              Encenderlo en Inventario
            </Link>
          </Aviso>
        )
      }
      tabla={{
        columnas,
        filas,
        clave: (f) => f.clave,
        orden: { id: "venta", dir: "desc" },
        minimo: 1080,
        vacio: "No hubo ventas en estas fechas.",
      }}
    >
      <Nota>
        La venta va sin IVA —el IVA se cobra para el SAT y el costo de los insumos también va sin
        IVA— y ya sin descuentos ni devoluciones. El costo es lo que esas ventas sacaron del
        inventario, al costo con que salió cada insumo. El margen se calcula solo contra la venta que
        tiene costo: un producto sin receta no cuenta como ganancia completa.
      </Nota>
      {t.costoEstimado > 0 && (
        <Nota>
          De ese costo, {mxn(t.costoEstimado)} se calculó con el costo promedio actual de insumos que
          no tenían costo cuando se vendieron («Costo estimado»).
        </Nota>
      )}
      {t.insumoSinCosto && (
        <Nota>
          Hay insumos sin costo capturado: su consumo cuenta como $0 y el margen de esos productos sale
          más alto de lo real. Captura su costo en{" "}
          <Link href="/inventario" className="font-semibold text-ink underline underline-offset-2">
            Inventario
          </Link>
          .
        </Nota>
      )}
      {t.costoRepartido > 0 && (
        <Nota>
          {mxn(t.costoRepartido)} salió con recetas que cambiaron después de vender. Como el
          inventario no guarda de qué producto salió cada insumo, se repartió entre los productos del
          mismo ticket según su venta («Receta cambió»).
        </Nota>
      )}
      {t.productosSinReceta > 0 && (
        <Nota>
          {t.productosSinReceta === 1 ? "Un producto vendido no tiene" : `${t.productosSinReceta} productos vendidos no tienen`} receta, así
          que no se sabe cuánto cuestan.{" "}
          <Link href="/catalogo/recetas?sin=1" className="font-semibold text-ink underline underline-offset-2">
            Capturar recetas
          </Link>
        </Nota>
      )}
    </ReporteMarco>
  );
}
