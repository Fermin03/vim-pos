"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type DatosCaja } from "../lib/turno";
import { labelEstadoMesa, leerMesas, type MesaEstado, type MesaVista } from "../lib/mesas";

const REFRESCO_MS = 8000;

// Colores funcionales de estado (P-086): NO el naranja de marca.
const ESTILO: Record<MesaEstado, { bg: string; line: string; text: string }> = {
  LIBRE: { bg: "#EAF4EE", line: "#BFE0CC", text: "#2E7D52" },
  OCUPADA: { bg: "#FBECEA", line: "#EDC4BE", text: "#C0392B" },
  RESERVADA: { bg: "#EAF0F8", line: "#C4D5ED", text: "#2C5AA0" },
  EN_LIMPIEZA: { bg: "#FBF8E4", line: "#E8E0AE", text: "#9A8408" },
  FUERA_DE_SERVICIO: { bg: "#F2F2F0", line: "#DDDDD9", text: "#6E6E73" },
};

function fmtMxn(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

export function PantallaMesas({
  token,
  caja,
  onSalir,
  onAbrirCuenta,
  onRetomar,
}: {
  token: string;
  caja: DatosCaja;
  onSalir: () => void;
  /** T2 — abrir cuenta en una mesa LIBRE (crea ticket MESA + asigna). */
  onAbrirCuenta?: (mesaId: string) => void;
  /** T2 — retomar la cuenta (ticket activo) de una mesa OCUPADA. */
  onRetomar?: (ticketId: string) => void;
}) {
  const [mesas, setMesas] = useState<MesaVista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  const recargar = useCallback(async () => {
    try {
      const m = await leerMesas(token, caja.sucursal_id);
      if (montado.current) {
        setMesas(m);
        setError(null);
      }
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer las mesas");
    }
  }, [token, caja.sucursal_id]);

  useEffect(() => {
    montado.current = true;
    recargar();
    const id = setInterval(recargar, REFRESCO_MS);
    return () => {
      montado.current = false;
      clearInterval(id);
    };
  }, [recargar]);

  // Agrupar por sección.
  const porSeccion = new Map<string, MesaVista[]>();
  for (const m of mesas ?? []) {
    const sec = m.seccion ?? "Salón";
    porSeccion.set(sec, [...(porSeccion.get(sec) ?? []), m]);
  }

  const total = mesas?.length ?? 0;
  const libres = (mesas ?? []).filter((m) => m.estado === "LIBRE").length;
  const ocupadas = (mesas ?? []).filter((m) => m.estado === "OCUPADA").length;

  return (
    <div className="flex h-screen flex-col">
      {/* Topbar */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-line bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink">
            <span className="font-display text-[15px] font-bold text-white">V</span>
          </div>
          <div>
            <div className="font-display text-[16px] font-bold leading-tight">Mesas · {caja.nombre}</div>
            <div className="text-[11.5px] text-ink-3">
              {total} mesas · <span className="text-success">{libres} libres</span> · <span className="text-danger">{ocupadas} ocupadas</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onSalir}
          className="flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Salir
        </button>
      </header>

      {error && (
        <div className="mx-6 mt-3 rounded border border-[#EDC4BE] bg-[#FBECEA] px-3 py-2 text-[13px] font-medium text-danger" role="alert">{error}</div>
      )}

      {/* Leyenda */}
      <div className="flex flex-shrink-0 items-center gap-4 border-b border-line bg-sel px-6 py-2.5 text-[11.5px] font-semibold text-ink-2">
        {(["LIBRE", "OCUPADA", "RESERVADA", "EN_LIMPIEZA"] as MesaEstado[]).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ESTILO[e].text }} />
            {labelEstadoMesa(e)}
          </span>
        ))}
      </div>

      {/* Cuerpo */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {mesas === null && <p className="text-center text-ink-3">Cargando mesas…</p>}
        {mesas !== null && mesas.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></svg>
            <p className="text-[17px] font-semibold text-ink-2">No hay mesas configuradas</p>
            <p className="text-[13px]">El dueño las da de alta en el admin: Configuración → Mesas.</p>
          </div>
        )}
        {mesas !== null && mesas.length > 0 && (
          <div className="flex flex-col gap-7">
            {[...porSeccion.entries()].map(([seccion, lista]) => (
              <div key={seccion}>
                <div className="mb-3 text-[11.5px] font-bold uppercase tracking-[0.07em] text-ink-3">{seccion}</div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                  {lista.map((m) => {
                    const st = ESTILO[m.estado];
                    const esRedonda = m.forma === "REDONDA" || m.forma === "CIRCULAR";
                    // Solo LIBRE (abrir) u OCUPADA con ticket (retomar) son accionables; el resto
                    // (RESERVADA/EN_LIMPIEZA/FUERA_DE_SERVICIO/OCUPADA sin ticket) no debe parecer clickable.
                    const accionable = (m.estado === "OCUPADA" && !!m.ticketActivoId) || m.estado === "LIBRE";
                    return (
                      <button
                        key={m.mesaId}
                        type="button"
                        disabled={!accionable}
                        onClick={() => {
                          if (m.estado === "OCUPADA" && m.ticketActivoId) onRetomar?.(m.ticketActivoId);
                          else if (m.estado === "LIBRE") onAbrirCuenta?.(m.mesaId);
                        }}
                        className={[
                          "flex flex-col items-start gap-1 border p-3.5 text-left transition",
                          accionable ? "cursor-pointer hover:shadow-[0_4px_14px_rgba(22,22,26,.08)]" : "cursor-default",
                        ].join(" ")}
                        style={{ background: st.bg, borderColor: st.line, borderRadius: esRedonda ? "16px" : "8px" }}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="font-display text-[20px] font-extrabold tabular-nums" style={{ color: st.text }}>
                            {m.numero}
                          </span>
                          <span className="text-[11px] font-bold" style={{ color: st.text }}>{labelEstadoMesa(m.estado)}</span>
                        </div>
                        <div className="text-[11.5px] font-medium text-ink-3">
                          {m.capacidad} {m.capacidad === 1 ? "lugar" : "lugares"}
                        </div>
                        {m.estado === "OCUPADA" && (
                          <div className="mt-1 flex w-full items-center justify-between border-t pt-1.5 text-[12px] font-semibold" style={{ borderColor: st.line }}>
                            <span style={{ color: st.text }}>{m.minutosOcupada} min</span>
                            <span className="tabular-nums" style={{ color: st.text }}>{fmtMxn(m.ticketTotal)}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
