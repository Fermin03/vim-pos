// Lee lo indispensable de un certificado de sello digital (.cer) del SAT.
//
// POR QUÉ LEEMOS EL .cer NOSOTROS EN VEZ DE PREGUNTARLE AL PAC
//
// Facturama expone `GET /api-lite/csds`, que devuelve la vigencia... y también, en claro, **la
// llave privada y su contraseña de cada emisor cargado**. Con nuestra credencial de cuenta se
// pueden extraer los sellos fiscales de todos nuestros clientes.
//
// Por eso el código NUNCA llama a ese endpoint: todo lo que necesitamos saber está en el .cer, que
// es público por definición, y lo tenemos en la mano en el momento de la carga. Es la diferencia
// entre un dato de más en un log y una fuga de sellos fiscales ajenos.
//
// El parseo es a propósito mínimo —serie, vigencia y RFC— y no una librería de X.509: hace falta
// leer tres campos de un formato estable, no validar cadenas de confianza.

export type DatosCertificado = {
  /** Número de certificado del SAT: 20 dígitos. Es el que va en el CFDI como `NoCertificado`. */
  numeroCertificado: string;
  vigenciaDesde: string; // YYYY-MM-DD
  vigenciaHasta: string; // YYYY-MM-DD
  /**
   * Los RFC que aparecen en el sujeto. Suelen ser dos —el del contribuyente y el de su
   * representante legal— y el orden no está garantizado, así que se devuelven todos y la
   * pregunta útil se contesta con `esDelRfc`.
   */
  rfcs: string[];
};

export class CertificadoIlegible extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "CertificadoIlegible";
  }
}

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export function leerCertificado(cerBase64: string): DatosCertificado {
  let der: Uint8Array;
  try {
    const binario = atob(cerBase64.replace(/\s+/g, ""));
    der = Uint8Array.from(binario, (ch) => ch.charCodeAt(0));
  } catch {
    throw new CertificadoIlegible("El archivo no parece un certificado válido");
  }
  if (der.length < 300) throw new CertificadoIlegible("El archivo es demasiado pequeño para ser un .cer");

  const numeroCertificado = leerNumeroDeSerie(der);
  const [vigenciaDesde, vigenciaHasta] = leerVigencia(der);
  return { numeroCertificado, vigenciaDesde, vigenciaHasta, rfcs: leerRfcs(der) };
}

/** ¿Este certificado es del RFC que dice ser? Evita subir por error el sello de otro negocio. */
export function esDelRfc(datos: DatosCertificado, rfc: string): boolean {
  return datos.rfcs.includes(rfc.trim().toUpperCase());
}

/** ¿Sigue vigente en la fecha dada? */
export function estaVigente(datos: DatosCertificado, hoy = new Date()): boolean {
  const dia = hoy.toISOString().slice(0, 10);
  return dia >= datos.vigenciaDesde && dia <= datos.vigenciaHasta;
}

/**
 * El número de serie va al principio del TBSCertificate, como INTEGER de 20 bytes. En los
 * certificados del SAT esos 20 bytes son dígitos ASCII, no un entero binario — por eso se leen
 * como texto y se comprueba que lo sean, en vez de convertirlos.
 */
function leerNumeroDeSerie(der: Uint8Array): string {
  for (let i = 0; i < Math.min(der.length, 64); i++) {
    if (der[i] === 0x02 && der[i + 1] === 0x14) {
      const s = textoLatino(der.subarray(i + 2, i + 22));
      if (/^\d{20}$/.test(s)) return s;
    }
  }
  throw new CertificadoIlegible("No se encontró el número de certificado. ¿Es un .cer del SAT?");
}

/**
 * `Validity ::= SEQUENCE { notBefore, notAfter }`, las dos como UTCTime (`YYMMDDhhmmssZ`).
 * Se toman las dos primeras que aparezcan: en un certificado son siempre estas, en este orden.
 */
function leerVigencia(der: Uint8Array): [string, string] {
  const fechas: string[] = [];
  for (let i = 0; i < der.length - 15 && fechas.length < 2; i++) {
    if (der[i] === 0x17 && der[i + 1] === 0x0d) {
      const s = textoLatino(der.subarray(i + 2, i + 15));
      if (/^\d{12}Z$/.test(s)) fechas.push(s);
    }
  }
  if (fechas.length < 2) throw new CertificadoIlegible("No se pudo leer la vigencia del certificado");
  return [aFecha(fechas[0]), aFecha(fechas[1])];
}

/** `YYMMDDhhmmssZ` → `YYYY-MM-DD`. Los años de dos dígitos < 50 son del siglo XXI (RFC 5280). */
function aFecha(utc: string): string {
  const yy = Number(utc.slice(0, 2));
  return `${yy < 50 ? 2000 + yy : 1900 + yy}-${utc.slice(2, 4)}-${utc.slice(4, 6)}`;
}

/**
 * El RFC vive en el sujeto, dentro de un PrintableString que trae el del contribuyente y el de su
 * representante separados por `/` — algo como `EKU9003173C9 / VADA800927DJ3`. Se parte el campo y
 * se queda con los pedazos que tengan forma de RFC.
 */
function leerRfcs(der: Uint8Array): string[] {
  const texto = textoLatino(der);
  const encontrados = new Set<string>();
  for (let i = 0; i < der.length - 2; i++) {
    if (der[i] !== 0x13 && der[i] !== 0x0c) continue; // PrintableString / UTF8String
    const largo = der[i + 1];
    if (largo < 12 || largo > 64) continue;
    for (const trozo of texto.slice(i + 2, i + 2 + largo).split(/[\s/,]+/)) {
      if (RFC.test(trozo)) encontrados.add(trozo);
    }
  }
  return [...encontrados];
}

function textoLatino(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
