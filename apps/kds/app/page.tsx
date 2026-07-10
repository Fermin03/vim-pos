"use client";
import { useCallback, useEffect, useState } from "react";
import {
  deviceEmail,
  deviceSignIn,
  deviceSignOut,
  deviceToken,
  cajaIdFromEmail,
  leerCreds,
  olvidarCreds,
  leerCaja,
  type CajaKds,
  VincularDispositivo,
  PantallaKds,
} from "@vim/kds-core";

// App dedicada de COCINA (cliente delgado del hub). Arranca con la sesión de DISPOSITIVO y entra
// directo a Cocina — sin PIN de empleado. Si no hay dispositivo vinculado, pide vincularlo una vez.
type Estado =
  | { paso: "boot" }
  | { paso: "vincular" }
  | { paso: "cocina"; token: string; caja: CajaKds }
  | { paso: "sin-caja" };

export default function Page() {
  const [estado, setEstado] = useState<Estado>({ paso: "boot" });

  const entrarCocina = useCallback(async () => {
    // 1) Sesión de dispositivo: viva, o reabierta desde las credenciales guardadas.
    let email = await deviceEmail();
    if (!email) {
      const creds = leerCreds();
      if (creds) {
        try {
          await deviceSignIn(creds.email, creds.password);
          email = creds.email;
        } catch {
          /* credenciales inválidas → re-vincular */
        }
      }
    }
    if (!email) {
      setEstado({ paso: "vincular" });
      return;
    }
    // 2) Caja del dispositivo → sucursal → comandas.
    const cid = cajaIdFromEmail(email);
    if (!cid) {
      setEstado({ paso: "sin-caja" });
      return;
    }
    const tok = await deviceToken();
    if (!tok) {
      setEstado({ paso: "vincular" });
      return;
    }
    try {
      const caja = await leerCaja(tok, cid);
      setEstado({ paso: "cocina", token: tok, caja });
    } catch {
      // Sin red con el hub o token vencido → volver a vincular/reintentar.
      setEstado({ paso: "vincular" });
    }
  }, []);

  useEffect(() => {
    entrarCocina();
  }, [entrarCocina]);

  const desvincular = useCallback(async () => {
    await deviceSignOut();
    olvidarCreds();
    setEstado({ paso: "vincular" });
  }, []);

  switch (estado.paso) {
    case "boot":
      return (
        <main className="flex h-screen items-center justify-center bg-[#1A1A1E] p-6 text-[#A0A0A6]">
          <p className="text-sm">Iniciando cocina…</p>
        </main>
      );

    case "vincular":
      return <VincularDispositivo onVinculado={entrarCocina} />;

    case "sin-caja":
      return (
        <main className="flex h-screen flex-col items-center justify-center gap-4 bg-[#1A1A1E] p-6 text-center">
          <p className="text-sm text-[#FF8080]">Este dispositivo no tiene una caja asociada.</p>
          <button
            type="button"
            onClick={desvincular}
            className="h-10 rounded border border-[#3A3A42] px-4 text-sm font-semibold text-[#C8C8CC] hover:text-white"
          >
            Re-vincular
          </button>
        </main>
      );

    case "cocina":
      return <PantallaKds token={estado.token} caja={estado.caja} onSalir={desvincular} />;
  }
}
