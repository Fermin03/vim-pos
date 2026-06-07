"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../components/page-header";
import {
  actualizarPromo,
  cambiarEstadoPromo,
  crearPromo,
  eliminarPromo,
  listarPromos,
  promoSchema,
  TIPOS_PROMO,
  type EstadoPromo,
  type Promo,
  type TipoPromo,
} from "../../lib/promociones";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

type FormDatos = { nombre: string; descripcion: string; tipo: TipoPromo; valor: string; fecha_inicio: string; fecha_fin: string };
function ahoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
const VACIO = (): FormDatos => ({ nombre: "", descripcion: "", tipo: "PORCENTAJE", valor: "", fecha_inicio: ahoraLocal(), fecha_fin: "" });

const COLOR_ESTADO: Record<EstadoPromo, string> = {
  ACTIVA: "bg-[#EAF3EE] text-success", PAUSADA: "bg-[#FCF3E6] text-warning",
  EXPIRADA: "bg-[#F2F2F0] text-ink-3", AGOTADA: "bg-[#FBECEA] text-danger",
};

export default function PromocionesPage() {
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: FormDatos } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    try { setPromos(await listarPromos()); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar"); setPromos([]); }
  }
  useEffect(() => { recargar(); }, []);

  const tipoSel = TIPOS_PROMO.find((t) => t.v === editando?.datos.tipo);

  async function guardar() {
    if (!editando) return;
    setError(null);
    const parsed = promoSchema.safeParse({
      nombre: editando.datos.nombre,
      descripcion: editando.datos.descripcion,
      tipo: editando.datos.tipo,
      valor: editando.datos.tipo === "CORTESIA_TOTAL" ? undefined : Number(editando.datos.valor || 0),
      fecha_inicio: editando.datos.fecha_inicio,
      fecha_fin: editando.datos.fecha_fin,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Datos inválidos"); return; }
    setGuardando(true);
    try {
      if (editando.id) await actualizarPromo(editando.id, parsed.data);
      else await crearPromo(parsed.data);
      setOkMsg("Promoción guardada."); setTimeout(() => setOkMsg(null), 2500);
      setEditando(null); recargar();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setGuardando(false); }
  }

  async function alternar(p: Promo) {
    try { await cambiarEstadoPromo(p.id, p.estado === "ACTIVA" ? "PAUSADA" : "ACTIVA"); recargar(); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }
  async function borrar(p: Promo) {
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
    try { await eliminarPromo(p.id); recargar(); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }

  function set<K extends keyof FormDatos>(k: K, v: FormDatos[K]) {
    if (editando) setEditando({ ...editando, datos: { ...editando.datos, [k]: v } });
  }

  return (
    <>
      <PageHeader titulo="Promociones" subtitulo="Descuentos, precios especiales y cortesías con vigencia (happy hour)." right={<Button onClick={() => setEditando({ id: null, datos: VACIO() })}>Nueva promoción</Button>} />
      <PageBody>
        {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}
        {error && !editando && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

        {promos === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {promos && promos.length === 0 && !editando && (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
            <p className="text-[15px] font-semibold text-ink-2">Sin promociones</p>
            <p className="mt-1 text-[13px]">Crea descuentos o precios especiales con su rango de vigencia.</p>
          </div>
        )}
        {promos && promos.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13.5px]">
              <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2.5">Promoción</th><th className="px-4 py-2.5">Beneficio</th><th className="px-4 py-2.5">Vigencia</th><th className="px-4 py-2.5">Estado</th><th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody>
                {promos.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5"><div className="font-medium">{p.nombre}</div>{p.descripcion && <div className="text-[12px] text-ink-3">{p.descripcion}</div>}</td>
                    <td className="px-4 py-2.5 font-semibold tabular-nums">{p.valorTexto}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-ink-2">
                      {new Date(p.fechaInicio).toLocaleDateString("es-MX")}{p.fechaFin ? ` → ${new Date(p.fechaFin).toLocaleDateString("es-MX")}` : " → sin fin"}
                    </td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${COLOR_ESTADO[p.estado]}`}>{p.estado}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => setEditando({ id: p.id, datos: { nombre: p.nombre, descripcion: p.descripcion, tipo: p.tipo, valor: p.valorTexto.replace(/[^0-9.]/g, ""), fecha_inicio: p.fechaInicio.slice(0, 16), fecha_fin: p.fechaFin ? p.fechaFin.slice(0, 16) : "" } })} className="text-[12.5px] font-semibold text-ink-2 hover:text-ink">Editar</button>
                      {(p.estado === "ACTIVA" || p.estado === "PAUSADA") && <button type="button" onClick={() => alternar(p)} className="ml-3 text-[12.5px] font-semibold text-ink-3 hover:text-ink">{p.estado === "ACTIVA" ? "Pausar" : "Activar"}</button>}
                      <button type="button" onClick={() => borrar(p)} className="ml-3 text-[12.5px] font-semibold text-ink-3 hover:text-danger">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editando && (
          <div className="mt-5 max-w-[560px] rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 font-display text-[16px] font-semibold tracking-tight">{editando.id ? "Editar promoción" : "Nueva promoción"}</div>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className={label} htmlFor="p-nom">Nombre</label>
                <input id="p-nom" className={input} value={editando.datos.nombre} maxLength={120} onChange={(e) => set("nombre", e.target.value)} placeholder="Happy hour 2x1" />
              </div>
              <div>
                <label className={label} htmlFor="p-desc">Descripción · opcional</label>
                <input id="p-desc" className={input} value={editando.datos.descripcion} maxLength={300} onChange={(e) => set("descripcion", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="p-tipo">Tipo</label>
                  <select id="p-tipo" className={input} value={editando.datos.tipo} onChange={(e) => set("tipo", e.target.value as TipoPromo)}>
                    {TIPOS_PROMO.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                </div>
                {tipoSel?.necesitaValor && (
                  <div>
                    <label className={label} htmlFor="p-val">Valor ({tipoSel.sufijo})</label>
                    <input id="p-val" className={input} value={editando.datos.valor} inputMode="decimal" onChange={(e) => set("valor", e.target.value.replace(/[^0-9.]/g, ""))} placeholder={tipoSel.v === "PORCENTAJE" ? "20" : "50.00"} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="p-fi">Inicio</label>
                  <input id="p-fi" type="datetime-local" className={input} value={editando.datos.fecha_inicio} onChange={(e) => set("fecha_inicio", e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="p-ff">Fin · opcional</label>
                  <input id="p-ff" type="datetime-local" className={input} value={editando.datos.fecha_fin} onChange={(e) => set("fecha_fin", e.target.value)} />
                </div>
              </div>
              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
                <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
