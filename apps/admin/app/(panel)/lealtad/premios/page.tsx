"use client";
import { useEffect, useState } from "react";
import { Button, DialogoPeligro, Modal } from "@vim/ui/styles";
import { cantidad, type Mecanica } from "@vim/db/lealtad";
import { PageBody, PageHeader } from "../../../components/page-header";
import { LealtadPestanas } from "../../../components/lealtad-pestanas";
import {
  cambiarCostoPremio, costoPremioSchema, crearPremio, eliminarPremio, leerProgramaAdmin, listarPremios, mensajeLealtad,
  productosParaPremio, setActivoPremio, type PremioAdmin,
} from "../../../lib/lealtad";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-13 font-medium text-ink-2";
const accion = "h-9 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50";

const fmtMxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

type Editando = { id: string | null; productoId: string; nombre: string; costo: string };

export default function PremiosLealtadPage() {
  const [premios, setPremios] = useState<PremioAdmin[] | null>(null);
  /** undefined = leyendo; null = todavía no hay programa. */
  const [mecanica, setMecanica] = useState<Mecanica | null | undefined>(undefined);
  const [opciones, setOpciones] = useState<{ id: string; nombre: string; precio: number }[]>([]);
  const [editando, setEditando] = useState<Editando | null>(null);
  const [borrar, setBorrar] = useState<PremioAdmin | null>(null);
  /** Una escritura a la vez: mientras algo se guarda, lo demás no responde. */
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Mensaje si no se pudo leer el programa (distinto de «todavía no hay programa»). */
  const [falloPrograma, setFalloPrograma] = useState<string | null>(null);

  async function recargar() {
    try {
      setPremios(await listarPremios());
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudieron leer los premios"));
      setPremios((prev) => prev ?? []);
    }
  }

  useEffect(() => {
    let vivo = true;
    leerProgramaAdmin().then((p) => { if (vivo) setMecanica(p?.mecanica ?? null); })
      .catch((e) => {
        if (!vivo) return;
        setFalloPrograma(mensajeLealtad(e, "No se pudo leer el programa"));
        setMecanica(null);
      });
    void recargar();
    return () => { vivo = false; };
  }, []);

  async function nuevo() {
    if (ocupado !== null) return;
    setError(null);
    setOcupado("nuevo");
    try {
      const ops = await productosParaPremio();
      setOpciones(ops);
      setEditando({ id: null, productoId: ops[0]?.id ?? "", nombre: "", costo: "" });
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudieron leer los productos"));
    } finally {
      setOcupado(null);
    }
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const costo = costoPremioSchema.safeParse(editando.costo);
    if (!costo.success) { setError(costo.error.issues[0]?.message ?? "Revisa el costo."); return; }
    if (!editando.id && !editando.productoId) { setError("Elige el producto que vas a regalar."); return; }
    setOcupado("guardar");
    try {
      if (editando.id) await cambiarCostoPremio(editando.id, costo.data);
      else await crearPremio(editando.productoId, costo.data);
      setEditando(null);
      await recargar();
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudo guardar el premio"));
    } finally {
      setOcupado(null);
    }
  }

  async function alternar(p: PremioAdmin) {
    setError(null);
    setOcupado(p.id);
    try {
      await setActivoPremio(p.id, !p.activo);
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudo cambiar el premio"));
    } finally {
      await recargar();
      setOcupado(null);
    }
  }

  async function confirmarBorrado() {
    if (!borrar) return;
    setOcupado(borrar.id);
    try {
      await eliminarPremio(borrar.id);
      setBorrar(null);
      await recargar();
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudo eliminar el premio"));
    } finally {
      setOcupado(null);
    }
  }

  const unidadDe = (n: number) => cantidad(mecanica ?? "SELLOS", n);
  const conPremios = mecanica === "SELLOS" || mecanica === "PUNTOS_PREMIOS";

  return (
    <>
      <PageHeader
        titulo="Lealtad"
        subtitulo="Lo que tus clientes se pueden llevar."
        right={conPremios ? <Button onClick={() => void nuevo()} disabled={ocupado !== null}>Nuevo premio</Button> : undefined}
      />
      <PageBody>
        <LealtadPestanas />

        {error && !editando && !borrar && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {falloPrograma && <p className="mb-4 text-sm font-medium text-danger" role="alert">{falloPrograma}</p>}
        {(premios === null || mecanica === undefined) && <p className="text-sm text-ink-3">Cargando…</p>}

        {mecanica === null && !falloPrograma && premios !== null && (
          <p className="max-w-[640px] rounded-lg border border-line bg-surface px-4 py-3 text-14 text-ink-2">
            Primero guarda tu programa en la pestaña Programa. Los premios se usan con sellos o con puntos por premios.
          </p>
        )}

        {mecanica === "PUNTOS_DINERO" && (
          <p className="mb-4 max-w-[640px] rounded-lg border border-line bg-surface px-4 py-3 text-14 text-ink-2">
            Tu programa es de puntos que valen dinero: el cliente los usa como descuento en su cuenta y no hacen falta premios.
            {premios && premios.length > 0 ? " Los premios de abajo quedaron de otra forma de ganar y no se ofrecen en la caja." : ""}
          </p>
        )}

        {conPremios && premios !== null && premios.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="font-display text-lg font-semibold">Aún no hay premios</p>
            <p className="mt-1 text-sm text-ink-2">Elige un producto de tu catálogo y di cuánto cuesta. Sin premios, tus clientes juntan pero no tienen qué canjear.</p>
            <div className="mt-4"><Button onClick={() => void nuevo()} disabled={ocupado !== null}>Nuevo premio</Button></div>
          </div>
        )}

        {premios !== null && premios.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-bg text-left text-12 font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5">Premio</th>
                  <th className="px-4 py-2.5 text-right">Cuesta</th>
                  <th className="px-4 py-2.5 text-right">Precio en carta</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {premios.map((p) => (
                  <tr key={p.id} className={`border-b border-line last:border-b-0 ${ocupado === p.id ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{p.nombre}</div>
                      {!p.productoDisponible && <div className="text-12 font-medium text-warning">Su producto está pausado: no se puede entregar.</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{unidadDe(p.costo)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-2">{fmtMxn(p.precio)}</td>
                    <td className="px-4 py-3">
                      <span className={["inline-block rounded-full px-2 py-0.5 text-12 font-semibold", p.activo ? "bg-success-soft text-success" : "bg-hover text-ink-3"].join(" ")}>
                        {p.activo ? "Activo" : "Pausado"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" className={accion} disabled={ocupado !== null}
                          onClick={() => { setError(null); setEditando({ id: p.id, productoId: p.productoId, nombre: p.nombre, costo: String(p.costo) }); }}>
                          Cambiar costo
                        </button>
                        <button type="button" className={accion} disabled={ocupado !== null} onClick={() => void alternar(p)}>
                          {p.activo ? "Pausar" : "Activar"}
                        </button>
                        <button type="button" disabled={ocupado !== null} onClick={() => { setError(null); setBorrar(p); }}
                          className="h-9 rounded border border-line-strong px-3 text-13 font-semibold text-danger transition hover:border-danger disabled:opacity-50">
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {conPremios && (
          <p className="mt-5 max-w-[720px] rounded-lg border border-line bg-surface px-4 py-3 text-13 leading-relaxed text-ink-2">
            En la caja, el premio entra a la cuenta como el producto en $0.00, sale a cocina y descuenta inventario como cualquier otro.
            Una cuenta que lleva un premio no se factura de forma individual: queda en tu factura global. Los combos no se pueden dar de premio.
          </p>
        )}
      </PageBody>

      {editando && (
        <Modal
          open
          onClose={() => { if (ocupado === null) { setEditando(null); setError(null); } }}
          title={editando.id ? "Cambiar el costo" : "Nuevo premio"}
          className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
        >
          {editando.id ? (
            <p className="mt-3 text-14 font-semibold text-ink">{editando.nombre}</p>
          ) : opciones.length === 0 ? (
            <p className="mt-3 text-14 text-ink-2">No hay productos disponibles: todos son combos, están pausados o ya son premios.</p>
          ) : (
            <div className="mt-4">
              <label className={label} htmlFor="premio-producto">Producto que regalas</label>
              <select id="premio-producto" className={input} value={editando.productoId} autoFocus
                onChange={(e) => setEditando({ ...editando, productoId: e.target.value })}>
                {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre} · {fmtMxn(o.precio)}</option>)}
              </select>
            </div>
          )}

          {(editando.id || opciones.length > 0) && (
            <div className="mt-4">
              <label className={label} htmlFor="premio-costo">Cuánto cuesta ({mecanica === "SELLOS" ? "sellos" : "puntos"})</label>
              <input id="premio-costo" className={input} inputMode="numeric" value={editando.costo} autoFocus={editando.id !== null}
                onChange={(e) => setEditando({ ...editando, costo: e.target.value.replace(/\D/g, "") })} placeholder={mecanica === "SELLOS" ? "6" : "100"} />
            </div>
          )}

          {error && <p className="mt-3 text-13 font-medium text-danger" role="alert">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => { setEditando(null); setError(null); }} disabled={ocupado !== null}
              className="h-11 flex-1 rounded border border-line-strong text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50">
              Cancelar
            </button>
            <Button className="flex-1" onClick={() => void guardar()} disabled={ocupado !== null || (!editando.id && opciones.length === 0)}>
              {ocupado === "guardar" ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </Modal>
      )}

      {borrar && (
        <DialogoPeligro
          titulo="¿Eliminar este premio?"
          consecuencia={
            <>
              <strong>{borrar.nombre}</strong> deja de ofrecerse en la caja. Los canjes que ya se hicieron no cambian y los saldos de tus
              clientes tampoco.
            </>
          }
          error={error}
          boton="Eliminar"
          ocupado={ocupado === borrar.id}
          textoOcupado="Eliminando…"
          ancho="sm"
          onConfirmar={() => void confirmarBorrado()}
          onCerrar={() => { setBorrar(null); setError(null); }}
        />
      )}
    </>
  );
}
