"use client";
import { useEffect, useState } from "react";
import { Button, StatusChip } from "@vim/ui/styles";
import { employeeClient, type Empleado } from "../lib/supabase";
import { TopbarPos } from "./topbar-pos";

/**
 * Home operativo (esqueleto andante). Prueba viva: con el token del empleado, leer
 * sucursales devuelve SOLO su tenant (RLS). Acciones de auth: bloquear, cambiar
 * cajero, y (solo DEV) simular expiración de sesión.
 */
export function PosHome({
  empleado,
  token,
  sucursal,
  caja,
  onBloquear,
  onCambiarCajero,
  onSimularExpiracion,
}: {
  empleado: Empleado;
  token: string;
  sucursal: string;
  caja: string;
  onBloquear: () => void;
  onCambiarCajero: () => void;
  onSimularExpiracion: () => void;
}) {
  const [sucursalesRls, setSucursalesRls] = useState<string | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");

  useEffect(() => {
    let activo = true;
    employeeClient(token)
      .from("sucursales")
      .select("nombre")
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          setEstado("error");
          return;
        }
        setSucursalesRls(data?.map((s: { nombre: string }) => s.nombre).join(", ") ?? "—");
        setEstado("ok");
      });
    return () => {
      activo = false;
    };
  }, [token]);

  return (
    <div className="flex h-screen flex-col">
      <TopbarPos sucursal={sucursal} caja={caja} />

      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <StatusChip tone="success">Sesión iniciada</StatusChip>
        <h1 className="font-display text-2xl font-semibold tracking-tight">¡Hola, {empleado.nombre}!</h1>

        <div className="rounded-lg border border-line p-5 text-center">
          <p className="text-sm text-ink-3">Sucursales visibles (RLS por tenant):</p>
          <p className="mt-1 font-display text-lg font-semibold">
            {estado === "cargando" ? "Cargando…" : estado === "error" ? "Error" : sucursalesRls}
          </p>
        </div>

        <p className="max-w-xs text-center text-sm text-ink-3">
          Esqueleto andante: dispositivo → PIN → JWT de empleado → datos del tenant vía RLS.
          El POS operativo va en F5.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="ghost" onClick={onBloquear}>
            Bloquear
          </Button>
          <Button variant="ghost" onClick={onCambiarCajero}>
            Cambiar cajero
          </Button>
          <Button variant="ghost" onClick={onSimularExpiracion}>
            Simular sesión expirada
          </Button>
        </div>
      </div>
    </div>
  );
}
