// Prospectos de demo (tabla `prospectos`, 0084 + 0145): lo que llega del formulario del sitio.
//
// La tabla no la lee nadie más que el servidor del panel (service_role): un prospecto todavía no es
// un negocio, así que no hay tenant ni RLS por negocio que valga — la política niega a todos.
//
// Aquí viven las reglas puras: el mensaje de WhatsApp, qué cambio de seguimiento es válido, cuándo
// un prospecto sin contestar se vuelve una alerta y con qué se pre-llena "Nuevo cliente".
import { z } from "zod";
import { enlaceWhatsapp } from "@vim/db/soporte";
import type { Severidad } from "./tipos";

/** Los mismos del CHECK de `prospectos.estado` (0084). */
export const ESTADOS_PROSPECTO = ["NUEVO", "CONTACTADO", "DEMO_AGENDADA", "GANADO", "PERDIDO", "SPAM"] as const;
export type EstadoProspecto = (typeof ESTADOS_PROSPECTO)[number];

export const NOMBRE_ESTADO_PROSPECTO: Record<EstadoProspecto, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  DEMO_AGENDADA: "Demo agendada",
  GANADO: "Ganado",
  PERDIDO: "Perdido",
  SPAM: "No era real",
};

/** Tokens de la paleta: lo nuevo llama la atención en ámbar, lo ganado en verde, lo demás neutro. */
export const COLOR_ESTADO_PROSPECTO: Record<EstadoProspecto, string> = {
  NUEVO: "bg-warning-soft text-warning",
  CONTACTADO: "bg-info-soft text-info",
  DEMO_AGENDADA: "bg-info-soft text-info",
  GANADO: "bg-success-soft text-success",
  PERDIDO: "bg-sel text-ink-2",
  SPAM: "bg-sel text-ink-2",
};

/** El mismo tope que el CHECK `prospectos_notas_largo` (0145). */
export const NOTA_MAXIMA = 500;

/** Horas sin contestar a partir de las cuales un prospecto NUEVO sale en Atención. */
export const HORAS_ALERTA_PROSPECTO = 24;
/** Y a partir de las cuales la alerta pasa de alta a crítica. */
const HORAS_CRITICA = 72;

export type Prospecto = {
  id: string;
  nombre: string;
  whatsapp: string;
  negocio: string;
  cajas: number;
  sucursales: number;
  giro: string | null;
  usa_hoy: string | null;
  mensaje: string | null;
  origen: string;
  utm_source: string | null;
  utm_campaign: string | null;
  estado: EstadoProspecto;
  notas: string | null;
  atendido_en: string | null;
  estado_cambiado_en: string | null;
  creado_en: string;
};

const limpio = (v: string) => v.replace(/\s+/g, " ").trim();

/** El saludo que ya va escrito al abrir WhatsApp. */
export function mensajeProspecto(p: { nombre: string; negocio: string }): string {
  return `Hola ${limpio(p.nombre)}, soy Fermín de VIM POS. Vi que pediste una demo para ${limpio(p.negocio)}.`;
}

/**
 * wa.me con el saludo. El formulario guarda los 10 dígitos de siempre (sin lada); a esos se les
 * pone el 52. Un número más largo ya trae su lada de país y se respeta. Null si no sirve.
 */
export function enlaceProspecto(p: { nombre: string; negocio: string; whatsapp: string }): string | null {
  const digitos = p.whatsapp.replace(/\D/g, "");
  return enlaceWhatsapp(digitos.length === 10 ? `52${digitos}` : digitos, mensajeProspecto(p));
}

const Cambio = z.object({
  estado: z.enum(ESTADOS_PROSPECTO).optional(),
  notas: z.string().max(NOTA_MAXIMA * 4).nullable().optional(),
});

export type CambioProspecto = { estado?: EstadoProspecto; notas?: string | null };

/**
 * Lo que se puede cambiar de un prospecto: su estado de seguimiento y una nota corta. Con uno de
 * los dos basta. La nota vacía se guarda como NULL; si no viene, no se toca.
 */
