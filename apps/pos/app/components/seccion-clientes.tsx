"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Icono } from "@vim/ui/styles";
import { diaLargo } from "@vim/db/agenda";
import { citasDeCliente, faltasCliente, guardarNotasCliente, leerFichaCliente, visitasCliente, type CitaDia, type FichaCliente } from "../lib/agenda";
import { telefonoLegible } from "../lib/telefono";
import { buscarClientesCuenta, type ClienteCuenta } from "../lib/clientes-cuenta";
import { leerPrograma, leerSaldoLocal } from "../lib/lealtad";
import { cantidad } from "../lib/lealtad-reglas";

/**
 * Clientes de la caja de belleza: buscar a una clienta y ver su ficha — visitas (citas terminadas)
 * con qué y con quién, faltas, notas editables, puntos si la lealtad está encendida y «Agendar cita».
 */
export function SeccionClientes({ token, lealtad, version, onAgendar }: {
  token: string;
  lealtad: boolean;
  /** Sube al guardar una cita: la ficha abierta se relee. */
  version: number;
  onAgendar: (c: ClienteCuenta) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ClienteCuenta[] | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => { campo.current?.focus(); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setResultados(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      buscarClientesCuenta(token, q).then((r) => { if (vivo) setResultados(r); }).catch(() => { if (vivo) setResultados([]); });
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, token]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3">
        <h1 className="font-display text-24 font-semibold tracking-tight">Clientes</h1>
        <input ref={campo} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o teléfono" aria-label="Buscar clienta"
          className="h-11 min-w-0 flex-1 rounded border border-line-strong px-3 text-15 outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]" />
      </div>
      <div className="flex min-h-0 flex-1">
        <ul className="w-[320px] flex-shrink-0 overflow-y-auto border-r border-line">
          {resultados == null ? (
            <li className="p-4 text-14 text-ink-3">Escribe al menos dos letras o números.</li>
          ) : resultados.length === 0 ? (
            <li className="p-4 text-14 text-ink-3">Nadie con ese nombre o teléfono.</li>
          ) : resultados.map((r) => (
            <li key={r.clienteId}>
              <button type="button" onClick={() => setElegida(r.clienteId)} aria-current={elegida === r.clienteId ? "true" : undefined}
                className={["flex min-h-14 w-full flex-col justify-center border-b border-line px-4 py-2 text-left transition-colors hover:bg-hover",
                  elegida === r.clienteId ? "bg-accent-soft" : ""].join(" ")}>
                <span className="truncate text-15 font-semibold">{r.nombre}</span>
                <span className="text-13 tabular-nums text-ink-3">{r.bloqueado ? "Bloqueada" : r.telefono}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 flex-1 overflow-y-auto">
          {elegida ? (
            <Ficha key={elegida} token={token} id={elegida} lealtad={lealtad} version={version} onAgendar={onAgendar} />
          ) : (
            <p className="p-8 text-15 text-ink-2">Busca a una clienta para ver sus visitas, notas y faltas.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Ficha({ token, id, lealtad, version, onAgendar }: {
  token: string; id: string; lealtad: boolean; version: number; onAgendar: (c: ClienteCuenta) => void;
}) {
  const [ficha, setFicha] = useState<FichaCliente | null>(null);
  const [citas, setCitas] = useState<CitaDia[] | null>(null);
  const [faltas, setFaltas] = useState(0);
  const [puntos, setPuntos] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    // Las faltas, de la misma función que la ficha de la cita: el mismo número en las dos pantallas.
    Promise.all([leerFichaCliente(token, id), citasDeCliente(token, id), faltasCliente(token, id)])
      .then(([f, c, n]) => { if (!vivo) return; setFicha(f); setNotas(f.notas ?? ""); setCitas(c); setFaltas(n); })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : "No se pudo leer la clienta"); });
    return () => { vivo = false; };
  }, [token, id, version]);
  useEffect(() => {
    if (!lealtad) return;
    let vivo = true;
    leerPrograma(token)
      .then(async (p) => {
        if (!p) return;
        const s = await leerSaldoLocal(token, id, p.version);
        if (vivo) setPuntos(cantidad(p.mecanica, s.saldo));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [token, id, lealtad]);

  async function guardarNotas() {
    setError(null);
    setGuardando(true);
    try {
      await guardarNotasCliente(token, id, notas);
      setFicha((f) => (f ? { ...f, notas: notas.trim() || null } : f));
      setAviso("Notas guardadas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar las notas");
    } finally {
      setGuardando(false);
    }
  }

  if (!ficha || !citas) return <p className="p-8 text-14 text-ink-3" role={error ? "alert" : undefined}>{error ?? "Cargando…"}</p>;
  const visitas = visitasCliente(citas);
  const cambiaron = notas.trim() !== (ficha.notas ?? "").trim();
  const dato = "rounded-lg border border-line px-4 py-3";

  return (
    <div className="flex max-w-[760px] flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-24 font-semibold tracking-tight">{ficha.nombre}</h2>
          <p className="text-14 tabular-nums text-ink-2">{[ficha.telefono && telefonoLegible(ficha.telefono), ficha.email].filter(Boolean).join(" · ") || "Sin teléfono ni correo"}</p>
        </div>
        <Button className="h-12 px-5 text-15" onClick={() => onAgendar({ clienteId: ficha.id, nombre: ficha.nombre, telefono: ficha.telefono })}>
          <Icono nombre="calendario" className="h-5 w-5" />
          Agendar cita
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className={dato}><dt className="text-13 text-ink-3">Visitas</dt><dd className="font-display text-24 font-semibold tabular-nums">{visitas.length}</dd></div>
        <div className={dato}><dt className="text-13 text-ink-3">Faltas</dt>
          <dd className={["font-display text-24 font-semibold tabular-nums", faltas ? "text-danger" : ""].join(" ")}>{faltas}</dd></div>
        {lealtad && puntos != null && <div className={dato}><dt className="text-13 text-ink-3">Lealtad</dt><dd className="font-display text-24 font-semibold tabular-nums">{puntos}</dd></div>}
      </dl>

      <section>
        <label htmlFor="notas-clienta" className="mb-1 block text-13 font-semibold text-ink-3">Notas</label>
        <textarea id="notas-clienta" value={notas} onChange={(e) => { setNotas(e.target.value); setAviso(null); }}
          placeholder="Alergias, preferencias, tono que usa…"
          className="h-24 w-full rounded border border-line-strong px-3 py-2 text-15 outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]" />
        <div className="mt-2 flex items-center gap-3">
          <Button variant="ghost" disabled={!cambiaron || guardando} onClick={() => void guardarNotas()}>{guardando ? "Guardando…" : "Guardar notas"}</Button>
          {aviso && <span className="text-13 text-success" role="status">{aviso}</span>}
          {error && <span className="text-13 font-medium text-danger" role="alert">{error}</span>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-13 font-semibold text-ink-3">Visitas</h3>
        {visitas.length === 0 ? (
          <p className="text-14 text-ink-2">Todavía no tiene visitas terminadas.</p>
        ) : (
          <ul className="flex flex-col">
            {visitas.map((c) => (
              <li key={c.id} className="border-b border-line py-3 last:border-b-0">
                <p className="text-15 font-semibold first-letter:uppercase">{c.inicia ? diaLargo(c.inicia) : "Sin fecha"}</p>
                <p className="text-14 text-ink-2">
                  {c.tramos.map((t) => (t.colaborador ? `${t.servicio} con ${t.colaborador}` : t.servicio)).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
