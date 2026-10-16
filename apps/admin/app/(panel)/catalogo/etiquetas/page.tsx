"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { Segmentos } from "../../../components/controles";
import { useModulos } from "../../../components/admin-shell";
import { BarrasEan13, formatoEtiqueta, type Formato } from "../../../components/barras-ean13";
import { precioMxn } from "../../../lib/catalogo";
import { normalizarEan } from "../../../lib/codigo-barras";
import { mensajeError } from "../../../lib/errores";
import { listarSucursalesOpciones, type SucursalOpcion } from "../../../lib/inventario";
import { conExistencias } from "../../../lib/operacion";
import { existenciasDeSucursal, listarProductosEtiquetables, type ProductoEtiquetable } from "../../../lib/variantes";

const codigoDe = (p: ProductoEtiquetable) => p.codigo_barras || p.codigo_interno;
const entero = (s: string, def: number) => (Number(s) > 0 ? Math.floor(Number(s)) : def);

/** Una etiqueta: nombre (2 renglones), precio, barras (o el código en texto) y el código en dígitos. */
function Etiqueta({ p, ancho, alto }: { p: ProductoEtiquetable; ancho: string; alto: string }) {
  const codigo = codigoDe(p);
  const ean = normalizarEan(codigo);
  return (
    <div className="etiqueta flex flex-col justify-between bg-surface text-ink" style={{ width: ancho, height: alto }}>
      <div className="line-clamp-2 text-11 font-semibold leading-tight">{p.nombre}</div>
      <div className="text-13 font-bold leading-none tabular-nums">{precioMxn(p.precio)}</div>
      {ean ? (
        <>
          <div style={{ height: "35%" }}><BarrasEan13 codigo={ean} /></div>
          <div className="text-center text-11 leading-none tabular-nums">{ean}</div>
        </>
      ) : (
        codigo && <div className="text-center text-13 font-semibold leading-none">{codigo}</div>
      )}
    </div>
  );
}

