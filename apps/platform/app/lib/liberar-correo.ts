import { z } from "zod";

/**
 * Liberar un correo (0154, ADR 0028). Lo puro de la ruta: la forma de lo que devuelve la base y
 * cómo se traduce un rechazo, para probarlo sin Next ni Supabase.
 *
 * El caso: alguien fue empleado de un negocio, lo desactivaron, y ahora quiere registrarse con el
 * mismo correo. El operador busca por correo (no sabe en qué negocio trabajó) y elimina esa cuenta
 * de empleado: el correo queda libre y el historial del negocio conserva el nombre.
 */

export const CuerpoCorreo = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("buscar"), email: z.string().trim().email().max(255) }),
  z.object({
    accion: z.literal("liberar"),
    email: z.string().trim().email().max(255),
    usuario_id: z.string().guid(),
    motivo: z.string().trim().min(10),
  }),
]);

const Bloqueo = z.object({ codigo: z.string(), mensaje: z.string() });

export const CuentaPorCorreo = z.discriminatedUnion("encontrado", [
  z.object({ encontrado: z.literal(false) }),
  z.object({
    encontrado: z.literal(true),
    usuario_id: z.string(),
    nombre: z.string(),
    tenant_id: z.string().nullable(),
    accesos: z.array(z.object({
      tenant_id: z.string(), negocio: z.string(), estado_negocio: z.string(), rol: z.string(), activo: z.boolean(),
    })),
    bloqueos: z.array(Bloqueo),
    puede_eliminar: z.boolean(),
  }),
]);
export type CuentaPorCorreo = z.infer<typeof CuentaPorCorreo>;

/** Los rechazos que la base dice con código (`CODIGO: mensaje`) y con qué estado HTTP salen. */
const ESTADO_POR_CODIGO: Record<string, number> = {
  USUARIO_NO_EXISTE: 404,
  MOTIVO_REQUERIDO: 400,
  ES_UNO_MISMO: 409,
  ES_DUENO: 409,
  ES_DISPOSITIVO: 409,
  ES_OPERADOR: 409,
  ACCESO_A_OTRO_NEGOCIO: 409,
  SIGUE_ACTIVO: 409,
};

/**
 * El error de la RPC → código, texto para el operador y estado HTTP. Solo pasan tal cual los
 * mensajes que escribimos nosotros en la migración; lo demás sale con un texto fijo (`crudo`) y el
 * original se queda en el registro del servidor.
 */
export function leerRechazoCorreo(error: { message: string }): { codigo: string; detalle: string; status: number; crudo: boolean } {
  const m = /^([A-Z_]+):\s*(.+)$/s.exec(error.message.trim());
  const status = m ? ESTADO_POR_CODIGO[m[1]!] : undefined;
  if (m && status !== undefined) return { codigo: m[1]!, detalle: m[2]!.trim(), status, crudo: false };
  return {
    codigo: "ERROR_AL_LIBERAR",
    detalle: "No se cambió nada: la base rechazó la operación. Quedó registrado para revisarlo.",
    status: 500,
    crudo: true,
  };
}
