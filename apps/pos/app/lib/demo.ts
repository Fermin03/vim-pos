import { deviceClient, deviceEmail, encabezadosFuncion, urlFuncion } from "./supabase";
import { guardarIdent } from "./device-creds";

/** La caja compilada con NEXT_PUBLIC_VIM_DEMO=1 es la demo pública. */
export const MODO_DEMO = process.env.NEXT_PUBLIC_VIM_DEMO === "1";

/** localStorage: `{ activa: boolean, indice: number }` — el estado de la guía (Task 4). */
export const LLAVE_GUIA = "vimpos.demo.guia";

/**
 * El negocio de ejemplo de esta caja ya se borró (demo_limpiar, a las 24 h): la sesión guardada
 * sigue en el navegador, pero su usuario ya no existe. Un fallo de red o un 429 no cuentan.
 */
export async function demoCaducada(): Promise<boolean> {
  try {
    const { error } = await deviceClient.auth.getUser();
    return error?.status === 401 || error?.status === 403 || error?.status === 404;
  } catch {
    return false;
  }
}

/** Pide un negocio de ejemplo nuevo y abre la sesión del dispositivo. Rechaza con CUPO, DEMO_LLENA o DEMO_ERROR. */
export async function iniciarDemo(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(urlFuncion("demo-iniciar"), { method: "POST", headers: encabezadosFuncion(), body: "{}" });
  } catch {
    throw new Error("DEMO_ERROR");
  }
  const cuerpo = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; error?: string } | null;
  if (!res.ok || !cuerpo?.access_token || !cuerpo.refresh_token) {
    throw new Error(cuerpo?.error === "CUPO" || cuerpo?.error === "DEMO_LLENA" ? cuerpo.error : "DEMO_ERROR");
  }
  const { error } = await deviceClient.auth.setSession({ access_token: cuerpo.access_token, refresh_token: cuerpo.refresh_token });
  if (error) throw new Error("DEMO_ERROR");
  const email = await deviceEmail();
  if (email) guardarIdent({ email });
}
