"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button, StatusChip, type TonoEstado } from "@vim/ui/styles";
import { ETIQUETA_ESTADO_CITA, diaLargo, horaCorta, type CitaEstado } from "@vim/db/agenda";
import { aFechaMx, diaCorto, hoyMx } from "@vim/fecha";
import { BrandMark } from "../components/topbar-pos";
import {
  accionDe, clasificarError, diasTira, ejecutarAccion, leerMiAgenda, leerMisComisiones, pesos, tramosDelDia,
  type MiAgenda, type MiTramo, type MisComisiones, type ResumenComision,
} from "../lib/mi-agenda";

const TONO: Record<CitaEstado, TonoEstado> = {
  AGENDADA: "warning", EN_ESPERA: "warning", EN_CURSO: "success", TERMINADA: "info", COBRADA: "neutral", NO_LLEGO: "danger", CANCELADA: "neutral",
};

/** Mediodía en México de un día YYYY-MM-DD: para formatearlo sin que la zona lo mueva de día. */
const aMediodia = (dia: string) => new Date(`${dia}T12:00:00-06:00`);
const fmtSemana = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", weekday: "short" });
const fmtNum = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "numeric" });

type Pestana = "agenda" | "comisiones";

/** El cuerpo de /mi-agenda con sesión: su agenda de 7 días y sus comisiones. */
export function Agenda({ sb, alVencer, alSalir }: {
  sb: SupabaseClient;
  alVencer: (tipo: "sesion" | "sin_agenda") => void;
  alSalir: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>("agenda");
  const [hoy, setHoy] = useState(hoyMx);
  const [dia, setDia] = useState(hoy);
  const [agenda, setAgenda] = useState<MiAgenda | null>(null);
  const [comisiones, setComisiones] = useState<MisComisiones | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Tramos que ya dijeron «Terminé mi parte»: la cita sigue EN_CURSO para quien hace el último.
  const [partesHechas, setPartesHechas] = useState<ReadonlySet<string>>(new Set());
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  const pestanaRef = useRef(pestana);
  pestanaRef.current = pestana;

  const fallo = useCallback((e: unknown) => {
    const c = clasificarError(e);
    if (c.tipo === "mensaje") setAviso({ texto: c.texto, error: true });
    else alVencer(c.tipo);
  }, [alVencer]);

  const actualizar = useCallback(async () => {
    const h = hoyMx();
    setHoy(h);
    setCargando(true);
    try {
      const [a, c] = await Promise.all([
        leerMiAgenda(sb, h),
        pestanaRef.current === "comisiones" ? leerMisComisiones(sb, h) : Promise.resolve(null),
      ]);
      setAgenda(a);
      if (c) setComisiones(c);
      setAviso((v) => (v?.error ? null : v));
    } catch (e) {
      fallo(e);
    } finally {
      setCargando(false);
    }
  }, [sb, fallo]);

  // Al abrir, al volver a la pestaña o a la app (el celular la deja dormida horas).
  useEffect(() => {
    void actualizar();
    const alVolver = () => { if (document.visibilityState === "visible") void actualizar(); };
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    return () => { window.removeEventListener("focus", alVolver); document.removeEventListener("visibilitychange", alVolver); };
  }, [actualizar]);

  useEffect(() => { if (pestana === "comisiones" && !comisiones) void actualizar(); }, [pestana, comisiones, actualizar]);

  // Si cambió el día con la app abierta, el día elegido no puede quedar antes de hoy.
  useEffect(() => { setDia((d) => (d < hoy ? hoy : d)); }, [hoy]);

  // El aviso de éxito se va solo; el de error se queda hasta que algo salga bien.
  useEffect(() => {
    if (!aviso || aviso.error) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function accionar(t: MiTramo, tipo: "empezar" | "terminar") {
    setOcupado(t.id);
    try {
      const texto = await ejecutarAccion(sb, tipo, t.cita.id);
      if (tipo === "terminar" && !t.ultimo) setPartesHechas((s) => new Set(s).add(t.id));
      setAviso({ texto, error: false });
      await actualizar();
    } catch (e) {
      fallo(e);
    } finally {
      setOcupado(null);
    }
  }

  const tramos = agenda ? tramosDelDia(agenda.tramos, dia) : [];
  const conCitas = new Set(agenda?.tramos.map((t) => aFechaMx(new Date(t.inicia))));

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 pb-2 pt-3">
          <BrandMark size={32} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-20 font-semibold tracking-tight">
              {agenda ? `Hola, ${agenda.colaborador}` : "Mi agenda"}
            </h1>
            <p className="truncate text-13 text-ink-3">{diaLargo(aMediodia(hoy))}</p>
          </div>
          <button type="button" onClick={alSalir}
            className="min-h-[44px] rounded px-3 text-14 font-semibold text-ink-2 transition-transform active:scale-[.97]">
            Cerrar sesión
          </button>
        </div>
        <div role="tablist" aria-label="Secciones" className="grid grid-cols-2 gap-1 px-4 pb-3">
          {(["agenda", "comisiones"] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}
              className={`min-h-[44px] rounded text-15 font-semibold transition-[background-color,color,transform] duration-150 active:scale-[.97] ${
                pestana === p ? "bg-ink text-bg" : "bg-sel text-ink-2"}`}>
              {p === "agenda" ? "Agenda" : "Mis comisiones"}
            </button>
          ))}
        </div>
      </header>

      <p role="status" aria-live="polite"
        className={aviso ? `mx-4 mt-3 rounded px-3 py-2 text-14 font-medium ${aviso.error ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}` : "sr-only"}>
        {aviso?.texto ?? ""}
      </p>

      {pestana === "agenda" ? (
        <section className="flex flex-1 flex-col gap-3 px-4 py-3">
          <div className="grid grid-cols-7 gap-1" aria-label="Días">
            {diasTira(hoy).map((d) => {
              const elegido = d === dia;
              return (
                <button key={d} type="button" onClick={() => setDia(d)} aria-pressed={elegido}
                  aria-label={d === hoy ? `Hoy, ${diaLargo(aMediodia(d))}` : diaLargo(aMediodia(d))}
                  className={`flex min-h-[56px] flex-col items-center justify-center rounded transition-[background-color,color,transform] duration-150 active:scale-[.97] ${
                    elegido ? "bg-accent text-white" : "bg-surface text-ink-2 border border-line"}`}>
                  <span className="text-12">{d === hoy ? "Hoy" : fmtSemana.format(aMediodia(d)).replace(".", "")}</span>
                  <span className="font-display text-18 font-semibold tabular-nums">{fmtNum.format(aMediodia(d))}</span>
                  <span className={`mt-0.5 h-1 w-1 rounded-full ${conCitas.has(d) ? (elegido ? "bg-white" : "bg-accent") : "bg-transparent"}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-16 font-semibold first-letter:uppercase">{diaLargo(aMediodia(dia))}</h2>
            <Button variant="ghost" onClick={() => void actualizar()} disabled={cargando}>
              {cargando ? "Actualizando…" : "Actualizar"}
            </Button>
          </div>

          {agenda && tramos.length === 0 && (
            <p className="rounded border border-dashed border-line-strong px-4 py-8 text-center text-15 text-ink-3">
              No tienes citas este día.
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {tramos.map((t) => {
              const accion = partesHechas.has(t.id) ? null : accionDe(t);
              return (
                <li key={t.id} className="rounded-lg border border-line bg-surface p-4">
                  <div className="flex gap-4">
                    <div className="w-14 flex-shrink-0 tabular-nums">
                      <p className="font-display text-18 font-semibold">{horaCorta(new Date(t.inicia))}</p>
                      <p className="text-13 text-ink-3">{horaCorta(new Date(t.termina))}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-16 font-semibold">{t.cita.cliente_nombre}</p>
                        <StatusChip tone={TONO[t.cita.estado]}>{ETIQUETA_ESTADO_CITA[t.cita.estado]}</StatusChip>
                      </div>
                      <p className="text-14 text-ink-2">{t.servicio}{t.espacio ? ` en ${t.espacio}` : ""}</p>
                      {t.cita.nota && <p className="mt-1 text-13 text-ink-3">{t.cita.nota}</p>}
                    </div>
                  </div>
                  {accion && (
                    <Button size="lg" className="mt-3 w-full" disabled={ocupado !== null}
                      onClick={() => void accionar(t, accion.tipo)}>
                      {ocupado === t.id ? "Un momento…" : accion.etiqueta}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="flex flex-1 flex-col gap-3 px-4 py-3">
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => void actualizar()} disabled={cargando}>
              {cargando ? "Actualizando…" : "Actualizar"}
            </Button>
          </div>
          {comisiones && (
            <>
              <BloqueComision titulo="Hoy" r={comisiones.hoy} />
              <BloqueComision titulo="Este periodo" rango={`${diaCorto(comisiones.actual.desde)} al ${diaCorto(comisiones.actual.hasta)}`} r={comisiones.actual} />
              <BloqueComision titulo="Periodo anterior" rango={`${diaCorto(comisiones.anterior.desde)} al ${diaCorto(comisiones.anterior.hasta)}`} r={comisiones.anterior} />
            </>
          )}
        </section>
      )}
    </main>
  );
}

function BloqueComision({ titulo, rango, r }: { titulo: string; rango?: string; r: ResumenComision }) {
  const fila = (k: string, v: string) => (
    <div className="flex justify-between gap-3 py-1.5"><dt className="text-ink-2">{k}</dt><dd className="tabular-nums">{v}</dd></div>
  );
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-display text-16 font-semibold">{titulo}</h2>
      {rango && <p className="text-13 text-ink-3">{rango}</p>}
      <dl className="mt-2 text-15">
        {fila("Servicios", String(r.servicios))}
        {fila("Ventas sin IVA", pesos(r.ventas))}
        {fila("Comisión", pesos(r.comision))}
        {r.sueldo !== null && fila("Sueldo", pesos(r.sueldo))}
        <div className="mt-1 flex justify-between gap-3 border-t border-line pt-2 font-display text-18 font-semibold">
          <dt>Total</dt><dd className="tabular-nums">{pesos(r.total)}</dd>
        </div>
      </dl>
    </section>
  );
}
