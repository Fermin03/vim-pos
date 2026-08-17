"use client";
import { useEffect, useState } from "react";
import { hace, type Acceso, type Api } from "../lib/tipos";

/**
 * Bitácora de accesos de super admin.
 *
 * `super_admin_accesos` ya se escribía en cada acción sensible —entrar como el cliente, cambiar
 * su plan, abonarle folios— pero no había forma de leerla. Un registro que nadie mira no
 * protege a nadie: el valor de auditar el impersonar está en poder demostrar después qué se
 * hizo y por qué, sobre todo si un cliente pregunta quién tocó su información.
 */
export function Bitacora({ api }: { api: Api }) {
  const [accesos, setAccesos] = useState<Acceso[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setAccesos(((await api("/api/bitacora")).accesos ?? []) as Acceso[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, [api]);

  if (error) return <p className="text-[13px] text-danger">{error}</p>;
  if (!accesos) return <p className="text-[13px] text-ink-3">Cargando…</p>;

  return (
    <div>
      <h2 className="mb-1 font-display text-[18px] font-semibold tracking-tight">Bitácora de accesos</h2>
      <p className="mb-4 text-[12.5px] text-ink-3">
        Toda acción sobre los datos de un cliente queda aquí. Es lo que te permite responder con hechos si alguna vez
        preguntan quién tocó su información.
      </p>
      {accesos.length === 0 ? (
        <p className="text-[13px] text-ink-3">Sin accesos registrados.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead className="bg-sel text-ink-3">
              <tr>
                <th className="p-2.5 text-left font-semibold">Cuándo</th>
                <th className="p-2.5 text-left font-semibold">Acción</th>
                <th className="p-2.5 text-left font-semibold">Empresa</th>
                <th className="p-2.5 text-left font-semibold">Motivo</th>
                <th className="p-2.5 text-left font-semibold">IP</th>
              </tr>
            </thead>
            <tbody>
              {accesos.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="whitespace-nowrap p-2.5 text-ink-2">{hace(a.fecha)}</td>
                  <td className="p-2.5 font-semibold">{a.accion}</td>
                  <td className="p-2.5">{a.tenant}</td>
                  <td className="p-2.5 text-ink-2">{a.motivo ?? "—"}</td>
                  <td className="p-2.5 tabular-nums text-ink-3">{a.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
