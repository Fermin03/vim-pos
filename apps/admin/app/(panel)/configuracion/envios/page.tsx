"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { listarSucursales, type Sucursal } from "../../../lib/configuracion";
import {
  crearZona,
  editarZona,
  eliminarZona,
  listarZonas,
  setActivaZona,
  zonaSchema,
  type Zona,
} from "../../../lib/zonas-envio";
import { mensajeError } from "../../../lib/errores";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

type FormDatos = { nombre: string; costoMxn: string; orden: string };
const FORM_VACIO: FormDatos = { nombre: "", costoMxn: "0", orden: "0" };

const fmtMxn = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/**
 * Zonas de envío: a qué colonias reparte esta sucursal y cuánto cobra por cada una.
 *
 * Se administran aquí con calma; el cajero también puede crearlas al vuelo desde la caja al
 * capturar la dirección de un pedido a domicilio.
 */
export default function ZonasEnvioPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucId, setSucId] = useState<string>("");
  const [zonas, setZonas] = useState<Zona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: FormDatos } | null>(null);
  const [borrar, setBorrar] = useState<Zona | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    listarSucursales()
      .then((ss) => {
        setSucursales(ss);
        if (ss.length > 0) setSucId(ss[0]!.id);
      })
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar las sucursales")));
  }, []);

  async function recargar(sid: string) {
    setError(null);
    try {
      setZonas(await listarZonas(sid));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar las zonas"));
      setZonas([]);
    }
  }
  useEffect(() => {
    if (sucId) recargar(sucId);
  }, [sucId]);

  function nueva() {
    setEditando({ id: null, datos: { ...FORM_VACIO, orden: String((zonas?.length ?? 0) * 10) } });
  }
  function editar(z: Zona) {
    setEditando({
      id: z.id,
      datos: { nombre: z.nombre, costoMxn: String(z.costoMxn), orden: String(z.orden) },
    });
  }

  async function guardar() {
    if (!editando || !sucId) return;
    setError(null);
    const parsed = zonaSchema.safeParse(editando.datos);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editando.id) await editarZona(editando.id, parsed.data);
      else await crearZona(sucId, parsed.data);
      setEditando(null);
      recargar(sucId);
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActiva(z: Zona) {
    setError(null);
    try {
      await setActivaZona(z.id, !z.activa);
      recargar(sucId);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado"));
    }
  }

  async function confirmarBorrado() {
    if (!borrar) return;
    setGuardando(true);
    try {
      await eliminarZona(borrar.id);
      setBorrar(null);
      recargar(sucId);
    } catch (e) {
      setError(mensajeError(e, "No se pudo eliminar"));
    } finally {
      setGuardando(false);
    }
  }

  function set<K extends keyof FormDatos>(k: K, v: FormDatos[K]) {
    if (editando) setEditando({ ...editando, datos: { ...editando.datos, [k]: v } });
  }

  return (
    <>
      <PageHeader
        titulo="Zonas de envío"
        subtitulo="A qué colonias reparte esta sucursal y cuánto se cobra por cada una."
        migas={[{ label: "Configuración" }, { label: "Zonas de envío" }]}
        right={sucId ? <Button onClick={nueva}>Nueva zona</Button> : undefined}
      />
      <PageBody>
        {sucursales.length === 0 ? (
          <p className="text-sm text-ink-3">No hay sucursales. Crea una primero.</p>
        ) : (
          <>
            <div className="mb-5 max-w-[320px]">
              <label className={label} htmlFor="z-suc">Sucursal</label>
              <select id="z-suc" className={input} value={sucId} onChange={(e) => setSucId(e.target.value)}>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            {error && !editando && !borrar && (
              <p className="mb-4 text-sm font-medium text-danger" role="alert">
                {error}
              </p>
            )}
            {zonas === null && <p className="text-sm text-ink-3">Cargando…</p>}

            {zonas !== null && zonas.length === 0 && (
              <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
                <p className="font-display text-lg font-semibold">Aún no hay zonas de envío</p>
                <p className="mt-1 text-sm text-ink-2">
                  Da de alta las colonias a las que reparte esta sucursal y su costo de envío.
                </p>
                <div className="mt-4">
                  <Button onClick={nueva}>Nueva zona</Button>
                </div>
              </div>
            )}

            {zonas !== null && zonas.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-bg text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                      <th className="px-4 py-2.5">Zona</th>
                      <th className="px-4 py-2.5">Costo</th>
                      <th className="px-4 py-2.5">Activa</th>
                      <th className="px-4 py-2.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zonas.map((z) => (
                      <tr key={z.id} className="border-b border-line last:border-b-0">
                        <td className="px-4 py-3 font-semibold text-ink">{z.nombre}</td>
                        <td className="px-4 py-3 tabular-nums text-ink-2">{fmtMxn(z.costoMxn)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={[
                              "inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold",
                              z.activa ? "bg-success-soft text-success" : "bg-hover text-ink-3",
                            ].join(" ")}
                          >
                            {z.activa ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => editar(z)}
                              className="h-9 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => alternarActiva(z)}
                              className="h-9 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                            >
                              {z.activa ? "Desactivar" : "Activar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setBorrar(z)}
                              className="h-9 rounded border border-line-strong px-3 text-[13px] font-semibold text-danger transition hover:border-danger"
                            >
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

            <p className="mt-5 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              Cambiar el costo de una zona afecta a los pedidos nuevos. Los ya cobrados conservan
              lo que se cobró ese día.
            </p>
          </>
        )}
      </PageBody>

      {editando && (
        <Modal
          open
          onClose={() => setEditando(null)}
          title={editando.id ? "Editar zona" : "Nueva zona"}
          className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
        >
          <div className="mt-4">
            <label className={label} htmlFor="nombre">Nombre</label>
            <input
              id="nombre"
              className={input}
              value={editando.datos.nombre}
              maxLength={60}
              autoFocus
              onChange={(e) => set("nombre", e.target.value)}
            />
          </div>
          <div className="mt-3">
            <label className={label} htmlFor="costo">Costo de envío (MXN)</label>
            <input
              id="costo"
              className={input}
              inputMode="decimal"
              value={editando.datos.costoMxn}
              onChange={(e) => set("costoMxn", e.target.value)}
            />
          </div>
          <div className="mt-3">
            <label className={label} htmlFor="orden">Orden</label>
            <input
              id="orden"
              className={input}
              inputMode="numeric"
              value={editando.datos.orden}
              onChange={(e) => set("orden", e.target.value)}
            />
            <p className="mt-1 text-[11.5px] text-ink-3">Las zonas se muestran de menor a mayor orden.</p>
          </div>

          {error && <p className="mt-3 text-[13px] font-medium text-danger" role="alert">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setEditando(null)}
              disabled={guardando}
              className="h-11 flex-1 rounded border border-line-strong text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50"
            >
              Cancelar
            </button>
            <Button className="flex-1" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </Modal>
      )}

      {borrar && (
        <Modal
          open
          onClose={() => setBorrar(null)}
          title="Eliminar zona"
          className="w-[420px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
        >
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            Se quita <strong>{borrar.nombre}</strong> de las zonas del POS. Los pedidos que ya se
            cobraron con esta zona conservan su costo de envío.
          </p>
          {error && <p className="mt-3 text-[13px] font-medium text-danger" role="alert">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setBorrar(null)}
              disabled={guardando}
              className="h-11 flex-1 rounded border border-line-strong text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50"
            >
              Cancelar
            </button>
            <Button className="flex-1" onClick={confirmarBorrado} disabled={guardando}>
              {guardando ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
