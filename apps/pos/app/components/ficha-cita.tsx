"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, DialogoPeligro, Icono, Modal, botonClases, useConfirmar } from "@vim/ui/styles";
import { ETIQUETA_ESTADO_CITA, diaLargo, horaCorta, pasoTolerancia } from "@vim/db/agenda";
import {
  accionesCita, atenderCita, cancelarCita, duracionTexto, enlaceRecordatorio, faltasCliente, leerCita,
  marcarNoLlego, resolverEmpalme, terminarCita, toleranciaMin, type CitaCanal, type CitaDia,
} from "../lib/agenda";
import { fmtMxn } from "../lib/turno";
import { telefonoLegible } from "../lib/telefono";
import {
  TEXTO_ANTICIPO, configCobroAgenda, decisionSugerida, leerAnticipos, sumaAnticipos, vigentes,
  type Anticipo, type CausaCancelacion, type ConfigCobroAgenda, type DecisionAnticipo,
} from "../lib/anticipos";
import { DialogoAnticipo, ModalCobrarAnticipo } from "./anticipo-cita";

const CANAL: Record<CitaCanal, string> = { CAJA: "En la caja", SIN_CITA: "Sin cita, de la lista de espera", EN_LINEA: "En línea" };

const minutos = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;

/**
 * Ficha de una cita (boceto 3): estado, clienta con sus faltas, horario, servicios y nota; a la
 * derecha, lo que se puede hacer según el estado. Lo destructivo pide confirmación.
 */
