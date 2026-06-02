"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import {
  actualizarOpcion,
  crearOpcion,
  eliminarOpcion,
  listarOpciones,
  opcionSchema,
  precioExtra,
  type Opcion,
} from "../lib/modificadores";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

function ModalOpcion({
  grupoId,
  opcion,
  onCerrar,
  onGuardado,
}: {
  grupoId: string;
  opcion: Opcion | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const editar = !!opcion;
  const [nombre, setNombre] = useState(opcion?.nombre ?? "");
  const [precio, setPrecio] = useState(opcion ? String(opcion.precio_extra_mxn) : "0");
  const [esDefault, setEsDefault] = useState(opcion?.es_default ?? false);
  const [activa, setActiva] = useState(opcion?.activa ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError(null);
    const parsed = opcionSchema.safeParse({ nombre, precio_extra_mxn: Number(precio), es_default: esDefault, activa });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editar) await actualizarOpcion(grupoId, opcion!.id, parsed.data);
      else await crearOpcion(grupoId, parsed.data);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  return (
    <Modal open onClose={onCerrar} title={editar ? "Editar opción" : "Nueva opción"} className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-xl">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="op-nombre">Nombre</label>
          <input id="op-nombre" className={input} value={nombre} maxLength={150} autoFocus onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Tres cuartos, Sin cebolla, Extra queso" />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="op-precio">Precio extra (MXN)</label>
          <input id="op-precio" className={input} value={precio} inputMode="decimal" onChange={(e) => setPrecio(e.target.value.replace(/[^0-9.-]/g, ""))} placeholder="0.00" />
          <p className="mt-1 text-[11.5px] text-ink-3">0 = sin costo. Puede ser negativo (descuento).</p>
        </div>
        <label className="flex items-center gap-2.5">
          <input type="checkbox" className="h-4 w-4 accent-[#16161A]" checked={esDefault} onChange={(e) => setEsDefault(e.target.checked)} />
          <span className="text-sm"><span className="font-medium">Opción por defecto</span> <span className="text-ink-3">(pre-seleccionada)</span></span>
        </label>
        <label className="flex items-center gap-2.5">
          <input type="checkbox" className="h-4 w-4 accent-[#16161A]" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          <span className="text-sm"><span className="font-medium">Activa</span></span>
        </label>
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : editar ? "Guardar" : "Agregar"}</Button>
      </div>
    </Modal>
  );
}

export function OpcionesEditor({ grupoId }: { grupoId: string }) {
  const [opciones, setOpciones] = useState<Opcion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ opcion: Opcion | null } | null>(null);

  async function recargar() {
    setError(null);
    try {
      setOpciones(await listarOpciones(grupoId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las opciones");
    }
  }
  useEffect(() => {
    recargar();
  }, [grupoId]);

  async function borrar(o: Opcion) {
    try {
      await eliminarOpcion(o.id);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  return (
    <div className="mt-8 max-w-[640px] border-t border-line pt-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-semibold">Opciones del grupo</h2>
          <p className="text-[12.5px] text-ink-3">Lo que el cliente puede elegir dentro de este grupo.</p>
        </div>
        <Button variant="ghost" onClick={() => setModal({ opcion: null })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[15px] w-[15px]"><path d="M12 5v14M5 12h14" /></svg>
          Agregar opción
        </Button>
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      {opciones === null && <p className="text-sm text-ink-3">Cargando…</p>}

      {opciones && opciones.length === 0 && (
        <div className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-ink-3">
          Aún no hay opciones. Agrega la primera (ej. “Tres cuartos”).
        </div>
      )}

      {opciones && opciones.length > 0 && (
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {opciones.map((o) => (
            <li key={o.id} className="group flex items-center gap-3 border-b border-line px-4 py-3 last:border-none hover:bg-hover">
              <div className="flex-1">
                <span className="text-[14.5px] font-medium">{o.nombre}</span>
                {o.es_default && <span className="ml-2 rounded-full bg-hover px-2 py-0.5 text-[11px] font-semibold text-ink-2">Por defecto</span>}
                {!o.activa && <span className="ml-2 rounded-full bg-hover px-2 py-0.5 text-[11px] font-semibold text-ink-3">Inactiva</span>}
              </div>
              <span className="text-[14px] font-semibold tabular-nums text-ink-2">{precioExtra(o.precio_extra_mxn)}</span>
              <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button type="button" title="Editar" onClick={() => setModal({ opcion: o })} className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[15px] w-[15px]"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
                <button type="button" title="Eliminar" onClick={() => borrar(o)} className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-[#E8C5C0] hover:text-danger">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[15px] w-[15px]"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <ModalOpcion
          grupoId={grupoId}
          opcion={modal.opcion}
          onCerrar={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}
