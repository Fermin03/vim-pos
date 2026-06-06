// F8 — Contrato del PAC (Proveedor Autorizado de Certificación). Una sola interfaz
// alimenta tanto el PAC mock (activo en dev/piloto) como Facturapi real (@sin-verificar).
// Mismo patrón que la impresión (doc 16): una fuente lógica, varios adaptadores.

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
