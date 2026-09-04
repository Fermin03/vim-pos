"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader, TablaScroll } from "../../../../components/page-header";
import { CatalogoTabs } from "../../../../components/catalogo-tabs";
import { obtenerProducto, type Producto } from "../../../../lib/catalogo";
import {
  convertirCantidad, costoReceta, guardarReceta, listarConversiones, listarInsumosOpciones, listarUnidadesDetalle,
  margen, obtenerReceta, precioSinIva, type Conversion, type InsumoOpcion, type Receta, type UnidadDetalle,
} from "../../../../lib/recetas";
import { mensajeError } from "../../../../lib/errores";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const input = "h-10 w-full rounded border border-line-strong px-2 text-sm outline-none focus:border-ink";

/** Fila del editor: lo que el usuario teclea. La cantidad operativa se deriva al guardar. */
type Fila = { insumoId: string; cantidadTexto: string; unidadId: string; esCritico: boolean; error: string | null };

export default function EditorRecetaPage() {
  const params = useParams<{ productoId: string }>();
  const router = useRouter();
  const [producto, setProducto] = useState<Producto | null | undefined>(undefined);
  const [receta, setReceta] = useState<Receta | null>(null);
  const [insumos, setInsumos] = useState<InsumoOpcion[]>([]);
  const [unidades, setUnidades] = useState<UnidadDetalle[]>([]);
  const [conversiones, setConversiones] = useState<Conversion[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [activa, setActiva] = useState(true);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([obtenerProducto(params.productoId), obtenerReceta(params.productoId), listarInsumosOpciones(), listarUnidadesDetalle(), listarConversiones()])
      .then(([p, r, ins, uni, conv]) => {
        setProducto(p); setReceta(r); setInsumos(ins); setUnidades(uni); setConversiones(conv);
        setActiva(r.activa); setNotas(r.notas ?? "");
        setFilas(r.componentes.map((c) => {
          const insumo = ins.find((i) => i.id === c.insumoId);
          return {
            insumoId: c.insumoId,
            cantidadTexto: String(c.cantidadCapturada ?? c.cantidad),
            unidadId: c.unidadCapturadaId ?? insumo?.unidadId ?? "",
            esCritico: c.esCritico,
            error: null,
          };
        }));
      })
      .catch((e) => { setError(mensajeError(e, "No se pudo cargar la receta")); setProducto(null); });
  }, [params.productoId]);

  const unidadDe = (id: string) => unidades.find((u) => u.id === id);
  const insumoDe = (id: string) => insumos.find((i) => i.id === id);

  /** Cantidad en la unidad del insumo, o el motivo por el que no se puede. */
  function resolver(f: Fila): { cantidad: number; error: null } | { cantidad: null; error: string } {
    const insumo = insumoDe(f.insumoId);
    if (!insumo) return { cantidad: null, error: "Elige un insumo" };
    const cant = Number(f.cantidadTexto);
    if (!(cant > 0)) return { cantidad: null, error: "Cantidad mayor que cero" };
    const origen = unidadDe(f.unidadId);
    const destino = unidadDe(insumo.unidadId);
    if (!origen || !destino) return { cantidad: null, error: "Revisar unidad" };
    try {
      return { cantidad: convertirCantidad(cant, origen, destino, conversiones), error: null };
    } catch (e) {
      return { cantidad: null, error: e instanceof Error ? e.message : "Revisar unidad" };
    }
  }

  const resueltas = useMemo(() => filas.map((f) => ({ f, r: resolver(f) })), [filas, insumos, unidades, conversiones]);
  const costo = costoReceta(resueltas.filter((x) => x.r.cantidad != null).map((x) => ({ cantidad: x.r.cantidad as number, costoUnitario: insumoDe(x.f.insumoId)?.costoUnitario ?? 0 })));
  const precioNeto = producto ? precioSinIva(producto.precio_base_mxn, producto.tasa_iva, producto.iva_incluido_en_precio) : 0;
  const m = margen(precioNeto, costo);
  const hayErrores = resueltas.some((x) => x.r.error) || filas.some((f) => f.insumoId && filas.filter((g) => g.insumoId === f.insumoId).length > 1);

  function set(i: number, patch: Partial<Fila>) {
    setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  }
  function agregar() {
    setFilas((prev) => [...prev, { insumoId: "", cantidadTexto: "", unidadId: "", esCritico: true, error: null }]);
  }
  function elegirInsumo(i: number, insumoId: string) {
    const insumo = insumoDe(insumoId);
    set(i, { insumoId, unidadId: insumo?.unidadId ?? "" });
  }
  function unidadesCompatibles(f: Fila): UnidadDetalle[] {
    const insumo = insumoDe(f.insumoId);
    const base = insumo ? unidadDe(insumo.unidadId) : undefined;
    return base ? unidades.filter((u) => u.dimension === base.dimension) : unidades;
  }

  async function guardar() {
    setError(null);
    if (activa && filas.length === 0) { setError("Una receta activa necesita al menos un insumo."); return; }
    if (hayErrores) { setError("Corrige las filas marcadas antes de guardar."); return; }
    setGuardando(true);
    try {
      await guardarReceta({
        productoId: params.productoId, activa, notas: notas.trim() || null,
        componentes: resueltas.map(({ f, r }, i) => ({
          insumoId: f.insumoId, cantidad: r.cantidad as number,
          cantidadCapturada: Number(f.cantidadTexto), unidadCapturadaId: f.unidadId,
          esCritico: f.esCritico, notas: null, orden: i,
        })),
      });
      setOkMsg("Receta guardada.");
      setTimeout(() => setOkMsg(null), 2500);
      setReceta(await obtenerReceta(params.productoId));
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar la receta"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo={producto ? `Receta: ${producto.nombre}` : "Receta"}
        subtitulo={producto ? `Precio sin IVA ${fmt(precioNeto)}` : undefined}
        migas={[{ label: "Catálogo" }, { label: "Recetas", href: "/catalogo/recetas" }, { label: producto?.nombre ?? "…" }]}
        right={<Button variant="ghost" onClick={() => router.push("/catalogo/recetas")}>Volver</Button>}
      />
      <CatalogoTabs />
      <PageBody>
        {producto === undefined && <p className="text-sm text-ink-3">Cargando…</p>}
        {producto === null && <p className="text-sm text-danger">Producto no encontrado.</p>}
        {producto && receta && (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
                <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
                Receta activa (descuenta inventario al vender)
              </label>
              {insumos.length === 0 && <span className="text-sm text-warning">No hay insumos activos. Da de alta insumos en Inventario primero.</span>}
            </div>

            <TablaScroll min={820}>
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                    <th className="py-2 pr-3 font-semibold">Insumo</th>
                    <th className="py-2 pr-3 text-right font-semibold">Cantidad</th>
                    <th className="py-2 pr-3 font-semibold">Unidad</th>
                    <th className="py-2 pr-3 text-right font-semibold">En unidad del insumo</th>
                    <th className="py-2 pr-3 text-right font-semibold">Costo</th>
                    <th className="py-2 pr-3 font-semibold">Crítico</th>
                    <th className="py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {resueltas.map(({ f, r }, i) => {
                    const insumo = insumoDe(f.insumoId);
                    const repetido = f.insumoId && filas.filter((g) => g.insumoId === f.insumoId).length > 1;
                    const err = r.error ?? (repetido ? "Insumo repetido" : null);
                    return (
                      <tr key={i} className="border-b border-line-soft align-top">
                        <td className="py-1.5 pr-3">
                          <select className={input} value={f.insumoId} onChange={(e) => elegirInsumo(i, e.target.value)} aria-label="Insumo">
                            <option value="">Elige…</option>
                            {insumos.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                          </select>
                          {err && f.insumoId && <p className="mt-1 text-[12px] text-danger">{err}</p>}
                        </td>
                        <td className="py-1.5 pr-3">
                          <input className={`${input} text-right tabular-nums`} inputMode="decimal" value={f.cantidadTexto} aria-label="Cantidad"
                            onChange={(e) => set(i, { cantidadTexto: e.target.value.replace(/[^0-9.]/g, "") })} />
                        </td>
                        <td className="py-1.5 pr-3">
                          <select className={input} value={f.unidadId} onChange={(e) => set(i, { unidadId: e.target.value })} aria-label="Unidad">
                            {unidadesCompatibles(f).map((u) => <option key={u.id} value={u.id}>{u.simbolo}</option>)}
                          </select>
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-ink-2">
                          {r.cantidad != null && insumo ? `${r.cantidad} ${unidadDe(insumo.unidadId)?.simbolo ?? ""}` : "—"}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">{r.cantidad != null && insumo ? fmt(r.cantidad * insumo.costoUnitario) : "—"}</td>
                        <td className="py-3 pr-3"><input type="checkbox" checked={f.esCritico} onChange={(e) => set(i, { esCritico: e.target.checked })} aria-label="Crítico" /></td>
                        <td className="py-1.5"><Button variant="ghost" onClick={() => setFilas((p) => p.filter((_, k) => k !== i))}>Quitar</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-semibold">
                    <td colSpan={4} className="py-2 pr-3 text-right">Costo de la receta</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(costo)}</td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="py-1 pr-3 text-right text-ink-2">Margen sobre {fmt(precioNeto)} sin IVA</td>
                    <td className={`py-1 pr-3 text-right tabular-nums ${m.pesos < 0 ? "text-danger" : ""}`}>
                      {fmt(m.pesos)} {m.porcentaje != null && `(${(m.porcentaje * 100).toFixed(1)} %)`}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </TablaScroll>

            <div><Button variant="ghost" onClick={agregar} disabled={insumos.length === 0}>Agregar insumo</Button></div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="notas">Notas de preparación</label>
              <textarea id="notas" className="min-h-[80px] w-full rounded border border-line-strong p-2 text-sm" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>

            {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
            {okMsg && <p className="text-sm font-medium text-success">{okMsg}</p>}
            <div className="flex gap-2">
              <Button onClick={guardar} disabled={guardando || hayErrores}>{guardando ? "Guardando…" : "Guardar receta"}</Button>
            </div>
            <p className="text-[12px] text-ink-3">Marca como crítico el insumo sin el cual el producto se agota solo cuando no hay existencia.</p>
          </div>
        )}
      </PageBody>
    </>
  );
}
