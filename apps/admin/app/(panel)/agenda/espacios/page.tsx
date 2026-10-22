"use client";
import { useEffect, useState } from "react";
import { Cargando, Button, useConfirmar } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { Tarjeta } from "../../../components/tarjeta";
import { AccionFila } from "../../../components/controles";
import { input, label } from "../../../components/campos";
import {
  activarEspacio, borrarTipoEspacio, guardarEspacio, guardarTipoEspacio, listarEspacios, listarTiposEspacio,
  nombreEspacioSchema, type Espacio, type TipoEspacio,
} from "../../../lib/agenda";
import { listarSucursales, type Sucursal } from "../../../lib/configuracion";
import { mensajeError } from "../../../lib/errores";

const th = "border-b border-line bg-sel px-4 py-[11px] text-left text-12 font-bold uppercase tracking-wide text-ink-3";
type Editando = { id: string | null; nombre: string; sucursalId: string; tipoEspacioId: string };

/** Tipos de espacio (cabina, sillón) y los espacios concretos de cada sucursal (0218). */
export default function EspaciosPage() {
  const [confirmar, dialogoConfirmar] = useConfirmar();
  const [tipos, setTipos] = useState<TipoEspacio[] | null>(null);
  const [espacios, setEspacios] = useState<Espacio[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nuevoTipo, setNuevoTipo] = useState("");
  const [tipoEditando, setTipoEditando] = useState<{ id: string; nombre: string } | null>(null);
  const [editando, setEditando] = useState<Editando | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    try {
      const [t, e, s] = await Promise.all([listarTiposEspacio(), listarEspacios(), listarSucursales()]);
      setTipos(t); setEspacios(e); setSucursales(s.filter((x) => x.activa));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron leer los espacios"));
      setTipos((t) => t ?? []);
    }
  }
  useEffect(() => { void recargar(); }, []);

  /** Una escritura a la vez; al terminar se vuelve a leer todo. */
  async function escribir(f: () => Promise<void>, despues?: () => void) {
    setGuardando(true);
    setError(null);
    try {
      await f();
      despues?.();
      await recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  function guardarTipo(id: string | null, nombre: string) {
    const p = nombreEspacioSchema.safeParse(nombre);
    if (!p.success) return setError(p.error.issues[0]?.message ?? "Nombre inválido");
    void escribir(() => guardarTipoEspacio(id, p.data), () => (id ? setTipoEditando(null) : setNuevoTipo("")));
  }

  async function eliminarTipo(t: TipoEspacio) {
    if (espacios.some((e) => e.tipoEspacioId === t.id)) {
      return setError(`«${t.nombre}» tiene espacios. Cámbialos de tipo antes de eliminarlo.`);
    }
    if (!(await confirmar({ titulo: `¿Eliminar el tipo ${t.nombre}?`, boton: "Eliminar" }))) return;
    void escribir(() => borrarTipoEspacio(t.id));
  }

  function guardar() {
    if (!editando) return;
    const p = nombreEspacioSchema.safeParse(editando.nombre);
    if (!p.success) return setError(p.error.issues[0]?.message ?? "Nombre inválido");
    if (!editando.sucursalId || !editando.tipoEspacioId) return setError("Elige la sucursal y el tipo de espacio.");
    const { id, sucursalId, tipoEspacioId } = editando;
    void escribir(() => guardarEspacio(id, { nombre: p.data, sucursalId, tipoEspacioId, orden: espacios.length + 1 }), () => setEditando(null));
  }

  const nombreTipo = new Map((tipos ?? []).map((t) => [t.id, t.nombre]));
  const nombreSucursal = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const puedeCrear = (tipos?.length ?? 0) > 0 && sucursales.length > 0;

  return (
    <>
      {dialogoConfirmar}
      <PageHeader
        titulo="Espacios"
        subtitulo="Dónde se atiende: cabinas, sillones o camillas. Una cita ocupa su espacio y nadie más lo puede agendar a esa hora."
        migas={[{ label: "Agenda" }, { label: "Espacios" }]}
        right={<Button disabled={!puedeCrear || guardando}
          onClick={() => { setError(null); setEditando({ id: null, nombre: "", sucursalId: sucursales[0]?.id ?? "", tipoEspacioId: tipos?.[0]?.id ?? "" }); }}>
          Nuevo espacio
        </Button>}
      />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {tipos === null ? <Cargando /> : (
          <div className="flex flex-col gap-5">
            <Tarjeta titulo="Tipos de espacio" descripcion="Lo que pide un servicio. Un corte pide «Sillón»; un facial, «Cabina».">
              {tipos.length > 0 && (
                <ul className="mb-4 divide-y divide-line border-y border-line">
                  {tipos.map((t) => (
                    <li key={t.id} className="flex min-h-[44px] items-center gap-3 py-1.5">
                      {tipoEditando?.id === t.id ? (
                        <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); guardarTipo(t.id, tipoEditando.nombre); }}>
                          <input className={input} aria-label="Nombre del tipo" maxLength={60} autoFocus value={tipoEditando.nombre}
                            onChange={(e) => setTipoEditando({ id: t.id, nombre: e.target.value })} />
                          <Button type="submit" disabled={guardando}>Guardar</Button>
                          <Button variant="ghost" onClick={() => setTipoEditando(null)} disabled={guardando}>Cancelar</Button>
                        </form>
                      ) : (
                        <>
                          <span className="flex-1 text-14 font-medium">{t.nombre}</span>
                          <span className="text-13 tabular-nums text-ink-3">
                            {espacios.filter((e) => e.tipoEspacioId === t.id).length} espacios
                          </span>
                          <AccionFila onClick={() => setTipoEditando({ id: t.id, nombre: t.nombre })} disabled={guardando}>Editar</AccionFila>
                          <AccionFila peligro onClick={() => void eliminarTipo(t)} disabled={guardando}>Eliminar</AccionFila>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form className="flex max-w-[420px] items-end gap-3" onSubmit={(e) => { e.preventDefault(); guardarTipo(null, nuevoTipo); }}>
                <div className="flex-1">
                  <label className={label} htmlFor="tipo-nuevo">Nuevo tipo</label>
                  <input id="tipo-nuevo" className={input} maxLength={60} placeholder="Cabina" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} />
                </div>
                <Button type="submit" variant="ghost" disabled={guardando || !nuevoTipo.trim()}>Agregar</Button>
              </form>
            </Tarjeta>

            {editando && (
              <Tarjeta titulo={editando.id ? "Editar espacio" : "Nuevo espacio"}>
                <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className={label} htmlFor="esp-nombre">Nombre</label>
                      <input id="esp-nombre" className={input} maxLength={60} placeholder="Cabina 1" autoFocus value={editando.nombre}
                        onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
                    </div>
                    <div>
                      <label className={label} htmlFor="esp-tipo">Tipo</label>
                      <select id="esp-tipo" className={input} value={editando.tipoEspacioId} onChange={(e) => setEditando({ ...editando, tipoEspacioId: e.target.value })}>
                        {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={label} htmlFor="esp-suc">Sucursal</label>
                      <select id="esp-suc" className={input} value={editando.sucursalId} onChange={(e) => setEditando({ ...editando, sucursalId: e.target.value })}>
                        {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                    <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
                    <Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
                  </div>
                </form>
              </Tarjeta>
            )}

            {espacios.length === 0 ? (
              <div className="max-w-[720px] rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
                <p className="text-15 font-semibold text-ink-2">Sin espacios todavía</p>
                <p className="mt-1 text-13">{puedeCrear ? "Agrega cada cabina o sillón de tus sucursales." : "Primero agrega un tipo de espacio."}</p>
              </div>
            ) : (
              <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
                <table className="w-full border-collapse text-14">
                  <thead>
                    <tr>
                      <th className={th}>Espacio</th>
                      <th className={th}>Tipo</th>
                      <th className={th}>Sucursal</th>
                      <th className={`${th} w-[110px]`}>Estado</th>
                      <th className={`${th} w-[170px]`}><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {espacios.map((e) => (
                      <tr key={e.id} className="border-b border-line last:border-none hover:bg-hover">
                        <td className="px-4 py-2.5 font-semibold">{e.nombre}</td>
                        <td className="px-4 py-2.5 text-ink-2">{nombreTipo.get(e.tipoEspacioId) ?? "—"}</td>
                        <td className="px-4 py-2.5 text-ink-2">{nombreSucursal.get(e.sucursalId) ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          {e.activo ? <span className="text-13 text-ink-2">Activo</span>
                            : <span className="rounded-full bg-hover px-2 py-0.5 text-11 font-bold text-ink-3">Inactivo</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-4">
                            <AccionFila disabled={guardando}
                              onClick={() => { setError(null); setEditando({ id: e.id, nombre: e.nombre, sucursalId: e.sucursalId, tipoEspacioId: e.tipoEspacioId }); }}>
                              Editar
                            </AccionFila>
                            <AccionFila disabled={guardando} onClick={() => void escribir(() => activarEspacio(e.id, !e.activo))}>
                              {e.activo ? "Desactivar" : "Activar"}
                            </AccionFila>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
