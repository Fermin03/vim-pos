"use client";
import { useMemo, useState } from "react";
import type { Producto } from "../lib/catalogo";
import type { ComboDef, ComponenteSel, SlotCombo } from "../lib/combos";
import { componentesPorDefecto, deltaDe, nuevoClientIdComponente, precioCombo, slotValido } from "../lib/combos";
import type { LineaCarrito, ModificadorSel } from "../lib/carrito";
import { nuevoClientId } from "../lib/carrito";
import { obtenerGruposDeProducto, type GrupoModificadores } from "../lib/modificadores";
import { fmtMxn } from "../lib/turno";
import { ModalModificadores } from "./modal-modificadores";

/**
 * Drawer de armado de combo: un slot por paso (spec §6.2, validado en el prototipo). En un slot
 * `max = 1` tocar una tarjeta selecciona Y avanza — no hay "Siguiente" que buscar. Si el producto
 * elegido trae un grupo obligatorio (p. ej. término de la hamburguesa), `ModalModificadores` se
 * abre encima del paso y al confirmar avanza una sola vez. El último paso es el resumen, con
 * cantidad y nota para cocina. El precio se recalcula en cada cambio y se ve en vivo en la
 * cabecera y en el botón del pie.
 */
type Props = {
  combo: ComboDef;
  token: string;
  /** Línea existente que se edita (reabre en el resumen). */
  linea?: LineaCarrito | null;
  /** Producto ya elegido para el primer slot (viene del aviso "¿Lo hacemos combo?"). */
  preset?: { producto: Producto; modificadores: ModificadorSel[] } | null;
  onConfirmar: (linea: LineaCarrito) => void;
  onCancelar: () => void;
};

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
  );
}
function IconBack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
  );
}

const extrasDe = (mods: ModificadorSel[]) => mods.reduce((s, m) => s + m.precioExtra * m.cantidad, 0);

