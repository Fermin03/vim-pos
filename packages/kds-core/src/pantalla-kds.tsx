"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type CajaKds } from "./caja";
import {
  labelModo,
  leerComandas,
  marcarListoCocina,
  minutosEnCocina,
  type ComandaKds,
} from "./comandas";
import { areaParaRpc, areasDeComandas, comandasNuevas, SIN_AREA, TODAS_LAS_AREAS, vistaDeArea } from "./estado";

const REFRESCO_MS = 5000; // re-lee comandas de BD cada 5s (polling robusto + Realtime del hub)
const UMBRAL_MEDIO = 8; // min → ámbar
const UMBRAL_VENCIDO = 15; // min → rojo (pulso)
const TODAS = TODAS_LAS_AREAS;
/** LISTO espera esto antes de mandarse, con "Deshacer" a la vista (ADR 0018). */
const DESHACER_MS = 5000;

/** Un LISTO tocado que todavía no se manda: la tarjeta se oculta y se puede deshacer. */
type Espera = { id: string; ticketId: string; area: string; folioCorto: string };

/** Reproduce un "beep" corto con la Web Audio API (sin assets). */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close();
  } catch {
    /* sin audio disponible */
  }
}

const MODO_BADGE: Record<string, string> = {
  COMER_AQUI: "bg-[#2C5AA0]",
  PARA_LLEVAR: "bg-[#2E7D52]",
  DRIVE_THRU: "bg-[#6B4FA0]",
  DELIVERY_PROPIO: "bg-[#B8651B]",
};

function colorEdad(min: number): { borde: string; pulso: boolean } {
  if (min >= UMBRAL_VENCIDO) return { borde: "#E04040", pulso: true };
  if (min >= UMBRAL_MEDIO) return { borde: "#D4A017", pulso: false };
  return { borde: "#2E7D52", pulso: false };
}

