"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@vim/ui/styles";
import {
  asignarGruposAProducto, gruposDeProducto, listarGrupos, TIPO_SELECCION, type Grupo,
} from "../lib/modificadores";
import { mensajeError } from "../lib/errores";

/** Asignación de grupos de modificadores a UN producto (checkboxes + guardar). */
export function ProductoModificadores({
  productoId,
  onPendiente,
}: {
  productoId: string;
  /** Avisa si hay cambios sin guardar, con la función que los guarda (o null si no hay), para que
   *  "Guardar cambios" del producto los guarde también antes de salir de la pantalla. */
  onPendiente?: (guardar: (() => Promise<void>) | null) => void;
}) {
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
      .catch((e) => setError(mensajeError(e, "Error")));
  }, [productoId]);

  const cambio = grupos !== null && (sel.size !== original.size || [...sel].some((g) => !original.has(g)));

  useEffect(() => {
    if (!onPendiente) return;
    onPendiente(
      cambio
        ? async () => {
            await asignarGruposAProducto(productoId, [...sel]);
            setOriginal(new Set(sel));
          }
        : null,
    );
  }, [cambio, sel, productoId, onPendiente]);

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
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className={onPendiente ? "rounded-lg border border-line bg-surface p-4" : "mt-6 rounded-lg border border-line bg-surface p-5"}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold">Modificadores</h2>
        <Link href="/catalogo/modificadores" className="text-[13px] font-semibold text-ink underline underline-offset-2">
          Ver todos los grupos
        </Link>
      </div>
      <p className="mb-3 text-[13px] text-ink-2">
        Lo que la caja pregunta al vender este producto: término, extras, sin ingredientes…
      </p>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      {grupos === null && !error && <p className="text-sm text-ink-2">Cargando grupos…</p>}
      {grupos !== null && grupos.length === 0 && (
        <p className="text-sm text-ink-2">
          Aún no tienes grupos de modificadores. <Link href="/catalogo/modificadores/nuevo" className="font-semibold text-ink underline underline-offset-2">Crea el primero</Link> (por ejemplo «Término de la carne» o «Extras»).
        </p>
      )}
      {grupos !== null && grupos.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {grupos.map((g) => (
              <label key={g.id} className={["flex min-h-[48px] cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-2.5 transition-colors", sel.has(g.id) ? "border-ink bg-sel" : "border-line hover:border-line-strong"].join(" ")}>
                <input
                  type="checkbox"
                  checked={sel.has(g.id)}
                  onChange={(e) => {
                    const n = new Set(sel);
                    if (e.target.checked) n.add(g.id); else n.delete(g.id);
                    setSel(n);
                  }}
                  className="mt-0.5 h-5 w-5 accent-ink"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">{g.nombre}</span>
                  <span className="block text-[12.5px] text-ink-2">{TIPO_SELECCION[g.tipo_seleccion]}</span>
                </span>
              </label>
            ))}
          </div>
          {/* Dentro del formulario del producto se guardan con su botón: un solo "Guardar" por
              pantalla (antes había dos y el de abajo quedaba después del de arriba). */}
          {onPendiente ? (
            cambio && <p className="mt-3 text-[13px] text-ink-2">Se guardan con «Guardar cambios».</p>
          ) : (
            <div className="mt-4 flex items-center justify-end gap-3">
              {msg && <span className="text-[13px] font-medium text-success" aria-live="polite">{msg}</span>}
              <Button onClick={guardar} disabled={!cambio || guardando}>
                {guardando ? "Guardando…" : "Guardar modificadores"}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
