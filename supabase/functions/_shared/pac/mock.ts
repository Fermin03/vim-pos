// F8 — PAC MOCK. Activo en dev/piloto cuando NO hay credenciales de PAC real configuradas.
// Genera un UUID fiscal determinista-aleatorio y un XML mínimo, simulando un timbrado SAT
// exitoso. NO produce un CFDI fiscalmente válido — solo permite ejercitar todo el pipeline
// (borrador → timbrado → estado TIMBRADO → almacenamiento) sin un PAC real.
import type { PacAdapter, PacTimbradoRequest, PacTimbradoResult } from "./tipos.ts";

export class MockPac implements PacAdapter {
  readonly nombre = "MOCK";

  // deno-lint-ignore require-await
  async timbrar(req: PacTimbradoRequest): Promise<PacTimbradoResult> {
    const uuid = crypto.randomUUID().toUpperCase();
    const now = new Date().toISOString();
    const folio = "MOCK-" + req.cfdiId.slice(0, 8);
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" ` +
      `Total="${req.total.toFixed(2)}" SubTotal="${req.subtotal.toFixed(2)}" ` +
      `MetodoPago="${req.metodoPagoSat}" FormaPago="${req.formaPagoSat}" ` +
      `LugarExpedicion="${req.emisor.lugarExpedicion}">` +
      `<cfdi:Emisor Rfc="${req.emisor.rfc}" Nombre="${req.emisor.razonSocial}" RegimenFiscal="${req.emisor.regimenFiscal}"/>` +
      `<cfdi:Receptor Rfc="${req.receptor.rfc}" Nombre="${req.receptor.razonSocial}" ` +
      `UsoCFDI="${req.receptor.usoCfdi}" DomicilioFiscalReceptor="${req.receptor.codigoPostal}" ` +
      `RegimenFiscalReceptor="${req.receptor.regimenFiscal}"/>` +
      // Los conceptos van también en el mock: si el XML de desarrollo tiene otra forma que el de
      // producción, los problemas de desglose no aparecen hasta que hay dinero de por medio.
      `<cfdi:Conceptos>` +
      req.conceptos
        .map((c) =>
          `<cfdi:Concepto ClaveProdServ="${c.claveProdServ}" ClaveUnidad="${c.claveUnidad}" ` +
          `Cantidad="${c.cantidad}" Descripcion="${c.descripcion.replace(/[<>&"]/g, "")}" ` +
          `ValorUnitario="${c.valorUnitario}" Importe="${c.importe.toFixed(2)}" ` +
          (c.descuento > 0 ? `Descuento="${c.descuento.toFixed(2)}" ` : "") +
          `ObjetoImp="02"/>`
        )
        .join("") +
      `</cfdi:Conceptos>` +
      `<cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}" FechaTimbrado="${now}"/></cfdi:Complemento>` +
      `</cfdi:Comprobante>`;

    return {
      ok: true,
      uuidFiscal: uuid,
      serie: "MOCK",
      folioFiscal: folio,
      fechaTimbrado: now,
      fechaEmision: now,
      xml,
      pacReferencia: "MOCK-" + uuid.slice(0, 12),
      costoCentavos: 0,
      responsePayload: { mock: true, uuid, nota: "Timbrado simulado — NO válido fiscalmente." },
    };
  }
}
