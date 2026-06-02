"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { ModalSucursal } from "../../../components/modal-sucursal";
import { eliminarSucursal, listarSucursales, type Sucursal } from "../../../lib/configuracion";

export default function SucursalesPage() {
  const [list, setList] = useState<Sucursal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ sucursal: Sucursal | null } | null>(null);
  const [borrar, setBorrar] = useState<Sucursal | null>(null);
  const [borrando, setBorrando] = useState(false);

  async function recargar() {
    setError(null);
    try {
      setList(await listarSucursales());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  async function confirmarBorrado() {
    if (!borrar) return;
    setBorrando(true);
    try {
      await eliminarSucursal(borrar.id);
      setBorrar(null);
      setBorrando(false);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
      setBorrando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Sucursales"
        subtitulo="Cada local donde operas. Cada sucursal puede tener varias cajas."
        migas={[{ label: "Configuración" }, { label: "Sucursales" }]}
        right={
          <Button onClick={() => setModal({ sucursal: null })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[17px] w-[17px]">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva sucursal
          </Button>
        }
      />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {list === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {list !== null && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Sucursal</th>
                  <th className="w-[260px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Dirección</th>
                  <th className="w-[100px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Cajas</th>
                  <th className="w-[110px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Estado</th>
                  <th className="w-[104px] border-b border-line bg-sel px-4 py-[13px]"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="group cursor-pointer border-b border-line last:border-none hover:bg-hover" onClick={() => setModal({ sucursal: s })}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 items-center justify-center rounded border border-line bg-hover px-2 font-display text-[12px] font-bold tabular-nums text-ink-2">{s.codigo}</span>
                        <div className="text-[15px] font-semibold">{s.nombre}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[13.5px] text-ink-2">
                      {s.direccion_calle || s.ciudad ? (
                        <>
                          {s.direccion_calle && <div>{s.direccion_calle}</div>}
                          {s.ciudad && <div className="text-ink-3">{s.ciudad}{s.estado_geo ? `, ${s.estado_geo}` : ""}</div>}
                        </>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-display text-[15px] font-semibold tabular-nums">{s.nCajas}</span>{" "}
                      <span className="text-xs text-ink-3">{s.nCajas === 1 ? "caja" : "cajas"}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[12.5px] font-semibold", s.activa ? "bg-[#EAF3EE] text-success" : "bg-hover text-ink-3"].join(" ")}>
                        <span className={["h-1.5 w-1.5 rounded-full", s.activa ? "bg-success" : "bg-ink-3"].join(" ")} />
                        {s.activa ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" title="Editar" onClick={() => setModal({ sucursal: s })} className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button type="button" title="Eliminar" onClick={() => setBorrar(s)} className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-[#E8C5C0] hover:text-danger">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {list.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold">Aún no hay sucursales</p>
                <p className="max-w-sm text-sm text-ink-2">Crea tu primera sucursal para empezar.</p>
                <Button onClick={() => setModal({ sucursal: null })}>Crear sucursal</Button>
              </div>
            )}
          </div>
        )}
      </PageBody>

      {modal && (
        <ModalSucursal
          sucursal={modal.sucursal}
          onCerrar={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            recargar();
          }}
        />
      )}

      {borrar && (
        <Modal open onClose={() => setBorrar(null)} title="Eliminar sucursal" className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-xl">
          <p className="text-sm text-ink-2">
            ¿Eliminar <b className="text-ink">{borrar.nombre}</b>?
            {borrar.nCajas > 0 && <> Tiene <b>{borrar.nCajas}</b> caja(s).</>}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBorrar(null)} disabled={borrando}>Cancelar</Button>
            <Button variant="danger" onClick={confirmarBorrado} disabled={borrando}>{borrando ? "Eliminando…" : "Eliminar"}</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