function reloj(fechaEnvio: string | null, ahora: number): string {
  if (!fechaEnvio) return "—";
  const ms = Math.max(0, ahora - new Date(fechaEnvio).getTime());
  const totalSeg = Math.floor(ms / 1000);
  const m = Math.floor(totalSeg / 60);
  const s = totalSeg % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PantallaKds({
  token,
  caja,
  onSalir,
  etiquetaSalir = "Salir",
  confirmarSalir,
}: {
  token: string;
  caja: CajaKds;
  onSalir: () => void;
  /** Texto del botón de salida. En la pantalla dedicada de cocina salir es desvincular. */
  etiquetaSalir?: string;
  /** Si salir cuesta algo (desvincular el dispositivo), se confirma antes con este texto. */
  confirmarSalir?: { titulo: string; mensaje: string; boton: string };
}) {
  const [comandas, setComandas] = useState<ComandaKds[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState<number>(() => Date.now());
  const [esperas, setEsperas] = useState<Espera[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [confirmandoSalir, setConfirmandoSalir] = useState(false);
  // Filtro multi-área, alto contraste, sonido, toasts.
  const [areaSel, setAreaSel] = useState<string>(TODAS);
  const [altoContraste, setAltoContraste] = useState(false);
  const [sonido, setSonido] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const montado = useRef(true);
  const idsPrevios = useRef<Set<string>>(new Set());
  const primeraCarga = useRef(true);

  const recargar = useCallback(async () => {
    try {
      const c = await leerComandas(token, caja.sucursal_id);
      if (!montado.current) return;
      // Detectar comandas nuevas para sonido + toast (no en la primera carga).
      const ids = c.map((x) => x.ticketId);
      if (!primeraCarga.current) {
        const nuevas = comandasNuevas(idsPrevios.current, ids);
        if (nuevas > 0) {
          if (sonido) beep();
          setToast(`${nuevas} ${nuevas === 1 ? "nuevo pedido" : "nuevos pedidos"}`);
          setTimeout(() => setToast(null), 3500);
        }
      }
      idsPrevios.current = new Set(ids);
      primeraCarga.current = false;
      setComandas(c);
      setError(null);
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer las comandas");
    }
  }, [token, caja.sucursal_id, sonido]);

  // Polling de comandas (respaldo robusto; el SSE del hub da el tiempo real)
  useEffect(() => {
    montado.current = true;
    recargar();
    const id = setInterval(recargar, REFRESCO_MS);
    return () => {
      montado.current = false;
      clearInterval(id);
    };
  }, [recargar]);

  // Tiempo real por SSE cuando el KDS corre contra la caja-hub de escritorio: al cambiar un ticket
  // de estado de cocina, recarga al instante (sin esperar el polling). Solo en el desktop
  // (window.__VIM_DESKTOP); en navegador/nube no aplica (sin endpoint).
  useEffect(() => {
    const w = typeof window !== "undefined" ? (window as unknown as { __VIM_SUPABASE_URL?: string; __VIM_DESKTOP?: boolean }) : undefined;
    if (!w?.__VIM_DESKTOP || !w.__VIM_SUPABASE_URL || typeof EventSource === "undefined") return;
    const es = new EventSource(`${w.__VIM_SUPABASE_URL}/kds/stream?sucursal=${caja.sucursal_id}`);
    es.addEventListener("cocina", () => { recargar(); });
    es.onerror = () => { /* EventSource reconecta solo; el polling cubre el hueco */ };
    return () => es.close();
  }, [recargar, caja.sucursal_id]);

  // Tick del reloj (1s) para los cronómetros, sin re-leer BD
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // El timer de un LISTO se crea en un render y dispara 5 s después: tiene que llamar al
  // `recargar` vigente, no al de aquel render (cambia con el sonido o la sucursal).
  const recargarRef = useRef(recargar);
  recargarRef.current = recargar;

  // Al desmontar se sueltan los LISTO pendientes SIN mandarlos: la orden reaparece al volver. Es
  // la falla segura — mandar un cierre que nadie alcanzó a deshacer sería la peligrosa.
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const id of t.values()) clearTimeout(id);
      t.clear();
    };
  }, []);

  function quitarEspera(id: string) {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setEsperas((es) => es.filter((e) => e.id !== id));
  }

  async function mandarListo(e: Espera) {
    timers.current.delete(e.id);
    try {
      const todas = e.area === TODAS;
      await marcarListoCocina(token, e.ticketId, todas ? null : areaParaRpc(e.area), todas);
      await recargarRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo marcar la comanda");
      await recargarRef.current();
    } finally {
      // Se quita DESPUÉS de recargar: antes, la tarjeta volvía un instante con los datos viejos.
      setEsperas((es) => es.filter((x) => x.id !== e.id));
    }
  }

  /** LISTO: oculta la tarjeta en esta vista y la manda en 5 s, salvo que se deshaga. */
  function listo(c: ComandaKds) {
    const e: Espera = { id: `${c.ticketId}:${areaSel}:${Date.now()}`, ticketId: c.ticketId, area: areaSel, folioCorto: c.folioCorto };
    setEsperas((es) => [...es, e]);
    timers.current.set(e.id, setTimeout(() => { void mandarListo(e); }, DESHACER_MS));
  }

  /** ¿Esta orden tiene un LISTO en espera que la saca de la vista actual? */
  function ocultaPorEspera(ticketId: string): boolean {
    return esperas.some((e) => e.ticketId === ticketId && (e.area === areaSel || e.area === TODAS));
  }

  // Paleta: alto contraste sube el contraste del fondo/texto para cocinas con luz fuerte.
  const tema = altoContraste
    ? { bg: "#000000", surface: "#15151A", line: "#444", text: "#FFFFFF", text2: "#D0D0D6", text3: "#9090A0" }
    : { bg: "#1A1A1E", surface: "#242429", line: "#333338", text: "#F0F0EC", text2: "#A0A0A6", text3: "#6E6E74" };

  // Áreas con algo pendiente + la vista del filtro (ADR 0018). El área elegida se queda en la
  // barra aunque ya no tenga pendientes: antes la barra desaparecía con el filtro puesto y no
  // había cómo volver a "Todas".
  const areas = comandas ? areasDeComandas(comandas) : [];
  const areasBarra = areaSel !== TODAS && !areas.includes(areaSel) ? [...areas, areaSel] : areas;
  const hayAreas = areas.length > 1 || areaSel !== TODAS;
  const comandasFiltradas = vistaDeArea(comandas ?? [], areaSel).filter((c) => !ocultaPorEspera(c.ticketId));

  const pendientes = comandasFiltradas.length;

  return (
    <div className="flex h-screen flex-col" style={{ background: tema.bg, color: tema.text }}>
      {/* Topbar */}
      <header className="flex flex-shrink-0 items-center justify-between border-b px-6 py-3.5" style={{ borderColor: tema.line }}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
            <span className="font-display text-[15px] font-bold text-[#16161A]">V</span>
          </div>
          <div>
            <div className="font-display text-[16px] font-bold leading-tight">Cocina · {caja.nombre}</div>
            <div className="text-[11.5px]" style={{ color: tema.text2 }}>{pendientes} {pendientes === 1 ? "comanda activa" : "comandas activas"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Sonido */}
          <button
            type="button"
            onClick={() => setSonido((s) => !s)}
            title={sonido ? "Silenciar" : "Activar sonido"}
            className="flex h-9 w-9 items-center justify-center rounded border text-[#C8C8CC] transition hover:text-white"
            style={{ borderColor: tema.line }}
          >
            {sonido ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M23 9l-6 6M17 9l6 6" /></svg>
            )}
          </button>
          {/* Alto contraste */}
          <button
            type="button"
            onClick={() => setAltoContraste((v) => !v)}
            title="Alto contraste"
            className="flex h-9 items-center gap-1.5 rounded border px-3 text-[13px] font-semibold text-[#C8C8CC] transition hover:text-white"
            style={{ borderColor: tema.line, background: altoContraste ? "#FFFFFF" : "transparent", color: altoContraste ? "#000" : undefined }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="9" /><path d="M12 3v18" fill="currentColor" /></svg>
            Contraste
          </button>
          <button
            type="button"
            onClick={() => (confirmarSalir ? setConfirmandoSalir(true) : onSalir())}
            className="flex h-9 items-center gap-1.5 rounded border px-3 text-[13px] font-semibold text-[#C8C8CC] transition hover:text-white"
            style={{ borderColor: tema.line }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            {etiquetaSalir}
          </button>
        </div>
      </header>

      {/* Filtro multi-área (solo si hay >1 área) */}
      {hayAreas && (
        <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto border-b px-6 py-2.5" style={{ borderColor: tema.line }}>
          {[TODAS, ...areasBarra].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAreaSel(a)}
              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition"
              style={
                areaSel === a
                  ? { background: "#fff", color: "#000" }
                  : { background: tema.surface, color: tema.text2 }
              }
            >
              {a === TODAS ? "Todas" : a}
            </button>
          ))}
        </div>
      )}

      {/* Toast de nuevo pedido */}
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-[#2E7D52] px-5 py-2.5 text-[14px] font-bold text-white shadow-xl">
          🔔 {toast}
        </div>
      )}

      {error && (
        <div className="mx-6 mt-3 rounded border border-[#5A2E2E] bg-[#2A1A1A] px-3 py-2 text-[13px] font-medium text-[#FF8080]" role="alert">{error}</div>
      )}

      {/* Cuerpo */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {comandas === null && <p className="p-8 text-center" style={{ color: tema.text2 }}>Cargando comandas…</p>}
        {comandas !== null && comandasFiltradas.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke={tema.text3} strokeWidth="1.5" className="h-12 w-12"><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
            <p className="text-[17px] font-semibold" style={{ color: tema.text2 }}>Sin pedidos pendientes</p>
            <p className="text-[13px]" style={{ color: tema.text3 }}>Los nuevos pedidos aparecerán aquí automáticamente.</p>
          </div>
        )}
        {comandas !== null && comandasFiltradas.length > 0 && (
          /* items-start: cada tarjeta mide lo que mide su contenido (1 ítem = chica, 10 = alta) */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-3">
            {comandasFiltradas.map((c) => {
              const min = minutosEnCocina(c.fechaEnvio, ahora);
              const { borde, pulso } = colorEdad(min);
              return (
                <div
                  key={c.ticketId}
                  className="flex max-h-[85vh] flex-col overflow-hidden rounded-lg"
                  style={{
                    background: tema.surface,
                    borderLeft: `5px solid ${borde}`,
                    animation: pulso ? "kdsPulse 1.1s ease-in-out infinite" : undefined,
                  }}
                >
                  {/* Header de tarjeta */}
                  <div className="flex items-center justify-between px-4 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[24px] font-extrabold tabular-nums">#{c.folioCorto}</span>
                      <span className={`rounded px-2.5 py-1 text-[13px] font-bold text-white ${MODO_BADGE[c.modoServicio] ?? "bg-[#9A6B12]"}`}>
                        {labelModo(c.modoServicio)}
                      </span>
                    </div>
                    <span className="font-display text-[20px] font-bold tabular-nums" style={{ color: borde }}>
                      {reloj(c.fechaEnvio, ahora)}
                    </span>
                  </div>

                  {/* Nota de TODA la orden — banda destacada */}
                  {c.notaOrden && (
                    <div className="mx-4 mt-2 rounded border-l-4 border-[#E0B33A] bg-[#332A12] px-3 py-2 text-[17px] font-bold leading-snug text-[#F2CB5C]">
                      {c.notaOrden}
                    </div>
                  )}

                  {/* Ítems — tipografía para leer a ~80 cm */}
                  <div className="min-h-0 overflow-y-auto px-4 py-2.5">
                    {c.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex gap-3 border-b border-[#2C2C32] py-2.5 last:border-b-0"
                        // En "Todas", lo que otra estación ya terminó se queda a la vista, apagado.
                        style={it.listo ? { opacity: 0.4 } : undefined}
                      >
                        <span className="font-display min-w-[44px] text-[30px] font-extrabold leading-none text-[#F0F0EC]">{it.cantidad}</span>
                        <div className="min-w-0 flex-1">
                          <div className={`text-[22px] font-bold leading-snug ${it.listo ? "line-through" : ""}`}>{it.nombre}</div>
                          {it.listo && (
                            <div className="mt-0.5 text-[15px] font-bold leading-snug text-[#8FD4A8]">✓ Listo · {it.area ?? SIN_AREA}</div>
                          )}
                          {it.comboEtiqueta && (
                            <div className="mt-0.5 text-[15px] font-bold leading-snug text-[#B8B8C0]">↳ {it.comboEtiqueta}</div>
                          )}
                          {it.modificadores.length > 0 && (
                            <div className="mt-1 text-[16px] font-medium leading-snug text-[#B8B8C0]">{it.modificadores.join(" · ")}</div>
                          )}
                          {it.notaCocina && (
                            <div className="mt-1 text-[16px] font-semibold italic text-[#E0B33A]">“{it.notaCocina}”</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* La orden sigue viva en otras estaciones: que la plancha lo sepa aunque la
                      tarjeta salga de su pantalla al marcar LISTO. */}
                  {c.otrasPendientes.length > 0 && (
                    <div className="px-4 pb-1 text-[15px] font-semibold" style={{ color: tema.text2 }}>
                      Falta en {c.otrasPendientes.join(", ")}
                    </div>
                  )}

                  {/* LISTO marca lo de esta vista (un área, o todo); se manda en 5 s si no se deshace. */}
                  <div className="p-2.5">
                    <button
                      type="button"
                      onClick={() => listo(c)}
                      className="font-display flex h-14 w-full items-center justify-center gap-2 rounded bg-[#2E7D52] text-[20px] font-extrabold tracking-wide text-white transition-[transform,background-color] duration-150 hover:bg-[#267045] active:scale-[0.97]"
                    >
                      LISTO
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* LISTO en espera: "Deshacer" grande, a la mano durante 5 s. La barra de abajo se vacía en
          ese tiempo para que se vea cuánto queda. */}
      {esperas.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-50 flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2" role="status">
          {esperas.slice(-3).map((e) => (
            <div key={e.id} className="relative overflow-hidden rounded-lg bg-[#F0F0EC] text-[#16161A] shadow-2xl">
              <div className="flex items-center gap-3 py-2 pl-5 pr-2">
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[20px] font-extrabold tabular-nums">#{e.folioCorto} lista</div>
                  {e.area !== TODAS && <div className="text-[15px] font-semibold text-[#4A4A50]">{e.area}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => quitarEspera(e.id)}
                  className="font-display h-14 rounded border-2 border-[#16161A] px-6 text-[18px] font-extrabold transition-transform duration-150 active:scale-[0.97]"
                >
                  Deshacer
                </button>
              </div>
              <div
                className="kds-cuenta absolute bottom-0 left-0 h-1 w-full origin-left bg-[#2E7D52]"
                style={{ animation: `kdsCuenta ${DESHACER_MS}ms linear forwards` }}
              />
            </div>
          ))}
        </div>
      )}

      {confirmandoSalir && confirmarSalir && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="kds-salir-titulo">
          <div className="w-full max-w-[440px] rounded-lg p-6" style={{ background: tema.surface }}>
            <h2 id="kds-salir-titulo" className="font-display text-[22px] font-bold">{confirmarSalir.titulo}</h2>
            <p className="mt-2 text-[16px] leading-snug" style={{ color: tema.text2 }}>{confirmarSalir.mensaje}</p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmandoSalir(false)}
                className="font-display h-14 flex-1 rounded border text-[17px] font-bold"
                style={{ borderColor: tema.line, color: tema.text }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { setConfirmandoSalir(false); onSalir(); }}
                className="font-display h-14 flex-1 rounded bg-[#C0392B] text-[17px] font-bold text-white"
              >
                {confirmarSalir.boton}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes kdsPulse { 0%,100%{border-left-color:#E04040} 50%{border-left-color:#FF6B6B} }
@keyframes kdsCuenta { from { transform: scaleX(1) } to { transform: scaleX(0) } }
@media (prefers-reduced-motion: reduce) { .kds-cuenta { animation: none !important } }`}</style>
    </div>
  );
}
