"use client";
import { useEffect, useState } from "react";
import { hace, type Api } from "../lib/tipos";

type ErrorAgrupado = {
  clave: string;
  mensaje: string;
  app: string;
  tenant: string;
  veces: number;
  ultima: string;
  primera: string;
  stack: string | null;
  version: string | null;
};

const COLOR_APP: Record<string, string> = {
  caja: "bg-[#FBECEA] text-danger",
  pos: "bg-[#FBF0EC] text-[#CF4525]",
  admin: "bg-[#EEF5FC] text-info",
  kds: "bg-[#FCF3E6] text-warning",
};

/**
 * Errores que reportan las apps de los clientes.
 *
 * Agrupados por mensaje: veinte veces el mismo fallo es un problema, no veinte. La traza se
 * despliega bajo demanda — sirve para diagnosticar, no para leerla de corrido.
 */
export function Errores({ api }: { api: Api }) {
  const [errores, setErrores] = useState<ErrorAgrupado[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api("/api/errores");
        setErrores((r.errores ?? []) as ErrorAgrupado[]);
        setTotal(Number(r.total ?? 0));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, [api]);

  if (error) return <p className="text-[13px] text-danger">{error}</p>;
  if (!errores) return <p className="text-[13px] text-ink-3">Cargando…</p>;

  return (
    <div>
      <h2 className="mb-1 font-display text-[18px] font-semibold tracking-tight">Errores de las apps</h2>
      <p className="mb-4 text-[12.5px] text-ink-3">
        Lo que truena en el POS, el admin y las cajas. Agrupado por mensaje · {total} reporte{total === 1 ? "" : "s"} recientes.
      </p>

      {errores.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-10 text-center">
          <div className="font-display text-[17px] font-semibold">Sin errores reportados</div>
          <p className="mt-1 text-[13px] text-ink-3">
            Las cajas reportan al sincronizar, así que un error reciente puede tardar unos minutos en aparecer.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {errores.map((e) => (
            <div key={e.clave} className="rounded-lg border border-line bg-surface">
              <button
                type="button"
                onClick={() => setAbierto(abierto === e.clave ? null : e.clave)}
                className="flex w-full items-start gap-3 p-3.5 text-left transition hover:bg-hover"
              >
                <span className={["mt-[2px] flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase", COLOR_APP[e.app] ?? "bg-sel text-ink-3"].join(" ")}>
                  {e.app}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-display text-[14px] font-semibold">{e.mensaje}</span>
                  <span className="mt-0.5 block text-[12px] text-ink-3">
                    {e.tenant}
                    {e.version ? ` · v${e.version}` : ""} · última {hace(e.ultima)}
                    {e.veces > 1 ? ` · primera ${hace(e.primera)}` : ""}
                  </span>
                </span>
                {e.veces > 1 && (
                  <span className="flex h-[22px] min-w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-[12px] font-bold text-white">
                    {e.veces}
                  </span>
                )}
              </button>
              {abierto === e.clave && (
                <pre className="max-h-[280px] overflow-auto border-t border-line bg-sel px-3.5 py-3 text-[11.5px] leading-[1.5] text-ink-2">
                  {e.stack ?? "(sin traza)"}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
