"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { ConfigSideNav } from "../../../components/config-sidenav";
import { listarConflictosPendientes, resolverConflicto, type ConflictoSync } from "../../../lib/sync-conflictos";

type Eleccion = "local" | "servidor";

function Version({ titulo, sub, payload, activo, onClick }: { titulo: string; sub: string; payload: Record<string, unknown>; activo: boolean; onClick: () => void }) {
  const campos = Object.entries(payload).filter(([k]) => !["id", "tenant_id", "created_at", "updated_at"].includes(k)).slice(0, 6);
  return (
    <button type="button" onClick={onClick}
      className={["flex-1 rounded-lg border-2 p-3.5 text-left transition", activo ? "border-ink bg-sel" : "border-line hover:border-line-strong"].join(" ")}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-3">{titulo}</span>
        {activo && <span className="rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-bold text-white">Elegido</span>}
      </div>
      <div className="mb-2 text-[11.5px] text-ink-3">{sub}</div>
      <dl className="space-y-0.5">
        {campos.length === 0 && <span className="text-[12px] text-ink-3">—</span>}
        {campos.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 text-[12.5px]">
            <dt className="text-ink-3">{k}</dt>
            <dd className="truncate font-medium text-ink-2">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}

export default function SincronizacionPage() {
  const [conflictos, setConflictos] = useState<ConflictoSync[] | null>(null);
  const [elec, setElec] = useState<Record<string, Eleccion>>({});
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function cargar() {
    setError(null);
    try { setConflictos(await listarConflictosPendientes()); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }
  useEffect(() => { cargar(); }, []);

  const elegidos = Object.keys(elec).length;

  async function aplicar() {
    setAplicando(true); setError(null); setMsg(null);
    try {
      for (const [id, eleccion] of Object.entries(elec)) {
        await resolverConflicto(id, eleccion === "local" ? "RESUELTO_OPERADOR" : "DESCARTADO", "");
      }
      setMsg(`${elegidos} conflicto${elegidos === 1 ? "" : "s"} resuelto${elegidos === 1 ? "" : "s"}.`);
      setElec({});
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <>
      <PageHeader titulo="Sincronización" subtitulo="Conflictos cuando dos dispositivos modifican lo mismo sin conexión." migas={[{ label: "Configuración" }, { label: "Sincronización" }]} />
      <div className="flex">
        <ConfigSideNav />
        <PageBody>
          {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
          {msg && <p className="mb-3 text-sm font-medium text-success">{msg}</p>}
          {conflictos === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}

          {conflictos !== null && conflictos.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF3EE] text-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6"><path d="M20 6 9 17l-5-5" /></svg>
              </div>
              <p className="text-[15px] font-semibold">Todo sincronizado</p>
              <p className="max-w-sm text-[13px] text-ink-3">No hay conflictos pendientes. Si dos dispositivos editan los mismos datos sin conexión, aparecerán aquí para que elijas qué versión conservar.</p>
            </div>
          )}

          {conflictos !== null && conflictos.length > 0 && (
            <>
              <div className="mb-4 flex items-center justify-between rounded-lg border border-[#E8DCC0] bg-[#F6EEDD] px-4 py-3">
                <p className="text-[13px] font-medium text-warning">
                  {conflictos.length} conflicto{conflictos.length === 1 ? "" : "s"} por resolver · {elegidos} elegido{elegidos === 1 ? "" : "s"}
                </p>
                <Button onClick={aplicar} disabled={elegidos === 0 || aplicando}>{aplicando ? "Aplicando…" : "Aplicar resoluciones"}</Button>
              </div>

              <div className="flex flex-col gap-3">
                {conflictos.map((c) => (
                  <div key={c.id} className="rounded-lg border border-line bg-surface p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded bg-sel px-2 py-0.5 text-[11px] font-bold uppercase text-ink-3">{c.entidad}</span>
                      <span className="text-[13px] font-semibold">{c.tipo}</span>
                      {c.diferencia && <span className="text-[12px] text-ink-3">· {c.diferencia}</span>}
                    </div>
                    <div className="flex flex-col gap-2.5 md:flex-row">
                      <Version titulo="Este dispositivo" sub="Versión capturada sin conexión" payload={c.payloadLocal}
                        activo={elec[c.id] === "local"} onClick={() => setElec((e) => ({ ...e, [c.id]: "local" }))} />
                      <Version titulo="Servidor" sub="Versión ya guardada" payload={c.payloadServidor}
                        activo={elec[c.id] === "servidor"} onClick={() => setElec((e) => ({ ...e, [c.id]: "servidor" }))} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </PageBody>
      </div>
    </>
  );
}
