"use client";
import { useMemo, useState } from "react";
import { Button } from "@vim/ui/styles";
import type { Producto } from "../lib/catalogo";
import type { GrupoModificadores } from "../lib/modificadores";
import type { ModificadorSel } from "../lib/carrito";
import { seleccionInicialGrupo } from "../lib/carrito";
import { fmtMxn } from "../lib/turno";

type SelPorGrupo = Record<string, Set<string>>; // grupoId -> set de opcionId

function initSel(grupos: GrupoModificadores[]): SelPorGrupo {
  const s: SelPorGrupo = {};
  for (const g of grupos) s[g.id] = new Set(seleccionInicialGrupo(g).map((o) => o.id));
  return s;
}

function grupoValido(g: GrupoModificadores, sel: Set<string>): boolean {
  const n = sel.size;
  switch (g.tipoSeleccion) {
    case "UNICA_OBLIGATORIA":
      return n === 1;
    case "UNICA_OPCIONAL":
      return n <= 1;
    case "MULTIPLE_OPCIONAL":
      return true;
    case "MULTIPLE_OBLIGATORIA_RANGO":
      return n >= (g.min ?? 0) && n <= (g.max ?? Infinity);
  }
}

export function ModalModificadores({
  producto,
  grupos,
  onConfirmar,
  onCancelar,
}: {
  producto: Producto;
  grupos: GrupoModificadores[];
  onConfirmar: (mods: ModificadorSel[], nota: string | null) => void;
  onCancelar: () => void;
}) {
  const [sel, setSel] = useState<SelPorGrupo>(() => initSel(grupos));
  const [nota, setNota] = useState("");

  function toggle(g: GrupoModificadores, opcionId: string) {
    setSel((prev) => {
      const actual = new Set(prev[g.id]);
      const unica = g.tipoSeleccion === "UNICA_OBLIGATORIA" || g.tipoSeleccion === "UNICA_OPCIONAL";
      if (actual.has(opcionId)) {
        if (g.tipoSeleccion === "UNICA_OBLIGATORIA") return prev; // no permitir vaciar
        actual.delete(opcionId);
      } else {
        if (unica) actual.clear();
        if (g.tipoSeleccion === "MULTIPLE_OBLIGATORIA_RANGO" && g.max && actual.size >= g.max) return prev;
        actual.add(opcionId);
      }
      return { ...prev, [g.id]: actual };
    });
  }

  const todoValido = useMemo(() => grupos.every((g) => grupoValido(g, sel[g.id] ?? new Set())), [grupos, sel]);

  function confirmar() {
    const mods: ModificadorSel[] = [];
    for (const g of grupos) {
      for (const opcionId of sel[g.id] ?? []) {
        const o = g.opciones.find((x) => x.id === opcionId);
        if (o) mods.push({ opcionId: o.id, grupoNombre: g.nombre, opcionNombre: o.nombre, precioExtra: o.precioExtra, cantidad: 1 });
      }
    }
    onConfirmar(mods, nota.trim() || null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-surface shadow-xl">
        <div className="border-b border-line p-4">
          <div className="font-display text-[17px] font-semibold">{producto.nombre}</div>
          <div className="text-[13px] text-ink-3">{fmtMxn(producto.precio_base_mxn)} base</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {grupos.map((g) => (
            <div key={g.id} className="mb-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold">{g.nombre}</span>
                <span className="text-[11px] uppercase tracking-wide text-ink-3">
                  {g.tipoSeleccion === "UNICA_OBLIGATORIA" ? "Elige 1" :
                   g.tipoSeleccion === "MULTIPLE_OBLIGATORIA_RANGO" ? `Elige ${g.min ?? 0}–${g.max ?? "∞"}` :
                   "Opcional"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {g.opciones.map((o) => {
                  const checked = sel[g.id]?.has(o.id) ?? false;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={o.agotada}
                      onClick={() => toggle(g, o.id)}
                      aria-pressed={checked}
                      className={[
                        "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition",
                        o.agotada ? "cursor-not-allowed border-line opacity-40" :
                        checked ? "border-ink bg-ink/5" : "border-line hover:border-ink",
                      ].join(" ")}
                    >
                      <span className="font-medium">{o.nombre}{o.agotada ? " (agotado)" : ""}</span>
                      <span className="tabular-nums text-ink-2">{o.precioExtra > 0 ? `+${fmtMxn(o.precioExtra)}` : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <label className="mt-2 block">
            <span className="mb-1 block text-[13px] font-semibold">Nota de cocina</span>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="ej. sin cebolla"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </label>
        </div>
        <div className="flex gap-2 border-t border-line p-4">
          <Button variant="ghost" className="flex-1" onClick={onCancelar}>Cancelar</Button>
          <Button className="flex-1" disabled={!todoValido} onClick={confirmar}>Agregar</Button>
        </div>
      </div>
    </div>
  );
}
