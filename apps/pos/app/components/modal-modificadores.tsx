"use client";
import { useMemo, useState } from "react";
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

function reglaTipoLabel(g: GrupoModificadores): string {
  switch (g.tipoSeleccion) {
    case "UNICA_OBLIGATORIA":
      return "Elige 1";
    case "UNICA_OPCIONAL":
      return "Opcional";
    case "MULTIPLE_OPCIONAL":
      return "Opcional";
    case "MULTIPLE_OBLIGATORIA_RANGO":
      return `Elige ${g.min ?? 0}–${g.max ?? "∞"}`;
  }
}

function esUnica(g: GrupoModificadores): boolean {
  return g.tipoSeleccion === "UNICA_OBLIGATORIA" || g.tipoSeleccion === "UNICA_OPCIONAL";
}

// Icono check SVG
function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Icono de advertencia
function IconWarning({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// Icono X para cerrar
function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// Icono alerta triángulo
function IconAlert({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// Icono hamburguesa (placeholder producto)
function IconBurger({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11a9 9 0 0 1 18 0Z" />
      <path d="M3 15h18" />
      <path d="M5 19h14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
    </svg>
  );
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

  // Precio total calculado con extras seleccionados (cantidad siempre 1 por opción)
  const precioTotal = useMemo(() => {
    let extras = 0;
    for (const g of grupos) {
      for (const opcionId of sel[g.id] ?? []) {
        const o = g.opciones.find((x) => x.id === opcionId);
        if (o) extras += o.precioExtra;
      }
    }
    return producto.precio_base_mxn + extras;
  }, [grupos, sel, producto.precio_base_mxn]);

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

  // Primer grupo inválido para el hint del footer
  const primerGrupoInvalido = grupos.find((g) => !grupoValido(g, sel[g.id] ?? new Set()));

  return (
    /* Scrim */
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-ink/[0.34]"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
    >
      {/* Drawer panel — right side, full height below any top bar */}
      <aside
        className="flex h-full w-full max-w-[480px] flex-col bg-surface shadow-[−14px_0_40px_rgba(22,22,26,.12)] border-l border-line-strong"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Hero: imagen placeholder */}
        <div className="relative flex-shrink-0">
          <div className="flex h-[150px] items-center justify-center bg-gradient-to-br from-[#F6E7EC] to-[#F1D9D1] text-[#9B2D4E]">
            <IconBurger className="h-[70px] w-[70px] opacity-55" />
          </div>
          {/* Botón cerrar flotante */}
          <button
            type="button"
            onClick={onCancelar}
            aria-label="Cerrar"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border-none bg-white/90 shadow-sm backdrop-blur-sm transition hover:bg-white"
          >
            <IconX className="h-[18px] w-[18px] text-ink" />
          </button>
        </div>

        {/* Nombre + precio base */}
        <div className="flex-shrink-0 border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <span className="font-display text-[21px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              {producto.nombre}
            </span>
            <span className="flex-shrink-0 text-right">
              <small className="mb-[-2px] block font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                Precio base
              </small>
              <span className="font-display text-[21px] font-bold tabular-nums text-ink">
                {fmtMxn(producto.precio_base_mxn)}
              </span>
            </span>
          </div>
        </div>

        {/* Cuerpo scrollable: grupos + nota */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {grupos.map((g) => {
            const selGrupo = sel[g.id] ?? new Set<string>();
            const valido = grupoValido(g, selGrupo);
            const esObligatoria = g.tipoSeleccion === "UNICA_OBLIGATORIA" || g.tipoSeleccion === "MULTIPLE_OBLIGATORIA_RANGO";
            const esOpcional = !esObligatoria;
            const isUnica = esUnica(g);

            return (
              <div key={g.id} className="mb-5 last:mb-0">
                {/* Cabecera del grupo */}
                <div className="mb-3 flex items-center gap-2">
                  <span className={["text-[14.5px] font-bold", !valido && esObligatoria ? "text-danger" : "text-ink"].join(" ")}>
                    {g.nombre}
                  </span>
                  {/* Badge de estado */}
                  {esObligatoria ? (
                    valido ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F2EC] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-success">
                        <IconCheck className="h-[11px] w-[11px]" />
                        Listo
                      </span>
                    ) : (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-accent">
                        Obligatorio
                      </span>
                    )
                  ) : (
                    <span className="text-[12px] font-medium text-ink-3">Opcional</span>
                  )}
                  {/* Regla (eje derecho) */}
                  <span className="ml-auto text-[11.5px] font-medium text-ink-3">
                    {reglaTipoLabel(g)}
                  </span>
                </div>

                {/* Opciones */}
                <div className="flex flex-col">
                  {g.opciones.map((o) => {
                    const checked = selGrupo.has(o.id);
                    const atMax =
                      g.tipoSeleccion === "MULTIPLE_OBLIGATORIA_RANGO" &&
                      g.max != null &&
                      selGrupo.size >= g.max &&
                      !checked;
                    const disabled = o.agotada || atMax;

                    return (
                      <div
                        key={o.id}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-pressed={checked}
                        aria-disabled={disabled}
                        onClick={() => { if (!disabled) toggle(g, o.id); }}
                        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(g, o.id); } }}
                        className={[
                          "mb-[7px] flex cursor-pointer items-center gap-3 rounded border px-[13px] py-3 transition-all duration-[120ms] last:mb-0",
                          o.agotada
                            ? "cursor-not-allowed border-line opacity-45"
                            : atMax
                            ? "cursor-not-allowed border-line opacity-45"
                            : checked
                            ? "border-ink bg-sel shadow-[inset_0_0_0_1px_theme(colors.ink)]"
                            : "border-line hover:border-line-strong",
                        ].join(" ")}
                      >
                        {/* Indicador radio/checkbox */}
                        <span
                          className={[
                            "flex h-5 w-5 flex-shrink-0 items-center justify-center border-[1.5px] transition-all duration-[120ms]",
                            isUnica ? "rounded-full" : "rounded-[5px]",
                            checked
                              ? "border-ink bg-ink"
                              : "border-line-strong bg-transparent",
                          ].join(" ")}
                        >
                          <IconCheck className={["h-3 w-3 text-white transition-opacity", checked ? "opacity-100" : "opacity-0"].join(" ")} />
                        </span>

                        {/* Nombre de opción */}
                        <span className="flex-1 text-[15px] font-medium text-ink">
                          {o.nombre}
                          {o.agotada ? <span className="ml-1 text-ink-3">(agotado)</span> : null}
                        </span>

                        {/* Precio extra */}
                        {o.precioExtra > 0 ? (
                          <span className="tabular-nums text-[14px] font-semibold text-ink-2">
                            +{fmtMxn(o.precioExtra)}
                          </span>
                        ) : (
                          <span className="text-[12.5px] font-medium text-ink-3">Sin costo</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Banner de error inline cuando grupo es inválido */}
                {!valido && esObligatoria && (
                  <div className="mt-1 flex items-center gap-[7px] rounded border border-[#F3CFC4] bg-accent-soft px-3 py-[9px] text-[12.5px] font-medium text-danger">
                    <IconWarning className="h-[15px] w-[15px] flex-shrink-0" />
                    Debes elegir una opción.
                  </div>
                )}
              </div>
            );
          })}

          {/* Nota de cocina */}
          <div className="mt-2">
            <label className="mb-3 block text-[14.5px] font-bold text-ink">
              Nota para cocina{" "}
              <span className="text-[12px] font-medium text-ink-3">(opcional)</span>
            </label>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. bien dorada, partir a la mitad, poca sal"
              rows={2}
              className="w-full resize-y rounded border border-line-strong px-[13px] py-[11px] font-sans text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-ink focus:shadow-[inset_0_0_0_1px_theme(colors.ink)]"
            />
          </div>
        </div>

        {/* Footer fijo */}
        <div className="flex-shrink-0 border-t border-line px-5 py-4">
          {/* Hint de validación si hay grupo inválido */}
          {!todoValido && primerGrupoInvalido && (
            <div className="mb-3 flex items-center gap-[7px] text-[12.5px] font-semibold text-warning">
              <IconAlert className="h-[15px] w-[15px] flex-shrink-0" />
              <span>
                {primerGrupoInvalido.tipoSeleccion === "UNICA_OBLIGATORIA"
                  ? `Elige el término en "${primerGrupoInvalido.nombre}" para continuar`
                  : `Completa "${primerGrupoInvalido.nombre}" para continuar`}
              </span>
            </div>
          )}

          <div className="flex items-center gap-4">
            {/* Botón cancelar (ghost) */}
            <button
              type="button"
              onClick={onCancelar}
              className="flex h-[52px] items-center justify-center rounded border border-line-strong bg-surface px-5 text-[15px] font-semibold text-ink-2 transition hover:bg-hover active:bg-sel"
            >
              Cancelar
            </button>

            {/* Botón agregar — accent, muestra precio total */}
            <button
              type="button"
              disabled={!todoValido}
              onClick={confirmar}
              className="flex flex-1 items-center justify-between gap-2 rounded-lg border-none bg-accent px-4 py-[16px] text-[16px] font-bold text-white shadow-[0_1px_3px_rgba(232,80,46,.3)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none"
            >
              <span>Agregar al ticket</span>
              <span className="font-display tabular-nums">
                {fmtMxn(precioTotal)}
              </span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
