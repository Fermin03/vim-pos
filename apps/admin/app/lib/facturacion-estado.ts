/**
 * ¿Ya puedo facturar? El estado de los tres pasos de la pantalla de Facturación, sin red.
 *
 * Antes la respuesta estaba repartida en dos pantallas ("Datos fiscales" y "CFDI / PAC") y no la
 * daba ninguna: el paso de bienvenida se marcaba completo con solo la razón social, y el "Modo"
 * (Pruebas / Activo / Inactivo) no controlaba nada: con el sello cargado se timbraba de verdad
 * aunque dijera "Pruebas".
 *
 * Decisión de Fermín (25 sep 2026): el modo pasa a ser real sin cortarle la facturación a nadie.
 * Solo "INACTIVO" (pausada) bloquea el timbrado —portal, botón Facturar y factura global—;
 * "PRUEBA" y "ACTIVO" timbran igual que siempre.
 */

const RFC_REGEX = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

export type DatosParaFacturar = {
  rfc: string;
  razon_social: string;
  regimen_fiscal: string | null;
  codigo_postal_fiscal: string;
};

export type EmisorParaFacturar = {
  estado: "ACTIVO" | "INACTIVO" | "PRUEBA";
  csd: { numeroCertificado: string | null; vigenciaHasta: string | null };
};

export type EstadoFacturacion = {
  datosCompletos: boolean;
  /** Hay sello cargado y no ha vencido. */
  selloVigente: boolean;
  /** Hay sello, pero ya venció. */
  selloVencido: boolean;
  /** El negocio la pausó: no se timbra nada nuevo. */
  pausada: boolean;
  /** Datos completos, sello vigente y sin pausa: se puede facturar. */
  lista: boolean;
  /** Qué falta, en palabras del dueño, en el orden de los pasos. */
  faltan: string[];
};

/** Días hasta que vence el sello (negativo si ya venció). La vigencia viene como `YYYY-MM-DD`. */
export function diasHasta(fecha: string, hoy: Date): number {
  const [a, m, d] = fecha.split("-").map(Number);
  const fin = Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1);
  const inicio = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((fin - inicio) / 86_400_000);
}

export function estadoFacturacion(datos: DatosParaFacturar, emisor: EmisorParaFacturar, hoy = new Date()): EstadoFacturacion {
  const datosCompletos =
    RFC_REGEX.test(datos.rfc) &&
    datos.razon_social.trim().length > 0 &&
    !!datos.regimen_fiscal &&
    /^\d{5}$/.test(datos.codigo_postal_fiscal);
  const haySello = !!emisor.csd.numeroCertificado;
  const selloVencido = haySello && !!emisor.csd.vigenciaHasta && diasHasta(emisor.csd.vigenciaHasta, hoy) < 0;
  const selloVigente = haySello && !selloVencido;
  const pausada = emisor.estado === "INACTIVO";

  const faltan: string[] = [];
  if (!datosCompletos) faltan.push("tus datos fiscales");
  if (!haySello) faltan.push("cargar tu sello digital");
  else if (selloVencido) faltan.push("renovar tu sello digital, que ya venció");
  if (pausada) faltan.push("reanudar la facturación, que está en pausa");

  return {
    datosCompletos,
    selloVigente,
    selloVencido,
    pausada,
    lista: datosCompletos && selloVigente && !pausada,
    faltan,
  };
}
