import { z } from "zod";

/**
 * Eliminar un cliente por completo (0144, ADR 0023). Lo puro de la ruta: la forma de lo que
 * devuelve la base y cómo se traduce un rechazo, para probarlo sin Next ni Supabase.
 */

/** La palabra que hay que escribir, además del nombre del negocio. */
export const PALABRA_ELIMINAR = "ELIMINAR";

export const CuerpoEliminar = z.object({
  motivo: z.string().trim().min(10),
  nombre: z.string(),
  confirmacion: z.string(),
});

const Resumen = z.object({
  sucursales: z.number(),
  cajas: z.number(),
  usuarios: z.number(),
  productos: z.number(),
  tickets: z.number(),
  clientes: z.number(),
  cfdi: z.number(),
  pagos_suscripcion: z.number(),
  cuentas: z.number(),
  cuentas_conservadas: z.number(),
  archivos: z.number(),
  tablas_con_datos: z.number(),
  filas: z.number(),
});
export type ResumenEliminacion = z.infer<typeof Resumen>;

const Bloqueo = z.object({ codigo: z.string(), mensaje: z.string() });

export const VistaPrevia = z.object({
  tenant: z.object({ id: z.string(), codigo: z.string(), nombre_comercial: z.string(), estado: z.string() }),
  puede_eliminar: z.boolean(),
  bloqueos: z.array(Bloqueo),
  resumen: Resumen,
  tablas: z.record(z.number()),
});
export type VistaPreviaEliminacion = z.infer<typeof VistaPrevia>;

export const ResultadoEliminar = z.object({
  tenant: z.object({ id: z.string(), codigo: z.string(), nombre_comercial: z.string() }),
  resumen: Resumen,
  cuentas_conservadas: z.array(z.object({ usuario_id: z.string(), motivo: z.string() })),
  archivos: z.array(z.object({ bucket: z.string(), nombre: z.string() })),
});

/** Los rechazos que la base dice con código (`CODIGO: mensaje`) y con qué estado HTTP salen. */
const ESTADO_POR_CODIGO: Record<string, number> = {
  TENANT_NO_EXISTE: 404,
  // La petición está bien formada; es el estado del negocio el que no lo permite.
  TENANT_NO_CANCELADO: 409,
  TENANT_INTERNO: 409,
  TIENE_TIMBRADOS: 409,
  TIMBRADO_EN_PROCESO: 409,
  QUEDAN_REFERENCIAS: 409,
  QUEDAN_FILAS: 409,
  CONFIRMACION_INVALIDA: 400,
  MOTIVO_REQUERIDO: 400,
  OPERADOR_REQUERIDO: 400,
};

/** `"TIENE_TIMBRADOS: Tiene facturas…"` → código, texto y estado. Lo desconocido es un 500. */
export function leerRechazo(mensaje: string): { codigo: string; detalle: string; status: number } {
  const m = /^([A-Z_]+):\s*(.+)$/s.exec(mensaje.trim());
  const codigo = m?.[1] ?? "";
  const status = ESTADO_POR_CODIGO[codigo];
  if (!m || status === undefined) return { codigo: "ERROR_AL_ELIMINAR", detalle: mensaje, status: 500 };
  return { codigo, detalle: m[2]!.trim(), status };
}

/** Los archivos de Storage, agrupados por bucket (la API borra por bucket). */
export function agruparPorBucket(archivos: { bucket: string; nombre: string }[]): Map<string, string[]> {
  const porBucket = new Map<string, string[]>();
  for (const a of archivos) porBucket.set(a.bucket, [...(porBucket.get(a.bucket) ?? []), a.nombre]);
  return porBucket;
}
