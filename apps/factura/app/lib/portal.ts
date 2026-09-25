"use client";

/**
 * Cliente del portal de autofactura.
 *
 * Todo va contra la Edge Function `autofacturar` y nada directo a la base: quien usa este portal no
 * tiene sesión, así que el RLS no puede acotarlo. El acotamiento y el límite de ritmo viven ahí.
 */

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type Negocio = { nombre: string; logo: string | null };

export type TicketEncontrado = {
  negocio: string;
  logo: string | null;
  ticket: { folio: string; fecha: string; total: number };
  /** Regímenes que se ofrecen, en orden. Vienen del servidor: el catálogo vive en un solo lugar. */
  regimenes: { clave: string; nombre: string }[];
  usos: Record<string, string>;
  usosPorRegimen: Record<string, string[]>;
};

export type Receptor = {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  usoCfdi: string;
  email: string;
};

export type Timbrado = {
  uuid: string; negocio: string; total: number;
  xml: string | null; pdf: string | null;
  /** El correo lo manda el PAC con los adjuntos; puede fallar sin que la factura se vea afectada. */
  correoEnviado: boolean;
  correo: string | null;
};

/** Un fallo con la forma que la pantalla necesita: qué decir, qué campo señalar y qué pasó. */
export class ErrorPortal extends Error {
  readonly campo: string | null;
  /** El `estado` de la función: "YA_FACTURADO" abre la recuperación en vez de un error. */
  readonly estado: string | null;
  /** Lo que la función manda junto al error (el nombre del negocio, el ticket…). */
  readonly datos: Record<string, unknown>;
  constructor(mensaje: string, campo: string | null = null, estado: string | null = null, datos: Record<string, unknown> = {}) {
    super(mensaje);
    this.name = "ErrorPortal";
    this.campo = campo;
    this.estado = estado;
    this.datos = datos;
  }
}

async function llamar(cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${SB_URL}/functions/v1/autofacturar`, {
      method: "POST",
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorPortal("No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.");
  }
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ErrorPortal(
      String(d.mensaje ?? "No se pudo completar la operación."),
      (d.campo as string) ?? null,
      (d.estado as string) ?? null,
      d,
    );
  }
  return d;
}

/** Nombre y logo del restaurante, para el encabezado desde el primer paso. */
export async function buscarNegocio(negocio: string): Promise<Negocio> {
  try {
    const d = await llamar({ accion: "negocio", negocio });
    return { nombre: String(d.negocio), logo: (d.logo as string) ?? null };
  } catch (e) {
    // Sin facturación activada también trae el nombre: el encabezado se pinta igual.
    if (e instanceof ErrorPortal && typeof e.datos.negocio === "string") {
      throw new ErrorPortal(e.message, null, e.estado, e.datos);
    }
    throw e;
  }
}

export async function buscarTicket(negocio: string, folio: string): Promise<TicketEncontrado> {
  const d = await llamar({ accion: "buscar", negocio, folio });
  return {
    negocio: String(d.negocio),
    logo: (d.logo as string) ?? null,
    ticket: d.ticket as TicketEncontrado["ticket"],
    regimenes: (d.regimenes ?? []) as TicketEncontrado["regimenes"],
    usos: (d.usos ?? {}) as Record<string, string>,
    usosPorRegimen: (d.usosPorRegimen ?? {}) as Record<string, string[]>,
  };
}

function aTimbrado(d: Record<string, unknown>): Timbrado {
  return {
    uuid: String(d.uuid),
    negocio: String(d.negocio),
    total: Number(d.total ?? 0),
    xml: (d.xml as string) ?? null,
    pdf: (d.pdf as string) ?? null,
    correoEnviado: d.correoEnviado === true,
    correo: (d.correo as string) ?? null,
  };
}

/** Una factura ya emitida, otra vez: con el folio y el RFC con que se pidió. */
export async function recuperar(negocio: string, folio: string, rfc: string): Promise<Timbrado> {
  return aTimbrado(await llamar({ accion: "recuperar", negocio, folio, rfc }));
}

/** Reenvía la factura por correo (la manda el PAC con el XML y el PDF adjuntos). */
export async function enviarPorCorreo(negocio: string, folio: string, rfc: string, email: string): Promise<void> {
  await llamar({ accion: "enviar", negocio, folio, rfc, email });
}

export async function timbrar(negocio: string, folio: string, receptor: Receptor): Promise<Timbrado> {
  return aTimbrado(await llamar({ accion: "timbrar", negocio, folio, receptor }));
}

/**
 * Ofrece un archivo al navegador desde base64.
 *
 * El PAC no guarda nada en la modalidad que usamos, así que estos bytes llegaron en la respuesta
 * del timbrado y son la única copia que el cliente va a ver aquí.
 */
export function descargar(base64: string, nombre: string, tipo: string): void {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  // Revocar en el mismo instante aborta la descarga en Safari: se le da tiempo a empezar.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Misma regla que el servidor (`_shared/pac/receptor.ts`): empresa 12, persona física 13. */
export const RFC_VALIDO = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
