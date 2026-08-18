"use client";
import { employeeClient } from "./supabase";

/**
 * Bitácora de errores: manda a `errores_app` lo que truena, para que VIM lo vea en el panel.
 *
 * Hasta ahora, cuando el POS fallaba en el restaurante el error moría en la consola de ESA
 * computadora. VIM se enteraba por teléfono y sin saber qué había pasado.
 *
 * POR QUÉ UN CONTEXTO DE MÓDULO Y NO UN PARÁMETRO. Los puntos donde de verdad hay que reportar
 * —`error.tsx`, `global-error.tsx`— son fronteras de React que no reciben props de la app: no
 * tienen token ni saben de qué tenant son. La sesión se registra una vez al entrar al POS y
 * desde ahí cualquier punto puede reportar.
 *
 * Reglas, todas por la misma razón (esto corre DENTRO de un fallo, no puede provocar otro):
 *   · nunca lanza;
 *   · nunca bloquea a quien la llama;
 *   · sin contexto registrado no reporta — sin token no hay tenant y RLS lo rechazaría.
 *
 * En la caja escribe en el Postgres LOCAL (el POS habla con el gateway local) y el escritorio
 * lo sube en su ciclo de sincronización. En el POS web va directo a la nube.
 */

type ContextoSesion = {
  token: string;
  tenantId: string;
  sucursalId: string | null;
  cajaId: string | null;
  usuarioId: string | null;
};

let sesion: ContextoSesion | null = null;

/** Registra quién está operando. Lo llama el POS al montar, y lo limpia al salir. */
export function fijarContextoErrores(ctx: ContextoSesion | null): void {
  sesion = ctx;
}

export type ContextoError = Record<string, string | number | boolean | null>;

/** Recorta para que un stack enorme no llene la tabla ni el panel. */
function recortar(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export async function reportarError(
  error: unknown,
  contexto: ContextoError = {},
  app: "pos" | "kds" = "pos",
): Promise<void> {
  try {
    if (!sesion) return;
    const err = error instanceof Error ? error : new Error(String(error));
    await employeeClient(sesion.token)
      .from("errores_app")
      .insert({
        tenant_id: sesion.tenantId,
        app,
        mensaje: recortar(err.message, 500) ?? "(sin mensaje)",
        stack: recortar(err.stack, 4000),
        contexto: {
          ...contexto,
          ruta: typeof window !== "undefined" ? window.location.pathname : null,
          escritorio: typeof window !== "undefined" && (window as { __VIM_DESKTOP?: boolean }).__VIM_DESKTOP === true,
        },
        sucursal_id: sesion.sucursalId,
        caja_id: sesion.cajaId,
        usuario_id: sesion.usuarioId,
      });
  } catch {
    // Silencio deliberado: ya estamos manejando un fallo.
  }
}

/** Para puntos de captura que no pueden esperar (boundaries de React, handlers de window). */
export function reportarErrorSinEsperar(error: unknown, contexto: ContextoError = {}): void {
  reportarError(error, contexto).catch(() => {});
}
