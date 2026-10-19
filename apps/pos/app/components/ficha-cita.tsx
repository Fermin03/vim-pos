"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, DialogoPeligro, Icono, Modal, botonClases, useConfirmar } from "@vim/ui/styles";
import { ETIQUETA_ESTADO_CITA, diaLargo, horaCorta, pasoTolerancia } from "@vim/db/agenda";
import {
  accionesCita, atenderCita, cancelarCita, duracionTexto, enlaceRecordatorio, faltasCliente, leerCita,
  marcarNoLlego, resolverEmpalme, terminarCita, toleranciaMin, type CitaCanal, type CitaDia,
} from "../lib/agenda";
import { fmtMxn } from "../lib/turno";

const CANAL: Record<CitaCanal, string> = { CAJA: "En la caja", SIN_CITA: "Sin cita, de la lista de espera", EN_LINEA: "En línea" };

const minutos = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;

/**
 * Ficha de una cita (boceto 3): estado, clienta con sus faltas, horario, servicios y nota; a la
 * derecha, lo que se puede hacer según el estado. Lo destructivo pide confirmación.
 */
export function FichaCita({ token, citaId, negocio, onMover, onCambio, onCerrar }: {
  token: string;
  citaId: string;
  negocio: string;
  /** «Mover de horario»: abre la cita en edición. */
  onMover: (cita: CitaDia) => void;
  /** Algo cambió: el calendario se relee. */
  onCambio: () => void;
  onCerrar: () => void;
}) {
  const [cita, setCita] = useState<CitaDia | null>(null);
  const [tolerancia, setTolerancia] = useState(15);
  const [faltas, setFaltas] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [confirmar, dialogoConfirmar] = useConfirmar();

  const leer = useCallback(() => {
    leerCita(token, citaId)
      .then((c) => {
        setCita(c);
        if (c.clienteId) faltasCliente(token, c.clienteId).then(setFaltas).catch(() => setFaltas(null));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo leer la cita"));
  }, [token, citaId]);
  useEffect(() => { leer(); }, [leer]);
  useEffect(() => { toleranciaMin(token).then(setTolerancia).catch(() => {}); }, [token]);
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function hacer(accion: () => Promise<unknown>, cerrar = false) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
      onCambio();
      if (cerrar) onCerrar();
      else leer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo");
    } finally {
      setOcupado(false);
    }
  }

  async function noLlego() {
    const ok = await confirmar({
      titulo: "¿Marcar que no llegó?",
      mensaje: "Su lugar se libera en el calendario y se le cuenta una falta. No se puede deshacer.",
      boton: "No llegó · liberar lugar",
    });
    if (ok) await hacer(() => marcarNoLlego(token, citaId));
  }

  const titulo = cita ? `Cita de ${cita.clienteNombre}` : "Cita";
  const a = cita ? accionesCita(cita, ahora) : null;
  const paso = cita?.estado === "AGENDADA" && cita.inicia != null && pasoTolerancia(cita.inicia, ahora, tolerancia);
  const whatsapp = cita ? enlaceRecordatorio(cita, negocio) : null;
  const estado = !cita ? "" : paso
    ? "Pasó la tolerancia"
    : cita.estado === "AGENDADA" && cita.inicia
      ? `${ETIQUETA_ESTADO_CITA.AGENDADA} · tolerancia hasta ${horaCorta(new Date(cita.inicia.getTime() + tolerancia * 60_000))}`
      : ETIQUETA_ESTADO_CITA[cita.estado];
  const tonoEstado = paso || cita?.estado === "NO_LLEGO" ? "border-danger-line bg-danger-soft text-danger"
    : cita?.estado === "EN_CURSO" ? "border-success-line bg-success-soft text-success"
      : cita?.estado === "AGENDADA" || cita?.estado === "EN_ESPERA" ? "border-warning-line bg-warning-soft text-warning"
        : "border-line bg-sel text-ink-2";
  const contacto = cita ? [cita.clienteTelefono, cita.clienteEmail, faltas ? `${faltas} ${faltas === 1 ? "falta" : "faltas"} antes` : null].filter(Boolean).join(" · ") : "";
  const fila = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-3";
  const accion = "h-12 w-full text-15";
  const peligro = "flex h-12 w-full items-center justify-center rounded border border-danger-line bg-surface font-display text-15 font-semibold text-danger transition-[background-color,transform] duration-150 ease-vim hover:bg-danger-soft active:scale-[.97] disabled:pointer-events-none disabled:opacity-50";

  return (
    <>
      <Modal open onClose={onCerrar} title={titulo} hideTitle
        className="flex h-[80vh] w-[80vw] flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_24px_60px_rgba(22,22,26,.18)]">
        <div className="relative flex flex-shrink-0 items-center justify-center border-b border-line px-16 py-3">
          <button type="button" onClick={onCerrar} aria-label="Cerrar"
            className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 transition-transform duration-150 ease-vim hover:bg-hover hover:text-ink active:scale-[.97]">
            <Icono nombre="cerrar" className="h-5 w-5" />
          </button>
          <h2 className="truncate font-display text-20 font-semibold tracking-tight">{titulo}</h2>
        </div>

        {!cita ? (
          <p className="p-6 text-14 text-ink-3" role={error ? "alert" : undefined}>{error ?? "Cargando…"}</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
            <div className="flex flex-col p-6 md:min-h-0 md:flex-1 md:overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-13 font-semibold ${tonoEstado}`}>{estado}</span>
                {a?.empalme && <span className="rounded-full bg-danger px-3 py-1 text-13 font-semibold text-white">Empalme</span>}
              </div>

              {a?.empalme && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-danger-line bg-danger-soft px-4 py-3" role="alert">
                  <p className="min-w-0 flex-1 text-14 text-danger">
                    Choca con otra cita: se agendó en dos lugares a la vez. Muévela o cancela una de las dos.
                  </p>
                  <Button variant="ghost" className="h-11 bg-surface" disabled={ocupado} onClick={() => void hacer(() => resolverEmpalme(token, citaId))}>Ya lo moví</Button>
                </div>
              )}

              <div className="mt-2">
                <div className={fila}>
                  <span className="text-15 font-semibold">{cita.clienteNombre}</span>
                  <span className="text-14 tabular-nums text-ink-2">{contacto}</span>
                </div>
                {cita.inicia && cita.termina && (
                  <div className={fila}>
                    <span className="text-15 font-semibold first-letter:uppercase">{diaLargo(cita.inicia)}</span>
                    <span className="text-14 tabular-nums text-ink-2">
                      {horaCorta(cita.inicia)} – {horaCorta(cita.termina)} ({duracionTexto(minutos(cita.inicia, cita.termina))})
                    </span>
                  </div>
                )}
                <div className={fila}>
                  <span className="text-15 font-semibold">Reservó</span>
                  <span className="text-14 text-ink-2">{CANAL[cita.canal]}</span>
                </div>
              </div>

              <h3 className="mt-6 text-13 font-semibold text-ink-3">Servicios</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {cita.tramos.map((t) => (
                  <li key={t.id} className="rounded-lg border border-line px-4 py-3">
                    <p className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-15 font-semibold">{t.servicio}</span>
                      <span className="text-15 font-semibold tabular-nums">{fmtMxn(t.precio)}</span>
                    </p>
                    <p className="text-13 text-ink-2">
                      {[t.colaborador ?? (cita.estado === "EN_ESPERA" ? "Sin preferencia" : null), t.espacio,
                        t.inicia && t.termina ? duracionTexto(minutos(t.inicia, t.termina)) : null].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>

              {cita.nota && (
                <>
                  <h3 className="mt-6 text-13 font-semibold text-ink-3">Nota</h3>
                  <p className="mt-1 whitespace-pre-line text-14 text-ink">{cita.nota}</p>
                </>
              )}
            </div>

            <aside className="flex flex-shrink-0 flex-col gap-3 border-t border-line bg-sel p-5 md:w-[320px] md:overflow-y-auto md:border-l md:border-t-0">
              {a?.atender && (
                <Button className={accion} disabled={ocupado} onClick={() => void hacer(() => atenderCita(token, citaId))}>
                  {cita.estado === "EN_ESPERA" ? "Atender" : "Llegó · empezar"}
                </Button>
              )}
              {a?.terminar && <Button className={accion} disabled={ocupado} onClick={() => void hacer(() => terminarCita(token, citaId))}>Terminé</Button>}
              {a?.recordar && (whatsapp ? (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${botonClases({ variant: "ghost" })} ${accion} bg-surface text-ink`}>
                  Recordar por WhatsApp
                </a>
              ) : (
                <div>
                  <Button variant="ghost" className={`${accion} bg-surface`} disabled>Recordar por WhatsApp</Button>
                  <p className="mt-1 text-13 text-ink-3">Sin un teléfono de 10 dígitos en la cita.</p>
                </div>
              ))}
              {a?.mover && <Button variant="ghost" className={`${accion} bg-surface text-ink`} disabled={ocupado} onClick={() => onMover(cita)}>Mover de horario</Button>}
              {(a?.noLlego || a?.cancelar) && <hr className="my-1 border-line" />}
              {a?.noLlego && <button type="button" className={peligro} disabled={ocupado} onClick={() => void noLlego()}>No llegó · liberar lugar</button>}
              {a?.cancelar && <button type="button" className={peligro} disabled={ocupado} onClick={() => { setMotivo(""); setCancelando(true); }}>Cancelar cita</button>}
              {error && <p className="text-14 font-medium text-danger" role="alert">{error}</p>}
            </aside>
          </div>
        )}
      </Modal>

      {cancelando && cita && (
        <DialogoPeligro
          titulo="Cancelar cita"
          contexto={`${cita.clienteNombre}${cita.inicia ? ` · ${diaLargo(cita.inicia)}, ${horaCorta(cita.inicia)}` : ""}`}
          consecuencia="Su lugar se libera en el calendario. No se puede deshacer."
          boton="Cancelar cita"
          textoOcupado="Cancelando…"
          ocupado={ocupado}
          deshabilitado={!motivo.trim()}
          nota={motivo.trim() ? null : "Escribe el motivo para poder cancelar."}
          error={error}
          onConfirmar={() => void hacer(() => cancelarCita(token, citaId, motivo), true)}
          onCerrar={() => setCancelando(false)}
        >
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium text-ink-2">Motivo</span>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="La clienta avisó que no puede venir"
              className="h-20 w-full rounded border border-line-strong px-3 py-2 text-15 outline-none focus:border-ink" />
          </label>
        </DialogoPeligro>
      )}
      {dialogoConfirmar}
    </>
  );
}
