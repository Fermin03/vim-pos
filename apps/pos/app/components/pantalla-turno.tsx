"use client";
import { useEffect, useState } from "react";
import { Button, StatusChip } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { TopbarPos } from "./topbar-pos";
import { AbrirTurno } from "./abrir-turno";
import { fmtMxn, leerCaja, turnoAbiertoDeCaja, type DatosCaja, type Turno } from "../lib/turno";

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
  onSimularExpiracion,
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

  // Placeholder operativo (F5.1+ reemplaza con catálogo/carrito/cobro)
  return (
    <div className="flex h-screen flex-col">
      <TopbarPos sucursal={caja.sucursalNombre} caja={caja.nombre} />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <StatusChip tone="success">Turno abierto</StatusChip>
        <h1 className="font-display text-2xl font-semibold tracking-tight">¡Hola, {empleado.nombre}!</h1>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-line bg-surface p-5 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Turno</div>
            <div className="mt-1 font-display text-lg font-bold tabular-nums">{turno.codigo_turno}</div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-5 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Fondo</div>
            <div className="mt-1 font-display text-lg font-bold tabular-nums">{fmtMxn(turno.fondo_inicial_mxn)}</div>
          </div>
        </div>

        <p className="max-w-md text-center text-sm text-ink-3">
          Turno abierto · RLS por tenant. El catálogo + carrito + cobro se construyen en F5.1+.
        </p>

        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="ghost" onClick={onBloquear}>Bloquear</Button>
          <Button variant="ghost" onClick={onCambiarCajero}>Cambiar cajero</Button>
          <Button variant="ghost" onClick={onSimularExpiracion}>Simular sesión expirada</Button>
        </div>
      </div>
    </div>
  );
}
