"use client";
import { useCallback, useEffect, useState } from "react";
import {
  deviceEmail,
  deviceSignIn,
  deviceSignOut,
  cajaIdFromEmail,
  segundosParaExpirar,
  type Empleado,
  type PinLoginResult,
} from "./lib/supabase";
import { leerCreds, olvidarCreds } from "./lib/device-creds";
import { VincularDispositivo } from "./components/vincular-dispositivo";
import { SelectorEmpleados } from "./components/selector-empleados";
import { ModalPin } from "./components/modal-pin";
import { PantallaBloqueo } from "./components/pantalla-bloqueo";
import { ModalSesionExpirada } from "./components/modal-sesion-expirada";
import { PosHome } from "./components/pos-home";

// Etiquetas de la sucursal/caja del fixture (DEV). En F5 saldrán de la sesión real.
const SUCURSAL_DEV = "Sucursal León Centro";
const CAJA_DEV = "Caja 01";

type Estado =
  | { paso: "boot" }
  | { paso: "vincular" }
  | { paso: "selector"; pinPara: Empleado | null }
  | { paso: "operando"; empleado: Empleado; token: string }
  | { paso: "bloqueo"; empleado: Empleado }
  | { paso: "expirada"; empleado: Empleado };

export default function Page() {
  const [estado, setEstado] = useState<Estado>({ paso: "boot" });
  const [cajaId, setCajaId] = useState<string | null>(null);

  // ── Arranque del dispositivo (Parte 1F §2.1) ────────────────────────────────
  useEffect(() => {
    let activo = true;
    (async () => {
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
      if (!activo) return;
      if (email) {
        setCajaId(cajaIdFromEmail(email));
        setEstado({ paso: "selector", pinPara: null });
      } else {
        setEstado({ paso: "vincular" });
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  const trasVincular = useCallback(async () => {
    const email = await deviceEmail();
    setCajaId(email ? cajaIdFromEmail(email) : null);
    setEstado({ paso: "selector", pinPara: null });
  }, []);

  const desvincular = useCallback(async () => {
    await deviceSignOut();
    olvidarCreds();
    setCajaId(null);
    setEstado({ paso: "vincular" });
  }, []);

  const trasPin = useCallback((empleado: Empleado, r: PinLoginResult) => {
    setEstado({ paso: "operando", empleado, token: r.access_token });
  }, []);

  // ── Vigilancia de expiración del token de empleado (Parte 1F §2.3, P-012) ────
  useEffect(() => {
    if (estado.paso !== "operando") return;
    const restante = segundosParaExpirar(estado.token);
    if (restante <= 0) {
      setEstado({ paso: "expirada", empleado: estado.empleado });
      return;
    }
    const id = setTimeout(
      () => setEstado({ paso: "expirada", empleado: estado.empleado }),
      restante * 1000,
    );
    return () => clearTimeout(id);
  }, [estado]);

  const sinCaja = (
    <main className="flex h-screen items-center justify-center p-6">
      <p className="text-sm text-danger">Dispositivo sin caja asociada. Re-vincula.</p>
    </main>
  );

  switch (estado.paso) {
    case "boot":
      return (
        <main className="flex h-screen items-center justify-center p-6">
          <p className="text-sm text-ink-3">Iniciando dispositivo…</p>
        </main>
      );

    case "vincular":
      return <VincularDispositivo onVinculado={trasVincular} />;

    case "selector":
      return (
        <>
          <SelectorEmpleados
            sucursal={SUCURSAL_DEV}
            caja={CAJA_DEV}
            onElegir={(empleado) => setEstado({ paso: "selector", pinPara: empleado })}
            onDesvincular={desvincular}
          />
          {estado.pinPara &&
            (cajaId ? (
              <ModalPin
                empleado={estado.pinPara}
                cajaId={cajaId}
                onExito={(r) => trasPin(estado.pinPara!, r)}
                onCerrar={() => setEstado({ paso: "selector", pinPara: null })}
              />
            ) : (
              sinCaja
            ))}
        </>
      );

    case "operando":
      return (
        <PosHome
          empleado={estado.empleado}
          token={estado.token}
          sucursal={SUCURSAL_DEV}
          caja={CAJA_DEV}
          onBloquear={() => setEstado({ paso: "bloqueo", empleado: estado.empleado })}
          onCambiarCajero={() => setEstado({ paso: "selector", pinPara: null })}
          onSimularExpiracion={() => setEstado({ paso: "expirada", empleado: estado.empleado })}
        />
      );

    case "bloqueo":
      if (!cajaId) return sinCaja;
      return (
        <PantallaBloqueo
          empleado={estado.empleado}
          cajaId={cajaId}
          caja={CAJA_DEV}
          onExito={(r) => trasPin(estado.empleado, r)}
          onCambiarUsuario={() => setEstado({ paso: "selector", pinPara: null })}
        />
      );

    case "expirada":
      if (!cajaId) return sinCaja;
      return (
        <ModalSesionExpirada
          empleado={estado.empleado}
          cajaId={cajaId}
          onExito={(r) => trasPin(estado.empleado, r)}
          onCerrarSesion={() => setEstado({ paso: "selector", pinPara: null })}
        />
      );
  }
}
