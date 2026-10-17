"use client";
import { Button, LogoVim, Modal, Icono } from "@vim/ui/styles";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useReloj } from "./topbar-pos";
import { evaluarSync, leerEstadoSync, type NivelSync } from "../lib/estado-sync";
import { BandaAcceso, BandaActualizacion, useAcceso } from "./banda-acceso";
import { accesosInicio } from "../lib/accesos-inicio";
import { DialogoAvisos } from "./dialogo-avisos";
import { avisosDe, leerDirectivas, type Aviso } from "../lib/directivas";
import { evaluarFolios, leerFolios, type NivelFolios } from "../lib/folios";
import type { DatosCaja, Turno } from "../lib/turno";
import { esTienda } from "../lib/tienda";
import type { Empleado } from "../lib/supabase";

declare global {
  interface Window {
    /** La pone el preload de Electron (desktop/src/preload.cjs). Solo existe en la VENTANA de la
     *  caja: los clientes de la LAN (segunda caja, cocina) cargan el mismo POS por HTTP y no tienen
     *  preload, así que allí es `undefined` y el botón de salir ni se pinta. */
    __VIM_SALIR?: () => Promise<void>;
  }
}

/**
 * Pantalla principal del POS: barra de accesos arriba y el negocio al centro.
 *
 * Sigue la estructura del Soft Restaurant que el equipo de Knock-Out ya opera (barra
 * horizontal de accesos + área de marca), porque copiar lo que ya saben usar vale más que
 * una interfaz nueva "mejor": el cajero no tiene que reaprender dónde está cada cosa.
 *
 * Comportamiento por modo (acordado con el dueño):
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
  nCuentasBarra = 0,
  nEnEspera,
  nPedidosApps = 0,
  expiradosApps = 0,
  online = true,
  onComedor,
  onParaLlevar,
  onPickup,
  onDomicilio,
  onBarra,
  onPedidosApps,
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
  nCuentasBarra?: number;
  nEnEspera: number;
  /** Pedidos en línea (apps de delivery y tienda propia) esperando que el cajero los acepte. ADR 0011. */
  nPedidosApps?: number;
  /** Pedidos en línea que vencieron sin aceptar y nadie ha visto en este dispositivo (spec A6). */
  expiradosApps?: number;
  /** Estado de red, para la barra de estado inferior (la caja opera igual sin internet). */
  online?: boolean;
  onComedor: () => void;
  onParaLlevar: () => void;
  onPickup: () => void;
  onDomicilio: () => void;
  /** Cuentas por nombre en barra. Sin la función no hay acceso (el módulo manda además). */
  onBarra?: () => void;
  onPedidosApps?: () => void;
  onMonitorVentas: () => void;
  onConsultarCuentas: () => void;
  onMovimientoCaja: () => void;
  onAbrirTurno: () => void;
  onCerrarTurno: () => void;
  onMenu: () => void;
}) {
  // Sin turno abierto no hay dónde colgar un ticket (tickets.turno_id es obligatorio), así que
  // vender queda bloqueado hasta abrirlo: los accesos de venta salen apagados y "Abrir turno"
  // toma el lugar de "Cerrar turno".
  const sinTurno = turno === null;
  // Salir de la aplicación. Se detecta por la FUNCIÓN del preload y no por `__VIM_DESKTOP`, que el
  // ui-server también inyecta a los clientes de la LAN: allí el botón saldría y no podría apagar
  // nada. Se resuelve tras montar porque en el render del servidor no existe `window`.
  const [puedeSalir, setPuedeSalir] = useState(false);
  const [confirmandoSalir, setConfirmandoSalir] = useState(false);
  useEffect(() => { setPuedeSalir(typeof window.__VIM_SALIR === "function"); }, []);
  const acceso = useAcceso();
  const ver = accesosInicio(acceso.modulos, { comedor: nCuentasComedor, pickup: nCuentasPickup, domicilio: nCuentasDomicilio, barra: nCuentasBarra });
  // Avisos de VIM. Esta es la pantalla que el cajero ve tras el PIN y al abrir turno, así que
  // es donde se le enseñan (ADR 0014, entrega 3).
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  useEffect(() => {
    let vivo = true;
    leerDirectivas().then((d) => { if (vivo) setAvisos(avisosDe(d)); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  return (
    <main className="flex h-screen flex-col bg-bg">
      {/* Aviso de suspensión con gracia: el cajero puede seguir cobrando, pero el negocio tiene
          que enterarse antes de la fecha en que la caja deje de vender (ADR 0014). */}
      {acceso.nivel === "gracia" && <BandaAcceso mensaje={acceso.mensaje} desde={acceso.desde} />}
      {/* Versión nueva sin instalar: aquí y no en la pantalla de cobro, para que se instale entre
          turnos y no a media venta. */}
      {acceso.actualizacion && acceso.nivel !== "bloqueado" && <BandaActualizacion version={acceso.actualizacion} />}
      {avisos && avisos.length > 0 && <DialogoAvisos avisos={avisos} onCerrar={() => setAvisos([])} />}
      {/* ── Barra superior: quién opera y dónde ─────────────────────────────── */}
      <header className="flex h-[clamp(2.75rem,6.5vh,3.5rem)] flex-shrink-0 items-center justify-between gap-3 border-b border-line px-[clamp(0.75rem,2vw,1.25rem)]">
        <div className="flex min-w-0 items-center gap-3">
          <LogoVim className="h-8 w-8 flex-shrink-0" />
          <div className="min-w-0">
            <div className="truncate font-display text-14 font-semibold tracking-tight">{caja.sucursalNombre}</div>
            <div className="truncate text-11 text-ink-3">
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
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-hover font-display text-12 font-semibold text-ink-2">
              {empleado.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
            </span>
            <div className="hidden sm:block">
              <div className="text-13 font-semibold leading-tight">{empleado.nombre}</div>
              <div className="text-11 text-ink-3">{empleado.rol === "CAJERO" ? "Cajero" : empleado.rol}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onMenu}
            className="flex h-8 items-center gap-1.5 rounded border border-line-strong px-2.5 text-13 font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
          >
            <Icono nombre="menu" className="h-4 w-4" />
            Menú
          </button>
        </div>
      </header>

      {expiradosApps > 0 && onPedidosApps && (
        <button
          type="button"
          onClick={onPedidosApps}
          role="alert"
          className="mx-4 mt-3 flex flex-shrink-0 items-center gap-2 rounded border border-danger bg-danger-soft px-3 py-2.5 text-left text-14 font-semibold text-danger"
        >
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-danger" />
          {expiradosApps === 1 ? "Se venció 1 pedido en línea sin aceptar." : `Se vencieron ${expiradosApps} pedidos en línea sin aceptar.`} Toca para ver Pedidos en línea.
        </button>
      )}

      {/* ── Barra de accesos ────────────────────────────────────────────────── */}
      <nav
        aria-label="Accesos principales"
        className="flex flex-shrink-0 items-stretch gap-px overflow-hidden border-b border-line bg-line"
      >
        {ver.comedor && (
          <Acceso label="Comedor" badge={nCuentasComedor} onClick={onComedor} requiereTurno={sinTurno}
            icon={<Icono nombre="mesa" />} />
        )}
        {ver.barra && onBarra && (
          <Acceso label="Barra" badge={nCuentasBarra} onClick={onBarra} requiereTurno={sinTurno}
            icon={<Icono nombre="vaso" />} />
        )}
        {ver.paraLlevar && (
          <Acceso label={esTienda(caja) ? "Venta" : "Para llevar"} onClick={onParaLlevar} requiereTurno={sinTurno} destacado
            icon={<Icono nombre="para-llevar" />} />
        )}
        {ver.pickup && (
          <Acceso label="Pick-up" badge={nCuentasPickup} onClick={onPickup} requiereTurno={sinTurno}
            icon={<Icono nombre="bolsa" />} />
        )}
        {ver.domicilio && (
          <Acceso label="Domicilio" badge={nCuentasDomicilio} onClick={onDomicilio} requiereTurno={sinTurno}
            icon={<Icono nombre="moto" />} />
        )}
        {onPedidosApps && (
          <Acceso label="Pedidos en línea" badge={nPedidosApps} onClick={onPedidosApps} requiereTurno={sinTurno}
            icon={<Icono nombre="celular" />} />
        )}

        <span className="w-px flex-shrink-0 bg-line-strong" aria-hidden="true" />

        <Acceso label="Retiro / Depósito" onClick={onMovimientoCaja} requiereTurno={sinTurno}
          icon={<Icono nombre="billete" />} />
        <Acceso label="Consultar ctas." badge={nEnEspera} onClick={onConsultarCuentas} requiereTurno={sinTurno}
          icon={<Icono nombre="recibo" />} />
        <Acceso label="Monitor ventas" onClick={onMonitorVentas} requiereTurno={sinTurno}
          icon={<Icono nombre="grafica" />} />

        <span className="w-px flex-shrink-0 bg-line-strong" aria-hidden="true" />

        {sinTurno ? (
          <Acceso label="Abrir turno" onClick={onAbrirTurno} resaltado
            icon={<Icono nombre="candado" />} />
        ) : (
          <Acceso label="Cerrar turno" onClick={onCerrarTurno} peligro
            icon={<Icono nombre="casilla" />} />
        )}

        {/* Salir de la caja. Al final de todo y detrás de su propio separador: es la única acción
            de esta barra que no es parte de vender, y la que peor se perdona por accidente.
            Solo en la VENTANA de la caja: la cocina y una segunda caja cargan este mismo POS por
            HTTP y no tienen preload, así que allí `puedeSalir` es false y el botón no existe —
            apagar el hub desde una pantalla remota no es algo que deba poder hacerse por error. */}
        {puedeSalir && (
          <>
            <span className="w-px flex-shrink-0 bg-line-strong" aria-hidden="true" />
            <Acceso label="Salir" onClick={() => setConfirmandoSalir(true)} peligro
              icon={<Icono nombre="salir" />} />
          </>
        )}
      </nav>

      {/* ── Área del negocio ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6">
        {sinTurno && (
          <button
            type="button"
            onClick={onAbrirTurno}
            className="flex items-center gap-3 rounded-xl border border-warning-line bg-warning-soft px-5 py-3 text-left transition hover:border-warning"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
              <Icono nombre="reloj" className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-display text-15 font-semibold tracking-tight">Abre el turno para empezar a vender</span>
              <span className="mt-0.5 block text-13 text-ink-2">Declara el fondo con el que arranca la caja.</span>
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
            <LogoVim className="h-[clamp(3.5rem,11vh,6rem)] w-[clamp(3.5rem,11vh,6rem)]" />
          )}
          {/* Solo el nombre del negocio. La venta del turno NO se muestra aquí: la pantalla de
              inicio está a la vista de clientes y de cualquiera que pase por el mostrador, y
              cuánto ha vendido el local no es información para ellos. Sigue disponible bajo
              demanda en "Monitor ventas" y en el corte X, que sí exigen entrar a verlos. */}
          <div className="text-center">
            <div className="font-display text-[clamp(1.25rem,3.6vh,2rem)] font-bold tracking-tight">{caja.negocioNombre}</div>
          </div>
        </div>
      </div>

      <BarraEstadoCaja caja={caja} online={online} />

      {confirmandoSalir && (
        <Modal
          open
          onClose={() => setConfirmandoSalir(false)}
          title="Cerrar la caja"
          hideTitle
          className="w-[420px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
        >
          <h2 className="font-display text-xl font-semibold tracking-tight">¿Cerrar la caja?</h2>
          {/* Esta computadora es el hub de la LAN: al apagarla, la cocina y cualquier segunda caja
              se quedan sin backend. Decirlo es la diferencia entre cerrar a propósito y descubrir
              a media comida que la cocina dejó de recibir comandas. */}
          <p className="mt-2 text-14 leading-snug text-ink-2">
            La cocina y las demás pantallas conectadas a esta computadora dejarán de funcionar
            hasta que la vuelvas a abrir.
          </p>
          <p className="mt-2 text-13 leading-snug text-ink-3">
            Antes de cerrar se guarda un respaldo. No se pierde ninguna venta.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmandoSalir(false)}
              className="h-11 flex-1 rounded border border-line-strong text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
            >
              Cancelar
            </button>
            <Button className="flex-1" onClick={() => { void window.__VIM_SALIR?.(); }}>
              Cerrar la caja
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}

/**
 * Barra de estado de la caja: estación, conexión, sincronización, folios y hora. La pinta el inicio
 * abajo y la caja de tienda, que no tiene inicio, arriba y con el turno (pos-retail.md, «Versión 2»).
 */
export function BarraEstadoCaja({ caja, online, turno, arriba = false }: { caja: DatosCaja; online: boolean; turno?: Turno | null; arriba?: boolean }) {
  const ahora = useReloj();

  // Estado de sincronización: el cajero necesita poder ver que sus ventas están subiendo. Se
  // relee cada minuto —el ciclo del escritorio corre cada 10— para que el aviso no se quede
  // pegado tras recuperar la conexión.
  const [sync, setSync] = useState<{ nivel: NivelSync; texto: string }>({ nivel: "desconocido", texto: "" });
  useEffect(() => {
    let vivo = true;
    const cargar = () => { leerEstadoSync().then((e) => { if (vivo) setSync(evaluarSync(e)); }).catch(() => {}); };
    cargar();
    const id = setInterval(cargar, 60000);
    return () => { vivo = false; clearInterval(id); };
  }, []);
  // Folios de facturación. A DEMANDA, no en un intervalo: cada lectura es una ida a la nube, y el
  // producto es local-first justamente para que la caja no dependa de la conexión. Se consulta una
  // vez al abrir la pantalla y luego solo si el cajero lo pide.
  const [folios, setFolios] = useState<{ nivel: NivelFolios; texto: string } | null>(null);
  const [consultandoFolios, setConsultandoFolios] = useState(false);
  const consultarFolios = useCallback(async () => {
    setConsultandoFolios(true);
    try {
      const r = await leerFolios();
      // "no-aplica" (el negocio no tiene facturación) deja el indicador oculto en vez de mostrar
      // un cero alarmante a quien nunca contrató el add-on.
      setFolios(r.estado === "ok" ? evaluarFolios(r.saldo) : null);
    } finally {
      setConsultandoFolios(false);
    }
  }, []);
  useEffect(() => { consultarFolios(); }, [consultarFolios]);
  const Tag = arriba ? "div" : "footer";

  return (
    <Tag className={`flex h-[clamp(1.5rem,3.5vh,1.875rem)] flex-shrink-0 items-center justify-between gap-4 ${arriba ? "border-b" : "border-t"} border-line bg-sel px-3 text-[clamp(0.6rem,1.2vh,0.72rem)] text-ink-3`}>
      <span className="truncate">
        Estación: <b className="font-semibold text-ink-2">{caja.nombre}</b>{turno && <> · Turno <b className="font-semibold text-ink-2">{turno.codigo_turno}</b></>}
      </span>
      <span className="flex flex-shrink-0 items-center gap-1.5">
        <span className={["h-1.5 w-1.5 rounded-full", online ? "bg-success" : "bg-warning"].join(" ")} aria-hidden="true" />
        {online ? "Conectado" : "Sin internet · la caja sigue cobrando"}
      </span>
      {/* Solo aparece en la caja de escritorio (en el POS web no hay servidor local que
          responda). Si lleva más de un día sin subir se pinta en rojo: ahí ya hay un turno
          entero de ventas viviendo únicamente en esta computadora. */}
      {sync.nivel !== "desconocido" && (
        <span
          className={[
            "flex flex-shrink-0 items-center gap-1.5",
            sync.nivel === "muda" || sync.nivel === "sin-vincular" ? "font-semibold text-danger" : "",
            sync.nivel === "atrasada" ? "text-warning" : "",
          ].join(" ")}
          title={sync.nivel === "muda" ? "Las ventas no están llegando a la nube. Avisa a soporte." : undefined}
        >
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              sync.nivel === "ok" ? "bg-success" : sync.nivel === "atrasada" ? "bg-warning" : "bg-danger",
            ].join(" ")}
            aria-hidden="true"
          />
          {sync.texto}
        </span>
      )}
      {/* Folios de facturación. Solo si el negocio tiene facturación activa. El botón vuelve a
          preguntarle a la nube: cuando VIM acredita un paquete, el cajero lo ve al pulsarlo y no
          una hora después, que es lo que tardaría la sincronización del catálogo. */}
      {folios && (
        <span
          className={[
            "flex flex-shrink-0 items-center gap-1.5",
            folios.nivel === "agotados" ? "font-semibold text-danger" : "",
            folios.nivel === "pocos" ? "text-warning" : "",
          ].join(" ")}
          title={
            folios.nivel === "agotados"
              ? "No se pueden emitir facturas. Pídele folios a VIM."
              : "Folios de facturación disponibles"
          }
        >
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              folios.nivel === "ok" ? "bg-success" : folios.nivel === "pocos" ? "bg-warning" : "bg-danger",
            ].join(" ")}
            aria-hidden="true"
          />
          {folios.texto}
          <button
            type="button"
            onClick={consultarFolios}
            disabled={consultandoFolios}
            className="underline underline-offset-2 disabled:opacity-50"
            aria-label="Actualizar folios"
          >
            {consultandoFolios ? "…" : "actualizar"}
          </button>
        </span>
      )}
      <span className="flex-shrink-0 tabular-nums">
        {ahora ? ahora.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
        {" · "}
        {ahora ? ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
      </span>
    </Tag>
  );
}

/**
 * Botón de la barra de accesos: ícono arriba, etiqueta abajo, como en Soft.
 * Se reparten el ancho a partes iguales (flex-1) para que la barra llene la pantalla
 * sin importar el tamaño, y el contenido escala con la altura disponible.
 */
function Acceso({
  label, icon, onClick, badge, requiereTurno, destacado, peligro, resaltado,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: number;
  /** Necesita un turno abierto: se pinta apagado, pero SIGUE respondiendo.
   *
   *  Antes esto era `deshabilitado` y ponía `disabled` en el botón. El cajero tocaba
   *  "Comedor" sin turno y no ocurría nada — que es como se ve un sistema colgado.
   *  Apagado pero vivo dice las dos cosas: que todavía no se puede vender, y qué
   *  hacer al respecto (el toque lleva a abrir el turno). */
  requiereTurno?: boolean;
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
      title={requiereTurno ? `${label} · abre el turno primero` : label}
      className={[
        "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-[clamp(0.4rem,1.4vh,0.7rem)] transition",
        requiereTurno ? "opacity-40" : "",
        destacado
          ? "bg-accent text-white hover:bg-accent-hover"
          : resaltado
            ? "bg-ink text-white hover:brightness-110"
            : peligro
              ? "bg-surface text-danger hover:bg-[#FBF1EF]"
              : "bg-surface text-ink-2 hover:bg-sel hover:text-ink",
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
