"use client";
import { useEffect, useState } from "react";
import { hoyMx } from "@vim/fecha";
import { Button, Icono, Modal } from "@vim/ui/styles";
import { horaCorta } from "@vim/db/agenda";
import {
  atenderCita, citasEnEspera, colaboradoresDelDia, serviciosAgenda,
  type CitaDia, type ColaboradorDia, type ServicioAgenda,
} from "../lib/agenda";

/**
 * Lista de espera: quién llegó sin cita, desde cuándo, qué quiere y con quién. «Atender» pregunta
 * con quién (o «Quien esté libre») y la base le arma el tramo desde ahora.
 */
export function PanelEspera({ token, sucursalId, version, onAbrirCita, onAgregar, onAtendida, onCerrar }: {
  token: string;
  sucursalId: string;
  /** Sube al agregar a alguien: la lista se relee. */
  version: number;
  onAbrirCita: (id: string) => void;
  onAgregar: () => void;
  onAtendida: () => void;
  onCerrar: () => void;
}) {
  const [espera, setEspera] = useState<CitaDia[] | null>(null);
  const [colaboradores, setColaboradores] = useState<ColaboradorDia[]>([]);
  const [servicios, setServicios] = useState<ServicioAgenda[]>([]);
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lectura, setLectura] = useState(0);
  const ahora = new Date();

  useEffect(() => {
    let vivo = true;
    citasEnEspera(token, sucursalId)
      .then((e) => { if (vivo) setEspera(e); })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : "No se pudo leer la espera"); });
    return () => { vivo = false; };
  }, [token, sucursalId, version, lectura]);
  useEffect(() => {
    colaboradoresDelDia(token, sucursalId, hoyMx()).then(setColaboradores).catch(() => {});
    serviciosAgenda(token).then(setServicios).catch(() => {});
  }, [token, sucursalId]);

  /** Quien hace todos sus servicios y hoy viene. */
  const quienesPueden = (c: CitaDia) => colaboradores.filter((x) => !x.ausente
    && c.tramos.every((t) => servicios.find((s) => s.productoId === t.productoId)?.colaboradores.some((k) => k.usuarioId === x.usuarioId)));

  async function atender(c: CitaDia, usuarioId: string | null) {
    setError(null);
    setOcupado(true);
    try {
      await atenderCita(token, c.id, c.tramos.map((t) => ({ producto_id: t.productoId, usuario_id: usuarioId })));
      setEligiendo(null);
      setLectura((n) => n + 1);
      onAtendida();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo atender");
    } finally {
      setOcupado(false);
    }
  }

  const opcion = "flex h-11 items-center rounded-lg border border-line-strong bg-surface px-4 text-14 font-semibold transition-[background-color,transform] duration-150 ease-vim hover:bg-hover active:scale-[.97] disabled:opacity-50";

  return (
    <Modal open onClose={onCerrar} title="En espera" hideTitle
      className="flex max-h-[80vh] w-[min(640px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_24px_60px_rgba(22,22,26,.18)]">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line px-4 py-2">
        <button type="button" onClick={onCerrar} aria-label="Cerrar"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 transition-transform duration-150 ease-vim hover:bg-hover hover:text-ink active:scale-[.97]">
          <Icono nombre="cerrar" className="h-5 w-5" />
        </button>
        <h2 className="flex-1 font-display text-20 font-semibold tracking-tight">En espera</h2>
        <Button onClick={onAgregar}>
          <Icono nombre="mas" className="h-4 w-4" />
          Agregar a la espera
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && <p className="px-6 pt-4 text-14 font-medium text-danger" role="alert">{error}</p>}
        {!espera ? (
          <p className="p-6 text-14 text-ink-3">{error ? "" : "Cargando…"}</p>
        ) : espera.length === 0 ? (
          <p className="p-6 text-15 text-ink-2">Nadie espera. Si llega alguien sin cita, agrégalo a la espera.</p>
        ) : (
          <ul>
            {espera.map((c) => {
              const llego = c.llegoAt ?? c.inicia;
              const min = llego ? Math.max(0, Math.round((ahora.getTime() - llego.getTime()) / 60_000)) : null;
              const preferencia = [...new Set(c.tramos.map((t) => t.colaborador).filter(Boolean))].join(", ") || "Quien esté libre";
              return (
                <li key={c.id} className="border-b border-line px-6 py-4 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => onAbrirCita(c.id)} className="min-h-11 min-w-0 flex-1 text-left">
                      <p className="truncate text-15 font-semibold">{c.clienteNombre}</p>
                      <p className="text-13 tabular-nums text-ink-2">
                        {llego ? `Llegó a las ${horaCorta(llego)} · hace ${min} min` : "En espera"}
                      </p>
                      <p className="text-13 text-ink-2">{c.tramos.map((t) => t.servicio).join(", ")} · {preferencia}</p>
                    </button>
                    <Button disabled={ocupado} onClick={() => setEligiendo(eligiendo === c.id ? null : c.id)}>Atender</Button>
                  </div>
                  {eligiendo === c.id && (
                    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Con quién atender a ${c.clienteNombre}`}>
                      <button type="button" className={opcion} disabled={ocupado} onClick={() => void atender(c, null)}>Quien esté libre</button>
                      {quienesPueden(c).map((x) => (
                        <button key={x.usuarioId} type="button" className={`${opcion} gap-2`} disabled={ocupado} onClick={() => void atender(c, x.usuarioId)}>
                          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: x.color }} />
                          {x.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
