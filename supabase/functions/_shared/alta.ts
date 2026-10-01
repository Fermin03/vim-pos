// Registro público de negocios (signup-tenant): validación y orquestación, SIN Deno ni red. 0142,
// ADR 0022. El handler (signup-tenant/index.ts) le inyecta Auth, la base, el correo y el captcha;
// aquí se decide todo lo demás, y por eso se prueba con `node --test` (alta.test.ts).
//
// VALIDACIÓN A MANO, no con Zod: el código de las Edge Functions no está en el workspace de pnpm y
// sus módulos puros se prueban con el runner de Node, que no resuelve `npm:zod`. El formulario del
// admin valida lo mismo con Zod (@vim/db/registro); esta es la frontera que cuenta.

import { esc, soloAscii } from "./correo.ts";

/**
 * Versión de los términos y el aviso de privacidad que se aceptan al registrarse. Se guarda con
 * cada alta (tenant_onboarding_estado.terminos_version). CAMBIARLA cuando cambie el texto de
 * https://vimpos.com.mx/terminos o /aviso-privacidad: así se sabe qué versión aceptó cada quien.
 */
export const TERMINOS_VERSION = "2026-10-01"; // sin días de tolerancia en el pago

export const VERTICALES = ["FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "CAFE_BAR", "DARK_KITCHEN", "ENTERPRISE"] as const;
export type Vertical = (typeof VERTICALES)[number];

// Los planes por giro se desactivaron con los tres escalones (ago 2026). Una cadena empieza en
// Cadena; todo lo demás en Esencial. El plan se cambia después desde /platform.
export const PLAN_DE_VERTICAL: Record<Vertical, string> = {
  FOODTRUCK: "ESENCIAL", QUICK_SERVICE: "ESENCIAL", FULL_SERVICE: "ESENCIAL",
  CAFE_BAR: "ESENCIAL", DARK_KITCHEN: "ESENCIAL", ENTERPRISE: "CADENA",
};

export const GIRO_ETIQUETA: Record<Vertical, string> = {
  FOODTRUCK: "Food truck",
  QUICK_SERVICE: "Comida rápida / mostrador",
  FULL_SERVICE: "Restaurante con meseros",
  CAFE_BAR: "Cafetería o bar",
  DARK_KITCHEN: "Cocina fantasma / solo reparto",
  ENTERPRISE: "Cadena",
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Espejo de `telefonoMx10` en @vim/db/registro: 10 dígitos, sin +52 ni 521. */
export function telefonoMx10(v: string): string | null {
  let d = v.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  return /^[0-9]{10}$/.test(d) ? d : null;
}

export type DatosAlta = {
  codigo: string;
  nombre_comercial: string;
  nombre_owner: string;
  email_owner: string;
  telefono_owner: string;
  ciudad: string;
  vertical: Vertical;
  password: string;
};

export type Rechazo = { ok: false; status: number; error: string; detalle?: string; campos?: string[] };

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Todo lo del cuerpo, validado. El primer problema que se encuentra es el que se contesta. */
export function validarAlta(b: Record<string, unknown>): { ok: true; datos: DatosAlta } | Rechazo {
  // Los términos primero: sin ellos no se mira nada más (y no se toca Auth).
  if (b.acepta_terminos !== true) {
    return { ok: false, status: 400, error: "TERMINOS_REQUERIDOS", detalle: "Acepta los términos y el aviso de privacidad." };
  }
  const codigo = txt(b.codigo).toLowerCase();
  const nombre_comercial = txt(b.nombre_comercial);
  const nombre_owner = txt(b.nombre_owner);
  const email_owner = txt(b.email_owner).toLowerCase();
  const telefono = telefonoMx10(txt(b.telefono_owner));
  const ciudad = txt(b.ciudad);
  const vertical = txt(b.vertical);
  const password = typeof b.password === "string" ? b.password : "";

  const faltan: string[] = [];
  if (!codigo) faltan.push("codigo");
  if (!nombre_comercial) faltan.push("nombre_comercial");
  if (!nombre_owner) faltan.push("nombre_owner");
  if (!email_owner) faltan.push("email_owner");
  if (!txt(b.telefono_owner)) faltan.push("telefono_owner");
  if (!ciudad) faltan.push("ciudad");
  if (!vertical) faltan.push("vertical");
  if (!password) faltan.push("password");
  if (faltan.length) return { ok: false, status: 400, error: "FALTAN_CAMPOS", campos: faltan };

  if (!SLUG_RE.test(codigo)) return { ok: false, status: 400, error: "CODIGO_INVALIDO", detalle: "minúsculas, números y guiones (3-50)" };
  if (nombre_comercial.length > 150) return { ok: false, status: 400, error: "NOMBRE_LARGO" };
  if (nombre_owner.length < 2 || nombre_owner.length > 150) return { ok: false, status: 400, error: "NOMBRE_OWNER_INVALIDO" };
  if (email_owner.length > 254 || !EMAIL_RE.test(email_owner)) return { ok: false, status: 400, error: "EMAIL_INVALIDO" };
  if (!telefono) return { ok: false, status: 400, error: "TELEFONO_INVALIDO", detalle: "10 dígitos" };
  if (ciudad.length < 2 || ciudad.length > 80) return { ok: false, status: 400, error: "CIUDAD_INVALIDA" };
  if (password.length < 8) return { ok: false, status: 400, error: "PASSWORD_DEBIL", detalle: "mínimo 8 caracteres" };
  if (password.length > 72) return { ok: false, status: 400, error: "PASSWORD_LARGA" };   // tope de bcrypt en GoTrue
  if (!(VERTICALES as readonly string[]).includes(vertical)) return { ok: false, status: 400, error: "VERTICAL_INVALIDA" };

  return {
    ok: true,
    datos: { codigo, nombre_comercial, nombre_owner, email_owner, telefono_owner: telefono, ciudad, vertical: vertical as Vertical, password },
  };
}

/** Correo para reenviar la confirmación: minúsculas y con forma de correo, o null. */
export function correoValido(v: unknown): string | null {
  const e = txt(v).toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

// ── Orquestación ──────────────────────────────────────────────────────────────────────────────

/** Lo que el handler le da a `procesarAlta`. Cada pieza se simula en las pruebas. */
export type DepsAlta = {
  /** `noConfigurado`: falta TURNSTILE_SECRET_KEY y no es local (fail-closed → 503). */
  verificarCaptcha(token: unknown, accion: "registro" | "reenvio"): Promise<{ ok: boolean; noConfigurado?: boolean }>;
  /** Crea la cuenta de Auth SIN confirmar. */
  crearUsuario(a: { email: string; password: string; nombre: string }): Promise<{ id: string } | { error: string }>;
  borrarUsuario(id: string): Promise<void>;
  /** RPC `alta_autoservicio` (0142): tenant TRIAL + términos + ciudad en una transacción. */
  altaNegocio(a: DatosAlta & { owner_id: string; plan: string; terminos_version: string }): Promise<{ tenantId: string } | { error: string }>;
  /** Manda el correo de confirmación (GoTrue). `limitado`: GoTrue dijo "espera" (límite de correos). */
  enviarConfirmacion(email: string): Promise<{ ok: boolean; error?: string; limitado?: boolean }>;
  /** Aviso interno a VIM. Se lanza sin esperarlo: nunca decide la respuesta. */
  avisarVim(d: DatosAlta & { tenantId: string }): void;
  log?: (nivel: "info" | "warn" | "error", msg: string) => void;
};

export type Respuesta = { status: number; body: Record<string, unknown> };

/** Respuesta del captcha fallido: 503 si falta configurarlo (es nuestro), 400 si el token no sirve. */
const captchaFallido = (c: { noConfigurado?: boolean }): Respuesta =>
  c.noConfigurado ? { status: 503, body: { error: "CAPTCHA_NO_CONFIGURADO" } } : { status: 400, body: { error: "CAPTCHA_INVALIDO" } };

/** ¿El error de GoTrue es un límite de envío? ("over_email_send_rate_limit", "only request this after 60 seconds"). */
export function esLimiteDeCorreo(error: string | undefined): boolean {
  return /rate limit|after \d+ seconds|too many|429/i.test(error ?? "");
}

const rechazo = (r: Rechazo): Respuesta => {
  const { ok: _ok, status, ...body } = r;
  return { status, body };
};

export async function procesarAlta(b: Record<string, unknown>, deps: DepsAlta): Promise<Respuesta> {
  const log = deps.log ?? (() => {});
  const v = validarAlta(b);
  if (!v.ok) return rechazo(v);
  const d = v.datos;

  const captcha = await deps.verificarCaptcha(b.captcha, "registro");
  if (!captcha.ok) return captchaFallido(captcha);

  // 1) La cuenta, SIN confirmar: no entra hasta abrir el enlace del correo.
  const u = await deps.crearUsuario({ email: d.email_owner, password: d.password, nombre: d.nombre_owner });
  if ("error" in u) {
    if (/already.*registered|exists|duplicate/i.test(u.error)) return { status: 409, body: { error: "EMAIL_YA_REGISTRADO" } };
    log("error", `createUser: ${u.error}`);   // C2-9: el mensaje de GoTrue va al log, no al visitante
    return { status: 400, body: { error: "ALTA_OWNER_FALLO" } };
  }

  // 2) El negocio en prueba, con los términos sellados. Si falla, se borra la cuenta.
  const t = await deps.altaNegocio({ ...d, owner_id: u.id, plan: PLAN_DE_VERTICAL[d.vertical], terminos_version: TERMINOS_VERSION });
  if ("error" in t) {
    // Si el borrado también falla queda una cuenta sin negocio: se deja en el log para limpiarla a
    // mano (el admin le enseña al dueño "tu cuenta no terminó de crearse" con el WhatsApp).
    await deps.borrarUsuario(u.id).catch((e) => log("error", `rollback: no se pudo borrar la cuenta ${u.id} sin negocio — ${String(e)}`));
    if (/duplicate|unique|already/i.test(t.error)) return { status: 409, body: { error: "CODIGO_YA_USADO" } };
    log("error", `alta_autoservicio: ${t.error}`);
    return { status: 400, body: { error: "PROVISION_FALLO" } };
  }

  // 3) El correo de confirmación. Si no sale, el alta YA existe: se dice, y la pantalla ofrece
  //    reenviarlo. Deshacer un negocio por un correo sería peor.
  const c = await deps.enviarConfirmacion(d.email_owner).catch((e) => ({ ok: false, error: String(e) }));
  if (!c.ok) log("warn", `confirmación a ${t.tenantId} no enviada: ${c.error ?? "?"}`);

  // 4) Aviso a VIM, sin esperarlo.
  try { deps.avisarVim({ ...d, tenantId: t.tenantId }); } catch (e) { log("error", `aviso a VIM: ${String(e)}`); }

  return {
    status: 200,
    body: { ok: true, tenant_id: t.tenantId, email: d.email_owner, correo_enviado: c.ok, siguiente_paso: "confirmar_correo" },
  };
}

/**
 * Reenviar la confirmación. SIEMPRE contesta lo mismo (salvo captcha): decir "ese correo no existe"
 * o "ya está confirmado" serviría para averiguar quién tiene cuenta.
 */
export async function procesarReenvio(b: Record<string, unknown>, deps: Pick<DepsAlta, "verificarCaptcha" | "enviarConfirmacion" | "log">): Promise<Respuesta> {
  const email = correoValido(b.email);
  if (!email) return { status: 400, body: { error: "EMAIL_INVALIDO" } };
  const captcha = await deps.verificarCaptcha(b.captcha, "reenvio");
  if (!captcha.ok) return captchaFallido(captcha);
  const r: { ok: boolean; error?: string; limitado?: boolean } = await deps.enviarConfirmacion(email).catch((e) => ({ ok: false, error: String(e) }));
  if (r.ok) return { status: 200, body: { ok: true } };
  // GoTrue solo pone su límite de 60 s a cuentas que existen; contestarlo tal cual delataría la
  // cuenta. Por eso el handler aplica ANTES su propio "un reenvío por correo por minuto" a todo
  // correo, exista o no: este 429 solo sale además por el tope de correos del proyecto.
  if (r.limitado || esLimiteDeCorreo(r.error)) return { status: 429, body: { error: "ESPERA_UN_MINUTO" } };
  (deps.log ?? (() => {}))("warn", `reenvío de confirmación falló: ${r.error ?? "?"}`);
  return { status: 200, body: { ok: true } };
}

// ── Aviso a VIM ─────────────────────────────────────────────────────────────────────────────────

/** El correo interno de cada alta. Todo lo que escribió el visitante va escapado. */
export function correoAvisoAlta(d: DatosAlta & { tenantId: string }, platformUrl: string): { subject: string; html: string } {
  const ficha = `${platformUrl.replace(/\/+$/, "")}/clientes/${encodeURIComponent(d.tenantId)}`;
  const fila = (k: string, v: string) => `<tr><td style="padding:2px 12px 2px 0"><b>${k}</b></td><td>${v}</td></tr>`;
  return {
    // ASCII puro: ver en solicitar-demo por qué un asunto con acentos rompía el correo entero.
    subject: soloAscii(`Registro nuevo: ${d.nombre_comercial} (${d.codigo}) - ${d.ciudad}`),
    html: `
      <h2 style="font-family:sans-serif">${esc(d.nombre_comercial)}</h2>
      <p style="font-family:sans-serif;font-size:14px">Se registró solo desde /registro. Está en prueba de 30 días y el dueño todavía tiene que confirmar su correo.</p>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        ${fila("Negocio", esc(d.nombre_comercial))}
        ${fila("Código", esc(d.codigo))}
        ${fila("Giro", esc(GIRO_ETIQUETA[d.vertical]))}
        ${fila("Dueño", esc(d.nombre_owner))}
        ${fila("Teléfono", `<a href="https://wa.me/52${esc(d.telefono_owner)}">${esc(d.telefono_owner)}</a>`)}
        ${fila("Correo", esc(d.email_owner))}
        ${fila("Ciudad", esc(d.ciudad))}
      </table>
      <p style="font-family:sans-serif;font-size:14px"><a href="${esc(ficha)}">Abrir la ficha en el panel</a></p>`,
  };
}
