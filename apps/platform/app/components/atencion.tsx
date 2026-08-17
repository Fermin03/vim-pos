"use client";
import { useEffect, useState } from "react";
import type { Alerta, Api, Severidad } from "../lib/tipos";

const SEV: Record<Severidad, { punto: string; caja: string; texto: string }> = {
  critica: { punto: "bg-danger", caja: "border-danger/30 bg-[#FBECEA]", texto: "text-danger" },
  alta: { punto: "bg-accent", caja: "border-accent/30 bg-[#FBF0EC]", texto: "text-[#CF4525]" },
  media: { punto: "bg-warning", caja: "border-line-strong bg-surface", texto: "text-warning" },
};

/**
 * Bandeja de pendientes. Es la primera pestaña a propósito: al abrir el panel, lo primero que
 * se ve no debería ser cómo va el negocio en abstracto, sino qué hay que hacer hoy.
 *
 * Cada alerta trae su botón "Abrir", que salta directo al detalle de esa empresa: un pendiente
 * que obliga a ir a buscar al cliente en otra pestaña es un pendiente que se pospone.
 */
export function Atencion({ api, onAbrirEmpresa }: { api: Api; onAbrirEmpresa: (id: string) => void }) {
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Severidad | "todas">("todas");

  useEffect(() => {
    (async () => {
      try {
        setAlertas(((await api("/api/alertas")).alertas ?? []) as Alerta[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, [api]);

  if (error) return <p className="text-[13px] text-danger">{error}</p>;
  if (!alertas) return <p className="text-[13px] text-ink-3">Revisando…</p>;

  const cuenta = (s: Severidad) => alertas.filter((a) => a.severidad === s).length;
  const lista = filtro === "todas" ? alertas : alertas.filter((a) => a.severidad === filtro);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[18px] font-semibold tracking-tight">Requiere tu atención</h2>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["todas", `Todas (${alertas.length})`],
              ["critica", `Críticas (${cuenta("critica")})`],
              ["alta", `Altas (${cuenta("alta")})`],
              ["media", `Medias (${cuenta("media")})`],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFiltro(k as Severidad | "todas")}
              className={[
                "rounded px-2.5 py-1 text-[12.5px] font-semibold transition",
                filtro === k ? "bg-ink text-white" : "text-ink-2 hover:bg-hover",
              ].join(" ")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {alertas.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-10 text-center">
          <div className="font-display text-[17px] font-semibold">Todo en orden</div>
          <p className="mt-1 text-[13px] text-ink-3">
            Ninguna caja caída, ningún trial por vencer, ningún cobro pendiente.
          </p>
        </div>
      ) : lista.length === 0 ? (
        <p className="text-[13px] text-ink-3">Nada en este nivel.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((a) => (
            <div key={a.id} className={["flex items-start gap-3 rounded-lg border p-3.5", SEV[a.severidad].caja].join(" ")}>
              <span className={["mt-1.5 h-2 w-2 flex-shrink-0 rounded-full", SEV[a.severidad].punto].join(" ")} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-[14.5px] font-semibold">{a.titulo}</span>
                  <span className="text-[12px] text-ink-3">· {a.tenant}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-2">{a.detalle}</p>
                <span className={["mt-1 inline-block text-[11px] font-bold uppercase tracking-wide", SEV[a.severidad].texto].join(" ")}>
                  {a.tipo}
                </span>
              </div>
              {a.tenantId && (
                <button
                  type="button"
                  onClick={() => onAbrirEmpresa(a.tenantId as string)}
                  className="flex-shrink-0 rounded border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                >
                  Abrir
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
