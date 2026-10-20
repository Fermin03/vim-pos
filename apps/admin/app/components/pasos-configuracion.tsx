"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, botonClases, Icono } from "@vim/ui/styles";
import { resumenPasos, type EstadoOnboarding } from "../lib/onboarding";

const clave = (tenantId: string) => `vim-admin:pasos-ignorados:${tenantId}`;

function leerIgnorados(tenantId: string): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(clave(tenantId)) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * «Configura tu negocio para empezar a vender» (estilo Square): una tarjeta por paso de
 * `lib/onboarding.ts`, con el siguiente marcado. Ignorar solo existe en el paso opcional y se
 * recuerda en este navegador; no es un dato del negocio.
 */
export function PasosConfiguracion({ estado, tenantId, onTerminar }: { estado: EstadoOnboarding; tenantId: string; onTerminar: () => Promise<void> }) {
  const [ignorados, setIgnorados] = useState<Set<string>>(new Set());
  const [terminando, setTerminando] = useState(false);
  useEffect(() => setIgnorados(leerIgnorados(tenantId)), [tenantId]);

  const ignorar = (c: string) => {
    const nuevos = new Set(ignorados).add(c);
    setIgnorados(nuevos);
    try { localStorage.setItem(clave(tenantId), JSON.stringify([...nuevos])); } catch { /* sin almacenamiento: dura lo que la pestaña */ }
  };

  const { visibles, siguiente, listo } = resumenPasos(estado, ignorados);

  if (listo) {
    return (
      <section className="mb-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-18 font-semibold">Tu negocio está listo para vender</h2>
        <p className="mt-1 text-14 text-ink-2">
          En la computadora de tu caja, entra a VIM POS con el PIN de un cajero y abre el turno.
        </p>
        <Button
          className="mt-4"
          disabled={terminando}
          onClick={async () => { setTerminando(true); try { await onTerminar(); } finally { setTerminando(false); } }}
        >
          {terminando ? "Guardando…" : "Terminar configuración"}
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="pasos-titulo" className="mb-6">
      <h2 id="pasos-titulo" className="font-display text-20 font-semibold tracking-tight">Configura tu negocio para empezar a vender</h2>
      <p className="mt-0.5 text-14 tabular-nums text-ink-2">Completaste {estado.obligatoriosHechos} de {estado.obligatoriosTotal} pasos</p>
      <div
        role="progressbar"
        aria-labelledby="pasos-titulo"
        aria-valuemin={0}
        aria-valuemax={estado.obligatoriosTotal}
        aria-valuenow={estado.obligatoriosHechos}
        className="mt-3 h-2 overflow-hidden rounded-full bg-hover"
      >
        {/* scaleX en vez de width: se anima en el compositor, sin recalcular el layout. */}
        <div
          className="h-full origin-left rounded-full bg-accent transition-transform duration-500 ease-vim motion-reduce:transition-none"
          style={{ transform: `scaleX(${estado.obligatoriosHechos / Math.max(1, estado.obligatoriosTotal)})` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((p) => {
          const esSiguiente = p.clave === siguiente;
          // Lo hecho ocupa una línea: en el celular, el paso que sigue no debe quedar hasta abajo.
          if (p.completo) {
            return (
              <div key={p.clave} className="flex items-center gap-3 rounded-lg border border-line bg-sel px-4 py-3 sm:flex-col sm:items-start sm:gap-1 sm:self-start sm:py-4">
                <span className="inline-flex items-center gap-1 text-11 font-bold uppercase tracking-[0.07em] text-success"><Icono nombre="palomita" className="h-3.5 w-3.5" strokeWidth={2.5} /><span className="sr-only sm:not-sr-only">Listo</span></span>
                <span className="min-w-0 flex-1 truncate text-15 font-semibold text-ink-2">{p.titulo}</span>
                <Link href={p.href} className="inline-flex min-h-[44px] items-center text-13 font-semibold text-ink-2 underline-offset-2 transition-colors hover:text-ink hover:underline lg:min-h-0">Revisar</Link>
              </div>
            );
          }
          return (
            <div key={p.clave} className={`flex flex-col rounded-lg border p-4 ${esSiguiente ? "border-ink bg-surface" : "border-line bg-surface"}`}>
              <div className="mb-1 flex min-h-[18px] items-center gap-2 text-11 font-bold uppercase tracking-[0.07em]">
                {esSiguiente ? (
                  <span className="text-accent">Siguiente</span>
                ) : p.opcional ? (
                  <span className="text-ink-3">Opcional</span>
                ) : null}
              </div>
              <div className="text-15 font-semibold">{p.titulo}</div>
              <p className="mb-3 mt-0.5 flex-1 text-13 leading-snug text-ink-2">{p.descripcion}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={p.href} className={botonClases({ variant: esSiguiente ? "primary" : "ghost" })}>
                  {p.clave === "vincular" ? "Conectar" : "Configurar"}
                </Link>
                {p.opcional && (
                  <button type="button" onClick={() => ignorar(p.clave)} className="min-h-[44px] px-2 text-13 font-semibold text-ink-2 transition-colors hover:text-ink lg:min-h-0">
                    Ignorar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