export function leerCambioProspecto(body: Record<string, unknown>): { ok: true; cambio: CambioProspecto } | { ok: false; error: string; detalle: string } {
  if (body.estado !== undefined && !(ESTADOS_PROSPECTO as readonly unknown[]).includes(body.estado)) {
    return { ok: false, error: "ESTADO_INVALIDO", detalle: "Ese estado de seguimiento no existe." };
  }
  const r = Cambio.safeParse({ estado: body.estado, notas: body.notas });
  if (!r.success) return { ok: false, error: "NOTA_INVALIDA", detalle: `La nota es un texto de hasta ${NOTA_MAXIMA} caracteres.` };
  const cambio: CambioProspecto = {};
  if (r.data.estado !== undefined) cambio.estado = r.data.estado;
  if (r.data.notas !== undefined) {
    const nota = (r.data.notas ?? "").trim();
    if (nota.length > NOTA_MAXIMA) return { ok: false, error: "NOTA_INVALIDA", detalle: `La nota es un texto de hasta ${NOTA_MAXIMA} caracteres.` };
    cambio.notas = nota === "" ? null : nota;
  }
  if (cambio.estado === undefined && cambio.notas === undefined) {
    return { ok: false, error: "NADA_QUE_CAMBIAR", detalle: "Manda el estado, la nota o los dos." };
  }
  return { ok: true, cambio };
}

export type AlertaProspectos = {
  id: string;
  severidad: Severidad;
  tipo: string;
  tenantId: null;
  tenant: string;
  titulo: string;
  detalle: string;
  orden: number;
  /** A dónde lleva "Abrir": no hay ficha de cliente, hay una bandeja. */
  href: string;
};

/**
 * Una sola alerta para todos los prospectos que siguen NUEVOS pasadas 24 horas. El sitio promete
 * contestar el mismo día hábil; un prospecto de ayer sin tocar es esa promesa rota. Va agrupada:
 * una alerta por prospecto enterraría la bandeja justo el día que una campaña funciona.
 */
export function alertaProspectos(
  filas: { negocio: string; estado: string; creado_en: string }[],
  ahoraMs: number = Date.now(),
): AlertaProspectos | null {
  const viejos = filas
    .filter((f) => f.estado === "NUEVO")
    .map((f) => ({ negocio: f.negocio, horas: (ahoraMs - new Date(f.creado_en).getTime()) / 3_600_000 }))
    .filter((f) => Number.isFinite(f.horas) && f.horas >= HORAS_ALERTA_PROSPECTO)
    .sort((a, b) => b.horas - a.horas);
  if (viejos.length === 0) return null;

  const n = viejos.length;
  const dias = Math.floor(viejos[0]!.horas / 24);
  const nombres = viejos.slice(0, 3).map((v) => v.negocio).join(", ");
  const resto = n > 3 ? ` y ${n - 3} más` : "";
  return {
    id: "prospectos-sin-contactar",
    severidad: viejos[0]!.horas >= HORAS_CRITICA ? "critica" : "alta",
    tipo: "Prospecto sin contactar",
    tenantId: null,
    tenant: "Prospectos del sitio",
    titulo: `${n} ${n === 1 ? "prospecto" : "prospectos"} sin contactar`,
    detalle: `${nombres}${resto}. ${n === 1 ? "Pidió" : "El más antiguo pidió"} su demo hace ${dias} ${dias === 1 ? "día" : "días"} y sigue como nuevo. El sitio promete contestar el mismo día hábil.`,
    orden: -Math.floor(viejos[0]!.horas),
    href: "/prospectos?estado=NUEVO",
  };
}

export type PrefijoNuevoCliente = {
  nombre_comercial: string;
  nombre_owner: string;
  telefono_owner: string;
  /** null = el formulario se queda con el suyo. */
  vertical: string | null;
  plan_codigo: "ESENCIAL" | "NEGOCIO" | "CADENA";
};

/**
 * Con qué se pre-llena "Nuevo cliente" al convertir un prospecto. El plan se sugiere por tamaño,
 * con la misma regla que el correo de aviso de `solicitar-demo`: más de una sucursal es Cadena,
 * más de una caja es Negocio. El correo del dueño no se pre-llena: el formulario de demo no lo pide.
 */
export function prefijoNuevoCliente(p: Pick<Prospecto, "nombre" | "negocio" | "whatsapp" | "giro" | "cajas" | "sucursales">): PrefijoNuevoCliente {
  return {
    nombre_comercial: limpio(p.negocio),
    nombre_owner: limpio(p.nombre),
    telefono_owner: p.whatsapp.replace(/\D/g, ""),
    vertical: p.giro,
    plan_codigo: p.sucursales > 1 ? "CADENA" : p.cajas > 1 ? "NEGOCIO" : "ESENCIAL",
  };
}
