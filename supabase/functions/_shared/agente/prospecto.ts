// La fila de `prospectos` que guarda el agente de WhatsApp. Pura: se prueba con node --test.
import type { Herramientas } from "./cerebro.ts"

// Lista vigente del CHECK prospectos_giro_check: supabase/migrations/0229_prospectos_belleza.sql.
// Si una migración nueva la amplía, se amplía aquí.
const GIROS = [
  "FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "CAFE_BAR", "DARK_KITCHEN", "ENTERPRISE", "BAR", "CAFETERIA", "TAQUERIA", "RETAIL",
  "ABARROTES", "FRUTERIA", "FERRETERIA", "VINOS", "SALON", "SPA", "PELUQUERIA", "BARBERIA", "TATUAJES",
]

export function filaProspecto(d: Parameters<Herramientas["guardarProspecto"]>[0], waId: string) {
  const giro = d.giro?.toUpperCase() ?? null
  const giroValido = giro !== null && GIROS.includes(giro)
  const digitos = waId.replace(/\D/g, "")
  return {
    nombre: d.nombre.trim().slice(0, 120), negocio: d.negocio.trim().slice(0, 150), cajas: d.cajas, sucursales: d.sucursales,
    // México: los 10 dígitos nacionales; otro país: el número completo con su lada.
    whatsapp: digitos.startsWith("52") ? digitos.slice(-10) : digitos, origen: "whatsapp",
    giro: giroValido ? giro : null,
    // Un giro fuera de la lista del CHECK (y la ciudad) viajan en el mensaje.
    mensaje: [d.mensaje, d.giro && !giroValido ? `Giro: ${d.giro}` : null, d.ciudad ? `Ciudad: ${d.ciudad}` : null]
      .filter(Boolean).join(". ").slice(0, 1000) || null,
  }
}

/** Para actualizar: solo lo que vino; un giro o mensaje vacío en esta llamada no borra el que ya estaba. */
export const sinNulos = <T extends object>(fila: T): Partial<T> =>
  Object.fromEntries(Object.entries(fila).filter(([, v]) => v != null)) as Partial<T>
