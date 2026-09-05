"use client";
import { useEffect, useState } from "react";
import { hace, type Acceso, type Api } from "../lib/tipos";
import { input } from "../lib/formato";

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
  // Filtros: con cientos de filas, "qué se le hizo a X" o "quién impersonó" tiene que ser un
  // clic, no una lectura de arriba abajo.
  const [accion, setAccion] = useState("");
  const [q, setQ] = useState("");

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

  const acciones = Array.from(new Set(accesos.map((a) => a.accion))).sort();
  const lista = accesos.filter(
    (a) => (!accion || a.accion === accion) && (!q.trim() || a.tenant.toLowerCase().includes(q.trim().toLowerCase())),
  );

  return (
    <div>
      <h2 className="mb-1 font-display text-[18px] font-semibold tracking-tight">Bitácora de accesos</h2>
      <p className="mb-4 text-[12.5px] text-ink-3">
        Toda acción sobre los datos de un cliente queda aquí. Es lo que te permite responder con hechos si alguna vez
        preguntan quién tocó su información.
      </p>
      {accesos.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <select className={`${input} w-[260px]`} value={accion} onChange={(e) => setAccion(e.target.value)} aria-label="Filtrar por acción">
            <option value="">Todas las acciones</option>
            {acciones.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className={`${input} w-[260px]`} placeholder="Filtrar por empresa…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar por empresa" />
          <span className="self-center text-[12px] text-ink-3">{lista.length} de {accesos.length}</span>
        </div>
      )}
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
              {lista.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-ink-3">Nada con ese filtro.</td></tr>
              )}
              {lista.map((a) => (
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
