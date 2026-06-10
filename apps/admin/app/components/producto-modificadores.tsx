"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@vim/ui/styles";
import {
  asignarGruposAProducto, gruposDeProducto, listarGrupos, TIPO_SELECCION, type Grupo,
} from "../lib/modificadores";

/** Asignación de grupos de modificadores a UN producto (checkboxes + guardar). */
export function ProductoModificadores({ productoId }: { productoId: string }) {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarGrupos(), gruposDeProducto(productoId)])
      .then(([gs, asignados]) => {
        setGrupos(gs.filter((g) => g.activo));
        const s = new Set(asignados);
        setSel(new Set(s));
        setOriginal(s);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [productoId]);

  const cambio = grupos !== null && (sel.size !== original.size || [...sel].some((g) => !original.has(g)));

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMsg(null);
    try {
      await asignarGruposAProducto(productoId, [...sel]);
      setOriginal(new Set(sel));
      setMsg("Modificadores guardados.");
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-line bg-surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-[16px] font-semibold tracking-tight">Modificadores del producto</h2>
        <Link href="/catalogo/modificadores" className="text-[12.5px] font-semibold text-accent hover:underline">
          Gestionar grupos →
        </Link>
      </div>
      <p className="mb-4 text-[12.5px] text-ink-3">
        Los grupos marcados aparecerán en el POS al vender este producto (término, extras, sin ingredientes…).
      </p>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      {grupos === null && !error && <p className="text-sm text-ink-3">Cargando grupos…</p>}
      {grupos !== null && grupos.length === 0 && (
        <p className="text-sm text-ink-3">
          Aún no tienes grupos de modificadores. <Link href="/catalogo/modificadores/nuevo" className="font-semibold text-accent hover:underline">Crea el primero</Link> (p.ej. “Término de la carne”, “Extras”).
        </p>
      )}
      {grupos !== null && grupos.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {grupos.map((g) => (
              <label key={g.id} className={["flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-2.5 transition", sel.has(g.id) ? "border-ink bg-sel" : "border-line hover:border-line-strong"].join(" ")}>
                <input
                  type="checkbox"
                  checked={sel.has(g.id)}
                  onChange={(e) => {
                    const n = new Set(sel);
                    if (e.target.checked) n.add(g.id); else n.delete(g.id);
                    setSel(n);
                  }}
                  className="mt-0.5 h-4 w-4 accent-ink"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">{g.nombre}</span>
                  <span className="block text-[11.5px] text-ink-3">{TIPO_SELECCION[g.tipo_seleccion]}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            {msg && <span className="text-[13px] font-medium text-success">{msg}</span>}
            <Button onClick={guardar} disabled={!cambio || guardando}>
              {guardando ? "Guardando…" : "Guardar modificadores"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
