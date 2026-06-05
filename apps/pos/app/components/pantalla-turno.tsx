"use client";
import { useEffect, useState } from "react";
import { type Empleado } from "../lib/supabase";
import { AbrirTurno } from "./abrir-turno";
import { HomePos } from "./home-pos";
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

  if (turno === null) {
    return (
      <AbrirTurno
        empleado={empleado}
        token={token}
        cajaId={cajaId}
        cajaNumero={caja.numero}
        cajaLabel={caja.nombre}
        sucursalLabel={caja.sucursalNombre}
        onTurnoAbierto={setTurno}
        onCambiarCajero={onCambiarCajero}
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
