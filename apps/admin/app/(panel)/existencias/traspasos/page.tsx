"use client";
import { useEffect, useRef, useState } from "react";
import { Button, StatusChip, useConfirmar, type TonoEstado } from "@vim/ui/styles";
import { fechaLegible, ZONA_MX } from "@vim/fecha";
import { PageBody, PageHeader } from "../../../components/page-header";
import { ExistenciasTabs } from "../../../components/existencias-tabs";
import { CapturaProductos } from "../../../components/captura-productos";
import { AccionFila } from "../../../components/controles";
import { input, label } from "../../../components/campos";
import { mensajeError } from "../../../lib/errores";
import { conUnidad } from "../../../lib/unidades";
import { formatear } from "../../../lib/reporte-tabla";
import { listarSucursalesOpciones, type SucursalOpcion } from "../../../lib/inventario";
import { listarProductosEtiquetables, type ProductoEtiquetable } from "../../../lib/variantes";
import {
  avisoRenglon,
  cancelarTraspaso,
  enviarTraspaso,
  listarTraspasos,
  recibirTraspaso,
  type Traspaso,
} from "../../../lib/existencias";

type Renglon = { producto: ProductoEtiquetable; cantidad: string };

const soloNumero = (v: string) => v.replace(/[^0-9.]/g, "");
const productos = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { timeZone: ZONA_MX, hour: "2-digit", minute: "2-digit" });

const ESTADO: Record<Traspaso["estado"], { texto: string; tono: TonoEstado }> = {
  ENVIADO: { texto: "En camino", tono: "warning" },
  RECIBIDO: { texto: "Recibido", tono: "success" },
  CANCELADO: { texto: "Cancelado", tono: "neutral" },
};

