"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@vim/ui/styles";
import {
  ICONOS_POS,
  colorCategoria,
  listarCategoriasPos,
  listarProductosPos,
  type Categoria,
  type Producto,
} from "../lib/catalogo";
import { fmtMxn, type DatosCaja, type Turno } from "../lib/turno";
import { useReloj } from "./topbar-pos";
import { type Empleado } from "../lib/supabase";

/** Topbar del POS operativo (mockup P-059): marca + sucursal/turno + reloj + cajero + acciones. */
function TopbarOperativa({
  caja,
  turno,
  empleado,
  onCambiarCajero,
  onBloquear,
}: {
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  onCambiarCajero: () => void;
  onBloquear: () => void;
}) {
  const ahora = useReloj();
  return (
    <header className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line px-6">
      <div className="flex items-center gap-4">
        <div className="relative flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-ink">
          <span className="font-display text-base font-bold leading-none tracking-tight text-white">V</span>
          <span className="absolute bottom-1.5 right-1.5 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
        </div>
        <div className="h-[26px] w-px bg-line-strong" />
        <div>
          <div className="font-display text-[15px] font-semibold tracking-tight">Knock-Out Burger</div>
          <div className="mt-px text-xs text-ink-3">
            {caja.sucursalNombre} · {caja.nombre} · <span className="text-success">Turno {turno.codigo_turno}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <div className="font-display text-[15px] font-semibold tabular-nums text-ink-2">
          {ahora ? ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
        </div>
        <div className="h-[26px] w-px bg-line-strong" />
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-hover font-display text-[13px] font-semibold text-ink-2">
            {empleado.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
          </span>
          <div>
            <div className="text-[13px] font-semibold leading-tight">{empleado.nombre}</div>
            <div className="text-[11px] text-ink-3">{empleado.rol === "CAJERO" ? "Cajero" : empleado.rol}</div>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onBloquear}
            aria-label="Bloquear"
            className="flex h-9 w-9 items-center justify-center rounded border border-line-strong text-ink-3 transition hover:border-ink hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          </button>
          <button
            type="button"
            onClick={onCambiarCajero}
            aria-label="Cambiar cajero"
            className="flex h-9 w-9 items-center justify-center rounded border border-line-strong text-ink-3 transition hover:border-ink hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export function HomePos({
  empleado,
  caja,
  turno,
  token,
  onBloquear,
  onCambiarCajero,
}: {
  empleado: Empleado;
  caja: DatosCaja;
  turno: Turno;
  token: string;
  onBloquear: () => void;
  onCambiarCajero: () => void;
}) {
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catSel, setCatSel] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    Promise.all([listarCategoriasPos(token), listarProductosPos(token)])
      .then(([cs, ps]) => {
        if (!activo) return;
        setCategorias(cs);
        setProductos(ps);
        if (cs.length > 0) setCatSel(cs[0]!.id);
      })
      .catch((e) => {
        if (!activo) return;
        setError(e instanceof Error ? e.message : "Error");
      });
    return () => {
      activo = false;
    };
  }, [token]);

  const prodsVisibles = useMemo(
    () => (productos ?? []).filter((p) => !catSel || p.categoria_id === catSel),
    [productos, catSel],
  );

  return (
    <div className="flex h-screen flex-col">
      <TopbarOperativa caja={caja} turno={turno} empleado={empleado} onCambiarCajero={onCambiarCajero} onBloquear={onBloquear} />

      <div className="flex min-h-0 flex-1">
        {/* Sidebar categorías */}
        <aside className="flex w-[200px] flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-3">
          <div className="px-2 pb-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-3">Categorías</div>
          {categorias === null && <p className="px-2 text-sm text-ink-3">Cargando…</p>}
          {categorias?.map((c, i) => {
            const col = colorCategoria(c, i);
            const active = catSel === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatSel(c.id)}
                aria-current={active ? "true" : undefined}
                className={[
                  "flex items-center gap-2.5 rounded px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  active ? "bg-ink text-white" : "text-ink-2 hover:bg-hover hover:text-ink",
                ].join(" ")}
              >
                <span
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded"
                  style={active ? { background: "rgba(255,255,255,0.15)", color: "#fff" } : { background: col.bg, color: col.ink }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d={ICONOS_POS[c.icono ?? "tag"] ?? ICONOS_POS.tag} />
                  </svg>
                </span>
                <span className="truncate">{c.nombre}</span>
              </button>
            );
          })}
          {categorias?.length === 0 && (
            <p className="px-2 text-xs text-ink-3">Sin categorías. Créalas en el admin.</p>
          )}
        </aside>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto bg-bg p-5">
          {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
          {productos === null && <p className="text-sm text-ink-3">Cargando productos…</p>}
          {productos !== null && prodsVisibles.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="font-display text-lg font-semibold">Sin productos en esta categoría</p>
              <p className="max-w-md text-sm text-ink-3">Crea productos en el admin para empezar a vender.</p>
            </div>
          )}
          {prodsVisibles.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {prodsVisibles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={p.agotado}
                  className={[
                    "group relative flex flex-col items-stretch gap-2 rounded-lg border bg-surface p-3 text-left transition",
                    p.agotado
                      ? "cursor-not-allowed border-line opacity-50"
                      : "border-line hover:border-ink hover:shadow-sm active:scale-[.98]",
                  ].join(" ")}
                >
                  {p.agotado && (
                    <span className="absolute right-2 top-2 rounded-full bg-danger/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-danger">
                      Agotado
                    </span>
                  )}
                  <div className="flex h-20 items-center justify-center rounded bg-hover">
                    <span className="font-display text-2xl font-bold text-ink-3">
                      {p.nombre.charAt(0)}
                    </span>
                  </div>
                  <div className="text-[13.5px] font-semibold leading-tight">{p.nombre}</div>
                  <div className="mt-auto font-display text-[15px] font-bold tabular-nums">{fmtMxn(p.precio_base_mxn)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar ticket — placeholder (F5.2 implementa el carrito) */}
        <aside className="flex w-[340px] flex-shrink-0 flex-col border-l border-line bg-surface">
          <div className="border-b border-line p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Ticket actual</div>
            <div className="mt-1 font-display text-[17px] font-semibold">Ticket nuevo</div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12 text-line-strong">
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
            </svg>
            <p className="text-sm font-medium text-ink-2">Carrito vacío</p>
            <p className="text-[12.5px] text-ink-3">El carrito real (líneas + modificadores + cobro) llega en F5.2+.</p>
          </div>
          <div className="border-t border-line p-4">
            <div className="mb-2 flex justify-between text-[13.5px] text-ink-2">
              <span>Subtotal</span><span className="tabular-nums">{fmtMxn(0)}</span>
            </div>
            <div className="mb-3 flex justify-between text-[13.5px] text-ink-3">
              <span>IVA (16%)</span><span className="tabular-nums">{fmtMxn(0)}</span>
            </div>
            <div className="mb-3 flex justify-between border-t border-line pt-3 font-display text-[18px] font-bold">
              <span>Total</span><span className="tabular-nums">{fmtMxn(0)}</span>
            </div>
            <Button size="lg" className="w-full" disabled>Cobrar {fmtMxn(0)}</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
