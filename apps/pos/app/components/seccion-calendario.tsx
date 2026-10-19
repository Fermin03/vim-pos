"use client";
import { TEXTO_ANTICIPO } from "../lib/anticipos";
import { useEffect, useMemo, useState } from "react";
import { hoyMx, sumarDias } from "@vim/fecha";
import { Icono } from "@vim/ui/styles";
import { ETIQUETA_ESTADO_CITA, horaCorta, pasoTolerancia } from "@vim/db/agenda";
import {
  ALTO_MIN,
  PX_POR_MIN,
  citasDelDia,
  citasEnEspera,
  colaboradoresDelDia,
  diaSemana,
  inicioDiaMx,
  minutoDelDia,
  posicionTramo,
  rangoHoras,
  toleranciaMin,
  trabajaA,
  type CitaDia,
  type ColaboradorDia,
  type TramoCita,
} from "../lib/agenda";

const LETRA_DIA = ["D", "L", "M", "M", "J", "V", "S"];
const SLOT_MIN = 30;
const fmtMes = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", month: "long" });

const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

/** «9:00», «17:30»; la medianoche con su cero: «00:30» (como `horaCorta`). */
const hhmm = (min: number) => `${Math.floor(min / 60) || "00"}:${String(min % 60).padStart(2, "0")}`;

/** Columna para los tramos de alguien que ya no está en la agenda (dado de baja) o sin colaborador. */
const SIN_COLABORADOR: ColaboradorDia = { usuarioId: "", nombre: "Sin colaborador", color: "rgb(var(--ink-3))", horario: null, ausente: false };

/**
 * Calendario de la caja de belleza (boceto 1): el día por colaborador, con la línea de la hora,
 * las citas en su tramo y su estado. Tocar una cita, un hueco o los botones de arriba lo resuelve
 * quien lo monta (ficha, nueva cita, lista de espera).
 */
