// F8 — Contrato del PAC (Proveedor Autorizado de Certificación). Una sola interfaz
// alimenta tanto el PAC mock (activo en dev/piloto) como Facturapi real (@sin-verificar).
// Mismo patrón que la impresión (doc 16): una fuente lógica, varios adaptadores.
import type { ConceptoCfdi } from "./conceptos.ts";

/** Datos del CFDI borrador que se envían al PAC para timbrar. */
export type PacTimbradoRequest = {
  cfdiId: string;
  tipoComprobante: string; // INGRESO/EGRESO
  emisor: { rfc: string; razonSocial: string; regimenFiscal: string; lugarExpedicion: string };
  receptor: {
    rfc: string;
    razonSocial: string;
    usoCfdi: string;
    codigoPostal: string;
    regimenFiscal: string;
    email: string | null;
  };
  metodoPagoSat: string; // PUE/PPD
  formaPagoSat: string; // 01, 03, 04, 28...
  /**
   * Folio del ticket. Facturama lo exige: sin él responde 400 "The Folio field is required".
   * Además amarra el CFDI con la venta cuando alguien reclama meses después.
   */
  folio: string;
  /**
   * Logo del negocio para el PDF. **PNG o JPG**: Facturama rechaza SVG con "la imagen debe ser
   * jpg, jpeg o png". `null` = el PDF sale sin logo, que es preferible a que falle el timbrado.
   */
  logoUrl: string | null;
  /**
   * Los renglones del comprobante, ya desglosados por `armarConceptos`. Van armados FUERA del
   * adaptador porque el desglose es aritmética fiscal idéntica para cualquier PAC: si cada
   * adaptador la repitiera, cada uno la equivocaría a su manera.
   *
   * `subtotal`, `descuento` e `iva` de abajo son la suma de estos conceptos, no los del ticket:
   * un descuento sobre el ticket completo baja la base gravable y por tanto el IVA, cosa que
   * `tickets.iva_mxn` hoy no refleja.
   */
  conceptos: ConceptoCfdi[];
  /**
   * Presente SOLO en la factura global. Su presencia es lo que convierte al CFDI en global: el PAC
   * exige este nodo cuando el receptor es `XAXX010101000`, y lo rechaza si falta.
   *
   * `mes` sigue el catálogo del SAT y depende de la periodicidad: 01–12 normalmente, 13–18 cuando
   * la periodicidad es `05` (bimestral). Mandar el que no toca se rechaza con mensaje explícito.
   */
  global?: { periodicidad: string; mes: string; anio: number } | null;
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
};

/** Respuesta de un timbrado exitoso. */
export type PacTimbradoOk = {
  ok: true;
  uuidFiscal: string;
  serie: string;
  folioFiscal: string;
  fechaTimbrado: string; // ISO
  fechaEmision: string; // ISO
  xml: string; // contenido o base64 del XML timbrado
  pacReferencia: string;
  costoCentavos: number;
  responsePayload: Record<string, unknown>;
};

/** Respuesta de error de timbrado. */
export type PacTimbradoError = {
  ok: false;
  codigoError: string;
  mensajeError: string;
  responsePayload: Record<string, unknown>;
};

export type PacTimbradoResult = PacTimbradoOk | PacTimbradoError;

/** Adaptador de PAC: implementado por mock (dev) y facturapi (prod, @sin-verificar). */
export interface PacAdapter {
  readonly nombre: string;
  timbrar(req: PacTimbradoRequest): Promise<PacTimbradoResult>;
}
