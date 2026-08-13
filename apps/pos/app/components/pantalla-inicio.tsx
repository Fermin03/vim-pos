"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useReloj } from "./topbar-pos";
import { fmtMxn, type DatosCaja, type Turno } from "../lib/turno";
import { leerReporteX } from "../lib/cierre";
import type { Empleado } from "../lib/supabase";

/**
 * Pantalla de inicio del POS: el cajero elige PRIMERO a qué viene.
 *
 * Sustituye al arranque anterior, que caía directo al catálogo con el modo de servicio
 * escondido dentro del carrito. Las cuatro operaciones de venta quedan a un toque, y lo
 * operativo (monitor, cuentas, retiros, cierre) deja de vivir enterrado en el menú.
 *
 * Comportamiento por modo (decidido con Fermín):
 *   - Comedor / Pick-up / Domicilio → abren la LISTA DE CUENTAS de ese modo; la venta nueva
 *     se crea desde ahí (en esos modos casi siempre se retoma una cuenta viva, no se empieza).
 *   - Para llevar → entra DIRECTO a tomar el pedido: es venta de mostrador, no hay nada que retomar.
 */
export function PantallaInicio({
  caja,
  turno,
  empleado,
  nCuentasComedor,
  nCuentasPickup,
  nCuentasDomicilio,
  nEnEspera,
  token,
  onComedor,
  onParaLlevar,
  onPickup,
  onDomicilio,
  onMonitorVentas,
  onConsultarCuentas,
  onMovimientoCaja,
  onAbrirTurno,
  onCerrarTurno,
  onMenu,
}: {
  caja: DatosCaja;
  /** null = la caja no tiene turno abierto: no se puede vender hasta abrirlo. */
  turno: Turno | null;
  empleado: Empleado;
  nCuentasComedor: number;
  nCuentasPickup: number;
  nCuentasDomicilio: number;
  nEnEspera: number;
  token: string;
  onComedor: () => void;
  onParaLlevar: () => void;
  onPickup: () => void;
  onDomicilio: () => void;
  onMonitorVentas: () => void;
  onConsultarCuentas: () => void;
  onMovimientoCaja: () => void;
  onAbrirTurno: () => void;
  onCerrarTurno: () => void;
  onMenu: () => void;
}) {
  const ahora = useReloj();
  // Venta del turno en el propio inicio: el dato que el cajero mira más veces al día.
  const [ventaTurno, setVentaTurno] = useState<number | null>(null);

  // Sin turno abierto no hay dónde colgar un ticket (tickets.turno_id es obligatorio), así que
  // vender queda bloqueado hasta abrirlo. El inicio se muestra igual —el cajero ve dónde está
  // parado— pero con las acciones de venta apagadas y "Abrir turno" como la acción evidente.
  const sinTurno = turno === null;

  useEffect(() => {
    if (!turno) { setVentaTurno(null); return; }
    let vivo = true;
    const cargar = () => {
      leerReporteX(token, turno.id)
        .then((x) => { if (vivo) setVentaTurno(x.ventaNeta); })
        .catch(() => { /* el monitor da el detalle y el error; aquí es solo un vistazo */ });
    };
    cargar();
    const id = setInterval(cargar, 30000);
    return () => { vivo = false; clearInterval(id); };
  }, [token, turno]);

  return (
    <main className="flex h-screen flex-col bg-bg">
      {/* Barra: quién opera, dónde y desde cuándo */}
      <header className="flex h-[clamp(3rem,7.5vh,4.25rem)] flex-shrink-0 items-center justify-between gap-3 border-b border-line px-[clamp(0.75rem,2vw,1.5rem)]">
        <div className="flex items-center gap-4">
          <div className="relative flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-ink">
            <span className="font-display text-base font-bold leading-none tracking-tight text-white">V</span>
            <span className="absolute bottom-1.5 right-1.5 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
          </div>
          <div className="h-[26px] w-px bg-line-strong" />
          <div>
            <div className="font-display text-[15px] font-semibold tracking-tight">{caja.sucursalNombre}</div>
            <div className="mt-px text-xs text-ink-3">
              {caja.nombre} ·{" "}
              {turno ? (
                <span className="text-success">Turno {turno.codigo_turno}</span>
              ) : (
                <span className="font-semibold text-warning">Sin turno abierto</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="font-display text-[15px] font-semibold tabular-nums text-ink-2">
            {ahora ? ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
          </div>
          <div className="h-[26px] w-px bg-line-strong" />
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-hover font-display text-[13px] font-semibold text-ink-2">
              {empleado.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
            </span>
            <div>
              <div className="text-[13px] font-semibold leading-tight">{empleado.nombre}</div>
              <div className="text-[11px] text-ink-3">{empleado.rol === "CAJERO" ? "Cajero" : empleado.rol}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onMenu}
            className="flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            Menú
          </button>
        </div>
      </header>

      {/* Sin scroll: el cuerpo reparte la altura que sobra entre las dos secciones. `min-h-0` es
          obligatorio — un hijo flex trae min-height:auto y se negaría a encogerse, empujando el
          contenido fuera de la pantalla en monitores bajos (1024×768 típico de caja). */}
      <div className="flex min-h-0 flex-1 flex-col gap-[clamp(0.5rem,2vh,1.75rem)] px-[clamp(1rem,3vw,2rem)] py-[clamp(0.75rem,2.5vh,2rem)]">
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-[clamp(0.5rem,2vh,1.75rem)]">
          {/* Sin turno: se dice por qué no se puede vender y cuál es el siguiente paso. */}
          {sinTurno && (
            <button
              type="button"
              onClick={onAbrirTurno}
              className="flex w-full flex-shrink-0 items-center gap-3 rounded-xl border border-[#E8DCC0] bg-[#F6EEDD] p-[clamp(0.75rem,1.6vh,1.25rem)] text-left transition hover:border-warning"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[clamp(0.95rem,1.6vh,1.1rem)] font-semibold tracking-tight">Abre el turno para empezar a vender</span>
                <span className="mt-0.5 block text-[clamp(0.72rem,1.3vh,0.82rem)] text-ink-2">
                  Declara el fondo con el que arranca la caja. Hasta entonces no se pueden tomar pedidos.
                </span>
              </span>
              <span className="flex-shrink-0 rounded-lg bg-ink px-4 py-2.5 text-[clamp(0.8rem,1.4vh,0.9rem)] font-semibold text-white">Abrir turno</span>
            </button>
          )}

          {/* Los 4 modos de venta: lo que se toca 100 veces al día. La sección crece con la
              pantalla (flex-[5] vs flex-[4] de Caja) para que los botones grandes se lleven
              la mayor parte del espacio sobrante. */}
          <section className="flex min-h-0 flex-[5] flex-col gap-[clamp(0.3rem,1vh,0.75rem)]">
            <h2 className="flex-shrink-0 text-[clamp(0.65rem,1.2vh,0.75rem)] font-bold uppercase tracking-[0.06em] text-ink-3">Tomar pedido</h2>
            <div className={["grid min-h-0 flex-1 grid-cols-2 gap-[clamp(0.5rem,1.4vh,1rem)] lg:grid-cols-4", sinTurno ? "pointer-events-none opacity-40" : ""].join(" ")} aria-disabled={sinTurno}>
            <BotonModo
              label="Comedor"
              sub={nCuentasComedor > 0 ? `${nCuentasComedor} mesa${nCuentasComedor === 1 ? "" : "s"} abierta${nCuentasComedor === 1 ? "" : "s"}` : "Ver mesas"}
              badge={nCuentasComedor}
              onClick={onComedor}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9"><path d="M3 11h18M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M6 11v7M18 11v7M9 6V4M15 6V4" /></svg>}
            />
            <BotonModo
              label="Para llevar"
              sub="Venta de mostrador"
              onClick={onParaLlevar}
              acento
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9"><path d="M6 2h12l1.5 5H4.5L6 2z" /><path d="M4.5 7h15l-1 13a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2L4.5 7z" /><path d="M9 12h6" /></svg>}
            />
            <BotonModo
              label="Pick-up"
              sub={nCuentasPickup > 0 ? `${nCuentasPickup} por recolectar` : "Ver pedidos"}
              badge={nCuentasPickup}
              onClick={onPickup}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9"><path d="M20 7H4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1z" /><path d="M8 7V5a4 4 0 0 1 8 0v2" /></svg>}
            />
            <BotonModo
              label="Domicilio"
              sub={nCuentasDomicilio > 0 ? `${nCuentasDomicilio} en reparto` : "Ver pedidos"}
              badge={nCuentasDomicilio}
              onClick={onDomicilio}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9"><path d="M1 9h13v8H1z" /><path d="M14 12h4l3 3v2h-7" /><circle cx="5" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>}
            />
            </div>
          </section>

          {/* Operación de caja */}
          <section className="flex min-h-0 flex-[4] flex-col gap-[clamp(0.3rem,1vh,0.75rem)]">
            <h2 className="flex-shrink-0 text-[clamp(0.65rem,1.2vh,0.75rem)] font-bold uppercase tracking-[0.06em] text-ink-3">Caja</h2>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-[clamp(0.5rem,1.4vh,1rem)] lg:grid-cols-4">
            <BotonOperacion
              label="Monitor de ventas"
              sub={sinTurno ? "Requiere turno abierto" : ventaTurno === null ? "Cargando…" : `${fmtMxn(ventaTurno)} en el turno`}
              onClick={onMonitorVentas}
              deshabilitado={sinTurno}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>}
            />
            <BotonOperacion
              label="Consultar cuentas"
              sub={sinTurno ? "Requiere turno abierto" : nEnEspera > 0 ? `${nEnEspera} en espera` : "Historial del turno"}
              onClick={onConsultarCuentas}
              deshabilitado={sinTurno}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M6 2h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>}
            />
            <BotonOperacion
              label="Retiros y depósitos"
              sub={sinTurno ? "Requiere turno abierto" : "Movimientos de efectivo"}
              onClick={onMovimientoCaja}
              deshabilitado={sinTurno}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>}
            />
            {sinTurno ? (
              <BotonOperacion
                label="Abrir turno"
                sub="Declarar fondo de caja"
                onClick={onAbrirTurno}
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8V6a5 5 0 0 1 10 0v2" /></svg>}
              />
            ) : (
              <BotonOperacion
                label="Cerrar turno"
                sub="Arqueo y corte Z"
                onClick={onCerrarTurno}
                peligro
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
              />
            )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

/** Botón grande de modo de venta. Alto generoso: se usa con el dedo, en pantalla táctil. */
function BotonModo({
  label, sub, icon, onClick, badge, acento,
}: { label: string; sub: string; icon: ReactNode; onClick: () => void; badge?: number; acento?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        // h-full: llena la celda del grid, que ya reparte la altura disponible. Sin alto fijo:
        // en un monitor bajo el botón se comprime en vez de empujar la página fuera de cuadro.
        "relative flex h-full min-h-0 flex-col items-start justify-between overflow-hidden rounded-xl border p-[clamp(0.6rem,1.6vh,1.25rem)] text-left transition",
        acento
          ? "border-ink bg-ink text-white hover:brightness-110"
          : "border-line-strong bg-surface hover:border-ink hover:bg-sel",
      ].join(" ")}
    >
      <span className={["[&>svg]:h-[clamp(1.4rem,3.4vh,2.25rem)] [&>svg]:w-auto", acento ? "text-white" : "text-ink-2"].join(" ")}>{icon}</span>
      <span className="w-full min-w-0">
        <span className="block truncate font-display text-[clamp(0.95rem,2.1vh,1.2rem)] font-semibold tracking-tight">{label}</span>
        <span className={["mt-0.5 block truncate text-[clamp(0.7rem,1.35vh,0.8rem)]", acento ? "text-white/70" : "text-ink-3"].join(" ")}>{sub}</span>
      </span>
      {badge != null && badge > 0 && (
        <span className="absolute right-3 top-3 flex h-[clamp(1.25rem,2.6vh,1.75rem)] min-w-[clamp(1.25rem,2.6vh,1.75rem)] items-center justify-center rounded-full bg-accent px-1.5 font-display text-[clamp(0.7rem,1.4vh,0.82rem)] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function BotonOperacion({
  label, sub, icon, onClick, peligro, deshabilitado,
}: { label: string; sub: string; icon: ReactNode; onClick: () => void; peligro?: boolean; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={[
        "flex h-full min-h-0 flex-col items-start justify-between overflow-hidden rounded-xl border border-line-strong bg-surface p-[clamp(0.5rem,1.4vh,1rem)] text-left transition",
        "disabled:cursor-default disabled:opacity-40 disabled:hover:border-line-strong disabled:hover:bg-surface",
        peligro ? "hover:border-danger hover:bg-[#FBF1EF]" : "hover:border-ink hover:bg-sel",
      ].join(" ")}
    >
      <span className={["[&>svg]:h-[clamp(1.15rem,2.6vh,1.75rem)] [&>svg]:w-auto", peligro ? "text-danger" : "text-ink-2"].join(" ")}>{icon}</span>
      <span className="w-full min-w-0">
        <span className={["block truncate text-[clamp(0.8rem,1.7vh,0.95rem)] font-semibold", peligro ? "text-danger" : ""].join(" ")}>{label}</span>
        <span className="mt-0.5 block truncate text-[clamp(0.65rem,1.3vh,0.78rem)] text-ink-3">{sub}</span>
      </span>
    </button>
  );
}
