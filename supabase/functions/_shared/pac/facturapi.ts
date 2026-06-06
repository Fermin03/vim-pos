// F8 — Adaptador Facturapi (facturapi.io) — @SIN-VERIFICAR.
// Codificado siguiendo la API REST de Facturapi pero NO probado contra el servicio real
// (igual que EpsonEposAdapter en impresión). Se activa cuando hay FACTURAPI_API_KEY en el
// entorno de la función. Antes de usar en producción: validar el mapeo de conceptos/impuestos
// CFDI 4.0, el manejo de errores del SAT, y subir el CSD al emisor de Facturapi.
import type { PacAdapter, PacTimbradoRequest, PacTimbradoResult } from "./tipos.ts";

const FACTURAPI_BASE = "https://www.facturapi.io/v2";

export class FacturapiPac implements PacAdapter {
  readonly nombre = "FACTURAPI";
  constructor(private readonly apiKey: string) {}

  async timbrar(req: PacTimbradoRequest): Promise<PacTimbradoResult> {
    // Facturapi arma el CFDI a partir de un payload de alto nivel y lo timbra en una llamada.
    const body = {
      type: req.tipoComprobante === "EGRESO" ? "E" : "I",
      payment_form: req.formaPagoSat,
      payment_method: req.metodoPagoSat,
      use: req.receptor.usoCfdi,
      customer: {
        legal_name: req.receptor.razonSocial,
        tax_id: req.receptor.rfc,
        tax_system: req.receptor.regimenFiscal,
        address: { zip: req.receptor.codigoPostal },
        email: req.receptor.email ?? undefined,
      },
      // Un solo concepto agregado por el total (MVP). En producción se mapea ítem por ítem.
      items: [
        {
          quantity: 1,
          product: {
            description: "Consumo en restaurante",
            product_key: "90101500", // Servicios de restaurantes y banquetes (SAT)
            price: Number((req.subtotal).toFixed(2)),
            tax_included: false,
            taxes: [{ type: "IVA", rate: 0.16 }],
          },
        },
      ],
    };

    let res: Response;
    try {
      res = await fetch(`${FACTURAPI_BASE}/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return {
        ok: false,
        codigoError: "PAC_NO_DISPONIBLE",
        mensajeError: e instanceof Error ? e.message : "No se pudo contactar al PAC",
        responsePayload: {},
      };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        codigoError: String((data.code as string) ?? res.status),
        mensajeError: String((data.message as string) ?? "Error de timbrado en el PAC"),
        responsePayload: data,
      };
    }

    // Mapeo de la respuesta de Facturapi al contrato del PAC.
    const uuid = String(data.uuid ?? "");
    const stamp = (data.stamp as Record<string, unknown> | undefined) ?? {};
    return {
      ok: true,
      uuidFiscal: uuid,
      serie: String(data.series ?? ""),
      folioFiscal: String(data.folio_number ?? ""),
      fechaTimbrado: String(stamp.date ?? new Date().toISOString()),
      fechaEmision: String(data.date ?? new Date().toISOString()),
      xml: "", // Facturapi expone XML/PDF por endpoints aparte: GET /invoices/:id/xml
      pacReferencia: String(data.id ?? ""),
      costoCentavos: 0,
      responsePayload: data,
    };
  }
}