export default function TraspasosPage() {
  const [sucursales, setSucursales] = useState<SucursalOpcion[] | null>(null);
  const [catalogo, setCatalogo] = useState<ProductoEtiquetable[]>([]);
  const [traspasos, setTraspasos] = useState<Traspaso[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  // Un solo clic por acción: el estado tarda un render en deshabilitar el botón.
  const enCurso = useRef(false);
  const [confirmar, dialogoConfirmar] = useConfirmar();

  useEffect(() => {
    let vivo = true;
    setErrorCarga(null);
    Promise.all([listarSucursalesOpciones(), listarProductosEtiquetables(), listarTraspasos()])
      .then(([s, p, t]) => {
        if (!vivo) return;
        setSucursales(s);
        setCatalogo(p);
        setTraspasos(t);
        setOrigen((o) => o || s[0]?.id || "");
        setDestino((d) => d || s[1]?.id || "");
      })
      .catch((e) => vivo && setErrorCarga(mensajeError(e, "No se pudieron cargar los traspasos")));
    return () => {
      vivo = false;
    };
  }, [intento]);

  const recargar = () => setIntento((i) => i + 1);
  const nombreSucursal = (id: string) => sucursales?.find((s) => s.id === id)?.nombre ?? "Sucursal eliminada";
  const viva = (id: string) => !!sucursales?.some((s) => s.id === id);
  const nombreProducto = (id: string) => catalogo.find((p) => p.id === id)?.nombre ?? "Producto eliminado";

  // Origen y destino nunca iguales: si el origen alcanza al destino, el destino se mueve.
  function cambiarOrigen(id: string) {
    setOrigen(id);
    if (id === destino) setDestino(sucursales?.find((s) => s.id !== id)?.id ?? "");
  }

  function agregar(p: ProductoEtiquetable) {
    setListo(null);
    setRenglones((rs) => {
      const i = rs.findIndex((r) => r.producto.id === p.id);
      if (i < 0) return [...rs, { producto: p, cantidad: "1" }];
      const cantidad = avisoRenglon(rs[i]!.cantidad, "", true) ? "1" : String(Math.round((Number(rs[i]!.cantidad) + 1) * 1000) / 1000);
      return rs.map((r, j) => (j === i ? { ...r, cantidad } : r));
    });
  }

  const avisos = renglones.map((r) => avisoRenglon(r.cantidad));
  const sePuede = !!origen && !!destino && origen !== destino && renglones.length > 0 && avisos.every((a) => a === null) && !enviando;

  async function enviar() {
    if (!sePuede || enCurso.current) return;
    enCurso.current = true;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      await enviarTraspaso(origen, destino, renglones.map((r) => ({ producto_id: r.producto.id, cantidad: Number(r.cantidad) })));
      setRenglones([]);
      setListo(`Listo: ${productos(renglones.length)} en camino a ${nombreSucursal(destino)}.`);
      recargar();
    } catch (e) {
      setErrorEnvio(mensajeError(e, "No se pudo enviar el traspaso"));
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }

  async function accion(t: Traspaso, que: "recibir" | "cancelar") {
    if (enCurso.current) return;
    const ok = await confirmar(
      que === "recibir"
        ? { titulo: `¿Recibir en ${nombreSucursal(t.destino_sucursal_id)}?`, mensaje: `La mercancía entra a ${nombreSucursal(t.destino_sucursal_id)}.`, boton: "Recibir", peligrosa: false }
        : { titulo: "¿Cancelar el traspaso?", mensaje: `La mercancía regresa a ${nombreSucursal(t.origen_sucursal_id)}.`, boton: "Cancelar traspaso" },
    );
    if (!ok || enCurso.current) return;
    enCurso.current = true;
    setOcupado(t.id);
    setErrorLista(null);
    try {
      await (que === "recibir" ? recibirTraspaso(t.id) : cancelarTraspaso(t.id));
      recargar();
    } catch (e) {
      setErrorLista(mensajeError(e, que === "recibir" ? "No se pudo recibir" : "No se pudo cancelar"));
    } finally {
      enCurso.current = false;
      setOcupado(null);
    }
  }

  return (
    <>
      <PageHeader titulo="Traspasos" subtitulo="Manda mercancía de una sucursal a otra." />
      <ExistenciasTabs />
      <PageBody>
        {errorCarga && (
          <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
            <p className="flex-1 text-14 font-medium text-danger">{errorCarga}</p>
            <Button variant="ghost" onClick={recargar}>Reintentar</Button>
          </div>
        )}

        {sucursales === null && !errorCarga && <p className="text-14 text-ink-2">Cargando…</p>}

        {sucursales !== null && sucursales.length <= 1 && (
          <p className="text-14 text-ink-2">Los traspasos son entre sucursales; tu negocio tiene una.</p>
        )}

        {sucursales !== null && sucursales.length > 1 && (
          <div className="max-w-3xl">
            <section aria-labelledby="t-nuevo" className="mb-8 rounded-lg border border-line p-4 lg:p-5">
              <h2 id="t-nuevo" className="mb-4 font-display text-lg font-semibold tracking-tight">Nuevo traspaso</h2>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="t-origen">Sale de</label>
                  <select id="t-origen" className={`${input} bg-surface`} value={origen} onChange={(e) => cambiarOrigen(e.target.value)}>
                    {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="t-destino">Llega a</label>
                  <select id="t-destino" className={`${input} bg-surface`} value={destino} onChange={(e) => setDestino(e.target.value)}>
                    {sucursales.filter((s) => s.id !== origen).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
              </div>

              {catalogo.length === 0 ? (
                <p className="text-14 text-ink-2">Todavía no hay productos que lleven existencias.</p>
              ) : (
                <CapturaProductos productos={catalogo} alAgregar={agregar} />
              )}

              {renglones.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-13 text-ink-2">
                      <tr>
                        <th className="py-2 pr-2 font-medium">Producto</th>
                        <th className="pr-2 font-medium">Cantidad</th>
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
                              onChange={(e) => setRenglones((rs) => rs.map((x) => (x.producto.id === r.producto.id ? { ...x, cantidad: soloNumero(e.target.value) } : x)))} />
                          </td>
                          <td className="py-2 pt-4 text-right">
                            <AccionFila peligro onClick={() => setRenglones((rs) => rs.filter((x) => x.producto.id !== r.producto.id))}>Quitar</AccionFila>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {errorEnvio && <p className="mt-4 text-sm font-medium text-danger" role="alert">{errorEnvio}</p>}
              {listo && <p className="mt-4 text-sm font-medium text-success" role="status">{listo}</p>}

              <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                <p className="mr-auto text-13 text-ink-3">La mercancía sale del origen al enviar.</p>
                <Button onClick={() => void enviar()} disabled={!sePuede}>{enviando ? "Enviando…" : "Enviar"}</Button>
              </div>
            </section>

            <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Historial</h2>
            {errorLista && <p className="mb-3 text-sm font-medium text-danger" role="alert">{errorLista}</p>}
            {traspasos !== null && traspasos.length === 0 && <p className="text-14 text-ink-2">Todavía no hay traspasos.</p>}
            {traspasos !== null && traspasos.length > 0 && (
              <ul className="border-t border-line">
                {traspasos.map((t) => {
                  const e = ESTADO[t.estado];
                  return (
                    <li key={t.id} className="border-b border-line py-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">
                            {nombreSucursal(t.origen_sucursal_id)} → {nombreSucursal(t.destino_sucursal_id)}
                          </p>
                          <p className="text-13 text-ink-3">
                            {fechaLegible(t.enviado_at)} · {hora(t.enviado_at)} ·{" "}
                            <button
                              type="button"
                              aria-expanded={abierto === t.id}
                              onClick={() => setAbierto((a) => (a === t.id ? null : t.id))}
                              className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
                            >
                              {productos(t.lineas.length)}
                            </button>
                          </p>
                        </div>
                        <StatusChip tone={e.tono}>{e.texto}</StatusChip>
                        {t.estado === "ENVIADO" && (() => {
                          // Una sucursal borrada no recibe mercancía (0194): solo queda la punta viva.
                          const recibe = viva(t.destino_sucursal_id), regresa = viva(t.origen_sucursal_id);
                          if (!recibe && !regresa) return <p className="text-13 text-ink-3">Las dos sucursales están eliminadas.</p>;
                          return (
                            <span className="flex gap-3">
                              {recibe && (
                                <AccionFila disabled={ocupado !== null} onClick={() => void accion(t, "recibir")}>
                                  {ocupado === t.id ? "Guardando…" : "Recibir"}
                                </AccionFila>
                              )}
                              {regresa && <AccionFila peligro disabled={ocupado !== null} onClick={() => void accion(t, "cancelar")}>Cancelar</AccionFila>}
                            </span>
                          );
                        })()}
                      </div>
                      {abierto === t.id && (
                        <ul className="mt-2 rounded border border-line text-sm">
                          {t.lineas.map((l) => (
                            <li key={l.producto_id} className="flex justify-between gap-3 border-t border-line px-3 py-2 first:border-t-0">
                              <span>{nombreProducto(l.producto_id)}</span>
                              <span className="tabular-nums text-ink-2">{conUnidad(formatear(Number(l.cantidad), "cantidad"), catalogo.find((p) => p.id === l.producto_id)?.tipo_venta)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        {dialogoConfirmar}
      </PageBody>
    </>
  );
}
