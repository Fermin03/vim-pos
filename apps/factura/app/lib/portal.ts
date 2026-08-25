"use client";

/**
 * Cliente del portal de autofactura.
 *
 * Todo va contra la Edge Function `autofacturar` y nada directo a la base: quien usa este portal no
 * tiene sesión, así que el RLS no puede acotarlo. El acotamiento y el límite de ritmo viven ahí.
 */

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type TicketEncontrado = {
  negocio: string;
  logo: string | null;
  ticket: { folio: string; fecha: string; total: number };
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

/** Un fallo con la forma que la pantalla necesita: qué decir y qué campo señalar. */
export class ErrorPortal extends Error {
  readonly campo: string | null;
  constructor(mensaje: string, campo: string | null = null) {
    super(mensaje);
    this.name = "ErrorPortal";
    this.campo = campo;
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
    );
  }
  return d;
}

export async function buscarTicket(negocio: string, folio: string): Promise<TicketEncontrado> {
  const d = await llamar({ accion: "buscar", negocio, folio });
  return {
    negocio: String(d.negocio),
    logo: (d.logo as string) ?? null,
    ticket: d.ticket as TicketEncontrado["ticket"],
    usosPorRegimen: (d.usosPorRegimen ?? {}) as Record<string, string[]>,
  };
}

export async function timbrar(negocio: string, folio: string, receptor: Receptor): Promise<Timbrado> {
  const d = await llamar({ accion: "timbrar", negocio, folio, receptor });
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
  URL.revokeObjectURL(url);
}

export const REGIMENES = [
  { v: "601", l: "601 · General de Ley Personas Morales" },
  { v: "603", l: "603 · Personas Morales sin fines de lucro" },
  { v: "605", l: "605 · Sueldos y salarios" },
  { v: "606", l: "606 · Arrendamiento" },
  { v: "612", l: "612 · Actividades empresariales y profesionales" },
  { v: "614", l: "614 · Ingresos por intereses" },
  { v: "616", l: "616 · Sin obligaciones fiscales" },
  { v: "621", l: "621 · Incorporación Fiscal" },
  { v: "626", l: "626 · RESICO" },
] as const;

export const USOS: Record<string, string> = {
  G01: "G01 · Adquisición de mercancías",
  G03: "G03 · Gastos en general",
  I01: "I01 · Construcciones",
  I08: "I08 · Otra maquinaria y equipo",
  D01: "D01 · Honorarios médicos",
  D02: "D02 · Gastos médicos por incapacidad",
  D03: "D03 · Gastos funerales",
  D04: "D04 · Donativos",
  D07: "D07 · Primas de seguros de gastos médicos",
  D10: "D10 · Pagos por servicios educativos",
  P01: "P01 · Por definir",
};
