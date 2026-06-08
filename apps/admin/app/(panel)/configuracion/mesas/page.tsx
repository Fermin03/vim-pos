"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import {
  actualizarMesa,
  crearMesa,
  eliminarMesa,
  ESTADO_LABEL,
  FORMAS,
  listarMesas,
  listarSucursalesMesas,
  mesaSchema,
  type FormaMesa,
  type Mesa,
  type Sucursal,
} from "../../../lib/mesas";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

type FormDatos = { sucursal_id: string; numero: string; nombre: string; capacidad: string; forma: FormaMesa };

const COLOR_ESTADO: Record<string, string> = {
  LIBRE: "bg-[#EAF3EE] text-success", OCUPADA: "bg-[#FBECEA] text-danger",
  RESERVADA: "bg-[#FCF3E6] text-warning", EN_LIMPIEZA: "bg-hover text-ink-3", FUERA_DE_SERVICIO: "bg-hover text-ink-3",
};

export default function MesasPage() {
  const [mesas, setMesas] = useState<Mesa[] | null>(null);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: FormDatos } | null>(null);
  const [borrar, setBorrar] = useState<Mesa | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    setError(null);
    try {
      const [m, s] = await Promise.all([listarMesas(), listarSucursalesMesas()]);
      setMesas(m); setSucursales(s);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar"); setMesas([]); }
  }
  useEffect(() => { recargar(); }, []);

  const grupos = useMemo(() => {
    const m = new Map<string, { nombre: string; mesas: Mesa[] }>();
    for (const x of mesas ?? []) {
      const g = m.get(x.sucursalId);
      if (g) g.mesas.push(x); else m.set(x.sucursalId, { nombre: x.sucursalNombre, mesas: [x] });
    }
    return Array.from(m.values());
  }, [mesas]);

  function nueva() {
    setEditando({ id: null, datos: { sucursal_id: sucursales[0]?.id ?? "", numero: "", nombre: "", capacidad: "4", forma: "RECTANGULAR" } });
  }
  function editar(m: Mesa) {
    setEditando({ id: m.id, datos: { sucursal_id: m.sucursalId, numero: m.numero, nombre: m.nombre, capacidad: String(m.capacidad), forma: m.forma } });
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const parsed = mesaSchema.safeParse({
      sucursal_id: editando.datos.sucursal_id,
      numero: editando.datos.numero,
      nombre: editando.datos.nombre,
      capacidad: Number(editando.datos.capacidad || 0),
      forma: editando.datos.forma,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Datos inválidos"); return; }
    setGuardando(true);
    try {
      if (editando.id) await actualizarMesa(editando.id, parsed.data);
      else await crearMesa(parsed.data);
      setEditando(null); recargar();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setGuardando(false); }
  }

  async function confirmarBorrado() {
    if (!borrar) return;
    setGuardando(true);
    try { await eliminarMesa(borrar.id); setBorrar(null); recargar(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo eliminar"); }
    finally { setGuardando(false); }
  }

  function set<K extends keyof FormDatos>(k: K, v: FormDatos[K]) {
    if (editando) setEditando({ ...editando, datos: { ...editando.datos, [k]: v } });
  }

  return (
    <>
      <PageHeader
        titulo="Mesas"
        subtitulo="Da de alta las mesas de cada sucursal para operar Full Service (cuentas por mesa)."
        migas={[{ label: "Configuración" }, { label: "Mesas" }]}
        right={<Button onClick={nueva} disabled={sucursales.length === 0}>Nueva mesa</Button>}
      />
      <PageBody>
        {error && !editando && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {mesas === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {mesas !== null && mesas.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="font-display text-lg font-semibold">Aún no hay mesas</p>
            <p className="mt-1 text-sm text-ink-2">Crea las mesas de tu salón para abrir cuentas por mesa en el POS.</p>
            <div className="mt-4"><Button onClick={nueva} disabled={sucursales.length === 0}>Crear primera mesa</Button></div>
          </div>
        )}

        {mesas !== null && mesas.length > 0 && (
          <div className="flex flex-col gap-6">
            {grupos.map((g) => (
              <div key={g.nombre} className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="border-b border-line bg-sel px-4 py-2.5"><h2 className="font-display text-[14px] font-semibold">{g.nombre}</h2></div>
                <table className="w-full border-collapse text-[13.5px]">
                  <thead><tr className="text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                    <th className="w-[90px] border-b border-line px-4 py-[11px]">N°</th>
                    <th className="border-b border-line px-4 py-[11px]">Nombre</th>
                    <th className="w-[110px] border-b border-line px-4 py-[11px]">Capacidad</th>
                    <th className="w-[120px] border-b border-line px-4 py-[11px]">Forma</th>
                    <th className="w-[130px] border-b border-line px-4 py-[11px]">Estado</th>
                    <th className="w-[100px] border-b border-line px-4 py-[11px]"></th>
                  </tr></thead>
                  <tbody>
                    {g.mesas.map((m) => (
                      <tr key={m.id} className="group border-b border-line last:border-none hover:bg-hover">
                        <td className="px-4 py-3 font-display text-[14px] font-bold tabular-nums">{m.numero}</td>
                        <td className="px-4 py-3">{m.nombre || <span className="text-ink-3">—</span>}</td>
                        <td className="px-4 py-3 tabular-nums">{m.capacidad} <span className="text-ink-3">pers.</span></td>
                        <td className="px-4 py-3">{FORMAS.find((f) => f.v === m.forma)?.l ?? m.forma}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${COLOR_ESTADO[m.estado] ?? "bg-hover text-ink-3"}`}>{ESTADO_LABEL[m.estado]}</span></td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <span className="inline-flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button type="button" title="Editar" onClick={() => editar(m)} className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                            <button type="button" title="Eliminar" disabled={m.estado === "OCUPADA"} onClick={() => setBorrar(m)} className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-[#E8C5C0] hover:text-danger disabled:cursor-not-allowed disabled:opacity-30">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </PageBody>

      {editando && (
        <Modal open onClose={() => setEditando(null)} title={editando.id ? "Editar mesa" : "Nueva mesa"} className="w-[460px] rounded-lg border border-line bg-surface p-6 shadow-xl">
          <div className="flex flex-col gap-3.5">
            <div>
              <label className={label} htmlFor="m-suc">Sucursal</label>
              <select id="m-suc" className={input} value={editando.datos.sucursal_id} onChange={(e) => set("sucursal_id", e.target.value)}>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="m-num">Número</label>
                <input id="m-num" className={input} value={editando.datos.numero} maxLength={20} onChange={(e) => set("numero", e.target.value)} placeholder="5" />
              </div>
              <div>
                <label className={label} htmlFor="m-cap">Capacidad</label>
                <input id="m-cap" className={input} value={editando.datos.capacidad} inputMode="numeric" onChange={(e) => set("capacidad", e.target.value.replace(/[^0-9]/g, ""))} placeholder="4" />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="m-nom">Nombre · opcional</label>
              <input id="m-nom" className={input} value={editando.datos.nombre} maxLength={60} onChange={(e) => set("nombre", e.target.value)} placeholder="Terraza 1" />
            </div>
            <div>
              <label className={label} htmlFor="m-forma">Forma</label>
              <select id="m-forma" className={input} value={editando.datos.forma} onChange={(e) => set("forma", e.target.value as FormaMesa)}>
                {FORMAS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
              </select>
            </div>
            {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
            <div className="mt-1 flex items-center justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
              <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
            </div>
          </div>
        </Modal>
      )}

      {borrar && (
        <Modal open onClose={() => setBorrar(null)} title="Eliminar mesa" className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-xl">
          <p className="text-sm text-ink-2">¿Eliminar la <b className="text-ink">Mesa {borrar.numero}</b>?</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBorrar(null)} disabled={guardando}>Cancelar</Button>
            <Button variant="danger" onClick={confirmarBorrado} disabled={guardando}>{guardando ? "Eliminando…" : "Eliminar"}</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
