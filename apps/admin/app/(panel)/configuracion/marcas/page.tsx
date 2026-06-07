"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../../components/page-header";
import {
  actualizarMarca,
  crearMarca,
  eliminarMarca,
  listarMarcas,
  marcaSchema,
  type Marca,
} from "../../../lib/configuracion";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const VACIA = { codigo: "", nombre: "", descripcion: "", color_primario_hex: "#E8502E", activa: true };

export default function MarcasPage() {
  const [marcas, setMarcas] = useState<Marca[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: typeof VACIA } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    try {
      setMarcas(await listarMarcas());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setMarcas([]);
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  function nueva() {
    setError(null);
    setEditando({ id: null, datos: { ...VACIA } });
  }
  function editar(m: Marca) {
    setError(null);
    setEditando({
      id: m.id,
      datos: { codigo: m.codigo, nombre: m.nombre, descripcion: m.descripcion ?? "", color_primario_hex: m.color_primario_hex || "#E8502E", activa: m.activa },
    });
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const parsed = marcaSchema.safeParse(editando.datos);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editando.id) await actualizarMarca(editando.id, parsed.data);
      else await crearMarca(parsed.data);
      setOkMsg("Marca guardada.");
      setTimeout(() => setOkMsg(null), 2500);
      setEditando(null);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(m: Marca) {
    if (!confirm(`¿Eliminar la marca "${m.nombre}"?`)) return;
    try {
      await eliminarMarca(m.id);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  return (
    <>
      <PageHeader
        titulo="Marcas virtuales"
        subtitulo="Cocinas fantasma: un mismo local opera varias marcas (multi-concepto, dark kitchen, foodtruck)."
        migas={[{ label: "Configuración" }, { label: "Marcas virtuales" }]}
        right={<Button onClick={nueva}>Nueva marca</Button>}
      />
      <PageBody>
        {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}
        {error && !editando && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

        {marcas === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {marcas && marcas.length === 0 && !editando && (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
            <p className="text-[15px] font-semibold text-ink-2">Sin marcas todavía</p>
            <p className="mt-1 text-[13px]">Crea tu primera marca virtual para operar varios conceptos desde el mismo local.</p>
          </div>
        )}
        {marcas && marcas.length > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {marcas.map((m) => (
              <div key={m.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 flex-shrink-0 rounded-lg" style={{ background: m.color_primario_hex || "#E8502E" }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[15px] font-semibold">{m.nombre}</div>
                    <div className="font-mono text-[11px] text-ink-3">{m.codigo}</div>
                  </div>
                  {!m.activa && <span className="rounded-full bg-sel px-2 py-0.5 text-[10.5px] font-bold text-ink-3">Inactiva</span>}
                </div>
                {m.descripcion && <p className="mt-2 line-clamp-2 text-[12.5px] text-ink-3">{m.descripcion}</p>}
                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <button type="button" onClick={() => editar(m)} className="text-[12.5px] font-semibold text-ink-2 hover:text-ink">Editar</button>
                  <button type="button" onClick={() => borrar(m)} className="ml-auto text-[12.5px] font-semibold text-ink-3 hover:text-danger">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Editor inline */}
        {editando && (
          <div className="mt-5 max-w-[560px] rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 font-display text-[16px] font-semibold tracking-tight">{editando.id ? "Editar marca" : "Nueva marca"}</div>
            <div className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="m-codigo">Código</label>
                  <input id="m-codigo" className={input} value={editando.datos.codigo} maxLength={50}
                    onChange={(e) => setEditando({ ...editando, datos: { ...editando.datos, codigo: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") } })} placeholder="tacos-don-pepe" />
                </div>
                <div>
                  <label className={label} htmlFor="m-color">Color</label>
                  <input id="m-color" type="color" className="h-11 w-full rounded border border-line-strong" value={editando.datos.color_primario_hex}
                    onChange={(e) => setEditando({ ...editando, datos: { ...editando.datos, color_primario_hex: e.target.value } })} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="m-nombre">Nombre</label>
                <input id="m-nombre" className={input} value={editando.datos.nombre} maxLength={150}
                  onChange={(e) => setEditando({ ...editando, datos: { ...editando.datos, nombre: e.target.value } })} placeholder="Tacos Don Pepe" />
              </div>
              <div>
                <label className={label} htmlFor="m-desc">Descripción · <span className="text-ink-3">opcional</span></label>
                <textarea id="m-desc" className={`${input} h-20 resize-none py-2`} value={editando.datos.descripcion} maxLength={500}
                  onChange={(e) => setEditando({ ...editando, datos: { ...editando.datos, descripcion: e.target.value } })} />
              </div>
              <label className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                <input type="checkbox" checked={editando.datos.activa} onChange={(e) => setEditando({ ...editando, datos: { ...editando.datos, activa: e.target.checked } })} />
                Marca activa
              </label>

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
