"use client";
import { useEffect, useState } from "react";
import { hace, type Api, type Salud } from "../lib/tipos";

const COLOR: Record<string, string> = {
  ok: "bg-[#EAF3EE] text-success",
  tibia: "bg-[#FCF3E6] text-warning",
  caida: "bg-[#FBECEA] text-danger",
  nunca: "bg-[#FBECEA] text-danger",
  bloqueada: "bg-[#FBECEA] text-danger",
  inactiva: "bg-sel text-ink-3",
};
const TEXTO: Record<string, string> = {
  ok: "Conectada",
  tibia: "Sin conexión",
  caida: "Caída",
  nunca: "Nunca conectó",
  bloqueada: "Bloqueada",
  inactiva: "Inactiva",
};

/**
 * Salud operativa de una empresa, dentro de su detalle.
 *
 * El plan y el estado dicen lo que el cliente contrató; esto dice lo que hace. Un tenant ACTIVO
 * que no sincroniza desde hace dos semanas está a un paso de cancelar, y sin esta vista no hay
 * forma de notarlo. En soporte también responde la primera pregunta de siempre: "¿le están
 * subiendo sus ventas?".
 */
export function SaludTenant({ api, id }: { api: Api; id: string }) {
  const [s, setS] = useState<Salud | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setS((await api(`/api/tenants/${id}/salud`)) as unknown as Salud);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, [api, id]);

  if (error) return <p className="text-[12.5px] text-danger">{error}</p>;
  if (!s) return <p className="text-[12.5px] text-ink-3">Cargando salud…</p>;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
        <span>
          Sucursales: <b>{s.sucursalesActivas}/{s.sucursales}</b>
        </span>
        <span>
          Última sincronización: <b>{hace(s.ultimaSync)}</b>
        </span>
        {s.erroresRecientes > 0 && <span className="font-semibold text-danger">{s.erroresRecientes} operaciones con error</span>}
        {s.conflictosRecientes > 0 && <span className="font-semibold text-warning">{s.conflictosRecientes} conflictos</span>}
      </div>

      {s.cajas.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">Sin cajas dadas de alta todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full text-[12.5px]">
            <thead className="bg-sel text-ink-3">
              <tr>
                <th className="p-2 text-left font-semibold">Caja</th>
                <th className="p-2 text-left font-semibold">Sucursal</th>
                <th className="p-2 text-left font-semibold">Estado</th>
                <th className="p-2 text-right font-semibold">Última conexión</th>
              </tr>
            </thead>
            <tbody>
              {s.cajas.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="p-2 font-semibold">{c.nombre}</td>
                  <td className="p-2 text-ink-2">{c.sucursal}</td>
                  <td className="p-2">
                    <span className={["rounded px-1.5 py-0.5 text-[11px] font-bold", COLOR[c.estado] ?? "bg-sel text-ink-3"].join(" ")}>
                      {TEXTO[c.estado] ?? c.estado}
                    </span>
                    {c.bloqueoMotivo && <span className="ml-1 text-[11px] text-ink-3">{c.bloqueoMotivo}</span>}
                  </td>
                  <td className="p-2 text-right tabular-nums text-ink-2">{hace(c.ultimaConexion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s.sync.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] font-semibold text-ink-2">Últimas sincronizaciones</summary>
          <div className="mt-1.5 flex flex-col gap-1">
            {s.sync.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-baseline justify-between gap-2 border-b border-line py-1 text-[12px] last:border-0">
                <span className="truncate text-ink-2">
                  {hace(e.fecha)}
                  {e.dispositivo ? ` · ${e.dispositivo}` : ""}
                </span>
                <span className="flex-shrink-0 tabular-nums">
                  {e.exitosas}/{e.total}
                  {e.errores > 0 && <b className="ml-1 text-danger">{e.errores} err</b>}
                  {e.conflictos > 0 && <b className="ml-1 text-warning">{e.conflictos} conf</b>}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
