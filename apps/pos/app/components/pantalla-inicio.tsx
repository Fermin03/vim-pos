"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useReloj } from "./topbar-pos";
import { fmtMxn, type DatosCaja, type Turno } from "../lib/turno";
import { leerReporteX } from "../lib/cierre";
import type { Empleado } from "../lib/supabase";

/**
 * Pantalla principal del POS: barra de accesos arriba y el negocio al centro.
 *
 * Sigue la estructura del Soft Restaurant que el equipo de Knock-Out ya opera (barra
 * horizontal de accesos + área de marca), porque copiar lo que ya saben usar vale más que
 * una interfaz nueva "mejor": el cajero no tiene que reaprender dónde está cada cosa.
 *
 * Comportamiento por modo (acordado con Fermín):
 *   - Comedor / Pick-up / Domicilio → abren la LISTA DE CUENTAS de ese modo; en esos modos
 *     casi siempre se retoma una cuenta viva, no se empieza una.
 *   - Para llevar → entra DIRECTO a capturar: es venta de mostrador, no hay nada que retomar.
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
  online = true,
  onComedor,
  onParaLlevar,
  onPickup,
  onDomicilio,
  onMonitorVentas,
  onConsultarCuentas,
  onMovimientoCaja,
  onCorteX,
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
  /** Estado de red, para la barra de estado inferior (la caja opera igual sin internet). */
  online?: boolean;
  onComedor: () => void;
  onParaLlevar: () => void;
  onPickup: () => void;
  onDomicilio: () => void;
  onMonitorVentas: () => void;
  onConsultarCuentas: () => void;
  onMovimientoCaja: () => void;
  onCorteX: () => void;
  onAbrirTurno: () => void;
  onCerrarTurno: () => void;
  onMenu: () => void;
}) {
  const ahora = useReloj();
  const [ventaTurno, setVentaTurno] = useState<number | null>(null);

  // Sin turno abierto no hay dónde colgar un ticket (tickets.turno_id es obligatorio), así que
  // vender queda bloqueado hasta abrirlo: los accesos de venta salen apagados y "Abrir turno"
  // toma el lugar de "Cerrar turno".
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
      {/* ── Barra superior: quién opera y dónde ─────────────────────────────── */}
      <header className="flex h-[clamp(2.75rem,6.5vh,3.5rem)] flex-shrink-0 items-center justify-between gap-3 border-b border-line px-[clamp(0.75rem,2vw,1.25rem)]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ink">
            <span className="font-display text-[15px] font-bold leading-none tracking-tight text-white">V</span>
            <span className="absolute bottom-1 right-1 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[13.5px] font-semibold tracking-tight">{caja.sucursalNombre}</div>
            <div className="truncate text-[11px] text-ink-3">
              {caja.nombre} ·{" "}
              {turno ? (
                <span className="text-success">Turno {turno.codigo_turno}</span>
              ) : (
                <span className="font-semibold text-warning">Sin turno abierto</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-hover font-display text-[12px] font-semibold text-ink-2">
              {empleado.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
            </span>
            <div className="hidden sm:block">
              <div className="text-[12.5px] font-semibold leading-tight">{empleado.nombre}</div>
              <div className="text-[10.5px] text-ink-3">{empleado.rol === "CAJERO" ? "Cajero" : empleado.rol}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onMenu}
            className="flex h-8 items-center gap-1.5 rounded border border-line-strong px-2.5 text-[12.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            Menú
          </button>
        </div>
      </header>

      {/* ── Barra de accesos ────────────────────────────────────────────────── */}
      <nav
        aria-label="Accesos principales"
        className="flex flex-shrink-0 items-stretch gap-px overflow-hidden border-b border-line bg-line"
      >
        <Acceso label="Comedor" badge={nCuentasComedor} onClick={onComedor} deshabilitado={sinTurno}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11h18M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M6 11v7M18 11v7M9 6V4M15 6V4" /></svg>} />
        <Acceso label="Para llevar" onClick={onParaLlevar} deshabilitado={sinTurno} destacado
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h12l1.5 5H4.5L6 2z" /><path d="M4.5 7h15l-1 13a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2L4.5 7z" /><path d="M9 12h6" /></svg>} />
        <Acceso label="Pick-up" badge={nCuentasPickup} onClick={onPickup} deshabilitado={sinTurno}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7H4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1z" /><path d="M8 7V5a4 4 0 0 1 8 0v2" /></svg>} />
        <Acceso label="Domicilio" badge={nCuentasDomicilio} onClick={onDomicilio} deshabilitado={sinTurno}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 9h13v8H1z" /><path d="M14 12h4l3 3v2h-7" /><circle cx="5" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>} />

        <span className="w-px flex-shrink-0 bg-line-strong" aria-hidden="true" />

        <Acceso label="Retiro / Depósito" onClick={onMovimientoCaja} deshabilitado={sinTurno}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>} />
        <Acceso label="Consultar ctas." badge={nEnEspera} onClick={onConsultarCuentas} deshabilitado={sinTurno}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>} />
        <Acceso label="Monitor ventas" onClick={onMonitorVentas} deshabilitado={sinTurno}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>} />
        <Acceso label="Corte caja X" onClick={onCorteX} deshabilitado={sinTurno}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" /><path d="M9 7h6M9 11h6M9 15h3" /></svg>} />

        <span className="w-px flex-shrink-0 bg-line-strong" aria-hidden="true" />

        {sinTurno ? (
          <Acceso label="Abrir turno" onClick={onAbrirTurno} resaltado
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8V6a5 5 0 0 1 10 0v2" /></svg>} />
        ) : (
          <Acceso label="Cerrar turno" onClick={onCerrarTurno} peligro
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} />
        )}
      </nav>

      {/* ── Área del negocio ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6">
        {sinTurno && (
          <button
            type="button"
            onClick={onAbrirTurno}
            className="flex items-center gap-3 rounded-xl border border-[#E8DCC0] bg-[#F6EEDD] px-5 py-3 text-left transition hover:border-warning"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </span>
            <span>
              <span className="block font-display text-[15px] font-semibold tracking-tight">Abre el turno para empezar a vender</span>
              <span className="mt-0.5 block text-[12.5px] text-ink-2">Declara el fondo con el que arranca la caja.</span>
            </span>
          </button>
        )}

        {/* Marca del negocio: su logo si lo subió en el panel (Configuración → Datos del
            negocio), y si no, la marca VIM como respaldo para no dejar el hueco vacío. */}
        <div className="flex select-none flex-col items-center gap-2 opacity-90">
          {caja.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI local: sin red, sin optimizador
            <img
              src={caja.logoUrl}
              alt={caja.negocioNombre}
              className="h-[clamp(4rem,16vh,9rem)] w-auto max-w-[min(60vw,22rem)] object-contain"
            />
          ) : (
            <div className="relative flex h-[clamp(3.5rem,11vh,6rem)] w-[clamp(3.5rem,11vh,6rem)] items-center justify-center rounded-[1.25rem] bg-ink">
              <span className="font-display text-[clamp(1.75rem,5.5vh,3rem)] font-bold leading-none tracking-tight text-white">V</span>
              <span className="absolute bottom-[14%] right-[14%] h-[7%] w-[7%] rounded-full bg-accent" aria-hidden="true" />
            </div>
          )}
          <div className="text-center">
            <div className="font-display text-[clamp(1.25rem,3.6vh,2rem)] font-bold tracking-tight">{caja.negocioNombre}</div>
            {!sinTurno && ventaTurno !== null && (
              <div className="mt-0.5 text-[clamp(0.75rem,1.5vh,0.9rem)] text-ink-3">
                Venta del turno · <b className="font-semibold text-ink-2 tabular-nums">{fmtMxn(ventaTurno)}</b>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Barra de estado ─────────────────────────────────────────────────── */}
      <footer className="flex h-[clamp(1.5rem,3.5vh,1.875rem)] flex-shrink-0 items-center justify-between gap-4 border-t border-line bg-sel px-3 text-[clamp(0.6rem,1.2vh,0.72rem)] text-ink-3">
        <span className="truncate">
          Estación: <b className="font-semibold text-ink-2">{caja.nombre}</b>
        </span>
        <span className="flex flex-shrink-0 items-center gap-1.5">
          <span className={["h-1.5 w-1.5 rounded-full", online ? "bg-success" : "bg-warning"].join(" ")} aria-hidden="true" />
          {online ? "Conectado" : "Sin conexión · modo offline"}
        </span>
        <span className="flex-shrink-0 tabular-nums">
          {ahora ? ahora.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
          {" · "}
          {ahora ? ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
        </span>
      </footer>
    </main>
  );
}

/**
 * Botón de la barra de accesos: ícono arriba, etiqueta abajo, como en Soft.
 * Se reparten el ancho a partes iguales (flex-1) para que la barra llene la pantalla
 * sin importar el tamaño, y el contenido escala con la altura disponible.
 */
function Acceso({
  label, icon, onClick, badge, deshabilitado, destacado, peligro, resaltado,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: number;
  deshabilitado?: boolean;
  /** Acción más frecuente (venta de mostrador): se pinta en el color de marca. */
  destacado?: boolean;
  peligro?: boolean;
  /** Acción que el cajero DEBE hacer ahora (abrir turno). */
  resaltado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      title={label}
      className={[
        "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-[clamp(0.4rem,1.4vh,0.7rem)] transition",
        "disabled:cursor-default disabled:opacity-35",
        destacado
          ? "bg-accent text-white hover:bg-accent-hover disabled:hover:bg-accent"
          : resaltado
            ? "bg-ink text-white hover:brightness-110 disabled:hover:brightness-100"
            : peligro
              ? "bg-surface text-danger hover:bg-[#FBF1EF] disabled:hover:bg-surface"
              : "bg-surface text-ink-2 hover:bg-sel hover:text-ink disabled:hover:bg-surface",
      ].join(" ")}
    >
      <span className="[&>svg]:h-[clamp(1.15rem,2.8vh,1.6rem)] [&>svg]:w-auto">{icon}</span>
      {/* La etiqueta ENVUELVE en dos líneas en vez de truncarse: con 9 accesos en pantallas
          angostas (tablet vertical) los botones bajan a ~84px, y un "Retiro / Depó…" cortado
          no le dice nada al cajero. Partido en dos renglones sí se lee completo. */}
      <span className="line-clamp-2 w-full text-balance break-words text-center text-[clamp(0.6rem,1.35vh,0.78rem)] font-semibold leading-tight">{label}</span>
      {badge != null && badge > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-[clamp(0.9rem,2vh,1.15rem)] min-w-[clamp(0.9rem,2vh,1.15rem)] items-center justify-center rounded-full bg-accent px-1 text-[clamp(0.55rem,1.1vh,0.68rem)] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
