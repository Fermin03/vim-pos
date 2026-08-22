"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import {
  areaSchema, crearArea, editarArea, eliminarArea, listarAreasCocina, setActivaArea,
  TIPOS_AREA, type AreaCocina,
} from "../../../lib/areas-cocina";
import { listarSucursalesMesas, type Sucursal } from "../../../lib/mesas";
import { mensajeError } from "../../../lib/errores";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

type FormDatos = { sucursal_id: string; nombre: string; tipo: string };

/**
 * Estaciones de preparación.
 *
 * Sirven para una sola cosa visible: repartir la comanda. Las bebidas salen en la impresora de la
 * barra y la comida en la de cocina, en vez de todo junto en un papel que hay que leer entero.
 */
export default function AreasPage() {
  const [areas, setAreas] = useState<AreaCocina[] | null>(null);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: FormDatos } | null>(null);
  const [borrar, setBorrar] = useState<AreaCocina | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    setError(null);
    try {
      const [a, s] = await Promise.all([listarAreasCocina(), listarSucursalesMesas()]);
      setAreas(a); setSucursales(s);
    } catch (e) { setError(mensajeError(e, "No se pudieron cargar las estaciones")); setAreas([]); }
  }
  useEffect(() => { recargar(); }, []);

  function nueva() {
    setEditando({ id: null, datos: { sucursal_id: sucursales[0]?.id ?? "", nombre: "", tipo: "COCINA_CALIENTE" } });
  }
  function editar(a: AreaCocina) {
    setEditando({ id: a.id, datos: { sucursal_id: a.sucursalId, nombre: a.nombre, tipo: a.tipo || "OTRO" } });
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const parsed = areaSchema.safeParse(editando.datos);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Datos inválidos"); return; }
    setGuardando(true);
    try {
      if (editando.id) await editarArea(editando.id, parsed.data);
      else await crearArea(parsed.data);
      setEditando(null); recargar();
    } catch (e) { setError(mensajeError(e, "No se pudo guardar")); }
    finally { setGuardando(false); }
  }

  async function confirmarBorrado() {
    if (!borrar) return;
    setGuardando(true);
    try { await eliminarArea(borrar.id); setBorrar(null); recargar(); }
    catch (e) { setError(mensajeError(e, "No se pudo eliminar")); }
    finally { setGuardando(false); }
  }

  function set<K extends keyof FormDatos>(k: K, v: FormDatos[K]) {
    if (editando) setEditando({ ...editando, datos: { ...editando.datos, [k]: v } });
  }

  return (
    <>
      <PageHeader
        titulo="Estaciones de preparación"
        subtitulo="Dónde se prepara cada cosa. La comanda se parte y cada estación recibe solo lo suyo."
        migas={[{ label: "Configuración" }, { label: "Estaciones" }]}
        right={<Button onClick={nueva} disabled={sucursales.length === 0}>Nueva estación</Button>}
      />
      <PageBody>
        <p className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          Después de crearlas, asigna cada categoría a su estación en <strong>Catálogo → Categorías</strong>
          {" "}(Bebidas → Barra) y, si algún producto es la excepción, cámbiaselo en su ficha. Por último,
          en el POS entra a <strong>Configurar impresora</strong> y elige qué impresora usa cada estación:
          eso se define en cada caja, porque cada una tiene sus propias impresoras.
        </p>

        {error && !editando && !borrar && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {areas === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {areas !== null && areas.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="font-display text-lg font-semibold">Aún no hay estaciones</p>
            <p className="mt-1 text-sm text-ink-2">
              Sin estaciones, cada pedido sale en una sola comanda por la impresora de cocina, como hasta ahora.
            </p>
            <div className="mt-4"><Button onClick={nueva} disabled={sucursales.length === 0}>Nueva estación</Button></div>
          </div>
        )}

        {areas !== null && areas.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-bg text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5">Estación</th>
                  <th className="px-4 py-2.5">Tipo</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">Sucursal</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-ink">{a.nombre}</td>
                    <td className="px-4 py-3 text-ink-2">{TIPOS_AREA.find((t) => t.v === a.tipo)?.l ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-ink-3 lg:table-cell">{a.sucursalNombre || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={["inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold", a.activa ? "bg-[#EAF3EE] text-success" : "bg-hover text-ink-3"].join(" ")}>
                        {a.activa ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => editar(a)} className="h-9 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">Editar</button>
                        <button
                          type="button"
                          onClick={async () => {
                            try { await setActivaArea(a.id, !a.activa); recargar(); }
                            catch (e) { setError(mensajeError(e, "No se pudo cambiar el estado")); }
                          }}
                          className="h-9 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                        >
                          {a.activa ? "Desactivar" : "Activar"}
                        </button>
                        <button type="button" onClick={() => setBorrar(a)} className="h-9 rounded border border-line-strong px-3 text-[13px] font-semibold text-danger transition hover:border-danger">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>

      {editando && (
        <Modal open onClose={() => setEditando(null)} title={editando.id ? "Editar estación" : "Nueva estación"} className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
          <div className="mt-4">
            <label className={label} htmlFor="nombre">Nombre</label>
            <input id="nombre" className={input} value={editando.datos.nombre} maxLength={100} autoFocus placeholder="Cocina, Barra…" onChange={(e) => set("nombre", e.target.value)} />
          </div>
          <div className="mt-3">
            <label className={label} htmlFor="tipo">Tipo</label>
            <select id="tipo" className={input} value={editando.datos.tipo} onChange={(e) => set("tipo", e.target.value)}>
              {TIPOS_AREA.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          {sucursales.length > 1 && (
            <div className="mt-3">
              <label className={label} htmlFor="suc">Sucursal</label>
              <select id="suc" className={input} value={editando.datos.sucursal_id} onChange={(e) => set("sucursal_id", e.target.value)}>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}
          {error && <p className="mt-3 text-[13px] font-medium text-danger" role="alert">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setEditando(null)} disabled={guardando} className="h-11 flex-1 rounded border border-line-strong text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50">Cancelar</button>
            <Button className="flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
          </div>
        </Modal>
      )}

      {borrar && (
        <Modal open onClose={() => setBorrar(null)} title="Eliminar estación" className="w-[420px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            Se elimina <strong>{borrar.nombre}</strong>. Los productos y categorías que la usaban vuelven a
            imprimirse en la comanda de cocina — no se pierde ningún pedido.
          </p>
          {error && <p className="mt-3 text-[13px] font-medium text-danger" role="alert">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setBorrar(null)} disabled={guardando} className="h-11 flex-1 rounded border border-line-strong text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50">Cancelar</button>
            <Button className="flex-1" onClick={confirmarBorrado} disabled={guardando}>{guardando ? "Eliminando…" : "Eliminar"}</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
