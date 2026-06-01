"use client";
import { useState, useEffect } from "react";
import { Button, PinKeypad, StatusChip } from "@vim/ui/styles";
import { pinLogin, employeeClient } from "./lib/supabase";

// DEV: empleado y caja sembrados por el fixture (seed.sql). En F4 el selector real
// listará los empleados de la sucursal vía la sesión de dispositivo.
const DEMO_EMPLEADO = { id: "99999999-0000-0000-0000-000000000001", nombre: "María G." };
const DEMO_CAJA = "99999999-0000-0000-0000-0000000000cc";

type Sesion = { nombre: string; token: string };

export default function Page() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onPin(pin: string) {
    setCargando(true);
    setError(null);
    try {
      const r = await pinLogin(DEMO_EMPLEADO.id, pin, DEMO_CAJA);
      setSesion({ nombre: r.usuario.nombre, token: r.access_token });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setError(msg === "PIN_INCORRECTO" ? "PIN incorrecto" : msg);
    } finally {
      setCargando(false);
    }
  }

  if (sesion) return <PosHome nombre={sesion.nombre} token={sesion.token} onSalir={() => setSesion(null)} />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <header className="flex flex-col items-center gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink">
          <span className="font-display text-lg font-bold text-white">V</span>
        </div>
        <h1 className="font-display text-xl font-semibold">Knock-Out Burger</h1>
        <p className="text-sm text-ink-3">Sucursal León Centro</p>
      </header>

      <div className="flex flex-col items-center gap-1">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-hover font-display font-semibold text-ink-2">
          MG
        </div>
        <p className="mt-1 font-medium">{DEMO_EMPLEADO.nombre}</p>
        <p className="text-sm text-ink-3">Cajera · ingresa tu PIN</p>
      </div>

      <PinKeypad length={4} onComplete={onPin} error={error} disabled={cargando} />
    </main>
  );
}

function PosHome({ nombre, token, onSalir }: { nombre: string; token: string; onSalir: () => void }) {
  const [sucursal, setSucursal] = useState<string | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");

  // Prueba viva de RLS: con el token del empleado, leer sucursales debe devolver SOLO su tenant.
  useEffect(() => {
    let activo = true;
    employeeClient(token)
      .from("sucursales")
      .select("nombre")
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) { setEstado("error"); return; }
        setSucursal(data?.map((s: { nombre: string }) => s.nombre).join(", ") ?? "—");
        setEstado("ok");
      });
    return () => { activo = false; };
  }, [token]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <StatusChip tone="success">Sesión iniciada</StatusChip>
      <h1 className="font-display text-2xl font-semibold">¡Hola, {nombre}!</h1>
      <div className="rounded-lg border border-line p-5 text-center">
        <p className="text-sm text-ink-3">Sucursales visibles (RLS por tenant):</p>
        <p className="mt-1 font-display text-lg font-semibold">
          {estado === "cargando" ? "Cargando…" : estado === "error" ? "Error" : sucursal}
        </p>
      </div>
      <p className="max-w-xs text-center text-sm text-ink-3">
        Esqueleto andante: PIN → JWT de empleado → datos del tenant vía RLS. El POS operativo va en F5.
      </p>
      <Button variant="ghost" onClick={onSalir}>Salir</Button>
    </main>
  );
}
