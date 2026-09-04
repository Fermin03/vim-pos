// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { claveOrigenDe, leerCfdiRecibido, normalizarDescripcion } from "../cfdi-recibido";

function cfdi(opts: { tipo?: string; moneda?: string; version?: string; timbre?: boolean; conceptos?: string } = {}): string {
  const { tipo = "I", moneda = "MXN", version = "4.0", timbre = true } = opts;
  const conceptos = opts.conceptos ?? `
    <cfdi:Concepto ClaveProdServ="50181900" NoIdentificacion="PB-12" Cantidad="2" ClaveUnidad="XBX" Unidad="Caja"
        Descripcion="PAN BRIOCHE CAJA 12 PZ" ValorUnitario="160.00" Importe="320.00" Descuento="20.00" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados>
        <cfdi:Traslado Base="300.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="48.00"/>
      </cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
    <cfdi:Concepto ClaveProdServ="78101800" Cantidad="1" ClaveUnidad="E48" Descripcion="Flete  a  Léon" ValorUnitario="100.00" Importe="100.00" ObjetoImp="01"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="${version}" Serie="A" Folio="1234" Fecha="2026-09-03T10:15:00" SubTotal="420.00" Descuento="20.00"
  Moneda="${moneda}" Total="448.00" TipoDeComprobante="${tipo}" LugarExpedicion="37150">
  <cfdi:Emisor Rfc="PSM010101AB1" Nombre="PANIFICADORA SMOKE SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="VIMF0308282D7" Nombre="FERMIN VILLALOBOS" UsoCFDI="G01" DomicilioFiscalReceptor="37150" RegimenFiscalReceptor="612"/>
  <cfdi:Conceptos>${conceptos}</cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="48.00"/>
  ${timbre ? `<cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE" FechaTimbrado="2026-09-03T10:16:00"/></cfdi:Complemento>` : ""}
</cfdi:Comprobante>`;
}

describe("leerCfdiRecibido", () => {
  it("lee cabecera, emisor, receptor, timbre y conceptos con descuento e IVA", () => {
    const r = leerCfdiRecibido(cfdi());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cfdi.uuid).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(r.cfdi.fecha).toBe("2026-09-03");
    expect(r.cfdi.serie).toBe("A");
    expect(r.cfdi.folio).toBe("1234");
    expect(r.cfdi.emisor).toEqual({ rfc: "PSM010101AB1", nombre: "PANIFICADORA SMOKE SA DE CV" });
    expect(r.cfdi.receptorRfc).toBe("VIMF0308282D7");
    expect(r.cfdi.subtotal).toBe(420);
    expect(r.cfdi.descuento).toBe(20);
    expect(r.cfdi.iva).toBe(48);
    expect(r.cfdi.total).toBe(448);
    expect(r.cfdi.conceptos).toHaveLength(2);
    const [pan, flete] = r.cfdi.conceptos;
    expect(pan).toMatchObject({ claveOrigen: "PB-12", claveProdServ: "50181900", noIdentificacion: "PB-12", cantidad: 2, claveUnidad: "XBX", unidad: "Caja", valorUnitario: 160, descuento: 20, importeSinIva: 300 });
    expect(flete).toMatchObject({ claveOrigen: "78101800|flete a leon", noIdentificacion: null, unidad: null, importeSinIva: 100 });
    expect(r.cfdi.avisos).toEqual([]);
  });
  it("sin timbre → error", () => {
    expect(leerCfdiRecibido(cfdi({ timbre: false }))).toEqual({ ok: false, motivo: "El archivo no está timbrado" });
  });
  it("tipo E (egreso) → error explicando", () => {
    const r = leerCfdiRecibido(cfdi({ tipo: "E" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/no es una factura de compra/);
  });
  it("moneda distinta de MXN → error", () => {
    expect(leerCfdiRecibido(cfdi({ moneda: "USD" }))).toEqual({ ok: false, motivo: "Solo se aceptan facturas en pesos" });
  });
  it("versión 3.3 → se acepta con aviso", () => {
    const r = leerCfdiRecibido(cfdi({ version: "3.3" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cfdi.avisos).toContain("La factura es CFDI 3.3; revisa los conceptos");
  });
  it("XML que no es CFDI → error", () => {
    expect(leerCfdiRecibido("<html><body>hola</body></html>")).toEqual({ ok: false, motivo: "El archivo no es una factura CFDI" });
  });
  it("XML roto → error", () => {
    expect(leerCfdiRecibido("<cfdi:Comprobante").ok).toBe(false);
  });
});

describe("claveOrigenDe / normalizarDescripcion", () => {
  it("usa NoIdentificacion cuando existe", () => {
    expect(claveOrigenDe("50181900", " PB-12 ", "lo que sea")).toBe("PB-12");
  });
  it("si no, clave SAT + descripción normalizada, máximo 120", () => {
    expect(normalizarDescripcion("  Pan  Brioche  Léon ")).toBe("pan brioche leon");
    expect(claveOrigenDe("50181900", null, "x".repeat(200))).toHaveLength(120);
  });
});
