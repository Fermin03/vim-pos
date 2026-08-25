// Adaptador de Facturama, modalidad API Multiemisor — VERIFICADO contra su sandbox el 24-ago-2026.
//
// A diferencia del adaptador de Facturapi, este SÍ usa el emisor que recibe: Facturama Multiemisor
// lleva el RFC del emisor en el payload y busca su sello (CSD) por ese RFC. Ahí está toda la razón
// de haberlo elegido — con una sola credencial de nuestra cuenta se timbra a nombre de cualquier
// cliente, sin custodiar una llave por negocio.
//
// Probado: dos CFDI desde la misma cuenta, uno con EKU9003173C9 y otro con EWE1709045U0, cada uno
// con su propio UUID. Esa prueba es obligatoria antes de producción (ver el plan del CFDI §7.2),
// porque el modo de fallo silencioso —timbrar con el RFC equivocado— le mete una factura ajena a la
// contabilidad de alguien.
//
// El detalle de rutas, payloads y trampas está en la habilidad `facturama-cfdi` del proyecto.
import type { PacAdapter, PacTimbradoRequest, PacTimbradoResult } from "./tipos.ts";

/** Sandbox por defecto: si alguien despliega sin configurar la URL, que timbre en pruebas y no en
 *  producción. Equivocarse hacia el lado inofensivo. */
const BASE_POR_DEFECTO = "https://apisandbox.facturama.mx";

type RespuestaFacturama = {
  Id?: string;
  Folio?: string;
  Date?: string;
  Complement?: { TaxStamp?: { Uuid?: string; Date?: string; RfcProvCertif?: string } };
  Issuer?: { Rfc?: string };
  [k: string]: unknown;
};

export class FacturamaPac implements PacAdapter {
  readonly nombre = "FACTURAMA";

  // Campos explícitos y no propiedades de constructor: así el adaptador se puede ejecutar con
  // `node --experimental-strip-types` para probarlo contra el sandbox sin instalar Deno. Es la
  // diferencia entre poder verificarlo en cualquier máquina o no poder verificarlo.
  private readonly usuario: string;
  private readonly password: string;
  private readonly baseUrl: string;

  constructor(usuario: string, password: string, baseUrl: string = BASE_POR_DEFECTO) {
    this.usuario = usuario;
    this.password = password;
    this.baseUrl = baseUrl;
  }

  private get autorizacion(): string {
    return "Basic " + btoa(`${this.usuario}:${this.password}`);
  }

