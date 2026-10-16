"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { ExistenciasTabs } from "../../../components/existencias-tabs";
import { SelectorSucursal, useSucursalReporte } from "../../../components/selector-sucursal";
import { CapturaProductos } from "../../../components/captura-productos";
import { AccionFila } from "../../../components/controles";
import { input, label } from "../../../components/campos";
import { mensajeError } from "../../../lib/errores";
import { avisoRenglon, recibirMercancia } from "../../../lib/existencias";
import { listarProductosEtiquetables, type ProductoEtiquetable } from "../../../lib/variantes";
import { listarProveedores, type Proveedor } from "../../../lib/proveedores";

type Renglon = { producto: ProductoEtiquetable; cantidad: string; costo: string };

const soloNumero = (v: string) => v.replace(/[^0-9.]/g, "");
const piezas = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;

export default function RecibirPage() {
  const sucursal = useSucursalReporte();
  const [productos, setProductos] = useState<ProductoEtiquetable[] | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  const [proveedor, setProveedor] = useState("");
  const [referencia, setReferencia] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [guardando, setGuardando] = useState(false);
  const enviando = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setErrorCarga(null);
    Promise.all([listarProductosEtiquetables(), listarProveedores()])
      .then(([p, pr]) => {
        if (!vivo) return;
        setProductos(p);
        setProveedores(pr.filter((x) => x.activo));
      })
      .catch((e) => vivo && setErrorCarga(mensajeError(e, "No se pudieron cargar los productos")));
    return () => {
      vivo = false;
    };
  }, [intento]);

  // Escanear otra vez el mismo producto suma 1 a su renglón.
  function agregar(p: ProductoEtiquetable) {
    setListo(null);
    setRenglones((rs) => {
      const i = rs.findIndex((r) => r.producto.id === p.id);
      if (i < 0) return [...rs, { producto: p, cantidad: "1", costo: "" }];
      const actual = Number(rs[i]!.cantidad);
      const cantidad = avisoRenglon(rs[i]!.cantidad, "", true) ? "1" : String(Math.round((actual + 1) * 1000) / 1000);
      return rs.map((r, j) => (j === i ? { ...r, cantidad } : r));
    });
  }

  const editar = (id: string, cambio: Partial<Renglon>) =>
    setRenglones((rs) => rs.map((r) => (r.producto.id === id ? { ...r, ...cambio } : r)));

  const enTodas = sucursal.id === null;
  const avisos = renglones.map((r) => avisoRenglon(r.cantidad, r.costo));
  const sePuede = !enTodas && renglones.length > 0 && avisos.every((a) => a === null) && !guardando;

  async function recibir() {
    if (!sePuede || !sucursal.id || enviando.current) return;
    enviando.current = true;
    setGuardando(true);
    setError(null);
    try {
      const n = await recibirMercancia(
        sucursal.id,
        proveedor || null,
        renglones.map((r) => ({ producto_id: r.producto.id, cantidad: Number(r.cantidad), costo: r.costo.trim() ? Number(r.costo) : null })),
        referencia.trim(),
      );
      setRenglones([]);
      setReferencia("");
      setListo(`Listo: entraron ${piezas(n)} a ${sucursal.nombre ?? "la sucursal"}.`);
    } catch (e) {
      setError(mensajeError(e, "No se pudo recibir la mercancía"));
    } finally {
      enviando.current = false;
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader titulo="Recibir mercancía" subtitulo="Lo que llega del proveedor entra a la existencia de la sucursal." />
      <ExistenciasTabs />
      <PageBody>
        <SelectorSucursal sucursal={sucursal} className="mb-5 w-full lg:w-auto" />
        {enTodas && sucursal.listo && <p className="mb-5 text-13 text-ink-2">Elige una sucursal para recibir.</p>}

        {errorCarga && (
          <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
            <p className="flex-1 text-14 font-medium text-danger">{errorCarga}</p>
            <Button variant="ghost" onClick={() => setIntento((i) => i + 1)}>Reintentar</Button>
          </div>
        )}

        {productos === null && !errorCarga && <p className="text-14 text-ink-2">Cargando…</p>}

        {productos !== null && (
          <div className="max-w-3xl">
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="r-prov">Proveedor</label>
                <select id="r-prov" className={`${input} bg-surface`} value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="r-ref">Remisión o factura · opcional</label>
                <input id="r-ref" className={input} value={referencia} maxLength={100} onChange={(e) => setReferencia(e.target.value)} placeholder="Ej. F-1234" />
              </div>
            </div>

            {productos.length === 0 ? (
              <p className="text-14 text-ink-2">Todavía no hay productos que lleven existencias.</p>
            ) : (
              <CapturaProductos productos={productos} alAgregar={agregar} />
            )}

            {renglones.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-13 text-ink-2">
                    <tr>
                      <th className="py-2 pr-2 font-medium">Producto</th>
                      <th className="pr-2 font-medium">Cantidad</th>
                      <th className="pr-2 font-medium">Costo unitario</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {renglones.map((r, i) => (
                      <tr key={r.producto.id} className="border-t border-line align-top">
                        <td className="py-2 pr-2">
                          <span className="block pt-2 font-medium">{r.producto.nombre}</span>
                          {avisos[i] && <span className="block text-13 font-medium text-danger" role="alert">{avisos[i]}</span>}
                        </td>
                        <td className="py-2 pr-2">
                          <input aria-label="Cantidad" className={`${input} h-9 w-24`} inputMode="decimal" value={r.cantidad}
                            onChange={(e) => editar(r.producto.id, { cantidad: soloNumero(e.target.value) })} />
                        </td>
                        <td className="py-2 pr-2">
                          <input aria-label="Costo unitario" className={`${input} h-9 w-28`} inputMode="decimal" value={r.costo} placeholder="Sin cambio"
                            onChange={(e) => editar(r.producto.id, { costo: soloNumero(e.target.value) })} />
                        </td>
                        <td className="py-2 pt-4 text-right">
                          <AccionFila peligro onClick={() => setRenglones((rs) => rs.filter((x) => x.producto.id !== r.producto.id))}>Quitar</AccionFila>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-13 text-ink-3">Si dejas el costo vacío, el costo del producto no cambia.</p>
              </div>
            )}

            {error && <p className="mt-4 text-sm font-medium text-danger" role="alert">{error}</p>}
            {listo && <p className="mt-4 text-sm font-medium text-success" role="status">{listo}</p>}

            <div className="mt-5 flex justify-end">
              <Button onClick={() => void recibir()} disabled={!sePuede}>
                {guardando ? "Recibiendo…" : `Recibir ${piezas(renglones.length)}`}
              </Button>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
