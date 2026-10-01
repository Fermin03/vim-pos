// El acceso del dueño de un negocio a su panel: ¿ya confirmó su correo?, y si no, qué correo hay
// que reenviarle (roadmap A5). Lógica pura, aparte de la ruta para poder probarla.
//
// HAY DOS CAMINOS DE ALTA y cada uno manda un correo distinto:
//
//   · VIM lo da de alta desde el panel (`provisionar-tenant`): Auth le manda una INVITACIÓN
//     (`inviteUserByEmail`), cuyo enlace aterriza en /establecer-acceso para que fije su contraseña.
//   · Se registra solo (`signup-tenant`): él ya puso su contraseña y Auth le manda la
//     CONFIRMACIÓN de registro (`resend` tipo `signup`), cuyo enlace aterriza en /cuenta-confirmada.
//
// Reenviar el equivocado no sirve: una invitación a quien ya tiene contraseña lo manda a crear
// otra, y una confirmación de registro a quien fue invitado no le deja fijar ninguna.

export type TipoReenvio = "invitacion" | "confirmacion";

/**
 * Cómo nació la cuenta. `signup-tenant` marca al usuario con `onboarding_self_service` y deja la
 * versión de los términos en el onboarding; las altas de VIM no llevan ninguna de las dos.
 */
export function tipoDeReenvio(d: { autoservicio: boolean; terminosVersion: string | null }): TipoReenvio {
  return d.autoservicio || Boolean(d.terminosVersion) ? "confirmacion" : "invitacion";
}

/** Lo que hace falta de `auth.users` para decidir. */
export type UsuarioAuth = {
  email?: string | null;
  email_confirmed_at?: string | null;
  invited_at?: string | null;
  confirmation_sent_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type AccesoDueno = {
  email: string | null;
  /** Cuándo confirmó su correo; null = todavía no puede entrar. */
  confirmadoEl: string | null;
  /** El último correo de acceso que le salió (invitación o confirmación). */
  ultimoEnvio: string | null;
  ultimoAcceso: string | null;
  tipo: TipoReenvio;
};

/** Resumen para la ficha. null si el negocio no tiene cuenta de dueño (negocios sembrados). */
export function accesoDeDueno(u: UsuarioAuth | null, terminosVersion: string | null): AccesoDueno | null {
  if (!u) return null;
  const autoservicio = u.user_metadata?.onboarding_self_service === true;
  const tipo = tipoDeReenvio({ autoservicio, terminosVersion });
  return {
    email: u.email ?? null,
    confirmadoEl: u.email_confirmed_at ?? null,
    ultimoEnvio: (tipo === "invitacion" ? u.invited_at : u.confirmation_sent_at) ?? u.invited_at ?? u.confirmation_sent_at ?? null,
    ultimoAcceso: u.last_sign_in_at ?? null,
    tipo,
  };
}

/** Lo que se le dice al operador cuando el correo salió. */
export function mensajeReenvio(tipo: TipoReenvio, email: string): string {
  return tipo === "invitacion"
    ? `Se reenvió la invitación a ${email}. El enlace le deja crear su contraseña; el anterior ya no sirve.`
    : `Se reenvió la confirmación de registro a ${email}. Al abrir el enlace entra con la contraseña que ya puso.`;
}

/** ¿El error de Auth es su límite de correos (uno por minuto por cuenta, o el tope por hora)? */
export function esLimiteDeCorreo(e: { message?: string; status?: number } | null | undefined): boolean {
  if (!e) return false;
  return e.status === 429 || /rate limit|security purposes|only request this after/i.test(e.message ?? "");
}
