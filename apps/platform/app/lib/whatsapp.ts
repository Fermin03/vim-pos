// Conversaciones del agente de WhatsApp (tablas wa_*, 0286). Solo las lee el servidor del panel
// (service_role): las tablas niegan a todos por RLS.

/** Los mismos del CHECK de `wa_conversaciones.estado` (0286). */
export const ESTADOS_WA = ["ACTIVA", "PROSPECTO_CALIENTE", "URGENTE_SOPORTE", "DUDA_SIN_RESPUESTA", "RESUELTO"] as const;
export type EstadoWa = (typeof ESTADOS_WA)[number];

const ETIQUETA: Record<EstadoWa, string> = {
  ACTIVA: "Activa",
  PROSPECTO_CALIENTE: "Prospecto caliente",
  URGENTE_SOPORTE: "Urgente: soporte",
  DUDA_SIN_RESPUESTA: "Duda sin respuesta",
  RESUELTO: "Resuelto",
};

/** Tokens de la paleta: lo urgente en rojo, lo que pide atención en ámbar, lo demás neutro. */
export const COLOR_ESTADO_WA: Record<EstadoWa, string> = {
  ACTIVA: "bg-sel text-ink-2",
  PROSPECTO_CALIENTE: "bg-warning-soft text-warning",
  URGENTE_SOPORTE: "bg-danger-soft text-danger",
  DUDA_SIN_RESPUESTA: "bg-info-soft text-info",
  RESUELTO: "bg-success-soft text-success",
};

export const etiquetaEstado = (e: string): string => ETIQUETA[e as EstadoWa] ?? e;

/** Mientras Fermín tiene la conversación, el agente no contesta (`pausado_hasta` en el futuro). */
export const agenteCallado = (pausadoHasta: string | null, ahora: Date): boolean =>
  pausadoHasta !== null && new Date(pausadoHasta).getTime() > ahora.getTime();

export type ConversacionWa = {
  id: string;
  wa_id: string;
  nombre_perfil: string | null;
  estado: EstadoWa;
  pausado_hasta: string | null;
  resumen: string | null;
  ultimo_mensaje_en: string | null;
  creado_en: string;
  prospecto: { id: string; negocio: string } | null;
};

export type MensajeWa = { id: string; autor: "CLIENTE" | "AGENTE" | "FERMIN"; texto: string | null; creado_en: string };