export function FichaCita({ token, citaId, negocio, cajaId, turnoId, ejecutaNombre, ofrecerAnticipo = false, onMover, onCambio, onCerrar }: {
  token: string;
  citaId: string;
  negocio: string;
  /** Para los anticipos: la caja y el turno que reciben o devuelven el dinero, y quién cobra (PIN). */
  cajaId: string;
  turnoId: string;
  ejecutaNombre: string;
  /** Recién agendada: abre «Cobrar anticipo» (se puede omitir con «Ahora no», que cierra la ficha). */
  ofrecerAnticipo?: boolean;
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
  const [anticipos, setAnticipos] = useState<Anticipo[]>([]);
  const [config, setConfig] = useState<ConfigCobroAgenda | null>(null);
  const [cobrandoAnticipo, setCobrandoAnticipo] = useState(ofrecerAnticipo);
  /** Quién cancela (solo se pregunta con anticipo vigente: decide la sugerencia). */
  const [quienCancela, setQuienCancela] = useState<"SALON" | "CLIENTA" | null>(null);
  /** El diálogo de devolver o retener, con la opción sugerida (null = sin sugerencia). */
  const [decidiendo, setDecidiendo] = useState<{ sugerida: DecisionAnticipo | null; elegida?: DecisionAnticipo } | null>(null);

  const leer = useCallback(() => {
    leerAnticipos(token, citaId).then(setAnticipos).catch(() => {});
    leerCita(token, citaId)
      .then((c) => {
        setCita(c);
        if (c.clienteId) faltasCliente(token, c.clienteId).then(setFaltas).catch(() => setFaltas(null));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo leer la cita"));
  }, [token, citaId]);
  useEffect(() => { leer(); }, [leer]);
  useEffect(() => { toleranciaMin(token).then(setTolerancia).catch(() => {}); }, [token]);
  useEffect(() => { configCobroAgenda(token).then(setConfig).catch(() => {}); }, [token]);
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function hacer(accion: () => Promise<unknown>, cerrar = false): Promise<boolean> {
    setError(null);
    setOcupado(true);
    try {
      await accion();
      onCambio();
      if (cerrar) onCerrar();
      else leer();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const porResolver = vigentes(anticipos);
  const anticipoVigente = sumaAnticipos(porResolver);
  /** Primero la cita (la base solo retiene el de una cancelada o que no llegó); luego, el anticipo. */
  const preguntarAnticipo = (causa: CausaCancelacion) =>
    setDecidiendo({ sugerida: decisionSugerida(causa, cita?.inicia ?? null, new Date(), config?.cancelarHoras ?? 24) });

  async function noLlego() {
    const ok = await confirmar({
      titulo: "¿Marcar que no llegó?",
      mensaje: "Su lugar se libera en el calendario y se le cuenta una falta. No se puede deshacer.",
      boton: "No llegó · liberar lugar",
    });
    if (ok && await hacer(() => marcarNoLlego(token, citaId)) && anticipoVigente > 0) preguntarAnticipo("NO_LLEGO");
  }

  async function cancelar() {
    const conAnticipo = anticipoVigente > 0;
    const quien = quienCancela;
    if (!await hacer(() => cancelarCita(token, citaId, motivo), !conAnticipo)) return;
    setCancelando(false);
    if (conAnticipo && quien) preguntarAnticipo(quien);
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
  const contacto = cita ? [cita.clienteTelefono && telefonoLegible(cita.clienteTelefono), cita.clienteEmail, faltas ? `${faltas} ${faltas === 1 ? "falta" : "faltas"} antes` : null].filter(Boolean).join(" · ") : "";
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

              {anticipoVigente > 0 && (cita.estado === "CANCELADA" || cita.estado === "NO_LLEGO") ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning-line bg-warning-soft px-4 py-3" role="status">
                  <p className="min-w-0 flex-1 text-14 font-medium text-warning">{TEXTO_ANTICIPO.pendiente} · <span className="tabular-nums">{fmtMxn(anticipoVigente)}</span></p>
                  <Button variant="ghost" className="h-11 bg-surface" onClick={() => setDecidiendo({ sugerida: null, elegida: "DEVOLVER" })}>{TEXTO_ANTICIPO.devolver}</Button>
                  <Button variant="ghost" className="h-11 bg-surface" onClick={() => setDecidiendo({ sugerida: null, elegida: "RETENER" })}>{TEXTO_ANTICIPO.retener}</Button>
                </div>
              ) : anticipoVigente > 0 ? (
                <p className="mt-4 rounded-lg border border-success-line bg-success-soft px-4 py-3 text-14 font-medium text-success">
                  {TEXTO_ANTICIPO.pagado(fmtMxn(anticipoVigente))}
                </p>
              ) : null}

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
              {(cita.estado === "AGENDADA" || cita.estado === "EN_ESPERA") && config && config.modo !== "AL_FINAL" && (
                <Button variant="ghost" className={`${accion} bg-surface text-ink`} disabled={ocupado} onClick={() => setCobrandoAnticipo(true)}>{TEXTO_ANTICIPO.cobrar}</Button>
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
              {a?.cancelar && <button type="button" className={peligro} disabled={ocupado} onClick={() => { setMotivo(""); setQuienCancela(null); setCancelando(true); }}>Cancelar cita</button>}
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
          deshabilitado={!motivo.trim() || (anticipoVigente > 0 && !quienCancela)}
          nota={!motivo.trim() ? "Escribe el motivo para poder cancelar." : anticipoVigente > 0 && !quienCancela ? "Elige quién cancela." : null}
          error={error}
          onConfirmar={() => void cancelar()}
          onCerrar={() => setCancelando(false)}
        >
          {anticipoVigente > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-13 font-medium text-ink-2">¿Quién cancela? Dejó {fmtMxn(anticipoVigente)} de anticipo.</span>
              <div className="grid grid-cols-2 gap-2">
                {(["SALON", "CLIENTA"] as const).map((q) => (
                  <button key={q} type="button" onClick={() => setQuienCancela(q)} aria-pressed={quienCancela === q}
                    className={["min-h-[44px] rounded-lg border px-3 text-14 font-semibold transition-[transform,border-color,background-color] duration-150 ease-vim active:scale-[.97]",
                      quienCancela === q ? "border-ink bg-sel text-ink shadow-[inset_0_0_0_1.5px_#16161A]" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
                    {q === "CLIENTA" ? "Cancela la clienta" : "Cancela el negocio"}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium text-ink-2">Motivo</span>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="La clienta avisó que no puede venir"
              className="h-20 w-full rounded border border-line-strong px-3 py-2 text-15 outline-none focus:border-ink" />
          </label>
        </DialogoPeligro>
      )}
      {cobrandoAnticipo && cita && (
        <ModalCobrarAnticipo
          token={token}
          citaId={citaId}
          clienta={cita.clienteNombre}
          cajaId={cajaId}
          turnoId={turnoId}
          textoSalir={ofrecerAnticipo ? "Ahora no" : "Volver"}
          onCobrado={() => { setCobrandoAnticipo(false); onCambio(); leer(); }}
          onCerrar={() => { setCobrandoAnticipo(false); if (ofrecerAnticipo && anticipos.length === 0) onCerrar(); }}
        />
      )}
      {decidiendo && porResolver.length > 0 && (
        <DialogoAnticipo
          token={token}
          vigentes={porResolver}
          sugerida={decidiendo.sugerida}
          elegida={decidiendo.elegida}
          cajaId={cajaId}
          turnoId={turnoId}
          ejecutaNombre={ejecutaNombre}
          onHecho={() => { setDecidiendo(null); onCambio(); leer(); }}
          onCerrar={() => setDecidiendo(null)}
        />
      )}
      {dialogoConfirmar}
    </>
  );
}
