"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, botonClases, Icono } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { useModulos } from "../../../components/admin-shell";
import { precioMxn } from "../../../lib/catalogo";
import { mensajeError } from "../../../lib/errores";
import { listarSucursalesOpciones, type SucursalOpcion } from "../../../lib/inventario";
import { importarCatalogoTienda, parsearCsvTienda, PLANTILLA_TIENDA, type ParseTienda, type ResultadoImportTienda } from "../../../lib/importar-tienda";
import { textoDeArchivo } from "../../../lib/leer-archivo";
import { conExistencias } from "../../../lib/operacion";

function descargarPlantilla() {
  // El BOM hace que Excel lea bien los acentos.
  const url = URL.createObjectURL(new Blob(["﻿" + PLANTILLA_TIENDA], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "plantilla-tienda.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportarTiendaPage() {
  const modulos = useModulos();
  const tienda = conExistencias(modulos);
  const [texto, setTexto] = useState("");
  const [generar, setGenerar] = useState(true);
  const [parse, setParse] = useState<ParseTienda | null>(null);
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [sucursal, setSucursal] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportTienda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [archivo, setArchivo] = useState<string | null>(null);
  const entradaArchivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tienda) return;
    listarSucursalesOpciones()
      .then((s) => { setSucursales(s); setSucursal(s[0]?.id ?? ""); })
      .catch((e) => setError(mensajeError(e, "No se pudieron leer las sucursales.")));
  }, [tienda]);

  function revisar(t = texto) {
    setError(null);
    setResultado(null);
    setParse(parsearCsvTienda(t, generar));
  }

  async function subirArchivo(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const t = await textoDeArchivo(file);
      setArchivo(file.name);
      setTexto(t);
      revisar(t);
    } catch (e) {
      setError(mensajeError(e, "No se pudo leer el archivo."));
    } finally {
      if (entradaArchivo.current) entradaArchivo.current.value = "";
    }
  }

  async function importar() {
    if (!parse || parse.errores.length > 0 || parse.filas.length === 0) return;
    setImportando(true);
    setError(null);
    try {
      setResultado(await importarCatalogoTienda(parse.filas, sucursal || null));
    } catch (e) {
      // La base ya dice «línea N: …».
      setError(mensajeError(e, "No se pudo importar"));
    } finally {
      setImportando(false);
    }
  }

  const conError = parse?.errores.length ?? 0;

  return (
    <>
      <PageHeader
        titulo="Importar tienda"
        subtitulo="Sube tu catálogo en Excel o CSV: productos, variantes, códigos y existencias."
        migas={[{ label: "Catálogo", href: "/catalogo" }, { label: "Importar tienda" }]}
      />
      <CatalogoTabs />
      <PageBody>
        {modulos !== null && !tienda && <p className="text-sm text-ink-2">Esta sección es para tiendas.</p>}
        {tienda && !resultado && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface p-4">
                <input
                  ref={entradaArchivo}
                  id="archivo"
                  type="file"
                  accept=".csv,.txt,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => void subirArchivo(e.target.files?.[0])}
                />
                <label htmlFor="archivo" className={`${botonClases({ variant: "ghost" })} cursor-pointer`}>
                  <Icono nombre="subir" className="h-4 w-4" />
                  Subir archivo
                </label>
                <span className="text-13 text-ink-2">{archivo ? `Leído: ${archivo}` : "Excel (.xlsx) o CSV"}</span>
              </div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <label className="text-13 font-medium text-ink-2" htmlFor="csv">O pégalo aquí</label>
                <button type="button" className="min-h-[40px] text-13 font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline" onClick={descargarPlantilla}>Descargar plantilla</button>
              </div>
              <textarea
                id="csv"
                value={texto}
                onChange={(e) => { setTexto(e.target.value); setParse(null); }}
                className="h-72 w-full rounded border border-line-strong p-3 font-mono text-13 outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
                placeholder={"Categoría,Producto,Ejes,Valores,SKU,Código de barras,Precio,Costo,Existencia"}
              />
              <p className="mt-2 text-13 text-ink-2">
                Si un SKU ya existe se actualizan su nombre, precio, costo y código; la existencia solo cuenta al crear.
              </p>
              <label className="mt-3 flex min-h-[40px] items-center gap-2 text-13 text-ink-2">
                <input type="checkbox" checked={generar} onChange={(e) => { setGenerar(e.target.checked); setParse(null); }} />
                Generar código de barras a las que no traen
              </label>
              {sucursales.length > 1 && (
                <label className="mt-3 block text-13 font-medium text-ink-2">Sucursal de la existencia
                  <select value={sucursal} onChange={(e) => setSucursal(e.target.value)} className="mt-1 block h-10 rounded border border-line-strong bg-surface px-3 text-13 outline-none focus:border-ink">
                    {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </label>
              )}
              {error && !parse && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
              <div className="mt-3">
                <Button variant={parse ? "ghost" : "primary"} onClick={() => revisar()} disabled={!texto.trim()}>Revisar</Button>
              </div>
            </div>

            <div>
              {parse ? (
                <>
                  <div className="mb-2 text-13 font-medium text-ink-2">
                    <span className="text-ink">{parse.filas.length}</span> renglones listos
                    {conError > 0 && <span className="text-danger"> · {conError} con error</span>}
                  </div>
                  {conError > 0 && (
                    <div className="mb-3 rounded border border-danger-line bg-danger-soft px-3 py-2 text-12 text-danger">
                      <div className="font-semibold">Corrige estas líneas para poder importar:</div>
                      <ul className="mt-1 list-disc pl-4">
                        {parse.errores.slice(0, 10).map((e) => <li key={e.linea}>Línea {e.linea}: {e.motivo}</li>)}
                        {conError > 10 && <li>…y {conError - 10} más</li>}
                      </ul>
                    </div>
                  )}
                  {parse.filas.length > 0 && (
                    <div className="max-h-72 overflow-auto rounded-lg border border-line bg-surface">
                      <table className="w-full min-w-[640px] text-13">
                        <thead className="sticky top-0 bg-sel">
                          <tr className="border-b border-line text-left text-11 uppercase tracking-wide text-ink-3">
                            <th className="px-3 py-2 font-semibold">Categoría</th>
                            <th className="px-3 py-2 font-semibold">Producto</th>
                            <th className="px-3 py-2 font-semibold">Variante</th>
                            <th className="px-3 py-2 font-semibold">SKU</th>
                            <th className="px-3 py-2 font-semibold">Código</th>
                            <th className="px-3 py-2 text-right font-semibold">Precio</th>
                            <th className="px-3 py-2 text-right font-semibold">Costo</th>
                            <th className="px-3 py-2 text-right font-semibold">Exist.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parse.filas.map((f) => (
                            <tr key={f.linea} className="border-b border-line last:border-b-0">
                              <td className="px-3 py-1.5 text-ink-2">{f.categoria}</td>
                              <td className="px-3 py-1.5 font-medium">{f.producto}</td>
                              <td className="px-3 py-1.5 text-ink-2">{f.ejes.map((e) => f.valores[e]).join(" / ") || "—"}</td>
                              <td className="px-3 py-1.5">{f.sku}</td>
                              <td className="px-3 py-1.5 text-ink-2">{f.codigo_barras || (f.generar_codigo ? "se genera" : "—")}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{precioMxn(f.precio)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{f.costo == null ? "—" : precioMxn(f.costo)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{f.existencia ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
                  <div className="mt-3">
                    <Button onClick={importar} disabled={importando || conError > 0 || parse.filas.length === 0}>
                      {importando ? "Importando…" : `Importar ${parse.filas.length}`}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-2">Sube el archivo o pega tu catálogo y presiona «Revisar» para ver cómo quedará.</p>
              )}
            </div>
          </div>
        )}

        {tienda && resultado && (
          <div className="max-w-[520px] rounded-lg border border-line bg-surface p-6">
            <div className="mb-2 flex items-center gap-2">
              <Icono nombre="palomita" className="h-6 w-6" />
              <h2 className="font-display text-lg font-semibold">Importación completada</h2>
            </div>
            <p className="text-14 text-ink-2">
              Listo: {resultado.productos} productos, {resultado.variantes_creadas} variantes, {resultado.actualizados} actualizados, {resultado.categorias} categorías nuevas.
            </p>
            <div className="mt-5 flex gap-2">
              <Link href="/catalogo/productos" className={botonClases()}>Ver productos</Link>
              <Button variant="ghost" onClick={() => { setResultado(null); setParse(null); setTexto(""); setArchivo(null); }}>Importar más</Button>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
