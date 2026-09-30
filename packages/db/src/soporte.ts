// Soporte de VIM por WhatsApp (0142, ADR 0022): la ÚNICA fuente de cómo se arma un enlace wa.me
// y de los mensajes que ya van escritos. La usan el admin (menú y "Plan y pagos"), el POS (menú y
// pantalla de bloqueo) y el panel de plataforma (validar lo que se captura).
//
// Funciones puras: nada de red ni de sesión. Se prueban con vitest desde las apps.
import { z } from "zod";

/**
 * El WhatsApp oficial de soporte de VIM (+52 56 6508 3346), en el formato de wa.me.
 * Es el RESPALDO: vale cuando no hay nada mejor —una caja recién instalada sin internet, una RPC
 * que falló—. El vigente lo edita VIM en /platform y viaja por `soporte_plataforma()` y por las
 * directivas de la caja. Mismo valor que la fila de fábrica de la migración 0142.
 */
export const WHATSAPP_SOPORTE_VIM = "525665083346";

export type Soporte = {
  /** Dígitos con lada de país (52…), 10 a 15. */
  whatsapp: string;
  /** Texto libre ("9:00 a 18:00") o null. */
  horario: string | null;
  correo: string | null;
};

export const SOPORTE_POR_DEFECTO: Soporte = Object.freeze({
  whatsapp: WHATSAPP_SOPORTE_VIM,
  horario: "9:00 a 18:00",
  correo: null,
}) as Soporte;

/** Quita espacios, guiones, paréntesis y el "+": como la gente copia un número de su teléfono. */
export function normalizarWhatsapp(v: string): string {
  return v.replace(/[\s()+.-]/g, "");
}

/** 10 a 15 dígitos, que es lo que wa.me acepta (y el CHECK de la base). */
export function whatsappValido(v: string | null | undefined): boolean {
  return typeof v === "string" && /^[0-9]{10,15}$/.test(v);
}

/** wa.me con el mensaje. Null si el número no sirve: mejor sin botón que uno que no abre. */
export function enlaceWhatsapp(numero: string | null | undefined, texto: string): string | null {
  const n = (numero ?? "").replace(/\D/g, "");
  if (!whatsappValido(n)) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

/** "+52 56 6508 3346" para leerlo en pantalla. Números que no son de México se muestran con "+". */
export function whatsappLegible(numero: string): string {
  const n = numero.replace(/\D/g, "");
  if (n.length === 12 && n.startsWith("52")) return `+52 ${n.slice(2, 4)} ${n.slice(4, 8)} ${n.slice(8)}`;
  return `+${n}`;
}

const textoONull = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  z.string().max(254).nullable(),
);

const EsquemaSoporte = z.object({
  whatsapp: z.string().transform((v) => v.replace(/\D/g, "")).refine(whatsappValido),
  horario: textoONull.optional().default(null),
  correo: textoONull.optional().default(null),
});

/**
 * Lee el soporte de lo que venga (fila de la RPC, directivas de la caja, JSON guardado). Null si
 * no trae un WhatsApp usable: quien llama decide el respaldo, no esta función.
 */
export function soporteDe(x: unknown): Soporte | null {
  const r = EsquemaSoporte.safeParse(x);
  return r.success ? { whatsapp: r.data.whatsapp, horario: r.data.horario ?? null, correo: r.data.correo ?? null } : null;
}

/** El primero que sirva, o el de fábrica. Nunca devuelve null: siempre hay a quién escribirle. */
export function soporteConRespaldo(...candidatos: unknown[]): Soporte {
  for (const c of candidatos) {
    const s = soporteDe(c);
    if (s) return s;
  }
  return SOPORTE_POR_DEFECTO;
}

/** "Atendemos de 9:00 a 18:00", o null si no hay horario. */
export function textoHorario(s: Soporte): string | null {
  return s.horario ? `Atendemos de ${s.horario}` : null;
}

const limpio = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/**
 * Mensaje del admin: "Hola, soy Ana de Knock-Out Burger (knock-out). Necesito ayuda con VIM POS."
 * Lo que falte se omite en vez de escribir "undefined" o un paréntesis vacío.
 */
export function mensajeAyudaAdmin(d: { usuario?: string | null; negocio?: string | null; codigo?: string | null }): string {
  const usuario = limpio(d.usuario);
  const negocio = limpio(d.negocio);
  const codigo = limpio(d.codigo);
  const quien = usuario ? `soy ${usuario}` : "";
  const de = negocio ? `${quien ? " de " : "escribo de "}${negocio}${codigo ? ` (${codigo})` : ""}` : "";
  const intro = quien || de ? `Hola, ${quien}${de}.` : "Hola.";
  return `${intro} Necesito ayuda con VIM POS.`;
}

/**
 * Mensaje de la caja: dice desde qué caja y con qué versión, que es lo primero que soporte pregunta.
 * "Hola, escribo de Knock-Out Burger (Centro · Caja 1 · VIM POS 0.4.99). Necesito ayuda con VIM POS."
 */
export function mensajeAyudaCaja(d: {
  cajero?: string | null;
  negocio?: string | null;
  sucursal?: string | null;
  caja?: string | null;
  version?: string | null;
}): string {
  const cajero = limpio(d.cajero);
  const negocio = limpio(d.negocio);
  const detalle = [limpio(d.sucursal), limpio(d.caja), limpio(d.version) ? `VIM POS ${limpio(d.version)}` : ""]
    .filter((x) => x && x !== "—")
    .join(" · ");
  const quien = cajero ? `soy ${cajero}` : "";
  const de = negocio && negocio !== "—" ? `${quien ? " de " : "escribo de "}${negocio}` : "";
  const intro = quien || de ? `Hola, ${quien}${de}${detalle ? ` (${detalle})` : ""}.` : detalle ? `Hola (${detalle}).` : "Hola.";
  return `${intro} Necesito ayuda con VIM POS.`;
}
