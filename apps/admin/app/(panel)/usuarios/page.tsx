"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../components/page-header";
import { ModalNuevoUsuario } from "../../components/modal-nuevo-usuario";
import { ModalResetearPin } from "../../components/modal-resetear-pin";
import {
  ROL_LABEL,
  ROLES_ASIGNABLES,
  cambiarRol,
  fechaCorta,
  listarUsuarios,
  setActivo,
  type Usuario,
} from "../../lib/usuarios";

const ROLES_FILTRO = ["all", "DUENO", "ADMIN", "SUPERVISOR", "CAJERO", "PERSONAL"] as const;
type RolFiltro = (typeof ROLES_FILTRO)[number];

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rolFiltro, setRolFiltro] = useState<RolFiltro>("all");
  const [estado, setEstado] = useState<"all" | "activos" | "inactivos">("all");
  const [nuevo, setNuevo] = useState(false);
  const [reset, setReset] = useState<Usuario | null>(null);
  const [confirmar, setConfirmar] = useState<{ u: Usuario; activar: boolean } | null>(null);
  const [cambiarRolModal, setCambiarRolModal] = useState<Usuario | null>(null);

  async function recargar() {
    setError(null);
    try {
      setUsuarios(await listarUsuarios());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los usuarios");
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  const visibles = useMemo(() => {
    return (usuarios ?? []).filter((u) => {
      if (rolFiltro !== "all" && u.rolCodigo !== rolFiltro) return false;
      if (estado === "activos" && !u.activo) return false;
      if (estado === "inactivos" && u.activo) return false;
      if (query && !u.nombre.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [usuarios, rolFiltro, estado, query]);

  const totalActivos = (usuarios ?? []).filter((u) => u.activo).length;
  const totalInactivos = (usuarios ?? []).filter((u) => !u.activo).length;

  async function aplicarActivar(u: Usuario, activar: boolean) {
    try {
      await setActivo(u.id, activar);
      setConfirmar(null);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
      setConfirmar(null);
    }
  }

  async function aplicarCambioRol(u: Usuario, nuevoRol: string) {
    try {
      await cambiarRol(u.id, nuevoRol);
      setCambiarRolModal(null);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el rol");
      setCambiarRolModal(null);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Usuarios"
        subtitulo="Empleados y permisos del negocio."
        migas={[{ label: "Administración" }, { label: "Usuarios" }]}
        right={
          <Button onClick={() => setNuevo(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[17px] w-[17px]">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo usuario
          </Button>
        }
      />
      <PageBody>
        {/* KPIs */}
        {usuarios !== null && (
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Total</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">{usuarios.length}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Activos</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums text-success">{totalActivos}</div>
              <div className="text-[11.5px] text-ink-3">pueden iniciar sesión</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Inactivos</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums text-ink-3">{totalInactivos}</div>
              <div className="text-[11.5px] text-ink-3">sin acceso al sistema</div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-[340px] flex-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-[13px] top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-3">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar usuario…"
              className="h-10 w-full rounded border border-line-strong pl-[38px] pr-3 text-sm outline-none focus:border-ink"
            />
          </div>
          <select
            value={rolFiltro}
            onChange={(e) => setRolFiltro(e.target.value as RolFiltro)}
            className="h-10 rounded border border-line-strong bg-surface px-3 text-sm font-medium outline-none focus:border-ink"
          >
            <option value="all">Todos los roles</option>
            {ROLES_FILTRO.slice(1).map((r) => (
              <option key={r} value={r}>{ROL_LABEL[r]}</option>
            ))}
          </select>
          <div className="inline-flex gap-0.5 rounded border border-line bg-hover p-[3px]">
            {(["all", "activos", "inactivos"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setEstado(s)}
                className={[
                  "rounded-[4px] px-3 py-[7px] text-[13px] font-semibold transition",
                  estado === s ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
                ].join(" ")}
              >
                {s === "all" ? "Todos" : s === "activos" ? "Activos" : "Inactivos"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>
        )}

        {usuarios === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {usuarios !== null && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Usuario</th>
                  <th className="w-[150px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Rol</th>
                  <th className="w-[120px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Estado</th>
                  <th className="w-[140px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Último acceso</th>
                  <th className="w-[140px] border-b border-line bg-sel px-4 py-[13px]"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((u) => (
                  <tr key={u.id} className="group border-b border-line last:border-none hover:bg-hover">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border border-line bg-hover font-display text-[13px] font-semibold text-ink-2">
                          {iniciales(u.nombre)}
                        </span>
                        <div>
                          <div className="text-[14.5px] font-semibold">{u.nombre}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[13.5px] text-ink-2">{u.rolNombre}</td>
                    <td className="px-4 py-3.5">
                      <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[12.5px] font-semibold", u.activo ? "bg-[#EAF3EE] text-success" : "bg-hover text-ink-3"].join(" ")}>
                        <span className={["h-1.5 w-1.5 rounded-full", u.activo ? "bg-success" : "bg-ink-3"].join(" ")} />
                        {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-[13.5px] text-ink-3">{fechaCorta(u.fechaUltimoLoginPin)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="inline-flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          title="Cambiar rol"
                          onClick={() => setCambiarRolModal(u)}
                          disabled={u.rolCodigo === "DUENO"}
                          className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink disabled:opacity-30 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-ink-3"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1M17 7a3 3 0 0 1 0 6" /></svg>
                        </button>
                        <button
                          type="button"
                          title="Resetear PIN"
                          onClick={() => setReset(u)}
                          className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                        </button>
                        <button
                          type="button"
                          title={u.activo ? "Desactivar" : "Activar"}
                          onClick={() => setConfirmar({ u, activar: !u.activo })}
                          disabled={u.rolCodigo === "DUENO"}
                          className={["flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-line-strong hover:bg-surface", u.activo ? "hover:text-danger" : "hover:text-success", "disabled:opacity-30 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-ink-3"].join(" ")}
                        >
                          {u.activo ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="9" /><path d="M4.5 4.5l15 15" /></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><polyline points="20 6 9 17 4 12" /></svg>
                          )}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {visibles.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold">
                  {usuarios.length === 0 ? "Solo estás tú" : "Sin resultados"}
                </p>
                <p className="max-w-sm text-sm text-ink-2">
                  {usuarios.length === 0
                    ? "Crea cuentas para tu equipo. Cada uno operará el POS con su PIN."
                    : "No hay usuarios que coincidan con tu búsqueda o filtros."}
                </p>
                {usuarios.length === 0 && <Button onClick={() => setNuevo(true)}>Crear el primer usuario</Button>}
              </div>
            )}
          </div>
        )}

        {usuarios !== null && visibles.length > 0 && (
          <p className="mt-4 text-[13px] text-ink-3">
            Mostrando <b className="text-ink-2">{visibles.length}</b> de <b className="text-ink-2">{usuarios.length}</b> usuarios
          </p>
        )}
      </PageBody>

      {nuevo && (
        <ModalNuevoUsuario
          onCerrar={() => setNuevo(false)}
          onCreado={() => {
            setNuevo(false);
            recargar();
          }}
        />
      )}

      {reset && (
        <ModalResetearPin
          usuario={reset}
          onCerrar={() => setReset(null)}
          onHecho={() => {
            setReset(null);
            recargar();
          }}
        />
      )}

      {confirmar && (
        <Modal
          open
          onClose={() => setConfirmar(null)}
          title={confirmar.activar ? "Activar usuario" : "Desactivar usuario"}
          className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-xl"
        >
          <p className="text-sm text-ink-2">
            {confirmar.activar ? "Activar " : "Desactivar "}
            <b className="text-ink">{confirmar.u.nombre}</b>?
            {!confirmar.activar && " No podrá iniciar sesión en el POS."}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button variant={confirmar.activar ? "primary" : "danger"} onClick={() => aplicarActivar(confirmar.u, confirmar.activar)}>
              {confirmar.activar ? "Activar" : "Desactivar"}
            </Button>
          </div>
        </Modal>
      )}

      {cambiarRolModal && (
        <Modal
          open
          onClose={() => setCambiarRolModal(null)}
          title={`Cambiar rol de ${cambiarRolModal.nombre}`}
          className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-xl"
        >
          <h2 className="mb-4 font-display text-lg font-semibold tracking-tight">Cambiar rol</h2>
          <p className="mb-4 text-sm text-ink-2">
            Rol actual de <b className="text-ink">{cambiarRolModal.nombre}</b>: <b>{cambiarRolModal.rolNombre}</b>
          </p>
          <div className="flex flex-col gap-1.5">
            {ROLES_ASIGNABLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => aplicarCambioRol(cambiarRolModal, r)}
                disabled={r === cambiarRolModal.rolCodigo}
                className={[
                  "flex items-center justify-between rounded border px-3 py-2.5 text-left text-sm transition",
                  r === cambiarRolModal.rolCodigo
                    ? "border-line bg-hover text-ink-3"
                    : "border-line-strong hover:border-ink hover:bg-sel",
                ].join(" ")}
              >
                <span className="font-medium">{ROL_LABEL[r]}</span>
                {r === cambiarRolModal.rolCodigo && <span className="text-[12px]">Actual</span>}
              </button>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <Button variant="ghost" onClick={() => setCambiarRolModal(null)}>Cancelar</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
