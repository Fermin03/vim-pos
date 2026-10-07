"use client";
import { useEffect, useState } from "react";
import { type Empleado } from "../lib/supabase";
import { ModalAbrirTurno } from "./abrir-turno";
import { HomePos } from "./home-pos";
import { MenuGeneral } from "./menu-general";
import { ModalCambiarPin } from "./modal-cambiar-pin";
import { ModalConfigImpresora } from "./modal-config-impresora";
import { PantallaInicio } from "./pantalla-inicio";
import { useEscape } from "../lib/use-escape";
import { leerCaja, turnoAbiertoDeCaja, type DatosCaja, type Turno } from "../lib/turno";


/**
 * Pantalla post-login: carga datos de la caja y decide entre abrir turno o
 * entrar al POS operativo. En F5.0 el "POS operativo" sigue siendo un
 * placeholder con la info del turno; F5.1+ lo reemplaza con catálogo+carrito+cobro.
 */
export function PantallaTurno({
  empleado,
  token,
  cajaId,
  onBloquear,
  onCambiarCajero,
}: {
  empleado: Empleado;
  token: string;
  cajaId: string;
  onBloquear: () => void;
  onCambiarCajero: () => void;
}) {
  const [caja, setCaja] = useState<DatosCaja | null | undefined>(undefined);
  const [turno, setTurno] = useState<Turno | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  /** El formulario de apertura solo se muestra cuando el cajero lo pide desde el inicio. */
  const [abriendoTurno, setAbriendoTurno] = useState(false);
  // Sin turno el menú también abre (ver el return de `turno === null`). Con turno, el menú y sus
  // modales los lleva HomePos.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cambiarPinAbierto, setCambiarPinAbierto] = useState(false);
  const [impresoraAbierta, setImpresoraAbierta] = useState(false);
  // Los modales cierran con su propio Escape; el menú es una capa a pantalla completa sin él.
  useEscape(menuAbierto && turno === null ? () => setMenuAbierto(false) : null);

  useEffect(() => {
    let activo = true;
    Promise.all([leerCaja(token, cajaId), turnoAbiertoDeCaja(token, cajaId)])
      .then(([c, t]) => {
        if (!activo) return;
        setCaja(c);
        setTurno(t);
      })
      .catch((e) => {
        if (!activo) return;
        setError(e instanceof Error ? e.message : "Error");
        setCaja(null);
        setTurno(null);
      });
    return () => {
      activo = false;
    };
  }, [token, cajaId]);

  if (caja === undefined || turno === undefined) {
    return (
      <main className="flex h-screen items-center justify-center">
        <p className="text-sm text-ink-3">Cargando turno…</p>
      </main>
    );
  }

  if (!caja) {
    return (
      <main className="flex h-screen items-center justify-center p-6">
        <p className="text-sm text-danger">{error ?? "No se pudo cargar la caja."}</p>
      </main>
    );
  }

  // Sin turno abierto NO se salta directo a "Abrir turno": el cajero aterriza igual en el
  // inicio (ve su caja, su nombre, dónde está parado) y abre el turno cuando lo decide, con
  // el botón. Entrar con un formulario de fondo de caja encima era una interrupción que nadie
  // pidió — a veces solo se entra a consultar algo o a cambiar de cajero.
  if (turno === null) {
    /* SIN TURNO SOLO SE BLOQUEA VENDER.
     *
     * Vender sin turno es imposible, y no por una decisión de pantalla: `tickets.turno_id` es
     * NOT NULL, un ticket sin turno no existe en la base. Así que los accesos de venta (y los que
     * leen un turno: retiros, monitor, cuentas) no entran — pero RESPONDEN: tocarlos abre el
     * modal de apertura, que es justo el paso que falta para lo que el cajero acaba de pedir. Un
     * botón que no reacciona se lee como que el sistema se colgó.
     *
     * Todo lo demás sigue disponible. El menú abre su versión sin turno (cambiar de cajero,
     * bloquear, el PIN, las impresoras, actualizar, ayuda) en vez de mandar a elegir cajero, que
     * era lo que hacía el botón «Menú» aquí.
     *
     * El inicio queda SIEMPRE de fondo y la apertura va encima como modal: entrar con un
     * formulario a pantalla completa era una interrupción que nadie pidió.
     */
    const abrir = () => setAbriendoTurno(true);
    return (
      <>
        <PantallaInicio
          caja={caja}
          turno={null}
          empleado={empleado}
          nCuentasComedor={0}
          nCuentasPickup={0}
          nCuentasDomicilio={0}
          nEnEspera={0}
          onComedor={abrir}
          onParaLlevar={abrir}
          onPickup={abrir}
          onDomicilio={abrir}
          onMonitorVentas={abrir}
          onConsultarCuentas={abrir}
          onMovimientoCaja={abrir}
          onAbrirTurno={abrir}
          onCerrarTurno={abrir}
          onMenu={() => setMenuAbierto(true)}
        />
        {menuAbierto && (
          <MenuGeneral
            onCerrar={() => setMenuAbierto(false)}
            onCambiarCajero={onCambiarCajero}
            onBloquear={onBloquear}
            onCambiarPin={() => setCambiarPinAbierto(true)}
            onImpresora={() => setImpresoraAbierta(true)}
            ayuda={{ negocio: caja.negocioNombre, sucursal: caja.sucursalNombre, caja: caja.nombre, cajero: empleado.nombre }}
          />
        )}
        {cambiarPinAbierto && (
          <ModalCambiarPin token={token} onListo={() => setCambiarPinAbierto(false)} onCerrar={() => setCambiarPinAbierto(false)} />
        )}
        {impresoraAbierta && (
          <ModalConfigImpresora token={token} sucursalId={caja.sucursal_id} onCerrar={() => setImpresoraAbierta(false)} />
        )}
        {abriendoTurno && (
          <ModalAbrirTurno
            token={token}
            cajaId={cajaId}
            cajaNumero={caja.numero}
            vertical={caja.vertical}
            onTurnoAbierto={(t) => { setAbriendoTurno(false); setTurno(t); }}
            onCerrar={() => setAbriendoTurno(false)}
          />
        )}
      </>
    );
  }

  return (
    <HomePos
      empleado={empleado}
      caja={caja}
      turno={turno}
      token={token}
      onBloquear={onBloquear}
      onCambiarCajero={onCambiarCajero}
      onCerrarTurno={() => setTurno(null)}
    />
  );
}
