"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { FORMATOS_ORIGEN, importarMenu, parsearConFormato, type FormatoOrigen, type ResultadoImport, type ResultadoParse } from "../../../lib/importar-menu";

const EJEMPLO = `Categoría,Producto,Precio,Descripción
Hamburguesas,Clásica,120,Carne 150g con queso
Hamburguesas,Doble,160,Doble carne y doble queso
Acompañamientos,Papas Gajo,55,
Bebidas,Refresco,35,Lata 355ml`;

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export default function ImportarMenuPage() {
  const [texto, setTexto] = useState("");
  const [formato, setFormato] = useState<FormatoOrigen>("AUTO");
  const [formatoUsado, setFormatoUsado] = useState<string | null>(null);
  const [parse, setParse] = useState<ResultadoParse | null>(null);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  function revisar() {
    setError(null);
    setResultado(null);
    const r = parsearConFormato(texto, formato);
    setParse(r);
    setFormatoUsado(r.formatoUsado);
    if (r.filas.length === 0) setError("No se detectaron productos. Revisa el formato u origen seleccionado.");
  }

  async function importar() {
    if (!parse || parse.filas.length === 0) return;
    setImportando(true);
    setError(null);
    try {
      setResultado(await importarMenu(parse.filas));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar");
    } finally {
      setImportando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Importar menú"
        subtitulo="Migra desde tu POS anterior (Square, Toast, Loyverse, Clip) pegando su export, o usa el formato simple de VIM."
        migas={[{ label: "Catálogo", href: "/catalogo" }, { label: "Importar" }]}
      />
      <PageBody>
        {!resultado && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[13px] font-medium text-ink-2" htmlFor="csv">Pega aquí tu menú</label>
                <button type="button" className="text-[12px] font-semibold text-ink-3 hover:text-ink" onClick={() => { setTexto(EJEMPLO); setParse(null); }}>Usar ejemplo</button>
              </div>
              <textarea
                id="csv"
                value={texto}
                onChange={(e) => { setTexto(e.target.value); setParse(null); }}
                className="h-72 w-full rounded border border-line-strong p-3 font-mono text-[12.5px] outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
                placeholder={"Categoría,Producto,Precio,Descripción\nHamburguesas,Clásica,120,Con queso\n…"}
              />
              <p className="mt-2 text-[12px] text-ink-3">
                Una fila por producto. Separadores: coma, punto y coma o tabulador. La primera fila puede ser encabezado.
                Las categorías que no existan se crean solas.
              </p>
              {/* Fase 4 — POS de origen (preset de columnas, con autodetección) */}
              <div className="mt-3 flex items-center gap-2">
                <label className="text-[12.5px] font-medium text-ink-2" htmlFor="origen">POS de origen</label>
                <select
                  id="origen"
                  value={formato}
                  onChange={(e) => { setFormato(e.target.value as FormatoOrigen); setParse(null); }}
                  className="h-10 rounded border border-line-strong bg-surface px-3 text-[13px] outline-none focus:border-ink"
                >
                  {FORMATOS_ORIGEN.map((f) => <option key={f.codigo} value={f.codigo}>{f.label}</option>)}
                </select>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button onClick={revisar} disabled={!texto.trim()}>Revisar</Button>
                {parse && formatoUsado && (
                  <span className="rounded-full bg-sel px-2.5 py-1 text-[11.5px] font-semibold text-ink-3">
                    Formato detectado: {formatoUsado}
                  </span>
                )}
              </div>
            </div>

            <div>
              {parse && (
                <>
                  <div className="mb-2 text-[13px] font-medium text-ink-2">
                    Vista previa · <span className="text-ink">{parse.filas.length}</span> productos
                    {parse.errores.length > 0 && <span className="text-danger"> · {parse.errores.length} con error</span>}
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-line bg-surface">
                    <table className="w-full text-[12.5px]">
                      <thead className="sticky top-0 bg-sel">
                        <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-3">
                          <th className="px-3 py-2 font-semibold">Categoría</th>
                          <th className="px-3 py-2 font-semibold">Producto</th>
                          <th className="px-3 py-2 text-right font-semibold">Precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parse.filas.map((f, i) => (
                          <tr key={i} className="border-b border-line last:border-b-0">
                            <td className="px-3 py-1.5 text-ink-2">{f.categoria}</td>
                            <td className="px-3 py-1.5 font-medium">{f.nombre}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{fmt(f.precio)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {parse.errores.length > 0 && (
                    <div className="mt-3 rounded border border-[#E8DCC0] bg-[#F6EEDD] px-3 py-2 text-[12px] text-warning">
                      <div className="font-semibold">Líneas que se omitirán:</div>
                      <ul className="mt-1 list-disc pl-4">
                        {parse.errores.slice(0, 6).map((e) => (
                          <li key={e.linea}>Línea {e.linea}: {e.motivo}</li>
                        ))}
                        {parse.errores.length > 6 && <li>…y {parse.errores.length - 6} más</li>}
                      </ul>
                    </div>
                  )}

                  {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}

                  <div className="mt-3">
                    <Button onClick={importar} disabled={importando || parse.filas.length === 0}>
                      {importando ? "Importando…" : `Importar ${parse.filas.length} productos`}
                    </Button>
                  </div>
                </>
              )}
              {!parse && <p className="text-sm text-ink-3">Pega tu menú y presiona “Revisar” para ver la vista previa.</p>}
            </div>
          </div>
        )}

        {resultado && (
          <div className="max-w-[520px] rounded-lg border border-line bg-surface p-6">
            <div className="mb-2 flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="#2E7D52" strokeWidth="2.5" className="h-6 w-6"><path d="M20 6L9 17l-5-5" /></svg>
              <h2 className="font-display text-lg font-semibold">Importación completada</h2>
            </div>
            <p className="text-[14px] text-ink-2">
              Se crearon <b>{resultado.productosCreados}</b> productos
              {resultado.categoriasCreadas > 0 && <> y <b>{resultado.categoriasCreadas}</b> categorías nuevas</>}.
            </p>
            {resultado.fallos.length > 0 && (
              <div className="mt-3 rounded border border-[#EDC4BE] bg-[#FBECEA] px-3 py-2 text-[12.5px] text-danger">
                <div className="font-semibold">{resultado.fallos.length} no se pudieron crear:</div>
                <ul className="mt-1 list-disc pl-4">
                  {resultado.fallos.slice(0, 8).map((f, i) => <li key={i}>{f.nombre}: {f.motivo}</li>)}
                </ul>
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <Link href="/catalogo/productos"><Button>Ver productos</Button></Link>
              <Button variant="ghost" onClick={() => { setResultado(null); setParse(null); setTexto(""); }}>Importar más</Button>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
