"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { buscarActualizacion, esEscritorio } from "../lib/actualizacion";

/**
 * Menú de pantalla completa del POS.
 *
 * Vivía dentro del topbar de la pantalla de venta, así que desde el inicio no había forma de
 * abrirlo: su botón "Menú" solo cambiaba de pantalla y no pasaba nada visible. Extraído aquí
 * para que ambas pantallas abran EL MISMO menú.
 */
export function MenuGeneral({
  onCerrar,
  onKds,
  onDevoluciones,
  onEnEspera,
  onAbrirCajon,
  nEnEspera,
  onCambiarCajero,
  onBloquear,
  onCambiarPin,
  onMisPropinas,
  onImpresora,
  onCerrarTurno,
}: {
  onCerrar: () => void;
  onKds: () => void;
  onDevoluciones: () => void;
  onEnEspera: () => void;
  onAbrirCajon: () => void;
  nEnEspera: number;
  onCambiarCajero: () => void;
  onBloquear: () => void;
  onCambiarPin: () => void;
  onMisPropinas: () => void;
  onImpresora: () => void;
  onCerrarTurno: () => void;
}) {
  // Actualizar solo aplica dentro de la app de escritorio; se resuelve en efecto porque el
  // export estático se prerenderiza sin window.
  const [enEscritorio, setEnEscritorio] = useState(false);
  const [buscandoUpd, setBuscandoUpd] = useState(false);
  const [avisoUpd, setAvisoUpd] = useState<string | null>(null);
  useEffect(() => { setEnEscritorio(esEscritorio()); }, []);

  const revisarActualizacion = useCallback(async () => {
    setBuscandoUpd(true);
    setAvisoUpd(null);
    const r = await buscarActualizacion();
    setBuscandoUpd(false);
    // Si hay versión nueva, Electron abre su diálogo encima: cerramos para no taparlo.
    if (r.estado === "hay") onCerrar();
    else if (r.estado === "al-dia") setAvisoUpd(`Ya tienes la última versión (v${r.version}).`);
    else if (r.estado === "descargando") setAvisoUpd("La actualización ya se está descargando.");
    else setAvisoUpd(r.error);
  }, [onCerrar]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onCerrar]);

  /** Cierra el menú y ejecuta la acción: ninguna opción debe dejar el menú encima. */
  const con = (fn: () => void) => () => { onCerrar(); fn(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Menú">
      <div className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line px-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-ink">
            <span className="font-display text-base font-bold leading-none tracking-tight text-white">V</span>
            <span className="absolute bottom-1.5 right-1.5 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
          </div>
          <span className="font-display text-[17px] font-semibold tracking-tight">Menú</span>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar menú"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-ink-2 transition hover:border-ink hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto flex max-w-4xl flex-col gap-9">
          <SeccionMenu titulo="Operación">
            <TileMenu label="Cocina" onClick={con(onKds)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>} />
            <TileMenu label="Devoluciones" onClick={con(onDevoluciones)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M9 14l-4-4 4-4M5 10h11a4 4 0 0 1 0 8h-1" /></svg>} />
            {/* Estas dos vivían en el topbar de la pantalla de venta. Al quitarlo se quedaron sin
                puerta: se podía dejar un pedido en espera pero ya no recuperarlo. */}
            <TileMenu label="Pedidos en espera" badge={nEnEspera} onClick={con(onEnEspera)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>} />
            <TileMenu label="Abrir cajón" onClick={con(onAbrirCajon)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><rect x="3" y="8" width="18" height="11" rx="1.5" /><path d="M3 12h18M10 15.5h4" /><path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" /></svg>} />
          </SeccionMenu>
          <SeccionMenu titulo="Cuenta">
            <TileMenu label="Cambiar cajero" onClick={con(onCambiarCajero)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg>} />
            <TileMenu label="Bloquear pantalla" onClick={con(onBloquear)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>} />
            <TileMenu label="Cambiar mi PIN" onClick={con(onCambiarPin)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.5 12.5 8-8" /><path d="m16 7 2 2" /><path d="m19 4 2 2" /></svg>} />
            <TileMenu label="Mis propinas" onClick={con(onMisPropinas)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.9 2.5 2-1.1 2-2.5 2a2.5 2.5 0 0 1-2.5-1.5M12 6.5v1M12 16.5v1" /></svg>} />
          </SeccionMenu>
          <SeccionMenu titulo="Ajustes">
            <TileMenu label="Configurar impresora" onClick={con(onImpresora)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>} />
            {enEscritorio && (
              <TileMenu
                label={buscandoUpd ? "Buscando…" : "Buscar actualizaciones"}
                onClick={() => { if (!buscandoUpd) revisarActualizacion(); }}
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v5h-5" /><path d="M12 8v5" /><path d="m9.5 11 2.5 2.5 2.5-2.5" /></svg>}
              />
            )}
            <TileMenu label="Cerrar turno" onClick={con(onCerrarTurno)} peligro icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} />
          </SeccionMenu>
          {avisoUpd && <p className="-mt-4 text-[13px] font-medium text-ink-2" role="status">{avisoUpd}</p>}
        </div>
      </div>
    </div>
  );
}

/** Tarjeta grande del menú: icono minimalista + etiqueta. */
function TileMenu({ icon, label, onClick, peligro, badge }: { icon: ReactNode; label: string; onClick: () => void; peligro?: boolean; badge?: number }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`relative flex min-h-[140px] flex-col items-center justify-center gap-4 rounded-2xl border p-6 transition ${peligro ? "border-danger/30 text-danger hover:border-danger hover:bg-danger/[0.06]" : "border-line-strong text-ink-2 hover:border-ink hover:bg-hover hover:text-ink"}`}
    >
      {badge != null && badge > 0 && (
        <span className="absolute right-3 top-3 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-white">{badge}</span>
      )}
      <span className="flex h-10 w-10 items-center justify-center">{icon}</span>
      <span className="text-center text-[14.5px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

function SeccionMenu({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{titulo}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}
