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

/** `espera_min`: minutos que faltan cuando el bloqueo es `ESPERA_TIMBRADOS`. */
const Bloqueo = z.object({ codigo: z.string(), mensaje: z.string(), espera_min: z.number().optional() });

export const VistaPrevia = z.object({
  tenant: z.object({ id: z.string(), codigo: z.string(), nombre_comercial: z.string(), estado: z.string() }),
  puede_eliminar: z.boolean(),
  bloqueos: z.array(Bloqueo),
  resumen: Resumen,
  tablas: z.record(z.string(), z.number()),
});
export type VistaPreviaEliminacion = z.infer<typeof VistaPrevia>;

export const Archivo = z.object({ bucket: z.string(), nombre: z.string() });
export type ArchivoStorage = z.infer<typeof Archivo>;

export const ResultadoEliminar = z.object({
  tenant: z.object({ id: z.string(), codigo: z.string(), nombre_comercial: z.string() }),
  resumen: Resumen,
  cuentas_conservadas: z.array(z.object({ usuario_id: z.string(), motivo: z.string() })),
});

/** Los rechazos que la base dice con código (`CODIGO: mensaje`) y con qué estado HTTP salen. */
const ESTADO_POR_CODIGO: Record<string, number> = {
  TENANT_NO_EXISTE: 404,
  // La petición está bien formada; es el estado del negocio el que no lo permite.
  TENANT_NO_CANCELADO: 409,
  TENANT_INTERNO: 409,
  EN_GRACIA: 409,
  TIENE_TIMBRADOS: 409,
  TIMBRADO_EN_PROCESO: 409,
  ESPERA_TIMBRADOS: 409,
  CONFIRMACION_INVALIDA: 400,
  MOTIVO_REQUERIDO: 400,
  OPERADOR_REQUERIDO: 400,
};

/**
 * Rechazos cuyo texto NO es nuestro: traen el mensaje de Postgres o nombres de tablas. Se contesta
 * con un texto fijo y el original se queda en el registro del servidor (`crudo: true`).
 */
const TEXTO_FIJO: Record<string, { detalle: string; status: number }> = {
  QUEDAN_REFERENCIAS: { detalle: "No se borró nada: otro negocio tiene datos que apuntan a este cliente. Hay que revisarlo a mano.", status: 409 },
  QUEDAN_FILAS: { detalle: "No se borró nada: quedaron datos del cliente sin borrar. Hay que revisarlo a mano.", status: 409 },
};

/** Fallos de Postgres por su SQLSTATE: aquí el mensaje nunca es nuestro. */
const POR_SQLSTATE: Record<string, { codigo: string; detalle: string; status: number }> = {
  // statement_timeout: la función se revirtió entera.
  "57014": { codigo: "DEMASIADO_GRANDE", detalle: "No se borró nada: el negocio es demasiado grande para eliminarlo desde el panel.", status: 504 },
  // lock_timeout: otra operación tiene tomada la fila del cliente.
  "55P03": { codigo: "CLIENTE_OCUPADO", detalle: "No se borró nada: el cliente está en uso en este momento. Intenta de nuevo en un minuto.", status: 409 },
};

export type Rechazo = {
  codigo: string;
  detalle: string;
  status: number;
  /** El mensaje original no se mandó al navegador: hay que registrarlo en el servidor. */
  crudo: boolean;
};

/**
 * El error de la RPC → código, texto para el operador y estado HTTP.
 *
 * Solo pasan tal cual los mensajes que escribimos nosotros en la migración (`CODIGO: texto` con un
 * código de la lista). Todo lo demás —un SQLSTATE, un texto de Postgres— sale con un texto fijo en
 * español: los mensajes crudos nombran tablas, llaves y roles, y no le sirven a quien opera.
 */
export function leerRechazo(error: { message: string; code?: string | null }): Rechazo {
  const porEstado = error.code ? POR_SQLSTATE[error.code] : undefined;
  if (porEstado) return { ...porEstado, crudo: true };

  const m = /^([A-Z_]+):\s*(.+)$/s.exec(error.message.trim());
  const codigo = m?.[1] ?? "";
  const fijo = TEXTO_FIJO[codigo];
  if (fijo) return { codigo, ...fijo, crudo: true };
  const status = ESTADO_POR_CODIGO[codigo];
  if (m && status !== undefined) return { codigo, detalle: m[2]!.trim(), status, crudo: false };
  return {
    codigo: "ERROR_AL_ELIMINAR",
    detalle: "No se borró nada: la base rechazó la operación. Quedó registrado para revisarlo.",
    status: 500,
    crudo: true,
  };
}

/** Los archivos de Storage, agrupados por bucket (la API borra por bucket). */
export function agruparPorBucket(archivos: ArchivoStorage[]): Map<string, string[]> {
  const porBucket = new Map<string, string[]>();
  for (const a of archivos) porBucket.set(a.bucket, [...(porBucket.get(a.bucket) ?? []), a.nombre]);
  return porBucket;
}

/**
 * ¿El servidor llegó a contestar algo que entendemos? Sus rechazos traen un texto nuestro, y en
 * todos se dice que no se borró nada. Si lo que llega es otra cosa —la conexión se cortó, la
 * plataforma mató la petición por tiempo— NO se sabe si la base terminó: pudo eliminar al cliente
 * y perderse solo la respuesta.
 */
export function respuestaCortada(e: unknown): boolean {
  if (!(e instanceof Error)) return true;
  if (e instanceof TypeError) return true; // fetch: sin red, conexión cerrada
  return /^El servidor respondió \d+$/.test(e.message);
}

export const AVISO_CORTE =
  "La petición se cortó y no sabemos si terminó. Antes de volver a intentarlo, abre Clientes eliminados: si este cliente ya aparece ahí, se eliminó y no hay nada más que hacer.";
