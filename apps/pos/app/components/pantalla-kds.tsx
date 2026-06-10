"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type DatosCaja } from "../lib/turno";
import {
  cerrarComanda,
  labelModo,
  leerComandas,
  minutosEnCocina,
  type ComandaKds,
} from "../lib/kds";
import { areasDeComandas, comandasNuevas, SIN_AREA } from "../lib/kds-estado";

const REFRESCO_MS = 5000; // re-lee comandas de BD cada 5s (polling robusto + Realtime futuro)
const UMBRAL_MEDIO = 8; // min → ámbar
const UMBRAL_VENCIDO = 15; // min → rojo (pulso)
const TODAS = "__todas__";

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
}: {
  token: string;
  caja: DatosCaja;
  onSalir: () => void;
}) {
  const [comandas, setComandas] = useState<ComandaKds[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState<number>(() => Date.now());
  const [procesando, setProcesando] = useState<Set<string>>(new Set());
  // F15 — filtro multi-área, alto contraste, sonido, toasts.
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

  // Polling de comandas
  useEffect(() => {
    montado.current = true;
    recargar();
    const id = setInterval(recargar, REFRESCO_MS);
    return () => {
      montado.current = false;
      clearInterval(id);
    };
  }, [recargar]);

  // Tick del reloj (1s) para los cronómetros, sin re-leer BD
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function avanzar(c: ComandaKds) {
    setProcesando((p) => new Set(p).add(c.ticketId));
    try {
      // Un toque: LISTO cierra la comanda (queda ENTREGADO y sale del panel).
      await cerrarComanda(token, c.ticketId, c.estadoCocina);
      // Optimista: quita/actualiza local y re-sincroniza.
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar la comanda");
    } finally {
      setProcesando((p) => {
        const n = new Set(p);
        n.delete(c.ticketId);
        return n;
      });
    }
  }

  // Paleta: alto contraste (P-111) sube el contraste del fondo/texto para cocinas con luz fuerte.
  const tema = altoContraste
    ? { bg: "#000000", surface: "#15151A", line: "#444", text: "#FFFFFF", text2: "#D0D0D6", text3: "#9090A0" }
    : { bg: "#1A1A1E", surface: "#242429", line: "#333338", text: "#F0F0EC", text2: "#A0A0A6", text3: "#6E6E74" };

  // Áreas presentes + filtrado.
  const areas = comandas ? areasDeComandas(comandas) : [];
  const hayAreas = areas.length > 1; // solo mostramos el filtro si hay más de un área real
  const comandasFiltradas = (comandas ?? [])
    .map((c) =>
      areaSel === TODAS
        ? c
        : { ...c, items: c.items.filter((it) => (it.area ?? SIN_AREA) === areaSel) },
    )
    .filter((c) => c.items.length > 0);

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
            onClick={onSalir}
            className="flex h-9 items-center gap-1.5 rounded border px-3 text-[13px] font-semibold text-[#C8C8CC] transition hover:text-white"
            style={{ borderColor: tema.line }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Salir
          </button>
        </div>
      </header>

      {/* Filtro multi-área (solo si hay >1 área) */}
      {hayAreas && (
        <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto border-b px-6 py-2.5" style={{ borderColor: tema.line }}>
          {[TODAS, ...areas].map((a) => (
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
              const enProceso = procesando.has(c.ticketId);
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
                      <div key={it.id} className="flex gap-3 border-b border-[#2C2C32] py-2.5 last:border-b-0">
                        <span className="font-display min-w-[44px] text-[30px] font-extrabold leading-none text-[#F0F0EC]">{it.cantidad}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[22px] font-bold leading-snug">{it.nombre}</div>
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

                  {/* Un toque: LISTO cierra la comanda (queda ENTREGADO y sale del panel) */}
                  <div className="p-2.5">
                    <button
                      type="button"
                      disabled={enProceso}
                      onClick={() => avanzar(c)}
                      className="font-display flex h-14 w-full items-center justify-center gap-2 rounded bg-[#2E7D52] text-[20px] font-extrabold tracking-wide text-white transition hover:bg-[#267045] active:scale-[0.97] disabled:opacity-60"
                    >
                      {enProceso ? "…" : "LISTO"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes kdsPulse { 0%,100%{border-left-color:#E04040} 50%{border-left-color:#FF6B6B} }`}</style>
    </div>
  );
}
