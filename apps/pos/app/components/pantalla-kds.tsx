"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type DatosCaja } from "../lib/turno";
import {
  avanzarCocina,
  labelModo,
  leerComandas,
  minutosEnCocina,
  siguienteEstado,
  type ComandaKds,
} from "../lib/kds";

const REFRESCO_MS = 5000; // re-lee comandas de BD cada 5s (polling robusto + Realtime futuro)
const UMBRAL_MEDIO = 8; // min → ámbar
const UMBRAL_VENCIDO = 15; // min → rojo (pulso)

const MODO_BADGE: Record<string, string> = {
  COMER_AQUI: "bg-[#2C5AA0]",
  PARA_LLEVAR: "bg-[#2E7D52]",
  DRIVE_THRU: "bg-[#6B4FA0]",
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
  const montado = useRef(true);

  const recargar = useCallback(async () => {
    try {
      const c = await leerComandas(token, caja.sucursal_id);
      if (montado.current) {
        setComandas(c);
        setError(null);
      }
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer las comandas");
    }
  }, [token, caja.sucursal_id]);

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
    const destino = siguienteEstado(c.estadoCocina);
    if (!destino) return;
    setProcesando((p) => new Set(p).add(c.ticketId));
    try {
      await avanzarCocina(token, c.ticketId, destino);
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

  const pendientes = comandas?.length ?? 0;

  return (
    <div className="flex h-screen flex-col bg-[#1A1A1E] text-[#F0F0EC]">
      {/* Topbar */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-[#333338] px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
            <span className="font-display text-[15px] font-bold text-[#16161A]">V</span>
          </div>
          <div>
            <div className="font-display text-[16px] font-bold leading-tight">Cocina · {caja.nombre}</div>
            <div className="text-[11.5px] text-[#A0A0A6]">{pendientes} {pendientes === 1 ? "comanda activa" : "comandas activas"}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onSalir}
          className="flex h-9 items-center gap-1.5 rounded border border-[#3A3A42] px-3 text-[13px] font-semibold text-[#C8C8CC] transition hover:border-white hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Salir
        </button>
      </header>

      {error && (
        <div className="mx-6 mt-3 rounded border border-[#5A2E2E] bg-[#2A1A1A] px-3 py-2 text-[13px] font-medium text-[#FF8080]" role="alert">{error}</div>
      )}

      {/* Cuerpo */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {comandas === null && <p className="p-8 text-center text-[#A0A0A6]">Cargando comandas…</p>}
        {comandas !== null && comandas.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#6E6E74" strokeWidth="1.5" className="h-12 w-12"><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
            <p className="text-[17px] font-semibold text-[#A0A0A6]">Sin pedidos pendientes</p>
            <p className="text-[13px] text-[#6E6E74]">Los nuevos pedidos aparecerán aquí automáticamente.</p>
          </div>
        )}
        {comandas !== null && comandas.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {comandas.map((c) => {
              const min = minutosEnCocina(c.fechaEnvio, ahora);
              const { borde, pulso } = colorEdad(min);
              const enProceso = procesando.has(c.ticketId);
              const esListo = c.estadoCocina === "LISTO";
              return (
                <div
                  key={c.ticketId}
                  className="flex max-h-[440px] flex-col overflow-hidden rounded-lg bg-[#242429]"
                  style={{
                    borderLeft: `5px solid ${borde}`,
                    animation: pulso ? "kdsPulse 1.1s ease-in-out infinite" : undefined,
                  }}
                >
                  {/* Header de tarjeta */}
                  <div className="flex items-center justify-between px-3.5 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[20px] font-extrabold tabular-nums">#{c.folioCorto}</span>
                      <span className={`rounded px-2 py-0.5 text-[11px] font-bold text-white ${MODO_BADGE[c.modoServicio] ?? "bg-[#9A6B12]"}`}>
                        {labelModo(c.modoServicio)}
                      </span>
                      {esListo && (
                        <span className="rounded bg-[#2E7D52] px-2 py-0.5 text-[11px] font-bold text-white">LISTO</span>
                      )}
                    </div>
                    <span className="font-display text-[15px] font-bold tabular-nums" style={{ color: borde }}>
                      {reloj(c.fechaEnvio, ahora)}
                    </span>
                  </div>

                  {/* Ítems */}
                  <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5">
                    {c.items.map((it) => (
                      <div key={it.id} className="flex gap-2.5 border-b border-[#2C2C32] py-2 last:border-b-0">
                        <span className="font-display min-w-[32px] text-[22px] font-extrabold leading-none text-[#F0F0EC]">{it.cantidad}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[15px] font-semibold leading-tight">{it.nombre}</div>
                          {it.modificadores.length > 0 && (
                            <div className="mt-0.5 text-[12.5px] leading-tight text-[#A0A0A6]">{it.modificadores.join(" · ")}</div>
                          )}
                          {it.notaCocina && (
                            <div className="mt-0.5 text-[12.5px] font-medium italic text-[#D4A017]">“{it.notaCocina}”</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Botón avanzar */}
                  <div className="p-2.5">
                    <button
                      type="button"
                      disabled={enProceso}
                      onClick={() => avanzar(c)}
                      className={[
                        "font-display flex h-12 w-full items-center justify-center gap-2 rounded text-[17px] font-extrabold tracking-wide text-white transition active:scale-[0.97] disabled:opacity-60",
                        esListo ? "bg-[#2C5AA0] hover:bg-[#244e8c]" : "bg-[#2E7D52] hover:bg-[#267045]",
                      ].join(" ")}
                    >
                      {enProceso ? "…" : esListo ? "ENTREGAR" : "LISTO"}
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
