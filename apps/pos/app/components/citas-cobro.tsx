"use client";
import { useEffect, useMemo, useState } from "react";
import { hoyMx } from "@vim/fecha";
import { Icono, Modal } from "@vim/ui/styles";
import { horaCorta } from "@vim/db/agenda";
import { citasEnEspera, citasParaCobrar, diaCita, gruposCitasCobro, nombreCorto, totalCita, type CitaDia } from "../lib/agenda";
import { fmtMxn } from "../lib/turno";
import { iniciales } from "./selector-empleados";

const plano = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** «Balayage · Adriana C. · Silla 1». */
const resumen = (c: CitaDia) => {
  const servicios = c.tramos.map((t) => t.servicio).join(", ");
  const quienes = [...new Set(c.tramos.map((t) => t.colaborador).filter((x): x is string => !!x))].map(nombreCorto).join(", ");
  const espacio = c.tramos.find((t) => t.espacio)?.espacio;
  return [servicios, quienes, espacio].filter(Boolean).join(" · ");
};

/**
 * Pestaña «Citas de hoy» del cobro de belleza (boceto 2): Termina pronto (se tocan para cobrar),
 * En espera (se atienden, no se cobran: aún no tienen tramos) y Cobradas hoy (solo se ven).
 */
export function CitasCobro({ token, sucursalId, version, activa, ventaActual, bloqueado, errorExterno, onReintentar, onCobrar, onRetomar, onAtender }: {
  token: string;
  sucursalId: string;
  /** Sube al cambiar la agenda o al cobrar: la lista se relee. */
  version: number;
  /** La cita que está en la venta. */
  activa: string | null;
  /** El ticket guardado que está en la venta (una cita ligada a él no está «en otra venta»). */
  ventaActual: string | null;
  /** Cobro abierto o venta guardada: no se cambia de cita. */
  bloqueado: boolean;
  /** No se leyeron los servicios o los colaboradores: no se cobra una cita hasta reintentar. */
  errorExterno: string | null;
  onReintentar: () => void;
  onCobrar: (c: CitaDia) => void;
  /** La cita ya está en otra venta abierta: se retoma esa venta en lugar de abrir otra. */
  onRetomar: (venta: NonNullable<CitaDia["ventaAbierta"]>) => void;
  onAtender: () => void;
}) {
  const [datos, setDatos] = useState<{ citas: CitaDia[]; espera: CitaDia[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([citasParaCobrar(token, sucursalId, hoyMx()), citasEnEspera(token, sucursalId)])
      .then(([citas, espera]) => { if (vivo) { setDatos({ citas, espera }); setError(null); } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : "No se pudieron leer las citas"); });
    return () => { vivo = false; };
  }, [token, sucursalId, version]);

  const grupos = useMemo(() => {
    if (!datos) return null;
    const q = plano(texto.trim());
    const pasa = (c: CitaDia) => !q || plano(c.clienteNombre).includes(q) || c.tramos.some((t) => plano(t.servicio).includes(q));
    const g = gruposCitasCobro(datos.citas, datos.espera, hoyMx());
    return { terminaPronto: g.terminaPronto.filter(pasa), enEspera: g.enEspera.filter(pasa), cobradas: g.cobradas.filter(pasa) };
  }, [datos, texto]);

  const titulo = (t: string) => (
    <h3 className="sticky top-0 z-[1] border-y border-line bg-hover px-4 py-2 text-12 font-semibold uppercase tracking-[0.04em] text-ink-2">{t}</h3>
  );
  const avatar = (c: CitaDia, marcada = false) => (
    <span aria-hidden className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-14 font-semibold ${marcada ? "bg-accent text-white" : "bg-ink/10 text-ink"}`}>
      {marcada ? <Icono nombre="palomita" className="h-5 w-5" /> : iniciales(c.clienteNombre)}
    </span>
  );
  const ahora = Date.now();
  const nada = grupos && grupos.terminaPronto.length + grupos.enEspera.length + grupos.cobradas.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-shrink-0 border-b border-line bg-surface px-4 py-3">
        <label className="flex h-12 items-center rounded-lg border border-line-strong bg-surface focus-within:border-ink">
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar clienta o servicio"
            aria-label="Buscar clienta o servicio"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent px-4 text-16 text-ink outline-none placeholder:text-ink-3"
          />
          {texto && (
            <button type="button" onClick={() => setTexto("")} aria-label="Limpiar búsqueda"
              className="mr-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97]">
              <Icono nombre="cerrar" className="h-5 w-5" />
            </button>
          )}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && <p className="px-4 pt-4 text-14 font-medium text-danger" role="alert">{error}</p>}
        {errorExterno && (
          <div className="flex items-center gap-3 bg-danger-soft px-4 py-2" role="alert">
            <p className="min-w-0 flex-1 text-14 font-medium text-danger">{errorExterno}</p>
            <button type="button" onClick={onReintentar}
              className="h-11 flex-shrink-0 rounded-lg border border-danger-line bg-surface px-4 text-14 font-semibold text-danger transition-[transform,background-color] duration-150 ease-vim hover:bg-danger/10 active:scale-[.97]">
              Reintentar
            </button>
          </div>
        )}
        {!grupos ? (
          !error && <p className="p-4 text-14 text-ink-3">Cargando citas…</p>
        ) : nada ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="font-display text-18 font-semibold">{texto.trim() ? "Nada coincide con la búsqueda" : "Sin citas por cobrar"}</p>
            <p className="max-w-md text-14 text-ink-3">{texto.trim() ? "Revisa el nombre o el servicio." : "Cuando una cita esté en curso o termine, aparece aquí para cobrarla."}</p>
          </div>
        ) : (
          <>
            {grupos.terminaPronto.length > 0 && titulo("Termina pronto")}
            <ul>
              {grupos.terminaPronto.map((c) => {
                const enEstaVenta = ventaActual != null && c.ventaAbierta?.id === ventaActual;
                const enOtra = c.ventaAbierta && !enEstaVenta ? c.ventaAbierta : null;
                const marcada = c.id === activa || enEstaVenta;
                const dia = diaCita(c.inicia, hoyMx());
                return (
                  <li key={c.id} className="border-b border-line">
                    <button
                      type="button"
                      disabled={(bloqueado || (!enOtra && errorExterno != null)) && !marcada}
                      aria-current={marcada ? "true" : undefined}
                      onClick={() => (marcada ? undefined : enOtra ? onRetomar(enOtra) : onCobrar(c))}
                      className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-[background-color] duration-150 ease-vim disabled:opacity-60 ${marcada ? "bg-accent-soft" : "hover:bg-hover"}`}
                    >
                      {avatar(c, marcada)}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-16 font-semibold">{c.clienteNombre}</span>
                        <span className="block truncate text-13 text-ink-2">{[dia, resumen(c)].filter(Boolean).join(" · ")}</span>
                        {enOtra && <span className="block text-13 font-semibold text-warning">En otra venta abierta · tócala para retomarla</span>}
                      </span>
                      <span className="font-display whitespace-nowrap text-16 font-semibold tabular-nums">{fmtMxn(totalCita(c))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {grupos.enEspera.length > 0 && titulo("En espera (sin cita)")}
            <ul>
              {grupos.enEspera.map((c) => {
                const llego = c.llegoAt ?? c.inicia;
                return (
                  <li key={c.id} className="flex min-h-16 items-center gap-3 border-b border-line px-4 py-3">
                    {avatar(c)}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-16 font-semibold">{c.clienteNombre}</span>
                      <span className="block truncate text-13 text-ink-2">
                        {[c.tramos.map((t) => t.servicio).join(", ") || null, llego ? `llegó ${horaCorta(llego)}` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {llego && <span className="whitespace-nowrap text-14 tabular-nums text-ink-2">{Math.max(0, Math.round((ahora - llego.getTime()) / 60_000))} min</span>}
                    <button type="button" onClick={onAtender}
                      className="h-11 flex-shrink-0 rounded-lg border border-line-strong bg-surface px-4 text-14 font-semibold transition-[transform,background-color,border-color] duration-150 ease-vim hover:border-ink active:scale-[.97]">
                      Atender
                    </button>
                  </li>
                );
              })}
            </ul>

            {grupos.cobradas.length > 0 && titulo("Cobradas hoy")}
            <ul>
              {grupos.cobradas.map((c) => (
                <li key={c.id} className="flex min-h-16 items-center gap-3 border-b border-line px-4 py-3 text-ink-3">
                  {avatar(c)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-16 font-semibold">{c.clienteNombre}</span>
                    <span className="block truncate text-13">{resumen(c)}</span>
                  </span>
                  <span className="font-display whitespace-nowrap text-16 font-semibold tabular-nums">{fmtMxn(totalCita(c))}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** Quién hizo un renglón. Un servicio exige a alguien; un producto puede quedar sin colaborador. */
export function ElegirColaborador({ servicio, colaboradores, actual, permiteNadie, onElegir, onCerrar }: {
  servicio: string;
  colaboradores: { usuarioId: string; nombre: string; color: string }[];
  actual: string | null;
  permiteNadie: boolean;
  onElegir: (usuarioId: string | null) => void;
  onCerrar: () => void;
}) {
  const opcion = (sel: boolean) =>
    `flex h-12 w-full items-center gap-3 rounded-lg border px-4 text-left text-15 font-semibold transition-[transform,background-color,border-color] duration-150 ease-vim active:scale-[.97] ${sel ? "border-ink bg-sel" : "border-line-strong bg-surface hover:border-ink"}`;
  return (
    <Modal open onClose={onCerrar} title={`¿Quién hizo ${servicio}?`} hideTitle
      className="flex max-h-[80vh] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_24px_60px_rgba(22,22,26,.18)]">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line px-4 py-2">
        <h2 className="min-w-0 flex-1 truncate font-display text-18 font-semibold tracking-tight">¿Quién hizo {servicio}?</h2>
        <button type="button" onClick={onCerrar} aria-label="Cerrar"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 transition-transform duration-150 ease-vim hover:bg-hover hover:text-ink active:scale-[.97]">
          <Icono nombre="cerrar" className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-4">
        {colaboradores.length === 0 && <p className="text-14 text-ink-3">No hay colaboradores activos en esta sucursal.</p>}
        {colaboradores.map((c) => (
          <button key={c.usuarioId} type="button" className={opcion(c.usuarioId === actual)} aria-pressed={c.usuarioId === actual} onClick={() => onElegir(c.usuarioId)}>
            <span aria-hidden className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
            {c.nombre}
          </button>
        ))}
        {permiteNadie && (
          <button type="button" className={opcion(actual === null)} aria-pressed={actual === null} onClick={() => onElegir(null)}>
            Sin colaborador
          </button>
        )}
      </div>
    </Modal>
  );
}
