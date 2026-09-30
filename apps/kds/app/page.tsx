"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deviceSignIn,
  deviceSignOut,
  sesionDispositivo,
  cajaIdFromEmail,
  leerCredsLegadas,
  guardarIdent,
  olvidarCreds,
  leerCaja,
  type CajaKds,
  VincularDispositivo,
  PantallaKds,
} from "@vim/kds-core";

// App dedicada de COCINA (cliente delgado del hub). Arranca con la sesión de DISPOSITIVO y entra
// directo a Cocina — sin PIN de empleado. Si no hay dispositivo vinculado, pide vincularlo una vez.
//
// El arranque NUNCA debe colgarse: si la caja (hub) no responde, todas las llamadas de red van con
// timeout y caemos a un estado de "reconectando" que reintenta solo. Así la pantalla de cocina se
// recupera sola cuando la caja se reinicia, sin quedarse en "Iniciando cocina…" para siempre.
type Estado =
  | { paso: "boot" }
  | { paso: "vincular" }
  | { paso: "cocina"; token: string; caja: CajaKds }
  | { paso: "sin-caja" }
  | { paso: "reconectando"; msg: string };

const TIMEOUT_MS = 7000;
const REINTENTO_MS = 4000;

/** En esta pantalla salir ES desvincular: volver cuesta teclear en la tele el identificador y la
 *  clave del dispositivo. Por eso se pregunta antes (revisión de diseño sep 2026, kds.md P1). */
const CONFIRMAR_DESVINCULAR = {
  titulo: "¿Desvincular esta pantalla?",
  mensaje:
    "La cocina deja de recibir comandas en esta pantalla. Para volver a usarla hay que vincularla otra vez con el identificador y la clave del dispositivo.",
  boton: "Desvincular",
};

/** ¿El fallo es "no llegué a la caja" (y no "la caja dijo que no")? Mismo criterio que la
 *  pantalla de vinculación. */
function esErrorDeRed(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /fetch|network|load failed|ECONN|timeout|abort|NetworkError|ErrorHubSinRespuesta/i.test(msg);
}

/** Corre una promesa con límite de tiempo (evita que una llamada al hub caído cuelgue el arranque). */
function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export default function Page() {
  const [estado, setEstado] = useState<Estado>({ paso: "boot" });
  const [confirmandoCambio, setConfirmandoCambio] = useState(false);
  const activo = useRef(true);

  const entrarCocina = useCallback(async () => {
    try {
      // 1) Sesión persistida de supabase-js (SEC CN-006, B2-5). Ya no se re-loguea con una
      //    contraseña guardada: el deviceClient de cocina aborta las llamadas de auth que tardan
      //    (fetchConTimeoutAuth), así que getSession()/refresh no se cuelgan con el hub caído.
      //    `sesionDispositivo` lanza si el hub no contestó → "reconectando"; null → vincular.
      let s = await conTimeout(sesionDispositivo(), TIMEOUT_MS);
      // 2) Migración de teles ya instaladas: traen la contraseña del formato viejo. Si no hay
      //    sesión viva, se usa UNA vez para abrirla; en cuanto hay sesión, `guardarIdent` la borra.
      if (!s) {
        const legadas = leerCredsLegadas();
        if (legadas) {
          try {
            await conTimeout(deviceSignIn(legadas.email, legadas.password), TIMEOUT_MS);
            s = await conTimeout(sesionDispositivo(), TIMEOUT_MS);
          } catch (e) {
            // Hub caído: se conserva la contraseña legada para el siguiente intento.
            if (esErrorDeRed(e)) throw e;
            // La caja la rechazó (clave rotada): ya no sirve; se olvida y se pide vincular.
            guardarIdent({ email: legadas.email });
            s = null;
          }
        }
      }
      if (!activo.current) return;
      if (!s) {
        setEstado({ paso: "vincular" });
        return;
      }
      guardarIdent({ email: s.email }); // hay sesión: fuera cualquier contraseña del disco
      // 2) Caja del dispositivo → sucursal → comandas.
      const cid = cajaIdFromEmail(s.email);
      if (!cid) {
        setEstado({ paso: "sin-caja" });
        return;
      }
      const caja = await conTimeout(leerCaja(s.token, cid), TIMEOUT_MS);
      if (!activo.current) return;
      setEstado({ paso: "cocina", token: s.token, caja });
    } catch {
      // Hub caído / sin red / credenciales que ya no responden → reconectar solo.
      if (activo.current) setEstado({ paso: "reconectando", msg: "No se pudo conectar con la caja. Reintentando…" });
    }
  }, []);

  useEffect(() => {
    activo.current = true;
    entrarCocina();
    return () => {
      activo.current = false;
    };
  }, [entrarCocina]);

  // Reintento automático mientras esté "reconectando" (la cocina se recupera cuando la caja vuelve).
  useEffect(() => {
    if (estado.paso !== "reconectando") return;
    const id = setTimeout(() => entrarCocina(), REINTENTO_MS);
    return () => clearTimeout(id);
  }, [estado, entrarCocina]);

  const desvincular = useCallback(async () => {
    try { await conTimeout(deviceSignOut(), TIMEOUT_MS); } catch { /* ignora */ }
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

    case "reconectando":
      return (
        <main className="flex h-screen flex-col items-center justify-center gap-4 bg-[#1A1A1E] p-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3A3A42] border-t-[#2E7D52]" />
          <p className="text-sm text-[#A0A0A6]">{estado.msg}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setEstado({ paso: "boot" }); entrarCocina(); }}
              className="h-10 rounded bg-[#2E7D52] px-4 text-sm font-semibold text-white hover:bg-[#267045]"
            >
              Reintentar ahora
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoCambio(true)}
              className="h-10 rounded border border-[#3A3A42] px-4 text-sm font-semibold text-[#C8C8CC] hover:text-white"
            >
              Cambiar de caja
            </button>
          </div>
          {/* Mientras la caja no responde es fácil tocar "Cambiar de caja" creyendo que reconecta:
              en realidad desvincula. Se pregunta igual que el botón de salir de la cocina. */}
          {confirmandoCambio && (
            <div className="mt-4 max-w-[440px] rounded-lg border border-[#3A3A42] bg-[#242429] p-5 text-left" role="alertdialog" aria-labelledby="kds-cambio-titulo">
              <h2 id="kds-cambio-titulo" className="text-lg font-bold text-[#F0F0EC]">{CONFIRMAR_DESVINCULAR.titulo}</h2>
              <p className="mt-1 text-sm text-[#A0A0A6]">{CONFIRMAR_DESVINCULAR.mensaje}</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirmandoCambio(false)}
                  className="h-11 flex-1 rounded border border-[#3A3A42] text-sm font-semibold text-[#F0F0EC]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmandoCambio(false); void desvincular(); }}
                  className="h-11 flex-1 rounded bg-[#C0392B] text-sm font-semibold text-white"
                >
                  {CONFIRMAR_DESVINCULAR.boton}
                </button>
              </div>
            </div>
          )}
        </main>
      );

    case "vincular":
      return <VincularDispositivo onVinculado={() => { setEstado({ paso: "boot" }); entrarCocina(); }} />;

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
      return (
        <PantallaKds
          token={estado.token}
          caja={estado.caja}
          onSalir={desvincular}
          etiquetaSalir="Desvincular"
          confirmarSalir={CONFIRMAR_DESVINCULAR}
        />
      );
  }
}
