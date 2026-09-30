// El canal de soporte de VIM que ven TODOS los clientes (0142): en el menú del admin, en el menú
// de la caja y en su pantalla de bloqueo. Mismas reglas que los CHECK de `plataforma_soporte`, aquí
// para contestar con un error que se entienda antes de llegar a la base.
import { z } from "zod";
import { normalizarWhatsapp, whatsappValido, type Soporte } from "@vim/db/soporte";

export type { Soporte };

/** El PUT es el registro COMPLETO (como en datos de pago): un cuerpo parcial se rechaza. */
export const CuerpoSoporte = z.object({
  whatsapp: z.string(),
  horario: z.string().nullable(),
  correo: z.string().nullable(),
});

const texto = (v: string | null): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export function leerSoporte(body: Record<string, unknown>): { ok: true; datos: Soporte } | { ok: false; campo: string; detalle: string } {
  const r = CuerpoSoporte.safeParse(body);
  if (!r.success) {
    const campo = String(r.error.issues[0]?.path[0] ?? "cuerpo");
    return { ok: false, campo, detalle: `Manda el registro completo: falta "${campo}" o no es texto.` };
  }
  const whatsapp = normalizarWhatsapp(r.data.whatsapp.trim());
  // Sin WhatsApp no hay soporte: el campo es obligatorio, a diferencia de datos de pago.
  if (!whatsappValido(whatsapp)) {
    return { ok: false, campo: "whatsapp", detalle: "El WhatsApp va en dígitos con lada de país, p. ej. 525665083346." };
  }
  const horario = texto(r.data.horario);
  if (horario && (horario.length < 2 || horario.length > 80)) return { ok: false, campo: "horario", detalle: "El horario va de 2 a 80 caracteres." };
  const correo = texto(r.data.correo);
  if (correo && (correo.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo))) return { ok: false, campo: "correo", detalle: "El correo no parece válido." };
  return { ok: true, datos: { whatsapp, horario, correo } };
}
