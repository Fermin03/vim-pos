// Datos del registro público (/registro del admin → Edge Function signup-tenant). 0142, ADR 0022.
//
// El registro es público: cualquiera llega desde el sitio. Por eso los datos de contacto son
// OBLIGATORIOS —nombre, WhatsApp, correo y ciudad—: si algo sale mal con la cuenta, VIM tiene que
// poder hablar con el dueño. La Edge Function vuelve a validar lo mismo a mano (el código Deno no
// importa paquetes del monorepo); este esquema es el del formulario, para contestar antes de enviar.
import { z } from "zod";

/**
 * Teléfono de México en los 10 dígitos de siempre, como se guardan los teléfonos en el proyecto.
 * Acepta lo que la gente escribe: espacios, guiones, "+52", "521" (el prefijo viejo de celular).
 * Null si no quedan exactamente 10 dígitos.
 */
export function telefonoMx10(v: string): string | null {
  let d = v.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  return /^[0-9]{10}$/.test(d) ? d : null;
}

export const CODIGO_NEGOCIO = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;

/** Paso 2 del formulario: el dueño. Los mensajes van tal cual a la pantalla. */
export const EsquemaDuenoRegistro = z.object({
  nombre_owner: z.string().trim().min(2, "Escribe tu nombre.").max(150, "El nombre es muy largo."),
  telefono_owner: z
    .string()
    .transform((v, ctx) => {
      const t = telefonoMx10(v);
      if (!t) ctx.addIssue({ code: "custom", message: "Tu WhatsApp va en 10 dígitos, p. ej. 477 123 4567." });
      return t ?? "";
    }),
  email_owner: z.string().trim().toLowerCase().email("Revisa tu correo: parece que le falta algo.").max(254),
  ciudad: z.string().trim().min(2, "Escribe tu ciudad.").max(80, "La ciudad es muy larga."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72, "La contraseña es muy larga."),
  acepta_terminos: z.literal(true, { error: "Para crear tu cuenta, acepta los términos y el aviso de privacidad." }),
});

export type DuenoRegistro = z.infer<typeof EsquemaDuenoRegistro>;

/** Primer mensaje de error del esquema, o null si todo está bien. */
export function errorDeRegistro(d: unknown): string | null {
  const r = EsquemaDuenoRegistro.safeParse(d);
  return r.success ? null : (r.error.issues[0]?.message ?? "Revisa los datos.");
}
