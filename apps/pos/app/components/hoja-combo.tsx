"use client";
import type { Producto } from "../lib/catalogo";
import { diferencialCombo, type ComboDef } from "../lib/combos";
import { fmtMxn } from "../lib/turno";

/** Aviso "¿Lo hacemos combo?" (spec §6.5): sheet flotante con el diferencial de precio. */
export function HojaCombo({ producto, combo, onSi, onNo }: { producto: Producto; combo: ComboDef; onSi: () => void; onNo: () => void }) {
  const { extra, resto } = diferencialCombo(combo, producto);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/[0.18]" onClick={onNo} />
      <div role="dialog" aria-live="polite"
        className="fixed bottom-5 left-1/2 z-[41] flex w-[min(640px,calc(100%-40px))] -translate-x-1/2 items-center gap-4 rounded-lg border border-line-strong bg-surface px-[18px] py-4 shadow-[0_18px_50px_rgba(22,22,26,.16)]">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M12 2l2.9 6.3 6.6.7-4.9 4.5 1.4 6.5L12 17.3 5.9 20.5 7.3 14 2.4 9.5l6.6-.7z" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <b className="block font-display text-[17px] font-semibold tracking-[-0.01em]">¿Lo hacemos combo?</b>
          <span className="mt-0.5 block text-[13px] text-ink-2"><span className="font-display font-bold text-ink">+{fmtMxn(extra)}</span> · {resto.join(" y ")} · cambia lo que quieras después</span>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button type="button" onClick={onNo} className="h-[52px] rounded border border-line-strong bg-surface px-4 text-[14.5px] font-semibold text-ink-2 transition hover:bg-hover">No, solo</button>
          <button type="button" onClick={onSi} className="flex h-[52px] items-center gap-2 rounded-lg bg-accent px-5 text-[15px] font-bold text-white shadow-[0_1px_3px_rgba(0,120,201,.3)] transition hover:bg-accent-hover active:scale-[.97]">Sí, combo</button>
        </div>
      </div>
    </>
  );
}
