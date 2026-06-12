"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { ConfigSideNav } from "../../../components/config-sidenav";
import {
  asignarPermisosUsuario, leerMatriz, permisosDeUsuario, quitarPermiso, restaurarPermiso,
  usuariosPersonalizados, type MatrizPermisos, type UsuarioPersonalizado,
} from "../../../lib/roles-permisos";

/**
 * Fase 5 · Roles y permisos (doc 09 §7).
 * D71: el dueño puede QUITAR permisos a los roles del sistema en su negocio (nunca ampliar:
 * las restricciones protegen al propio dueño). D72: usuarios con rol PERSONALIZADO reciben
 * solo los permisos marcados explícitamente.
 */
export default function RolesPermisosPage() {
  const [matriz, setMatriz] = useState<MatrizPermisos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null); // `${rolId}:${permisoId}` en vuelo

  // D72
  const [personalizados, setPersonalizados] = useState<UsuarioPersonalizado[]>([]);
  const [usuarioSel, setUsuarioSel] = useState<string>("");
  const [permisosSel, setPermisosSel] = useState<Set<string>>(new Set());
  const [guardandoPers, setGuardandoPers] = useState(false);
  const [msgPers, setMsgPers] = useState<string | null>(null);

  async function cargar() {
    setError(null);
    try {
      const [m, us] = await Promise.all([leerMatriz(), usuariosPersonalizados()]);
      setMatriz(m);
      setPersonalizados(us);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (!usuarioSel) { setPermisosSel(new Set()); return; }
    permisosDeUsuario(usuarioSel).then((ps) => setPermisosSel(new Set(ps))).catch(() => setPermisosSel(new Set()));
  }, [usuarioSel]);

  const categorias = useMemo(() => {
    const m = new Map<string, typeof matriz extends null ? never : NonNullable<typeof matriz>["permisos"]>();
    for (const p of matriz?.permisos ?? []) {
      if (!m.has(p.categoria)) m.set(p.categoria, []);
      m.get(p.categoria)!.push(p);
    }
    return [...m.entries()];
  }, [matriz]);

  async function toggle(rolId: string, permisoId: string, activoHoy: boolean) {
    const clave = `${rolId}:${permisoId}`;
    setOcupado(clave);
    setError(null);
    try {
      if (activoHoy) await quitarPermiso(rolId, permisoId);
      else await restaurarPermiso(rolId, permisoId);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setOcupado(null);
    }
  }

  async function guardarPersonalizado() {
    if (!usuarioSel) return;
    setGuardandoPers(true);
    setError(null);
    setMsgPers(null);
    try {
      await asignarPermisosUsuario(usuarioSel, [...permisosSel]);
      setMsgPers("Permisos del usuario guardados.");
      setTimeout(() => setMsgPers(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardandoPers(false);
    }
  }

  return (
    <>
      <PageHeader titulo="Roles y permisos" subtitulo="Ajusta qué puede hacer cada rol en tu negocio (solo restringir) y los permisos de usuarios personalizados." migas={[{ label: "Configuración" }, { label: "Roles y permisos" }]} />
      <div className="flex">
        <ConfigSideNav />
        <PageBody>
          {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
          {matriz === null && !error && <p className="text-sm text-ink-3">Cargando matriz…</p>}

          {matriz && (
            <>
              {/* ── D71: matriz restrictiva ── */}
              <div className="mb-2 rounded-lg border border-[#E8DCC0] bg-[#F6EEDD] px-4 py-2.5 text-[12.5px] font-medium text-warning">
                Solo puedes <b>quitar</b> permisos (los roles del sistema no se amplían: esas reglas antifraude te protegen a ti).
              </div>
              <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line bg-sel text-left text-[11px] font-bold uppercase tracking-wide text-ink-3">
                      <th className="sticky left-0 bg-sel px-4 py-2.5">Permiso</th>
                      {matriz.roles.map((r) => <th key={r.id} className="px-3 py-2.5 text-center">{r.nombre}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {categorias.map(([cat, permisos]) => (
                      <>
                        <tr key={cat} className="border-b border-line bg-hover">
                          <td colSpan={1 + matriz.roles.length} className="px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-3">{cat}</td>
                        </tr>
                        {permisos.map((p) => (
                          <tr key={p.id} className="border-b border-line last:border-b-0">
                            <td className="sticky left-0 bg-surface px-4 py-2 font-medium">{p.nombre}</td>
                            {matriz.roles.map((r) => {
                              const tieneBase = matriz.base.get(r.id)?.has(p.id) ?? false;
                              const quitado = matriz.quitados.get(r.id)?.has(p.id) ?? false;
                              const activo = tieneBase && !quitado;
                              const clave = `${r.id}:${p.id}`;
                              if (!tieneBase) return <td key={r.id} className="px-3 py-2 text-center text-ink-3">—</td>;
                              return (
                                <td key={r.id} className="px-3 py-2 text-center">
                                  <button
                                    type="button"
                                    disabled={ocupado === clave}
                                    onClick={() => toggle(r.id, p.id, activo)}
                                    title={activo ? "Quitar este permiso en mi negocio" : "Restaurar el permiso del sistema"}
                                    className={[
                                      "inline-flex h-6 w-6 items-center justify-center rounded transition disabled:opacity-50",
                                      activo ? "bg-[#EAF3EE] text-success hover:bg-[#d9eadf]" : "bg-[#FBF1EF] text-danger hover:bg-[#f3dcd7]",
                                    ].join(" ")}
                                  >
                                    {activo ? "✓" : "✕"}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── D72: permisos explícitos del rol PERSONALIZADO ── */}
              <section className="mt-6 rounded-lg border border-line bg-surface p-5">
                <h2 className="font-display text-[16px] font-semibold tracking-tight">Usuarios personalizados</h2>
                <p className="mb-4 text-[12.5px] text-ink-3">
                  Un usuario con rol <b>Personalizado</b> solo puede hacer lo que marques aquí (p.ej. un "jefe de parrilla" que
                  marca pedidos listos y ve tiempos de cocina, sin acceso a nada más).
                </p>
                {personalizados.length === 0 ? (
                  <p className="text-[13px] text-ink-3">
                    No hay usuarios con rol Personalizado. Créalo en <b>Usuarios → Nuevo</b> eligiendo el rol "Personalizado" y vuelve aquí para marcar sus permisos.
                  </p>
                ) : (
                  <>
                    <select
                      value={usuarioSel}
                      onChange={(e) => setUsuarioSel(e.target.value)}
                      className="h-10 rounded border border-line-strong bg-surface px-3 text-[13px] outline-none focus:border-ink"
                    >
                      <option value="">Elige un usuario…</option>
                      {personalizados.map((u) => <option key={u.usuarioId} value={u.usuarioId}>{u.nombre}</option>)}
                    </select>
                    {usuarioSel && (
                      <>
                        <div className="mt-4 grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-3">
                          {matriz.permisos.map((p) => (
                            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded border border-line px-3 py-2 text-[12.5px] hover:border-line-strong">
                              <input
                                type="checkbox"
                                checked={permisosSel.has(p.id)}
                                onChange={(e) => {
                                  const n = new Set(permisosSel);
                                  if (e.target.checked) n.add(p.id); else n.delete(p.id);
                                  setPermisosSel(n);
                                }}
                                className="h-4 w-4 accent-ink"
                              />
                              <span className="min-w-0 truncate font-medium">{p.nombre}</span>
                            </label>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-3">
                          {msgPers && <span className="text-[13px] font-medium text-success">{msgPers}</span>}
                          <Button onClick={guardarPersonalizado} disabled={guardandoPers}>
                            {guardandoPers ? "Guardando…" : `Guardar (${permisosSel.size} permisos)`}
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </PageBody>
      </div>
    </>
  );
}
