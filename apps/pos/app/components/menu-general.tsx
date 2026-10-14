"use client";
import { LogoVim, Icono } from "@vim/ui/styles";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { buscarActualizacion, esEscritorio } from "../lib/actualizacion";
import { pedirActualizacionCatalogo } from "../lib/catalogo-eventos";
import { enlaceWhatsapp, mensajeAyudaCaja, textoHorario } from "@vim/db/soporte";
import { useSoporte } from "../lib/soporte";

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
  onCorteX,
  onEnEspera,
  onAbrirCajon,
  nEnEspera,
  onCambiarCajero,
  onBloquear,
  onCambiarPin,
  onMisPropinas,
  onImpresora,
  onCerrarTurno,
  ayuda,
}: {
  onCerrar: () => void;
  /* Las opciones que dependen de un turno abierto son opcionales: sin turno el menú se abre igual
     (cambiar de cajero, el PIN, las impresoras, actualizar, pedir ayuda) y simplemente no pinta
     las que no tendrían sobre qué trabajar. Antes, sin turno, el botón «Menú» ni siquiera abría
     esto: mandaba directo a elegir cajero. */
  onKds?: () => void;
  onDevoluciones?: () => void;
  onCorteX?: () => void;
  onEnEspera?: () => void;
  onAbrirCajon?: () => void;
  nEnEspera?: number;
  onCambiarCajero: () => void;
  onBloquear: () => void;
  onCambiarPin: () => void;
  onMisPropinas?: () => void;
  onImpresora: () => void;
  onCerrarTurno?: () => void;
  /** Para el mensaje de "Ayuda por WhatsApp": desde qué negocio, sucursal y caja se escribe. */
  ayuda?: { negocio?: string | null; sucursal?: string | null; caja?: string | null; cajero?: string | null };
}) {
  // Actualizar solo aplica dentro de la app de escritorio; se resuelve en efecto porque el
  // export estático se prerenderiza sin window.
  const [enEscritorio, setEnEscritorio] = useState(false);
  const [buscandoUpd, setBuscandoUpd] = useState(false);
  const [avisoUpd, setAvisoUpd] = useState<string | null>(null);
  const [bajandoMenu, setBajandoMenu] = useState(false);
  useEffect(() => { setEnEscritorio(esEscritorio()); }, []);
  // Soporte de VIM (0142): el WhatsApp vigente (o el de fábrica) con el mensaje ya escrito.
  const { soporte, version } = useSoporte();
  const waAyuda = enlaceWhatsapp(soporte.whatsapp, mensajeAyudaCaja({ ...ayuda, version }));

  /**
   * Trae el menú de la nube en el momento. El escritorio ya lo sondea solo cada minuto; esto es
   * para el dueño que acaba de dar de alta un producto y lo quiere en pantalla con el cliente
   * delante. La pantalla NO se recarga aquí: el escritorio avisa por SSE cuando terminó de bajar,
   * y así la segunda caja y la cocina se enteran por el mismo camino.
   */
  const actualizarMenu = useCallback(async () => {
    setBajandoMenu(true);
    setAvisoUpd(null);
    const r = await pedirActualizacionCatalogo();
    setBajandoMenu(false);
    setAvisoUpd(r.ok ? "Menú actualizado." : (r.error ?? "No se pudo actualizar el menú."));
  }, []);

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

  // Escape lo cierra home-pos (capa `menuGeneralAbierto` de su lista). Aquí había un listener
  // propio que no miraba si la tecla ya estaba atendida: cerraba el menú también cuando Escape
  // era para un modal abierto encima.

  /** Cierra el menú y ejecuta la acción: ninguna opción debe dejar el menú encima. */
  const con = (fn: () => void) => () => { onCerrar(); fn(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Menú">
      <div className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line px-8">
        <div className="flex items-center gap-3">
          <LogoVim className="h-[34px] w-[34px]" />
          <span className="font-display text-18 font-semibold tracking-tight">Menú</span>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar menú"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-ink-2 transition hover:border-ink hover:text-ink"
        >
          <Icono nombre="cerrar" className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto flex max-w-4xl flex-col gap-9">
          {(onKds || onDevoluciones || onCorteX || onEnEspera || onAbrirCajon) && (
          <SeccionMenu titulo="Operación">
            {onKds && (
              <TileMenu label="Cocina" onClick={con(onKds)} icon={<Icono nombre="megafono" className="h-8 w-8" />} />
            )}
            {onDevoluciones && (
              <TileMenu label="Devoluciones" onClick={con(onDevoluciones)} icon={<Icono nombre="devolver" className="h-8 w-8" />} />
            )}
            {/* Estas dos vivían en el topbar de la pantalla de venta. Al quitarlo se quedaron sin
                puerta: se podía dejar un pedido en espera pero ya no recuperarlo. */}
            {onCorteX && (
              <TileMenu label="Corte caja X" onClick={con(onCorteX)} icon={<Icono nombre="recibo" className="h-8 w-8" />} />
            )}
            {onEnEspera && (
              <TileMenu label="Pedidos en espera" badge={nEnEspera} onClick={con(onEnEspera)} icon={<Icono nombre="reloj" className="h-8 w-8" />} />
            )}
            {onAbrirCajon && (
              <TileMenu label="Abrir cajón" onClick={con(onAbrirCajon)} icon={<Icono nombre="cajon" className="h-8 w-8" />} />
            )}
          </SeccionMenu>
          )}
          <SeccionMenu titulo="Cuenta">
            <TileMenu label="Cambiar cajero" onClick={con(onCambiarCajero)} icon={<Icono nombre="personas" className="h-8 w-8" />} />
            <TileMenu label="Bloquear pantalla" onClick={con(onBloquear)} icon={<Icono nombre="candado" className="h-8 w-8" />} />
            <TileMenu label="Cambiar mi PIN" onClick={con(onCambiarPin)} icon={<Icono nombre="llave" className="h-8 w-8" />} />
            {onMisPropinas && (
              <TileMenu label="Mis propinas" onClick={con(onMisPropinas)} icon={<Icono nombre="moneda" className="h-8 w-8" />} />
            )}
          </SeccionMenu>
          <SeccionMenu titulo="Ajustes">
            <TileMenu label="Configurar impresoras y pantallas" onClick={con(onImpresora)} icon={<Icono nombre="impresora" className="h-8 w-8" />} />
            {enEscritorio && (
              <>
            <TileMenu
              label={bajandoMenu ? "Actualizando…" : "Actualizar menú"}
              onClick={() => { if (!bajandoMenu) actualizarMenu(); }}
              icon={<Icono nombre="actualizar-menu" className="h-8 w-8" />}
            />
              <TileMenu
                label={buscandoUpd ? "Buscando…" : "Buscar actualizaciones"}
                onClick={() => { if (!buscandoUpd) revisarActualizacion(); }}
                icon={<Icono nombre="buscar-actualizacion" className="h-8 w-8" />}
              />
              </>
            )}
            {waAyuda && (
              <TileEnlace
                label="Ayuda por WhatsApp"
                detalle={textoHorario(soporte)}
                href={waAyuda}
                icon={<Icono nombre="chat" className="h-8 w-8" />}
              />
            )}
            {onCerrarTurno && (
              <TileMenu label="Cerrar turno" onClick={con(onCerrarTurno)} peligro icon={<Icono nombre="casilla" className="h-8 w-8" />} />
            )}
          </SeccionMenu>
          {avisoUpd && <p className="-mt-4 text-13 font-medium text-ink-2" role="status">{avisoUpd}</p>}
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
        <span className="absolute right-3 top-3 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 text-12 font-bold text-white">{badge}</span>
      )}
      <span className="flex h-10 w-10 items-center justify-center">{icon}</span>
      <span className="text-center text-15 font-semibold leading-tight">{label}</span>
    </button>
  );
}

/**
 * Igual que `TileMenu`, pero es un enlace: abre WhatsApp fuera de la caja (el escritorio manda
 * los `https:` con `target=_blank` al navegador del sistema). El menú se queda abierto: al volver,
 * el cajero sigue donde estaba.
 */
function TileEnlace({ icon, label, detalle, href }: { icon: ReactNode; label: string; detalle?: string | null; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      role="menuitem"
      className="relative flex min-h-[140px] flex-col items-center justify-center gap-4 rounded-2xl border border-line-strong p-6 text-ink-2 transition hover:border-ink hover:bg-hover hover:text-ink"
    >
      <span className="flex h-10 w-10 items-center justify-center">{icon}</span>
      <span className="flex flex-col items-center gap-1">
        <span className="text-center text-15 font-semibold leading-tight">{label}</span>
        {detalle && <span className="text-center text-12 text-ink-3">{detalle}</span>}
      </span>
    </a>
  );
}

function SeccionMenu({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3.5 text-12 font-semibold uppercase tracking-[0.06em] text-ink-3">{titulo}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}
