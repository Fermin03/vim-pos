// Lector del XML de un CFDI 4.0 RECIBIDO (la factura que nos da el proveedor). Función pura:
// no toca la red ni guarda el archivo. Spec 2026-09-03 §5. Busca por localName para tolerar los
// prefijos cfdi:/tfd: y cualquier orden de atributos.

export type ConceptoCfdi = {
  claveOrigen: string; claveProdServ: string; noIdentificacion: string | null; descripcion: string;
  cantidad: number; claveUnidad: string; unidad: string | null; valorUnitario: number; descuento: number; importeSinIva: number;
};
export type CfdiRecibido = {
  uuid: string; fecha: string; serie: string | null; folio: string | null;
  emisor: { rfc: string; nombre: string }; receptorRfc: string;
  subtotal: number; descuento: number; iva: number; total: number; conceptos: ConceptoCfdi[]; avisos: string[];
};
export type ResultadoLectura = { ok: true; cfdi: CfdiRecibido } | { ok: false; motivo: string };

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string | null) => (v == null || v === "" ? 0 : Number(v));
const attr = (el: Element | null, nombre: string): string | null => el?.getAttribute(nombre) ?? null;

function hijos(el: Element | null, localName: string): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter((c) => c.localName === localName);
}
function descendientes(el: Element | Document, localName: string): Element[] {
  return Array.from(el.getElementsByTagNameNS("*", localName));
}

export function normalizarDescripcion(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function claveOrigenDe(claveProdServ: string, noIdentificacion: string | null, descripcion: string): string {
  const ident = (noIdentificacion ?? "").trim();
  const clave = ident ? ident : `${claveProdServ}|${normalizarDescripcion(descripcion)}`;
  return clave.slice(0, 120);
}

export function leerCfdiRecibido(xml: string): ResultadoLectura {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return { ok: false, motivo: "No se pudo leer el archivo" };
  }
  if (descendientes(doc, "parsererror").length > 0) return { ok: false, motivo: "El archivo XML está dañado" };
  const comp = doc.documentElement;
  if (!comp || comp.localName !== "Comprobante") return { ok: false, motivo: "El archivo no es una factura CFDI" };

  const avisos: string[] = [];
  const version = attr(comp, "Version") ?? "";
  if (version === "3.3") avisos.push("La factura es CFDI 3.3; revisa los conceptos");
  else if (version !== "4.0") return { ok: false, motivo: `Versión de CFDI no soportada (${version || "desconocida"})` };

  const tipo = attr(comp, "TipoDeComprobante");
  if (tipo !== "I") return { ok: false, motivo: `Este XML es de tipo ${tipo ?? "?"}, no es una factura de compra (ingreso)` };
  if ((attr(comp, "Moneda") ?? "MXN") !== "MXN") return { ok: false, motivo: "Solo se aceptan facturas en pesos" };

  const timbre = descendientes(comp, "TimbreFiscalDigital")[0] ?? null;
  const uuid = attr(timbre, "UUID");
  if (!uuid) return { ok: false, motivo: "El archivo no está timbrado" };

  const emisor = hijos(comp, "Emisor")[0] ?? null;
  const receptor = hijos(comp, "Receptor")[0] ?? null;
  const conceptosEl = hijos(comp, "Conceptos")[0] ?? null;

  const conceptos: ConceptoCfdi[] = hijos(conceptosEl, "Concepto").map((c) => {
    const claveProdServ = attr(c, "ClaveProdServ") ?? "";
    const noIdent = (attr(c, "NoIdentificacion") ?? "").trim() || null;
    const descripcion = (attr(c, "Descripcion") ?? "").trim();
    const importe = num(attr(c, "Importe"));
    const descuento = num(attr(c, "Descuento"));
    return {
      claveOrigen: claveOrigenDe(claveProdServ, noIdent, descripcion),
      claveProdServ, noIdentificacion: noIdent, descripcion,
      cantidad: r6(num(attr(c, "Cantidad"))),
      claveUnidad: attr(c, "ClaveUnidad") ?? "",
      unidad: (attr(c, "Unidad") ?? "").trim() || null,
      valorUnitario: r6(num(attr(c, "ValorUnitario"))),
      descuento: r2(descuento),
      importeSinIva: r2(importe - descuento),
    };
  });

  // IVA = traslados con Impuesto 002 de cada concepto (los del comprobante pueden incluir IEPS).
  const iva = r2(conceptos.length === 0 ? 0 : hijos(conceptosEl, "Concepto").reduce((acc, c) => {
    const traslados = descendientes(c, "Traslado").filter((t) => attr(t, "Impuesto") === "002");
    return acc + traslados.reduce((a, t) => a + num(attr(t, "Importe")), 0);
  }, 0));

  return {
    ok: true,
    cfdi: {
      uuid: uuid.toLowerCase(),
      fecha: (attr(comp, "Fecha") ?? "").slice(0, 10),
      serie: attr(comp, "Serie") || null,
      folio: attr(comp, "Folio") || null,
      emisor: { rfc: (attr(emisor, "Rfc") ?? "").toUpperCase(), nombre: (attr(emisor, "Nombre") ?? "").trim() },
      receptorRfc: (attr(receptor, "Rfc") ?? "").toUpperCase(),
      subtotal: r2(num(attr(comp, "SubTotal"))),
      descuento: r2(num(attr(comp, "Descuento"))),
      iva,
      total: r2(num(attr(comp, "Total"))),
      conceptos,
      avisos,
    },
  };
}