export default function EtiquetasPage() {
  const modulos = useModulos();
  const tienda = conExistencias(modulos);
  const [productos, setProductos] = useState<ProductoEtiquetable[]>([]);
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [sucursal, setSucursal] = useState("");
  const [existencias, setExistencias] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Formato["tipo"]>("carta");
  const [ancho, setAncho] = useState("50");
  const [alto, setAlto] = useState("25");
  const [q, setQ] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [cantidades, setCantidades] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!tienda) return;
    Promise.all([listarProductosEtiquetables(), listarSucursalesOpciones()])
      .then(([p, s]) => { setProductos(p); setSucursales(s); setSucursal(s[0]?.id ?? ""); })
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar los productos.")));
  }, [tienda]);

  useEffect(() => {
    if (!sucursal) return;
    existenciasDeSucursal(sucursal).then(setExistencias).catch((e) => setError(mensajeError(e, "No se pudieron leer las existencias.")));
  }, [sucursal]);

  const formato = formatoEtiqueta(tipo === "carta" ? { tipo } : { tipo, anchoMm: entero(ancho, 50), altoMm: entero(alto, 25) });
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? productos.filter((p) => `${p.nombre} ${p.codigo_interno} ${p.codigo_barras}`.toLowerCase().includes(t)) : productos;
  }, [productos, q]);
  const propuesta = (p: ProductoEtiquetable) => Math.max(1, Math.floor(existencias[p.id] ?? 1));
  const cantidad = (p: ProductoEtiquetable) => entero(cantidades[p.id] ?? "", propuesta(p));
  const aImprimir = productos.filter((p) => marcados.has(p.id));
  const total = aImprimir.reduce((n, p) => n + cantidad(p), 0);
  const muestra = aImprimir[0] ?? visibles[0];

  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (!n.delete(id)) n.add(id); return n; });
  const todosMarcados = visibles.length > 0 && visibles.every((p) => marcados.has(p.id));
  const marcarTodos = () => setMarcados((m) => { const n = new Set(m); visibles.forEach((p) => (todosMarcados ? n.delete(p.id) : n.add(p.id))); return n; });

  return (
    <>
      <PageHeader
        titulo="Etiquetas"
        subtitulo="Imprime etiquetas con código de barras para tus productos."
        migas={[{ label: "Catálogo", href: "/catalogo" }, { label: "Etiquetas" }]}
        right={tienda ? <Button onClick={() => window.print()} disabled={total === 0}>{total > 0 ? `Imprimir ${total}` : "Imprimir"}</Button> : undefined}
      />
      <CatalogoTabs />
      <PageBody>
        {modulos !== null && !tienda && <p className="text-sm text-ink-2">Esta sección es para tiendas.</p>}
        {tienda && (
          <>
            <style>{`
              @media screen { .zona-impresion { display: none; } }
              @media print {
                @page { size: ${formato.pagina}; margin: ${formato.columnas > 1 ? "12.7mm 4.8mm" : "0"}; }
                body * { visibility: hidden; }
                .zona-impresion, .zona-impresion * { visibility: visible; }
                .zona-impresion { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(${formato.columnas}, ${formato.ancho}); grid-auto-rows: ${formato.alto}; }
                .etiqueta { break-inside: avoid; overflow: hidden; padding: 1.5mm; font-family: Arial, sans-serif; color: #000; }
              }
            `}</style>

            <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
              <Segmentos
                etiqueta="Formato de etiqueta"
                opciones={[{ v: "carta", l: "Hoja carta (3×10)" }, { v: "rollo", l: "Rollo" }]}
                valor={tipo}
                onCambiar={setTipo}
              />
              {tipo === "rollo" && (
                <>
                  <label className="text-13 font-medium text-ink-2">Ancho (mm)
                    <input type="number" min={10} value={ancho} onChange={(e) => setAncho(e.target.value)} className="mt-1 block h-10 w-24 rounded border border-line-strong bg-surface px-3 text-13 outline-none focus:border-ink" />
                  </label>
                  <label className="text-13 font-medium text-ink-2">Alto (mm)
                    <input type="number" min={10} value={alto} onChange={(e) => setAlto(e.target.value)} className="mt-1 block h-10 w-24 rounded border border-line-strong bg-surface px-3 text-13 outline-none focus:border-ink" />
                  </label>
                </>
              )}
              {sucursales.length > 1 && (
                <label className="text-13 font-medium text-ink-2">Sucursal (cantidad propuesta)
                  <select value={sucursal} onChange={(e) => setSucursal(e.target.value)} className="mt-1 block h-10 rounded border border-line-strong bg-surface px-3 text-13 outline-none focus:border-ink">
                    {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </label>
              )}
              <label className="min-w-[200px] flex-1 text-13 font-medium text-ink-2">Buscar
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, SKU o código" className="mt-1 block h-10 w-full rounded border border-line-strong bg-surface px-3 text-13 outline-none focus:border-ink" />
              </label>
            </div>
            <p className="mb-4 text-13 text-ink-2">Para PDF, en el diálogo de impresión elige «Guardar como PDF».</p>
            {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

            {muestra && (
              <div className="mb-4">
                <div className="mb-2 text-13 font-medium text-ink-2">Así saldrá</div>
                <div className="inline-block rounded border border-line-strong p-2">
                  <Etiqueta p={muestra} ancho={formato.ancho} alto={formato.alto} />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-line bg-surface">
              <label className="flex min-h-[44px] items-center gap-3 border-b border-line px-3 text-13 font-medium text-ink-2">
                <input type="checkbox" checked={todosMarcados} onChange={marcarTodos} />
                Seleccionar {q.trim() ? "los que se ven" : "todos"} ({visibles.length})
              </label>
              {visibles.length === 0 && <p className="px-3 py-4 text-sm text-ink-2">No hay productos con existencias que coincidan.</p>}
              {visibles.map((p) => {
                const codigo = codigoDe(p);
                return (
                  <div key={p.id} className="flex min-h-[52px] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
                    <input type="checkbox" aria-label={`Etiquetar ${p.nombre}`} checked={marcados.has(p.id)} onChange={() => alternar(p.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.nombre}</div>
                      <div className="text-13 text-ink-3">
                        {codigo || "Sin código"}
                        {codigo && !normalizarEan(codigo) && " · Sin barras: sale el código en texto"}
                      </div>
                    </div>
                    <input
                      type="number" min={1} max={999} aria-label={`Cantidad de ${p.nombre}`}
                      value={cantidades[p.id] ?? String(propuesta(p))}
                      onChange={(e) => setCantidades((c) => ({ ...c, [p.id]: e.target.value }))}
                      className="h-10 w-20 rounded border border-line-strong bg-surface px-2 text-right text-13 tabular-nums outline-none focus:border-ink"
                    />
                  </div>
                );
              })}
            </div>

            <div className="zona-impresion">
              {aImprimir.flatMap((p) => Array.from({ length: cantidad(p) }, (_, i) => (
                <Etiqueta key={`${p.id}-${i}`} p={p} ancho={formato.ancho} alto={formato.alto} />
              )))}
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
