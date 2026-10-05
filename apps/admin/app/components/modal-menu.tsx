"use client";
import { useState, type FormEvent } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { mensajeError } from "../lib/errores";
import { actualizarMenu, avisoAlMover, crearMenu, type Menu, type SucursalDeMenu } from "../lib/menus";

/**
 * Crear o editar un menú: nombre y a qué sucursales aplica. Un menú nuevo arranca como copia del
 * General (lo hace crear_menu en la base). Cada sucursal usa un solo menú: marcar una que está en
 * otro menú propio la mueve, y se avisa antes de guardar.
 */
export function ModalMenu({
  menu,
  menus,
  sucursales,
  onCerrar,
  onGuardado,
}: {
  /** El menú a editar; `null` = uno nuevo. */
  menu: Menu | null;
  menus: Menu[];
  sucursales: SucursalDeMenu[];
  onCerrar: () => void;
  onGuardado: (menuId: string) => void | Promise<void>;
}) {
  const [nombre, setNombre] = useState(menu?.nombre ?? "");
  const [elegidas, setElegidas] = useState<string[]>(menu ? menu.sucursales.map((s) => s.id) : []);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const avisos = avisoAlMover(elegidas, menu?.id ?? null, sucursales, menus);
  const usa = (s: SucursalDeMenu) => (s.menuId === null ? "General" : (menus.find((m) => m.id === s.menuId)?.nombre ?? "General"));
  const titulo = menu ? "Editar menú" : "Nuevo menú";

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nombre.trim() === "") return setError("Ponle nombre al menú.");
    if (!menu && elegidas.length === 0) return setError("Elige al menos una sucursal para el menú.");
    setGuardando(true);
    try {
      const id = menu ? (await actualizarMenu(menu.id, nombre.trim(), elegidas), menu.id) : await crearMenu(nombre.trim(), elegidas);
      await onGuardado(id);
    } catch (err) {
      setError(mensajeError(err, "No se pudo guardar el menú"));
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      title={titulo}
      hideTitle
      className="w-full max-w-[460px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <form onSubmit={guardar} noValidate>
        <h2 className="font-display text-xl font-semibold tracking-tight">{titulo}</h2>
        {!menu && <p className="mt-1 text-13 text-ink-2">Arranca igual que el menú General. Después le apagas productos o le cambias precios.</p>}

        <label className="mb-1.5 mt-4 block text-13 font-medium text-ink-2" htmlFor="menu-nombre">Nombre</label>
        <input
          id="menu-nombre"
          className="h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
          value={nombre}
          maxLength={80}
          autoFocus
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Menú Norte"
        />

        <fieldset className="mt-4">
          <legend className="mb-1.5 text-13 font-medium text-ink-2">Sucursales que lo usan</legend>
          <ul className="divide-y divide-line rounded border border-line">
            {sucursales.map((s) => (
              <li key={s.id}>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 px-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-ink"
                    checked={elegidas.includes(s.id)}
                    onChange={(e) => setElegidas((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                  />
                  <span className="text-sm font-medium">{s.nombre}</span>
                  <span className="ml-auto text-13 text-ink-3">usa: {usa(s)}</span>
                </label>
              </li>
            ))}
          </ul>
          {menu && <p className="mt-1.5 text-13 text-ink-2">Las que desmarques vuelven al menú General.</p>}
        </fieldset>

        {avisos.map((a) => (
          <p key={a} className="mt-2 text-13 text-ink-2">{a}</p>
        ))}
        {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : menu ? "Guardar menú" : "Crear menú"}</Button>
        </div>
      </form>
    </Modal>
  );
}
