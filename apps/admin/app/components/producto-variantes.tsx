"use client";
import { useEffect, useMemo, useState } from "react";
import { label, input } from "./campos";
import { AccionFila } from "./controles";
import { armarMatriz, claveValores, filaConPrecioInvalido, guardarVariantes, listarVariantes, parsearValoresEje, type Eje, type FilaVariante } from "../lib/variantes";
import { listarSucursalesOpciones, type SucursalOpcion } from "../lib/inventario";
import { mensajeError } from "../lib/errores";
import type { Producto } from "../lib/catalogo";

const nombreFila = (f: FilaVariante, ejes: Eje[]) => ejes.map((e) => f.valores[e.nombre]).join(" · ");
const efectivos = (casillas: Eje[]) => casillas.map((e) => ({ ...e, nombre: e.nombre.trim() })).filter((e) => e.nombre && e.valores.length);

/**
 * Tallas y colores de una prenda (ADR 0037): el dueño escribe los ejes y sus valores y aquí sale una
 * fila por combinación, con su SKU, código de barras, precio, costo y existencia inicial. Se guarda
 * con el «Guardar cambios» del producto (mismo patrón que ProductoModificadores).
 */
export function ProductoVariantes({ producto, onPendiente }: {
  producto: Producto;
  onPendiente: (guardar: (() => Promise<void>) | null) => void;
}) {
  // Siempre dos casillas (eje 1 y eje 2), vacías o no: así editar una no reordena la otra.
  const [casillas, setCasillas] = useState<Eje[]>([{ nombre: "", valores: [] }, { nombre: "", valores: [] }]);
  const [filas, setFilas] = useState<FilaVariante[] | null>(null);
  const [original, setOriginal] = useState("");
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [sucursal, setSucursal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tieneHijas = (filas ?? []).some((f) => f.id && f.activa);
  const ejes = useMemo(() => efectivos(casillas), [casillas]);

  useEffect(() => {
    Promise.all([listarVariantes(producto.id), listarSucursalesOpciones()])
      .then(([vs, ss]) => {
        const nombres = producto.variante_ejes ?? [];
        setCasillas([0, 1].map((i) => {
          const n = nombres[i];
          return n ? { nombre: n, valores: [...new Set(vs.map((v) => v.valores[n]).filter((x): x is string => !!x))] } : { nombre: "", valores: [] };
        }));
        setFilas(vs);
        setOriginal(JSON.stringify(vs));
        setSucursales(ss);
        setSucursal(ss[0]?.id ?? "");
      })
      .catch((e) => setError(mensajeError(e, "No se pudieron leer las variantes")));
  }, [producto.id, producto.variante_ejes]);

  const cambio = filas !== null && JSON.stringify(filas) !== original;
  const conExistenciaInicial = (filas ?? []).some((f) => !f.id && f.activa && Number(f.existencia_inicial) > 0);

  useEffect(() => {
    onPendiente(cambio ? async () => {
      const mala = filaConPrecioInvalido(filas ?? []);
      if (mala) throw new Error(`Precio inválido en ${nombreFila(mala, ejes)}`);
      await guardarVariantes(producto.id, ejes.map((e) => e.nombre), filas ?? [], conExistenciaInicial ? sucursal || null : null);
      const vs = await listarVariantes(producto.id);
      setFilas(vs);
      setOriginal(JSON.stringify(vs));
    } : null);
  }, [cambio, filas, ejes, sucursal, conExistenciaInicial, producto.id, onPendiente]);

  function cambiarCasilla(i: number, parte: Partial<Eje>) {
    const nuevas = casillas.map((c, j) => (j === i ? { ...c, ...parte } : c));
    setCasillas(nuevas);
    setFilas((fs) => armarMatriz(efectivos(nuevas), fs ?? [], String(producto.precio_base_mxn)));
  }
  const editar = (k: string, cambio: Partial<FilaVariante>) =>
    setFilas((fs) => (fs ?? []).map((f) => (claveValores(f.valores) === k ? { ...f, ...cambio } : f)));

  const activas = useMemo(() => (filas ?? []).filter((f) => f.activa), [filas]);

  return (
    <section className="rounded-lg border border-line bg-surface p-4" aria-labelledby="titulo-variantes">
      <h2 id="titulo-variantes" className="text-14 font-semibold">Tallas y colores</h2>
      <p className="mb-3 text-13 text-ink-2">Escribe los ejes y sus valores separados por coma. Cada combinación se vende y se cuenta por separado.</p>
      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      {filas === null && !error && <p className="text-sm text-ink-2">Cargando…</p>}
      {filas !== null && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="grid grid-cols-[120px_1fr] gap-2">
                <input aria-label={`Eje ${i + 1}`} className={input} value={casillas[i]!.nombre} disabled={tieneHijas}
                  placeholder={i === 0 ? "Talla" : "Color"}
                  onChange={(e) => cambiarCasilla(i, { nombre: e.target.value })} />
                <input aria-label={`Valores del eje ${i + 1}`} className={input} defaultValue={casillas[i]!.valores.join(", ")}
                  placeholder={i === 0 ? "CH, M, G" : "Negra, Blanca"}
                  onBlur={(e) => cambiarCasilla(i, { valores: parsearValoresEje(e.target.value) })} />
              </div>
            ))}
          </div>
          {tieneHijas && <p className="mt-2 text-13 text-ink-2">Los nombres de los ejes ya no se cambian; sí puedes agregar o quitar valores.</p>}

          {activas.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-13 text-ink-2">
                  <tr><th className="py-2 pr-2 font-medium">Variante</th><th className="pr-2 font-medium">SKU</th><th className="pr-2 font-medium">Código de barras</th>
                    <th className="pr-2 font-medium">Precio</th><th className="pr-2 font-medium">Costo</th><th className="pr-2 font-medium">Existencia inicial</th><th /></tr>
                </thead>
                <tbody>
                  {activas.map((f) => {
                    const k = claveValores(f.valores);
                    return (
                      <tr key={k} className="border-t border-line">
                        <td className="py-2 pr-2 font-medium">{nombreFila(f, ejes)}</td>
                        <td className="pr-2"><input aria-label="SKU" className={`${input} h-9`} value={f.codigo_interno} onChange={(e) => editar(k, { codigo_interno: e.target.value })} /></td>
                        <td className="pr-2"><input aria-label="Código de barras" className={`${input} h-9`} value={f.codigo_barras}
                          placeholder={f.generar_codigo ? "Se genera al guardar" : ""} onChange={(e) => editar(k, { codigo_barras: e.target.value.trim(), generar_codigo: !e.target.value.trim() })} /></td>
                        <td className="pr-2"><input aria-label="Precio" className={`${input} h-9 w-24`} inputMode="decimal" value={f.precio} onChange={(e) => editar(k, { precio: e.target.value })} /></td>
                        <td className="pr-2"><input aria-label="Costo" className={`${input} h-9 w-24`} inputMode="decimal" value={f.costo} onChange={(e) => editar(k, { costo: e.target.value })} /></td>
                        <td className="pr-2">{f.id ? <span className="text-13 text-ink-2">—</span> :
                          <input aria-label="Existencia inicial" className={`${input} h-9 w-20`} inputMode="decimal" value={f.existencia_inicial} onChange={(e) => editar(k, { existencia_inicial: e.target.value })} />}</td>
                        <td><AccionFila peligro onClick={() => editar(k, { activa: false })}>Quitar</AccionFila></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {conExistenciaInicial && sucursales.length > 1 && (
            <div className="mt-3 max-w-xs">
              <label className={label} htmlFor="sucursal-inicial">La existencia inicial entra en</label>
              <select id="sucursal-inicial" className={input} value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}
          {cambio && <p className="mt-3 text-13 text-ink-2">Se guardan con «Guardar cambios».</p>}
        </>
      )}
    </section>
  );
}