export function ModalCombo({ combo, token, linea, preset, onConfirmar, onCancelar }: Props) {
  const slots = combo.slots;
  const [componentes, setComponentes] = useState<ComponenteSel[]>(() => {
    if (linea?.combo) return linea.combo.componentes;
    const base = componentesPorDefecto(combo);
    if (preset && slots[0]) {
      const primero = slots[0];
      return [
        { grupoId: primero.id, grupoNombre: primero.nombre, producto: preset.producto, cantidad: 1, modificadores: preset.modificadores, notaCocina: null, clientId: nuevoClientIdComponente() },
        ...base.filter((c) => c.grupoId !== primero.id),
      ];
    }
    return base;
  });
  const [paso, setPaso] = useState<number>(() => (linea ? slots.length : preset ? 1 : 0));
  const [cantidad, setCantidad] = useState<number>(linea?.cantidad ?? 1);
  const [nota, setNota] = useState<string>(linea?.notaCocina ?? "");
  const [personalizando, setPersonalizando] = useState<{ comp: ComponenteSel; grupos: GrupoModificadores[]; avanzar: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enResumen = paso >= slots.length;
  const slot: SlotCombo | null = enResumen ? null : (slots[paso] ?? null);
  const precioBase = useMemo(() => precioCombo(combo, componentes), [combo, componentes]);
  const precio = useMemo(() => Math.round((precioBase + componentes.reduce((s, c) => s + extrasDe(c.modificadores) * c.cantidad, 0)) * 100) / 100, [precioBase, componentes]);
  const todoValido = slots.every((s) => slotValido(s, componentes));

  const avanzar = () => setPaso((p) => Math.min(p + 1, slots.length));

  async function elegir(s: SlotCombo, producto: Producto) {
    const ya = componentes.find((c) => c.grupoId === s.id && c.producto.id === producto.id);
    if (s.max === 1) {
      if (ya) { avanzar(); return; }
      const comp: ComponenteSel = { grupoId: s.id, grupoNombre: s.nombre, producto, cantidad: 1, modificadores: [], notaCocina: null, clientId: nuevoClientIdComponente() };
      setComponentes((prev) => [...prev.filter((c) => c.grupoId !== s.id), comp]);
      await personalizar(comp, true, true);
      return;
    }
    const enSlot = componentes.filter((c) => c.grupoId === s.id).reduce((n, c) => n + c.cantidad, 0);
    if (ya) setComponentes((prev) => prev.filter((c) => c !== ya));
    else if (enSlot < s.max) setComponentes((prev) => [...prev, { grupoId: s.id, grupoNombre: s.nombre, producto, cantidad: 1, modificadores: [], notaCocina: null, clientId: nuevoClientIdComponente() }]);
  }

  /** Abre los modificadores del componente. `soloObligatorios`: si no hay ninguno obligatorio, no abre y avanza. */
  async function personalizar(comp: ComponenteSel, avanzarAlTerminar: boolean, soloObligatorios: boolean) {
    try {
      const grupos = await obtenerGruposDeProducto(token, comp.producto.id);
      const hayObligatorio = grupos.some((g) => g.tipoSeleccion === "UNICA_OBLIGATORIA" || g.tipoSeleccion === "MULTIPLE_OBLIGATORIA_RANGO");
      if (grupos.length === 0 || (soloObligatorios && !hayObligatorio)) { if (avanzarAlTerminar) avanzar(); return; }
      setPersonalizando({ comp, grupos, avanzar: avanzarAlTerminar });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los modificadores");
      if (avanzarAlTerminar) avanzar();
    }
  }

  function confirmar() {
    const base: LineaCarrito = linea
      ? { ...linea, cantidad, notaCocina: nota.trim() || null, combo: { def: combo, componentes, precioUnitario: precioBase } }
      : { clientId: nuevoClientId(), producto: combo.producto, cantidad, modificadores: [], notaCocina: nota.trim() || null, combo: { def: combo, componentes, precioUnitario: precioBase } };
    onConfirmar(base);
  }

  const importeDe = (s: SlotCombo, o: { producto: Producto; delta: number }) => (s.modo === "SUMA_PRECIO_PRODUCTO" ? o.producto.precio_base_mxn : 0) + o.delta;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-ink/[0.34]" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
      <aside className="flex h-full w-full max-w-[480px] flex-col border-l border-line-strong bg-surface shadow-[-14px_0_40px_rgba(22,22,26,.12)]" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera: nombre, paso, precio en vivo, barra de pasos */}
        <div className="flex-shrink-0 border-b border-line px-5 pb-3 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-display text-[21px] font-semibold leading-tight tracking-[-0.02em] text-ink">{combo.producto.nombre}</div>
              <div className="mt-0.5 text-[12.5px] font-medium text-ink-3">{enResumen ? "Revisa y agrega" : `Paso ${paso + 1} de ${slots.length + 1} · ${slot!.nombre}`}</div>
            </div>
            <div className="flex-shrink-0 text-right">
              <small className="mb-[-2px] block text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">{enResumen ? "Total" : "Precio"}</small>
              <span className="font-display text-[21px] font-bold tabular-nums text-ink">{fmtMxn(enResumen ? precio * cantidad : precio)}</span>
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            {[...slots, null].map((_, i) => (
              <span key={i} className={["h-1 flex-1 rounded-full", i < paso ? "bg-ink" : i === paso ? "bg-accent" : "bg-line"].join(" ")} />
            ))}
          </div>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error && <div className="mb-3 rounded border border-line bg-accent-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</div>}
          {slot && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[14.5px] font-bold text-ink">{slot.nombre}</span>
                {slot.min > 0 ? (
                  slotValido(slot, componentes)
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-success"><IconCheck className="h-[11px] w-[11px]" />Listo</span>
                    : <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-accent">Obligatorio</span>
                ) : <span className="text-[12px] font-medium text-ink-3">Opcional</span>}
                <span className="ml-auto text-[11.5px] font-medium text-ink-3">{slot.max === 1 ? "Elige 1" : `Elige ${slot.min}–${slot.max}`}{slot.modo === "SUMA_PRECIO_PRODUCTO" ? " · se suma su precio" : ""}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {slot.opciones.map((o) => {
                  const c = componentes.find((x) => x.grupoId === slot.id && x.producto.id === o.producto.id);
                  const importe = importeDe(slot, o);
                  const disabled = o.producto.agotado;
                  return (
                    // Contenedor relativo: la tarjeta y "Personalizar" son botones HERMANOS (un
                    // <button> no puede anidar otro control interactivo), "Personalizar" flota en
                    // la esquina inferior con 44px de área táctil.
                    <div key={o.producto.id} className="relative">
                      <button type="button" disabled={disabled} aria-pressed={!!c} onClick={() => elegir(slot, o.producto)}
                        className={["relative flex min-h-[96px] w-full flex-col items-start justify-between gap-2.5 rounded-lg border px-[13px] py-3 text-left transition active:scale-[.98]",
                          disabled ? "cursor-not-allowed border-line opacity-45" : c ? "border-ink bg-sel shadow-[inset_0_0_0_1px_rgb(var(--ink))]" : "border-line"].join(" ")}>
                        {disabled
                          ? <span className="absolute right-2.5 top-2.5 rounded-full bg-danger/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-danger">Agotado</span>
                          : <span className={["absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full border-[1.5px]", c ? "border-ink bg-ink" : "border-line-strong"].join(" ")}><IconCheck className={["h-3 w-3 text-white", c ? "opacity-100" : "opacity-0"].join(" ")} /></span>}
                        <span>
                          <span className="block text-[15px] font-semibold leading-tight text-ink">{o.producto.nombre}</span>
                          {c && c.modificadores.length > 0 && <span className="mt-0.5 block text-[12px] text-ink-3">{c.modificadores.map((m) => m.opcionNombre).join(" · ")}</span>}
                        </span>
                        <span className="flex w-full items-baseline justify-between">
                          {importe > 0
                            ? <span className="font-display text-[14px] font-semibold tabular-nums text-ink-2">{slot.modo === "SUMA_PRECIO_PRODUCTO" ? "" : "+"}{fmtMxn(importe)}</span>
                            : <span className="text-[12.5px] font-medium text-ink-3">Incluido</span>}
                          {o.esDefault && !c && <span className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-success">Default</span>}
                        </span>
                      </button>
                      {c && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); void personalizar(c, false, false); }}
                          className="absolute bottom-1 right-1 z-10 flex h-11 min-w-[44px] items-center justify-center rounded px-2.5 text-[12.5px] font-semibold text-accent transition hover:bg-hover">
                          Personalizar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {slot.min === 0 && (
                <button type="button" onClick={() => { setComponentes((prev) => prev.filter((c) => c.grupoId !== slot.id)); avanzar(); }}
                  className="mt-3 flex h-[52px] w-full items-center justify-center rounded border border-line-strong text-[15px] font-semibold text-ink-2 transition hover:bg-hover">
                  Sin {slot.nombre.toLowerCase()}
                </button>
              )}
            </>
          )}

          {enResumen && (
            <>
              <div className="flex flex-col">
                {slots.map((s, i) => {
                  const del = componentes.filter((c) => c.grupoId === s.id);
                  if (del.length === 0) return (
                    <div key={s.id} className="flex items-start gap-3 border-b border-line py-3">
                      <span className="w-[104px] flex-shrink-0 pt-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-ink-3">{s.nombre}</span>
                      <b className="flex-1 text-[15px] font-semibold text-ink-3">Sin {s.nombre.toLowerCase()}</b>
                      <button type="button" onClick={() => setPaso(i)} className="rounded px-2 py-1 text-[12.5px] font-semibold text-accent">Elegir</button>
                    </div>
                  );
                  return del.map((c) => {
                    const imp = importeDe(s, { producto: c.producto, delta: deltaDe(s, c.producto.id) });
                    const ex = extrasDe(c.modificadores);
                    return (
                      <div key={c.clientId} className="flex items-start gap-3 border-b border-line py-3">
                        <span className="w-[104px] flex-shrink-0 pt-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-ink-3">{s.nombre}</span>
                        <div className="min-w-0 flex-1">
                          <b className="block text-[15px] font-semibold">{c.cantidad > 1 ? `${c.cantidad}× ` : ""}{c.producto.nombre}</b>
                          {c.modificadores.length > 0 && <span className="mt-0.5 block text-[12.5px] text-ink-2">{c.modificadores.map((m) => m.opcionNombre).join(" · ")}</span>}
                        </div>
                        <span className="font-display whitespace-nowrap text-[14px] font-semibold tabular-nums text-ink-2">
                          {imp > 0 ? `${s.modo === "SUMA_PRECIO_PRODUCTO" ? "" : "+"}${fmtMxn(imp)}` : "incl."}{ex > 0 && <span className="text-ink-3"> +{fmtMxn(ex)}</span>}
                        </span>
                        <button type="button" onClick={() => setPaso(i)} className="rounded px-2 py-1 text-[12.5px] font-semibold text-accent">Cambiar</button>
                      </div>
                    );
                  });
                })}
                <div className="flex items-start gap-3 py-3">
                  <span className="w-[104px] flex-shrink-0 pt-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-ink-3">Combo</span>
                  <div className="flex-1"><b className="block text-[15px] font-semibold">Hacerlo combo</b><span className="block text-[12.5px] text-ink-2">Precio base del combo</span></div>
                  <span className="font-display text-[14px] font-semibold tabular-nums text-ink-2">{fmtMxn(combo.producto.precio_base_mxn)}</span>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <b className="text-[14.5px] font-bold">Cantidad</b>
                <span className="inline-flex items-center overflow-hidden rounded border border-line-strong">
                  <button type="button" aria-label="Menos" onClick={() => setCantidad((n) => Math.max(1, n - 1))} className="flex h-11 w-11 items-center justify-center text-[19px] text-ink-2 hover:bg-hover">−</button>
                  <span className="font-display min-w-[44px] text-center text-[17px] font-semibold tabular-nums">{cantidad}</span>
                  <button type="button" aria-label="Más" onClick={() => setCantidad((n) => n + 1)} className="flex h-11 w-11 items-center justify-center text-[19px] text-ink-2 hover:bg-hover">+</button>
                </span>
              </div>
              <div className="mt-5">
                <label className="mb-2.5 block text-[14.5px] font-bold text-ink">Nota para cocina <span className="text-[12px] font-medium text-ink-3">(opcional, para todo el combo)</span></label>
                <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Ej. todo para llevar, sin servilletas"
                  className="w-full resize-y rounded border border-line-strong px-[13px] py-[11px] font-sans text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-ink focus:shadow-[inset_0_0_0_1px_rgb(var(--ink))]" />
              </div>
            </>
          )}
        </div>

        {/* Pie */}
        <div className="flex-shrink-0 border-t border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => (paso === 0 && !linea ? onCancelar() : setPaso((p) => Math.max(0, p - 1)))}
              className="flex h-[52px] items-center justify-center gap-2 rounded border border-line-strong bg-surface px-5 text-[15px] font-semibold text-ink-2 transition hover:bg-hover">
              {paso === 0 && !linea ? "Cancelar" : <><IconBack className="h-4 w-4" />Atrás</>}
            </button>
            {enResumen ? (
              <button type="button" disabled={!todoValido} onClick={confirmar}
                className="flex h-[52px] flex-1 items-center justify-between rounded-lg bg-accent px-4 text-[16px] font-bold text-white shadow-[0_1px_3px_rgb(var(--accent)/0.3)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none">
                <span>{linea ? "Guardar cambios" : "Agregar al ticket"}</span><span className="font-display tabular-nums">{fmtMxn(precio * cantidad)}</span>
              </button>
            ) : (
              <button type="button" disabled={!slotValido(slot!, componentes)} onClick={avanzar}
                className="flex h-[52px] flex-1 items-center justify-between rounded-lg bg-accent px-4 text-[16px] font-bold text-white shadow-[0_1px_3px_rgb(var(--accent)/0.3)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none">
                <span>{paso === slots.length - 1 ? "Revisar" : "Siguiente"}</span><span className="font-display tabular-nums">{fmtMxn(precio)}</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {personalizando && (
        <ModalModificadores
          producto={personalizando.comp.producto}
          grupos={personalizando.grupos}
          onConfirmar={(mods) => {
            const comp = personalizando.comp;
            setComponentes((prev) => prev.map((c) => (c.clientId === comp.clientId ? { ...c, modificadores: mods } : c)));
            const avanzarDespues = personalizando.avanzar;
            setPersonalizando(null);
            if (avanzarDespues) avanzar();
          }}
          onCancelar={() => {
            const p = personalizando;
            setPersonalizando(null);
            // Este modal solo se abre con avanzar=true cuando el grupo era obligatorio (flujo de
            // selección inicial en elegir()). Cancelarlo ahí NO debe avanzar el paso: hay que
            // deshacer la selección del componente para que el slot quede inválido y el cajero
            // tenga que volver a tocar la tarjeta. Cuando avanzar=false (reabierto desde
            // "Personalizar" sobre un componente ya elegido) el cancelar sigue sin tocar nada.
            if (p.avanzar) setComponentes((prev) => prev.filter((c) => c.clientId !== p.comp.clientId));
          }}
        />
      )}
    </div>
  );
}
