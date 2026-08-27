"use client";
import { useEffect, useState } from "react";
import { type Empleado } from "../lib/supabase";
import { AbrirTurno } from "./abrir-turno";
import { HomePos } from "./home-pos";
import { PantallaInicio } from "./pantalla-inicio";
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
  onSimularExpiracion: _onSimularExpiracion,
}: {
  empleado: Empleado;
  token: string;
  cajaId: string;
  onBloquear: () => void;
  onCambiarCajero: () => void;
  onSimularExpiracion: () => void;
}) {
  const [caja, setCaja] = useState<DatosCaja | null | undefined>(undefined);
  const [turno, setTurno] = useState<Turno | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  /** El formulario de apertura solo se muestra cuando el cajero lo pide desde el inicio. */
  const [abriendoTurno, setAbriendoTurno] = useState(false);

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
    if (!abriendoTurno) {
      /* EL MENÚ RESPONDE SIEMPRE.
       *
       * Antes, sin turno, los ocho accesos llevaban a `noop`: el cajero tocaba
       * "Comedor" y no pasaba nada. Un botón que no reacciona se lee como que el
       * sistema se colgó, y el aviso de "abre el turno" quedaba abajo, fuera de
       * donde estaba mirando.
       *
       * No es que faltara cablearlos: vender sin turno es IMPOSIBLE, y no por una
       * decisión de pantalla — `tickets.turno_id` es NOT NULL, así que un ticket sin
       * turno no existe en la base. Lo que se puede arreglar es la reacción: tocar
       * cualquiera de ellos lleva a abrir el turno, que es exactamente el paso que
       * falta para hacer lo que el cajero acaba de pedir.
       */
      const abrir = () => setAbriendoTurno(true);
      return (
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
          onCorteX={abrir}
          onAbrirTurno={abrir}
          onCerrarTurno={abrir}
          onMenu={onCambiarCajero}
        />
      );
    }
    return (
      <AbrirTurno
        empleado={empleado}
        token={token}
        cajaId={cajaId}
        cajaNumero={caja.numero}
        cajaLabel={caja.nombre}
        sucursalLabel={caja.sucursalNombre}
        negocioLabel={caja.negocioNombre}
        vertical={caja.vertical}
        onTurnoAbierto={(t) => { setAbriendoTurno(false); setTurno(t); }}
        onVolver={() => setAbriendoTurno(false)}
      />
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
