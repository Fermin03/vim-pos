"use client";
import { Icono } from "@vim/ui/styles";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { buscarActualizacion, esEscritorio } from "../lib/actualizacion";
import { pedirActualizacionCatalogo } from "../lib/catalogo-eventos";
import { enlaceWhatsapp, mensajeAyudaCaja, textoHorario } from "@vim/db/soporte";
import { useSoporte } from "../lib/soporte";
import { moduloActivo } from "@vim/db/operacion";
import { useAcceso } from "./banda-acceso";

/**
 * Las opciones del menú general. Las pinta `MenuGeneral` dentro de su diálogo (restaurante) y la
 * sección «Configuración» de la caja de tienda directo en la página (pos-retail.md, «Versión 2»).
 */
export function ContenidoMenu({
  alElegir,
  enPagina = false,
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
  onMovimientoCaja,
  onCreditos,
  onSalir,
  ayuda,
}: {
  /** Se llama al elegir una opción: el diálogo se cierra para no quedar encima. En la página, nada. */
  alElegir?: () => void;
  /** En la página «Cerrar turno» va aparte, al final, separado de lo demás. */
  enPagina?: boolean;
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
  /** Solo la tienda, que no tiene inicio: sus accesos «Retiro / Depósito» y «Salir» («Corte caja X» abre el monitor). */
  onMovimientoCaja?: () => void;
  /** Solo la tienda, con el módulo de crédito: quién debe y registrar abonos (temporal: la entrega 4 lo lleva a «Más»). */
  onCreditos?: () => void;
  onSalir?: () => void;
  /** Para el mensaje de "Ayuda por WhatsApp": desde qué negocio, sucursal y caja se escribe. */
  ayuda?: { negocio?: string | null; sucursal?: string | null; caja?: string | null; cajero?: string | null };
}) {
  const { modulos } = useAcceso();
  const creditos = onCreditos && modulos?.credito === true ? onCreditos : undefined;
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
    if (r.estado === "hay") alElegir?.();
    else if (r.estado === "al-dia") setAvisoUpd(`Ya tienes la última versión (v${r.version}).`);
    else if (r.estado === "descargando") setAvisoUpd("La actualización ya se está descargando.");
    else setAvisoUpd(r.error);
  }, [alElegir]);

  // Escape lo cierra home-pos (capa `menuGeneralAbierto` de su lista). Aquí había un listener
  // propio que no miraba si la tecla ya estaba atendida: cerraba el menú también cuando Escape
  // era para un modal abierto encima.

  /** Cierra el menú (si es diálogo) y ejecuta la acción: ninguna opción debe dejar el menú encima. */
  const con = (fn: () => void) => () => { alElegir?.(); fn(); };
  const cerrarTurno = onCerrarTurno && (
    <TileMenu label="Cerrar turno" onClick={con(onCerrarTurno)} peligro icon={<Icono nombre="casilla" className="h-8 w-8" />} />
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-9">
      {(onKds || onDevoluciones || onCorteX || onEnEspera || onAbrirCajon || onMovimientoCaja || creditos) && (
      <SeccionMenu titulo="Operación">
        {onKds && moduloActivo(modulos, "kds") && (
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
        {onMovimientoCaja && (
          <TileMenu label="Retiro / Depósito" onClick={con(onMovimientoCaja)} icon={<Icono nombre="billete" className="h-8 w-8" />} />
        )}
        {creditos && (
          <TileMenu label="Créditos" onClick={con(creditos)} icon={<Icono nombre="pesos" className="h-8 w-8" />} />
        )}
      </SeccionMenu>
      )}
      <SeccionMenu titulo="Cuenta">
        <TileMenu label="Cambiar cajero" onClick={con(onCambiarCajero)} icon={<Icono nombre="personas" className="h-8 w-8" />} />
        <TileMenu label="Bloquear pantalla" onClick={con(onBloquear)} icon={<Icono nombre="candado" className="h-8 w-8" />} />
        <TileMenu label="Cambiar mi PIN" onClick={con(onCambiarPin)} icon={<Icono nombre="llave" className="h-8 w-8" />} />
        {onMisPropinas && moduloActivo(modulos, "meseros") && (
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
        {!enPagina && cerrarTurno}
      </SeccionMenu>
      {avisoUpd && <p className="-mt-4 text-13 font-medium text-ink-2" role="status">{avisoUpd}</p>}
      {enPagina && (cerrarTurno || onSalir) && (
        <SeccionMenu titulo="Turno">
          {cerrarTurno}
          {onSalir && <TileMenu label="Salir" onClick={con(onSalir)} peligro icon={<Icono nombre="salir" className="h-8 w-8" />} />}
        </SeccionMenu>
      )}
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