export function SeccionCalendario({ token, sucursalId, version, onAbrirCita, onNuevaCita, onAbrirEspera }: {
  token: string;
  sucursalId: string;
  /** Sube al guardar, mover o cancelar una cita: el calendario se relee en ese momento. */
  version: number;
  onAbrirCita: (id: string) => void;
  /** Desde un hueco llega con la hora y el colaborador; desde «+ Nueva cita», sin nada. */
  onNuevaCita: (inicio?: Date, usuarioId?: string) => void;
  onAbrirEspera: () => void;
}) {
  const hoy = hoyMx();
  const [dia, setDia] = useState(hoy);
  const [ahora, setAhora] = useState(() => new Date());
  const [datos, setDatos] = useState<{ dia: string; colaboradores: ColaboradorDia[]; citas: CitaDia[]; espera: number; tolerancia: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // La hora corre cada 30 s; el día se vuelve a leer cada minuto (la nube o la otra caja agendan).
  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(reloj);
  }, []);
  useEffect(() => {
    let vivo = true;
    const leer = () => {
      Promise.all([colaboradoresDelDia(token, sucursalId, dia), citasDelDia(token, sucursalId, dia), citasEnEspera(token, sucursalId), toleranciaMin(token)])
        .then(([colaboradores, citas, espera, tolerancia]) => {
          if (!vivo) return;
          setDatos({ dia, colaboradores, citas, espera: espera.length, tolerancia });
          setError(null);
        })
        .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : "No se pudo leer la agenda"); });
    };
    leer();
    const t = setInterval(leer, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, [token, sucursalId, dia, version]);

  // Lunes a domingo de la semana del día elegido.
  const lunes = sumarDias(dia, -((diaSemana(dia) + 6) % 7));
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const mes = fmtMes.format(new Date(`${dia}T12:00:00Z`));

  const vigentes = datos?.dia === dia ? datos : null;
  const rango = useMemo(
    () => (vigentes ? rangoHoras(vigentes.colaboradores, vigentes.citas, dia) : null),
    [vigentes, dia],
  );
  const alto = rango ? (rango.hasta - rango.desde) * PX_POR_MIN : 0;
  const minAhora = minutoDelDia(ahora, dia);
  const lineaAhora = rango && dia === hoy && minAhora >= rango.desde && minAhora <= rango.hasta ? (minAhora - rango.desde) * PX_POR_MIN : null;

  const conocidos = new Set(vigentes?.colaboradores.map((c) => c.usuarioId));
  const huerfanos = vigentes?.citas.some((c) => c.tramos.some((t) => t.inicia && t.termina && !conocidos.has(t.usuarioId ?? ""))) ?? false;
  const columnas = vigentes ? [...vigentes.colaboradores, ...(huerfanos ? [SIN_COLABORADOR] : [])] : [];

  const boton = "flex h-12 items-center justify-center rounded-lg px-4 text-15 font-semibold transition-[transform,background-color,border-color] duration-150 ease-vim active:scale-[.97]";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Angosta (≈800 px) la cabecera se parte en dos renglones en vez de empujar la página de lado. */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3">
        <h1 className="font-display text-24 font-semibold capitalize tracking-tight">{mes}</h1>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Semana anterior" onClick={() => setDia(sumarDias(dia, -7))}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 transition-transform duration-150 ease-vim hover:bg-hover hover:text-ink active:scale-[.97]">
            <Icono nombre="chevron-izquierda" className="h-5 w-5" />
          </button>
          {semana.map((d) => {
            const elegido = d === dia;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDia(d)}
                aria-current={elegido ? "date" : undefined}
                aria-label={d === hoy ? `Hoy, ${d}` : d}
                className={[
                  "flex h-14 w-[52px] flex-col items-center justify-center rounded-lg leading-tight transition-[transform,background-color] duration-150 ease-vim active:scale-[.97]",
                  elegido ? "bg-accent text-white" : "text-ink hover:bg-hover",
                ].join(" ")}
              >
                <span className={["text-12 font-medium", elegido ? "text-white/80" : d === hoy ? "text-accent" : "text-ink-3"].join(" ")}>{LETRA_DIA[diaSemana(d)]}</span>
                <span className={["font-display text-18 font-semibold tabular-nums", !elegido && d === hoy ? "text-accent" : ""].join(" ")}>{Number(d.slice(8))}</span>
              </button>
            );
          })}
          <button type="button" aria-label="Semana siguiente" onClick={() => setDia(sumarDias(dia, 7))}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 transition-transform duration-150 ease-vim hover:bg-hover hover:text-ink active:scale-[.97]">
            <Icono nombre="chevron-derecha" className="h-5 w-5" />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
        {dia !== hoy && (
          <button type="button" onClick={() => setDia(hoy)} className={`${boton} border border-line-strong text-ink-2 hover:border-ink hover:text-ink`}>Hoy</button>
        )}
        <button
          type="button"
          onClick={onAbrirEspera}
          className="flex h-11 items-center rounded-full border border-warning-line bg-warning-soft px-4 text-14 font-semibold tabular-nums text-warning transition-transform duration-150 ease-vim active:scale-[.97]"
        >
          {vigentes?.espera ?? 0} en espera
        </button>
        <button type="button" onClick={() => onNuevaCita()} className={`${boton} gap-2 bg-accent text-white hover:bg-accent-hover`}>
          <Icono nombre="mas" className="h-5 w-5" />
          Nueva cita
        </button>
        </div>
      </div>

      {error && <p className="flex-shrink-0 px-4 py-2.5 text-14 font-medium text-danger" role="alert">{error}</p>}

      {!vigentes || !rango ? (
        <p className="p-4 text-14 text-ink-3">{error ? "" : "Cargando…"}</p>
      ) : columnas.length === 0 ? (
        <p className="p-8 text-15 text-ink-2">No hay colaboradores en esta sucursal. Dalos de alta en el admin, en Agenda › Colaboradores.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex min-w-max">
            {/* Horas */}
            <div className="sticky left-0 z-20 w-16 flex-shrink-0 border-r border-line bg-surface">
              <div className="sticky top-0 z-10 h-14 border-b border-line bg-surface" />
              <div className="relative" style={{ height: alto }}>
                {/* Toda hora lleva su etiqueta; la primera va debajo de la raya (centrada, la taparía la cabecera). */}
                {Array.from({ length: (rango.hasta - rango.desde) / 60 + 1 }, (_, i) => rango.desde + i * 60).map((m, i) => (
                  <span key={m} className={["absolute right-2 text-12 tabular-nums text-ink-3", i === 0 ? "translate-y-0.5" : "-translate-y-1/2"].join(" ")} style={{ top: (m - rango.desde) * PX_POR_MIN }}>
                    {hhmm(m)}
                  </span>
                ))}
                {lineaAhora != null && (
                  <span className="absolute right-1 z-10 -translate-y-1/2 bg-surface text-11 font-bold tabular-nums text-danger" style={{ top: lineaAhora }}>
                    {horaCorta(ahora)}
                  </span>
                )}
              </div>
            </div>

            {columnas.map((c) => (
              <Columna
                key={c.usuarioId || "sin"}
                colaborador={c}
                dia={dia}
                desde={rango.desde}
                hasta={rango.hasta}
                alto={alto}
                tramos={vigentes.citas.flatMap((cita) => cita.tramos
                  .filter((t) => t.inicia && t.termina && (c === SIN_COLABORADOR ? !conocidos.has(t.usuarioId ?? "") : t.usuarioId === c.usuarioId))
                  .map((t) => ({ cita, t })))}
                ahora={ahora}
                tolerancia={vigentes.tolerancia}
                lineaAhora={lineaAhora}
                onAbrirCita={onAbrirCita}
                onNuevaCita={onNuevaCita}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Columna({ colaborador: c, dia, desde, hasta, alto, tramos, ahora, tolerancia, lineaAhora, onAbrirCita, onNuevaCita }: {
  colaborador: ColaboradorDia;
  dia: string;
  desde: number;
  hasta: number;
  alto: number;
  tramos: { cita: CitaDia; t: TramoCita }[];
  ahora: Date;
  tolerancia: number;
  lineaAhora: number | null;
  onAbrirCita: (id: string) => void;
  onNuevaCita: (inicio?: Date, usuarioId?: string) => void;
}) {
  const slots = Array.from({ length: (hasta - desde) / SLOT_MIN }, (_, i) => desde + i * SLOT_MIN);
  return (
    <div className="w-[260px] flex-shrink-0 border-r border-line last:border-r-0">
      <div className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-line bg-surface px-3">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-12 font-bold text-white" style={{ backgroundColor: c.color }}>
          {iniciales(c.nombre)}
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-15 font-semibold">{c.nombre}</span>
        {c.ausente && <span className="text-12 font-medium text-ink-3">No viene hoy</span>}
      </div>
      <div className="relative" style={{ height: alto }}>
        {/* Huecos de media hora: tocar uno agenda ahí. Fuera de su horario se ven apagados. */}
        {c !== SIN_COLABORADOR && slots.map((m) => (
          <button
            key={m}
            type="button"
            aria-label={`Nueva cita a las ${hhmm(m)} con ${c.nombre}`}
            onClick={() => onNuevaCita(new Date(inicioDiaMx(dia).getTime() + m * 60_000), c.usuarioId)}
            className={[
              "absolute inset-x-0 block transition-colors hover:bg-hover",
              m % 60 === 0 ? "border-t border-line" : "",
              trabajaA(c, m) ? "" : "bg-hover/70",
            ].join(" ")}
            style={{ top: (m - desde) * PX_POR_MIN, height: SLOT_MIN * PX_POR_MIN }}
          />
        ))}
        {tramos.map(({ cita, t }) => (
          <TarjetaTramo key={t.id} cita={cita} tramo={t} dia={dia} desde={desde} color={c.color} ahora={ahora} tolerancia={tolerancia} onAbrir={() => onAbrirCita(cita.id)} />
        ))}
        {lineaAhora != null && <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[5] h-0.5 bg-danger" style={{ top: lineaAhora - 1 }} />}
      </div>
    </div>
  );
}

function TarjetaTramo({ cita, tramo, dia, desde, color, ahora, tolerancia, onAbrir }: {
  cita: CitaDia;
  tramo: TramoCita;
  dia: string;
  desde: number;
  color: string;
  ahora: Date;
  tolerancia: number;
  onAbrir: () => void;
}) {
  const { top, alto } = posicionTramo(tramo.inicia!, tramo.termina!, dia, desde);
  const noLlego = cita.estado === "NO_LLEGO";
  // Una cancelada solo se ve con anticipo pendiente (citasDelDia): apagada y marcada.
  const cancelada = cita.estado === "CANCELADA";
  const apagada = cita.estado === "TERMINADA" || cancelada;
  const porLlegar = cita.estado === "AGENDADA" && cita.inicia != null;
  const paso = porLlegar && pasoTolerancia(cita.inicia!, ahora, tolerancia);
  const empalme = !cancelada && (cita.empalme || tramo.empalme);
  const detalle = cita.canal === "SIN_CITA"
    ? "Sin cita (de la lista de espera)"
    : porLlegar && !paso
      ? `Tolerancia hasta ${horaCorta(new Date(cita.inicia!.getTime() + tolerancia * 60_000))}`
      : tramo.espacio;

  const insignia = paso
    ? { texto: "Pasó la tolerancia", clase: "bg-danger-soft text-danger" }
    : noLlego
      ? { texto: ETIQUETA_ESTADO_CITA.NO_LLEGO, clase: "bg-danger-soft text-danger" }
      : cita.estado === "EN_CURSO"
        ? { texto: ETIQUETA_ESTADO_CITA.EN_CURSO, clase: "bg-surface text-success" }
        : cita.estado === "AGENDADA"
          ? { texto: ETIQUETA_ESTADO_CITA.AGENDADA, clase: "bg-surface text-warning" }
          : { texto: ETIQUETA_ESTADO_CITA[cita.estado], clase: "bg-surface text-ink-3" };

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={[
        "absolute left-1.5 right-1.5 z-[1] flex flex-col overflow-hidden rounded-lg border-l-[3px] px-2.5 py-1.5 text-left transition-transform duration-150 ease-vim active:scale-[.98]",
        noLlego ? "border border-dashed border-line-strong bg-surface" : "",
        apagada ? "opacity-60" : "",
        empalme ? "ring-2 ring-inset ring-danger" : "",
      ].join(" ")}
      style={{
        top: top + 2,
        height: Math.max(alto - 4, ALTO_MIN),
        borderLeftColor: noLlego ? "rgb(var(--danger))" : color,
        // 10 % del color (hex de la paleta o un token): color-mix sirve para los dos.
        backgroundColor: noLlego ? undefined : `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      <span className="flex items-start gap-2">
        <span className={["min-w-0 flex-1 truncate text-14 font-semibold", noLlego || cancelada ? "text-ink-3 line-through" : "text-ink"].join(" ")}>{cita.clienteNombre}</span>
        <span className="flex flex-shrink-0 flex-wrap justify-end gap-1">
          {empalme && <span className="rounded bg-danger px-1.5 py-px text-11 font-bold text-white">Empalme</span>}
          {cita.anticipoPendiente && <span className="rounded bg-warning-soft px-1.5 py-px text-11 font-bold text-warning">{TEXTO_ANTICIPO.marcaPendiente}</span>}
          <span className={`rounded px-1.5 py-px text-11 font-bold ${insignia.clase}`}>{insignia.texto}</span>
        </span>
      </span>
      <span className="truncate text-13 tabular-nums text-ink-2">
        {horaCorta(tramo.inicia!)} – {horaCorta(tramo.termina!)} · {tramo.servicio}
      </span>
      {detalle && <span className="truncate text-13 text-ink-2">{detalle}</span>}
    </button>
  );
}
