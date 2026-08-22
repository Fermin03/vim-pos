"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import {
  crearRepartidor,
  editarRepartidor,
  eliminarRepartidor,
  listarRepartidores,
  repartidorSchema,
  setActivoRepartidor,
  type Repartidor,
} from "../../../lib/repartidores";
import { mensajeError } from "../../../lib/errores";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

type FormDatos = { nombre: string; telefono: string; notas: string };

/**
 * Repartidores del negocio.
 *
 * Se dan de alta aquí y el cajero los elige de una lista al marcar la salida de un domicilio. NO
 * son usuarios del sistema: no entran al POS, no tienen PIN y no aparecen en la pantalla donde se
 * elige quién opera la caja. Por eso viven en su propio catálogo y no en Usuarios.
 */
export default function RepartidoresPage() {
  const [repartidores, setRepartidores] = useState<Repartidor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: FormDatos } | null>(null);
  const [borrar, setBorrar] = useState<Repartidor | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    setError(null);
    try {
      setRepartidores(await listarRepartidores());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los repartidores"));
      setRepartidores([]);
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  function nuevo() {
    setEditando({ id: null, datos: { nombre: "", telefono: "", notas: "" } });
  }
  function editar(r: Repartidor) {
    setEditando({ id: r.id, datos: { nombre: r.nombre, telefono: r.telefono, notas: r.notas } });
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const parsed = repartidorSchema.safeParse(editando.datos);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editando.id) await editarRepartidor(editando.id, parsed.data);
      else await crearRepartidor(parsed.data);
      setEditando(null);
      recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(r: Repartidor) {
    setError(null);
    try {
      await setActivoRepartidor(r.id, !r.activo);
      recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado"));
    }
  }

  async function confirmarBorrado() {
    if (!borrar) return;
    setGuardando(true);
    try {
      await eliminarRepartidor(borrar.id);
      setBorrar(null);
      recargar();
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
        titulo="Repartidores"
        subtitulo="Quiénes reparten a domicilio. El cajero los elige de esta lista al marcar la salida de un pedido."
        migas={[{ label: "Administración" }, { label: "Usuarios", href: "/usuarios" }, { label: "Repartidores" }]}
        right={<Button onClick={nuevo}>Nuevo repartidor</Button>}
      />
      <PageBody>
        <p className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          Los repartidores <strong>no usan el sistema</strong>: no tienen PIN ni aparecen al elegir
          quién opera la caja. Se registran aquí solo para saber quién llevó cada pedido y poder
          cuadrarle el efectivo cuando regresa.
        </p>

        {error && !editando && !borrar && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}
        {repartidores === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {repartidores !== null && repartidores.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="font-display text-lg font-semibold">Aún no hay repartidores</p>
            <p className="mt-1 text-sm text-ink-2">
              Da de alta a quien reparte y aparecerá en el POS al marcar la salida de un domicilio.
            </p>
            <div className="mt-4">
              <Button onClick={nuevo}>Nuevo repartidor</Button>
            </div>
          </div>
        )}

        {repartidores !== null && repartidores.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-bg text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5">Nombre</th>
                  <th className="px-4 py-2.5">Teléfono</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">Notas</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {repartidores.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-ink">{r.nombre}</td>
                    <td className="px-4 py-3 tabular-nums text-ink-2">{r.telefono || "—"}</td>
                    <td className="hidden max-w-[280px] truncate px-4 py-3 text-ink-3 lg:table-cell">
                      {r.notas || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold",
                          r.activo ? "bg-[#EAF3EE] text-success" : "bg-hover text-ink-3",
                        ].join(" ")}
                      >
                        {r.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => editar(r)}
                          className="h-9 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => alternarActivo(r)}
                          className="h-9 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                        >
                          {r.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setBorrar(r)}
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

        <p className="mt-5 text-[13px] text-ink-3">
          ¿Buscabas las cuentas del personal que sí opera el POS?{" "}
          <Link href="/usuarios" className="font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">
            Usuarios y permisos
          </Link>
        </p>
      </PageBody>

      {editando && (
        <Modal
          open
          onClose={() => setEditando(null)}
          title={editando.id ? "Editar repartidor" : "Nuevo repartidor"}
          className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
        >
          <div className="mt-4">
            <label className={label} htmlFor="nombre">Nombre</label>
            <input
              id="nombre"
              className={input}
              value={editando.datos.nombre}
              maxLength={100}
              autoFocus
              onChange={(e) => set("nombre", e.target.value)}
            />
          </div>
          <div className="mt-3">
            <label className={label} htmlFor="tel">Teléfono · opcional</label>
            <input
              id="tel"
              className={input}
              inputMode="tel"
              value={editando.datos.telefono}
              maxLength={20}
              onChange={(e) => set("telefono", e.target.value)}
            />
          </div>
          <div className="mt-3">
            <label className={label} htmlFor="notas">Notas · opcional</label>
            <input
              id="notas"
              className={input}
              value={editando.datos.notas}
              maxLength={280}
              placeholder="Moto propia, turno de noche…"
              onChange={(e) => set("notas", e.target.value)}
            />
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
          title="Eliminar repartidor"
          className="w-[420px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
        >
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            Se quita <strong>{borrar.nombre}</strong> de la lista del POS. Los pedidos que ya
            repartió conservan su nombre.
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
