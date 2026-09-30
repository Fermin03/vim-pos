"use client";
// Llamadas del registro público a la Edge Function signup-tenant (0142, ADR 0022). Pública: va con
// la anon key, igual que antes. La función valida todo otra vez; aquí solo se arma el cuerpo.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type RespuestaRegistro = { ok: boolean; status: number; error?: string; detalle?: string; correoEnviado?: boolean };

/** Mensajes de la función, como los diría el dueño. */
export const ERRORES_REGISTRO: Record<string, string> = {
  CODIGO_YA_USADO: "Esa dirección ya la usa otro negocio. Prueba con otra.",
  CODIGO_INVALIDO: "La dirección solo lleva minúsculas, números y guiones (de 3 a 50).",
  EMAIL_INVALIDO: "Revisa tu correo: parece que le falta algo.",
  TELEFONO_INVALIDO: "Tu WhatsApp va en 10 dígitos, p. ej. 477 123 4567.",
  CIUDAD_INVALIDA: "Escribe tu ciudad.",
  NOMBRE_OWNER_INVALIDO: "Escribe tu nombre.",
  TERMINOS_REQUERIDOS: "Para crear tu cuenta, acepta los términos y el aviso de privacidad.",
  CAPTCHA_INVALIDO: "No pudimos comprobar que no eres un robot. Espera un momento e intenta de nuevo.",
  DEMASIADOS_INTENTOS: "Hubo demasiados intentos desde esta conexión. Espera un rato e intenta de nuevo.",
  NO_DISPONIBLE: "El registro no está disponible en este momento. Intenta de nuevo en unos minutos.",
  PASSWORD_DEBIL: "La contraseña debe tener al menos 8 caracteres.",
  PASSWORD_LARGA: "La contraseña es muy larga (máximo 72 caracteres).",
  VERTICAL_INVALIDA: "Elige el tipo de negocio.",
  FALTAN_CAMPOS: "Faltan datos. Revisa el formulario.",
};

async function llamar(cuerpo: Record<string, unknown>): Promise<RespuestaRegistro> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/signup-tenant`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detalle?: string; correo_enviado?: boolean };
  return { ok: res.ok && data.ok === true, status: res.status, error: data.error, detalle: data.detalle, correoEnviado: data.correo_enviado };
}

export function registrarNegocio(d: {
  codigo: string;
  nombre_comercial: string;
  vertical: string;
  nombre_owner: string;
  telefono_owner: string;
  email_owner: string;
  ciudad: string;
  password: string;
  acepta_terminos: boolean;
  captcha: string;
}): Promise<RespuestaRegistro> {
  return llamar(d);
}

/** Reenvía el correo de confirmación. La función contesta igual exista o no la cuenta. */
export function reenviarConfirmacion(email: string, captcha: string): Promise<RespuestaRegistro> {
  return llamar({ accion: "reenviar", email: email.trim().toLowerCase(), captcha });
}
