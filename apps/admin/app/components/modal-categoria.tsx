"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import {
  COLORES,
  ICONOS,
  bgDe,
  categoriaSchema,
  crearCategoria,
  actualizarCategoria,
  type Categoria,
} from "../lib/catalogo";

function IconoSvg({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d={ICONOS[name] ?? ICONOS.tag} />
    </svg>
  );
}

export function ModalCategoria({
  cat,
  onCerrar,
  onGuardado,
}: {
  cat: Categoria | null; // null = crear
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const editar = !!cat;
  const [nombre, setNombre] = useState(cat?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(cat?.descripcion ?? "");
  const [color, setColor] = useState<string | null>(cat?.color_hex ?? COLORES[0]!.hex);
  const [icono, setIcono] = useState<string>(cat?.icono ?? "tag");
  const [activa, setActiva] = useState<boolean>(cat?.activa ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError(null);
    const parsed = categoriaSchema.safeParse({ nombre, descripcion, color_hex: color, icono, activa });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editar) await actualizarCategoria(cat!.id, parsed.data);
      else await crearCategoria(parsed.data);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      title={editar ? "Editar categoría" : "Nueva categoría"}
      hideTitle
      className="w-[460px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {editar ? "Editar categoría" : "Nueva categoría"}
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {editar ? "Actualiza los datos del grupo." : "Agrega un grupo al menú de León Centro."}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-[13px] font-medium text-ink-2">
            <span>Nombre de la categoría</span>
            <span className="text-ink-3">{nombre.length} / 40</span>
          </span>
          <input
            value={nombre}
            maxLength={40}
            autoFocus
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Combos, Veganos, Para niños"
            className="h-11 rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-[13px] font-medium text-ink-2">
            <span>Descripción <span className="text-ink-3">· opcional</span></span>
            <span className="text-ink-3">{descripcion.length} / 80</span>
          </span>
          <input
            value={descripcion}
            maxLength={80}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Una nota breve para tu equipo (no se muestra al cliente)"
            className="h-11 rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
          />
        </label>

        <div className="flex gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">Color</span>
            <div className="flex gap-2">
              {COLORES.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  aria-label={`Color ${c.hex}`}
                  aria-pressed={color === c.hex}
                  onClick={() => setColor(c.hex)}
                  style={{ background: c.bg, color: c.hex }}
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded transition",
                    color === c.hex ? "ring-2 ring-ink ring-offset-1" : "",
                  ].join(" ")}
                >
                  <IconoSvg name={icono} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">Icono</span>
            <div className="flex flex-wrap gap-2">
              {Object.keys(ICONOS).map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={`Icono ${name}`}
                  aria-pressed={icono === name}
                  onClick={() => setIcono(name)}
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded border text-ink-2 transition",
                    icono === name ? "border-ink bg-hover text-ink" : "border-line-strong hover:bg-hover",
                  ].join(" ")}
                >
                  <IconoSvg name={name} className="h-[18px] w-[18px]" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
            className="h-4 w-4 accent-[#16161A]"
          />
          <span className="text-sm">
            <span className="font-medium">Categoría activa</span>{" "}
            <span className="text-ink-3">(visible en el POS)</span>
          </span>
        </label>

        {error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Crear categoría"}
        </Button>
      </div>

      {/* preview del dot con el color/icono elegido */}
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-[12.5px] text-ink-3">
        Vista previa:
        <span
          className="flex h-7 w-7 items-center justify-center rounded"
          style={{ background: bgDe(color), color: color ?? "#5A5A60" }}
        >
          <IconoSvg name={icono} className="h-4 w-4" />
        </span>
        <span className="font-medium text-ink-2">{nombre || "Nombre"}</span>
      </div>
    </Modal>
  );
}
