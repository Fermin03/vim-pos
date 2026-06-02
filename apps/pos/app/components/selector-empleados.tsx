"use client";
import { useEffect, useState } from "react";
import { TopbarPos } from "./topbar-pos";
import { listarEmpleados, type Empleado } from "../lib/supabase";

export const ROL_LABEL: Record<string, string> = {
  CAJERO: "Cajero",
  SUPERVISOR: "Supervisor",
  ADMIN: "Administrador",
  DUENO: "Dueño",
  PERSONAL: "Personal",
};

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/** Login en POS (P-002): shell + grid de usuarios de la sucursal (RLS bajo el dispositivo). */
export function SelectorEmpleados({
  sucursal,
  caja,
  onElegir,
  onDesvincular,
}: {
  sucursal: string;
  caja: string;
  onElegir: (e: Empleado) => void;
  onDesvincular: () => void;
}) {
  const [empleados, setEmpleados] = useState<Empleado[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    listarEmpleados()
      .then((e) => activo && setEmpleados(e))
      .catch(() => activo && setError("No se pudieron cargar los empleados."));
    return () => {
      activo = false;
    };
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <TopbarPos sucursal={sucursal} caja={caja} />

      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-8">
        <div className="w-full max-w-[720px]">
          <div className="mb-8 text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight">¿Quién está en caja?</h1>
            <p className="mt-1 text-sm text-ink-2">Toca tu usuario e ingresa tu PIN para empezar tu turno</p>
          </div>

          {error && (
            <p className="mb-6 text-center text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}

          {empleados === null && !error && (
            <p className="text-center text-sm text-ink-3">Cargando empleados…</p>
          )}

          {empleados && empleados.length === 0 && (
            <p className="text-center text-sm text-ink-3">No hay empleados activos en esta sucursal.</p>
          )}

          {empleados && empleados.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {empleados.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onElegir(e)}
                  className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-3 py-5 text-center transition-[border-color,transform] hover:border-ink active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                >
                  <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full border border-line bg-hover font-display text-[21px] font-semibold tracking-tight text-ink-2">
                    {iniciales(e.nombre)}
                  </span>
                  <span className="text-sm font-semibold leading-tight text-ink">{e.nombre}</span>
                  <span className="-mt-1 text-xs text-ink-3">{ROL_LABEL[e.rol] ?? "Empleado"}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={onDesvincular}
              className="border-b border-transparent text-[13px] font-medium text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2"
            >
              Desvincular este dispositivo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