  async timbrar(req: PacTimbradoRequest): Promise<PacTimbradoResult> {
    const cuerpo = this.construirCfdi(req);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api-lite/3/cfdis`, {
        method: "POST",
        headers: {
          Authorization: this.autorizacion,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(cuerpo),
      });
    } catch (e) {
      // Fallo de TRANSPORTE: se propaga para que el selector pueda intentar con el PAC de respaldo.
      // Es la única familia de errores donde reintentar es seguro.
      throw new Error(`FACTURAMA_RED: ${e instanceof Error ? e.message : String(e)}`);
    }

    const texto = await res.text();
    let datos: RespuestaFacturama | Record<string, unknown>;
    try {
      datos = JSON.parse(texto || "null");
    } catch {
      return {
        ok: false,
        codigoError: `HTTP_${res.status}`,
        mensajeError: texto.slice(0, 500) || "Respuesta ilegible del PAC",
        responsePayload: { crudo: texto.slice(0, 2000) },
      };
    }

    if (!res.ok) {
      const { codigo, mensaje } = interpretarError(res.status, datos as Record<string, unknown>);
      return { ok: false, codigoError: codigo, mensajeError: mensaje, responsePayload: datos as Record<string, unknown> };
    }

    const d = datos as RespuestaFacturama;
    const uuid = d.Complement?.TaxStamp?.Uuid;
    if (!uuid) {
      // 2xx sin UUID no es un timbrado. Darlo por bueno dejaría una venta marcada como facturada
      // sin comprobante que enseñarle al SAT.
      return {
        ok: false,
        codigoError: "SIN_UUID",
        mensajeError: "El PAC respondió correctamente pero sin UUID fiscal",
        responsePayload: d as Record<string, unknown>,
      };
    }

    const fechaTimbrado = d.Complement?.TaxStamp?.Date ?? new Date().toISOString();
    return {
      ok: true,
      uuidFiscal: uuid,
      serie: String(cuerpo.Serie ?? ""),
      folioFiscal: String(d.Folio ?? req.folio),
      fechaTimbrado,
      fechaEmision: d.Date ?? fechaTimbrado,
      // El XML se descarga aparte: en Multiemisor Facturama NO guarda nada, así que si no lo
      // bajamos y lo archivamos nosotros, se pierde. Lo hace `timbrar-cfdi` con `descargar()`.
      xml: "",
      pacReferencia: String(d.Id ?? ""),
      costoCentavos: 50, // $0.50 por folio, supuesto del modelo. Confirmar con el comercial.
      responsePayload: d as Record<string, unknown>,
    };
  }

  /**
   * Descarga el XML, el PDF o la representación HTML de un CFDI ya timbrado.
   *
   * Facturama devuelve base64 dentro de un sobre JSON, no el archivo. Y estas rutas van SIN el
   * prefijo `api-lite`, al revés que el timbrado — con el prefijo responden 404.
   */
  async descargar(id: string, formato: "xml" | "pdf" | "html"): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/cfdi/${formato}/issuedLite/${id}`, {
      headers: { Authorization: this.autorizacion, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    return (d && typeof d.Content === "string") ? d.Content : null; // base64
  }

  /**
   * Cancela un CFDI. Motivos del SAT: 01 con errores con relación, 02 con errores sin relación,
   * 03 no se llevó a cabo la operación, 04 operación nominativa en una factura global.
   *
   * OJO: en el sandbox esto responde 200 y el comprobante SIGUE apareciendo activo. No se puede dar
   * la cancelación por buena con una prueba de sandbox; hay que verificarla en producción.
   */
  async cancelar(
    id: string,
    motivo: "01" | "02" | "03" | "04",
    uuidSustituto?: string,
  ): Promise<{ ok: true; cuerpo: string } | { ok: false; codigo: string; mensaje: string }> {
    // El motivo 01 significa "con errores CON relación": el SAT exige decir cuál es el comprobante
    // que sustituye al cancelado. Se valida AQUÍ porque **la API no lo valida**: comprobado contra
    // el sandbox, un DELETE con motivo 01 y sin sustituto responde 200 tan tranquilo. Dejarlo pasar
    // produciría una solicitud que el SAT rechaza después, cuando ya nadie está mirando.
    if (motivo === "01" && !uuidSustituto) {
      return {
        ok: false,
        codigo: "FALTA_SUSTITUTO",
        mensaje: "El motivo 01 exige el UUID del comprobante que sustituye al cancelado.",
      };
    }

    const params = new URLSearchParams({ type: "issuedLite", motive: motivo });
    if (uuidSustituto) params.set("uuidReplacement", uuidSustituto);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api-lite/cfdi/${id}?${params}`, {
        method: "DELETE",
        headers: { Authorization: this.autorizacion, Accept: "application/json" },
      });
    } catch (e) {
      return { ok: false, codigo: "RED", mensaje: e instanceof Error ? e.message : String(e) };
    }

    const cuerpo = await res.text();
    if (res.ok) return { ok: true, cuerpo };

    let datos: Record<string, unknown>;
    try {
      datos = JSON.parse(cuerpo || "null") ?? {};
    } catch {
      return { ok: false, codigo: `HTTP_${res.status}`, mensaje: cuerpo.slice(0, 300) };
    }
    const { codigo, mensaje } = interpretarError(res.status, datos);
    return { ok: false, codigo, mensaje };
  }

  /**
   * Acuse de cancelación del SAT. Es el único documento que prueba que un comprobante se canceló,
   * así que se descarga y se archiva: en Multiemisor el PAC no guarda nada.
   *
   * Ruta verificada: `/cfdi/acuse/issuedLite/{id}?format=xml`. El formato va como parámetro, no en
   * la ruta como en las otras descargas — con `/acuse/xml/...` responde 404.
   *
   * OJO: en el sandbox devuelve el propio comprobante, no un acuse, porque allí la cancelación no
   * surte efecto. Hay que comprobar en producción qué llega de verdad antes de fiarse.
   */
  async descargarAcuse(id: string): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/cfdi/acuse/issuedLite/${encodeURIComponent(id)}?format=xml`, {
      headers: { Authorization: this.autorizacion, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    return d && typeof d.Content === "string" ? d.Content : null;
  }

  /**
   * Carga el sello (CSD) de un emisor. Se hace UNA vez por RFC; a partir de ahí cada timbrado
   * encuentra el sello por el `Rfc` del `Issuer`.
   *
   * La llave privada y su contraseña pasan por aquí y no se guardan en ningún sitio nuestro: ni en
   * la base, ni en logs, ni en los respaldos. Este método es el único punto del código que las ve.
   */
  async cargarSello(
    rfc: string,
    certificadoBase64: string,
    llaveBase64: string,
    passwordLlave: string,
  ): Promise<{ ok: true; reemplazado: boolean } | { ok: false; codigo: string; mensaje: string }> {
    const cuerpo = {
      Rfc: rfc,
      Certificate: certificadoBase64,
      PrivateKey: llaveBase64,
      PrivateKeyPassword: passwordLlave,
    };

    const alta = await this.peticionSello("POST", "/api-lite/csds", cuerpo);
    if (alta.ok) return { ok: true, reemplazado: false };

    // `POST` NO reemplaza: con un sello ya cargado responde «Ya existe un CSD asociado a este
    // RFC». Renovar es la operación NORMAL —los CSD del SAT caducan cada cuatro años— así que un
    // choque aquí no es un error del usuario, es la señal de que toca `PUT`.
    if (!/ya existe/i.test(alta.mensaje)) return alta;

    const reemplazo = await this.peticionSello("PUT", `/api-lite/csds/${encodeURIComponent(rfc)}`, cuerpo);
    return reemplazo.ok ? { ok: true, reemplazado: true } : reemplazo;
  }

  private async peticionSello(
    metodo: "POST" | "PUT",
    ruta: string,
    cuerpo: Record<string, string>,
  ): Promise<{ ok: true } | { ok: false; codigo: string; mensaje: string }> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${ruta}`, {
        method: metodo,
        headers: {
          Authorization: this.autorizacion,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(cuerpo),
      });
    } catch (e) {
      return { ok: false, codigo: "RED", mensaje: e instanceof Error ? e.message : String(e) };
    }

    if (res.ok) return { ok: true };

    const texto = await res.text();
    let datos: Record<string, unknown>;
    try {
      datos = JSON.parse(texto || "null") ?? {};
    } catch {
      return { ok: false, codigo: `HTTP_${res.status}`, mensaje: texto.slice(0, 300) };
    }
    const { codigo, mensaje } = interpretarError(res.status, datos);
    return { ok: false, codigo, mensaje };
  }

  /**
   * Quita el sello de un emisor de nuestra cuenta.
   *
   * Va con la baja de un cliente, no es opcional: mientras su CSD siga cargado, su sello fiscal
   * sigue en una cuenta que ya no le sirve de nada y que nosotros seguimos pudiendo usar.
   */
  async borrarSello(rfc: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/api-lite/csds/${encodeURIComponent(rfc)}`, {
      method: "DELETE",
      headers: { Authorization: this.autorizacion, Accept: "application/json" },
    });
    return res.ok;
  }

  /** Arma el CFDI 4.0 en la forma que Facturama espera. */
  private construirCfdi(req: PacTimbradoRequest): Record<string, unknown> {
    const subtotal = redondear(req.subtotal);
    const descuento = redondear(req.descuento);
    const iva = redondear(req.iva);
    const total = redondear(req.total);

    if (req.conceptos.length === 0) {
      throw new Error("FACTURAMA_SIN_CONCEPTOS: el CFDI no lleva renglones");
    }

    const cfdi: Record<string, unknown> = {
      CfdiType: req.tipoComprobante === "EGRESO" ? "E" : "I",
      PaymentForm: req.formaPagoSat,
      PaymentMethod: req.metodoPagoSat,
      ExpeditionPlace: req.emisor.lugarExpedicion,
      Currency: "MXN",
      // Obligatorio: sin Folio, 400. Va el folio del ticket para amarrar CFDI y venta.
      Folio: req.folio,
      OrderNumber: req.folio,
      // El nodo que convierte el comprobante en global. Va antes del emisor porque sin él, un
      // receptor XAXX010101000 se rechaza — y con él, ese receptor ES la factura global.
      ...(req.global
        ? {
            GlobalInformation: {
              Periodicity: req.global.periodicidad,
              Months: req.global.mes,
              Year: req.global.anio,
            },
          }
        : {}),
      Issuer: {
        Rfc: req.emisor.rfc,
        // Sin el régimen societario y en mayúsculas, como lo tiene registrado el SAT. Si no
        // coincide con su padrón, rechaza.
        Name: limpiarRazonSocial(req.emisor.razonSocial),
        FiscalRegime: req.emisor.regimenFiscal,
      },
      Receiver: {
        Rfc: req.receptor.rfc,
        Name: limpiarRazonSocial(req.receptor.razonSocial),
        CfdiUse: req.receptor.usoCfdi,
        FiscalRegime: req.receptor.regimenFiscal,
        // El SAT valida que este CP sea EL DEL RFC, no cualquiera válido. Es el rechazo más
        // frecuente de la autofacturación.
        TaxZipCode: req.receptor.codigoPostal,
      },
      Items: req.conceptos.map((c) => ({
        ProductCode: c.claveProdServ,
        Description: c.descripcion,
        Unit: c.unidad,
        UnitCode: c.claveUnidad,
        UnitPrice: c.valorUnitario,
        Quantity: c.cantidad,
        Subtotal: c.importe,
        // Facturama solo acepta el campo si hay descuento; mandar 0 en todos los renglones ensucia
        // el XML sin aportar nada.
        ...(c.descuento > 0 ? { Discount: c.descuento } : {}),
        TaxObject: "02", // sí objeto de impuesto (la tasa 0 también lo es)
        Taxes: [{
          Name: "IVA",
          Rate: redondear(c.tasaIva / 100, 6),
          Total: c.iva,
          Base: redondear(c.importe - c.descuento),
          IsRetention: false,
          IsFederalTax: true,
        }],
        Total: c.total,
      })),
      Subtotal: subtotal,
      ...(descuento > 0 ? { Discount: descuento } : {}),
      Total: total,
    };

    // El logo solo si es un formato que el PAC acepta. Mandar un SVG tumba el timbrado entero por
    // un adorno, así que ante la duda va sin logo.
    if (req.logoUrl && /\.(png|jpe?g)(\?|$)/i.test(req.logoUrl)) cfdi.LogoUrl = req.logoUrl;

    if (req.receptor.email) (cfdi.Receiver as Record<string, unknown>).Email = req.receptor.email;

    return cfdi;
  }
}

/**
 * Traduce el rechazo de Facturama a un código y un mensaje aprovechables.
 *
 * Sus 400 traen `ModelState` con el campo exacto que falló, que es mucho más útil que el
 * "La solicitud no es válida" de arriba. Se conserva el nombre del campo en el código de error
 * para poder agrupar fallos después sin leer texto libre.
 */
function interpretarError(status: number, datos: Record<string, unknown>): { codigo: string; mensaje: string } {
  const modelState = datos.ModelState as Record<string, string[]> | undefined;
  if (modelState) {
    const campos = Object.entries(modelState);
    const detalle = campos
      .map(([campo, errores]) => `${campo.replace("cfdiToCreate.", "")}: ${errores[0]}`)
      .join(" · ");
    const primerCampo = campos[0]?.[0]?.replace("cfdiToCreate.", "") ?? "DESCONOCIDO";
    return { codigo: `VALIDACION_${primerCampo.toUpperCase()}`, mensaje: detalle };
  }
  const mensaje = typeof datos.Message === "string" ? datos.Message : `HTTP ${status}`;
  return { codigo: `HTTP_${status}`, mensaje };
}

/**
 * Régimen societario al final del nombre. Va como literal y no armado con `new RegExp` a partir de
 * strings: en un string de TypeScript `"\."` se colapsa a `"."`, que en una expresión regular
 * significa "cualquier carácter" — el patrón parecía correcto leyéndolo y no lo era.
 *
 * El orden importa: la alternancia gana con la primera que cuadre, así que las formas largas van
 * antes que las cortas (si `S\.?A\.?` fuera primera, "SA DE CV" quedaría como "DE CV").
 */
const REGIMEN_AL_FINAL =
  /\s+(S\.?A\.?B\.?\s+DE\s+C\.?V\.?|S\.?A\.?P\.?I\.?(\s+DE\s+C\.?V\.?)?|S\.?A\.?\s+DE\s+C\.?V\.?|S\.?\s+DE\s+R\.?L\.?(\s+DE\s+C\.?V\.?)?|S\.?\s+DE\s+C\.?V\.?|S\.?A\.?S\.?|S\.?C\.?|A\.?C\.?|S\.?A\.?)\s*$/i;

/**
 * Quita el régimen societario de la razón social. "ESCUELA KEMPER URGATE SA DE CV" → "ESCUELA
 * KEMPER URGATE".
 *
 * No es cosmético: el SAT valida el nombre contra su padrón, y en el padrón NO va el régimen. Si
 * sobra, rechaza con "El campo Nombre del emisor, debe pertenecer al nombre asociado al RFC".
 *
 * Los sufijos salieron de rechazos reales del sandbox. La primera versión solo contemplaba
 * "SA DE CV" y "S DE RL", y "ESCUELA WILSON ESQUIVEL S DE CV" pasó de largo hasta que el PAC lo
 * rechazó. Si aparece una forma nueva, se añade aquí — pero ojo: se quita SOLO al final del
 * nombre, para no mutilar a un negocio que legítimamente se llame "LA SOCIEDAD".
 */
function limpiarRazonSocial(nombre: string): string {
  return nombre
    .toUpperCase()
    .replace(/,/g, " ")
    .replace(REGIMEN_AL_FINAL, "")
    .replace(/\s+/g, " ")
    .trim();
}

function redondear(n: number, decimales = 2): number {
  return Number(n.toFixed(decimales));
}
