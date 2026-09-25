// Catálogo y validación del RECEPTOR para el portal de autofactura.
//
// Módulo puro (sin Deno ni red) para probarlo con `node --test`, igual que el resto de `_shared/pac`.
//
// QUÉ SE OFRECE Y POR QUÉ SOLO ESO
//
// El catálogo c_UsoCFDI del SAT (CFDI 4.0) dice qué usos admite cada régimen del receptor, y el PAC
// rechaza la combinación que no cuadre. Pero además de VÁLIDO, el uso tiene que tener sentido para
// lo que se factura: un consumo en un restaurante. "Honorarios médicos", "Construcciones" o
// "Gastos funerales" pasan la validación para ciertos regímenes y son falsos para una comida; antes
// se ofrecían, y con el régimen 605 el portal autoelegía "D01 · Honorarios médicos".
//
// Queda lo que un comensal puede pedir de verdad:
//   · G03 Gastos en general — lo normal para consumo en restaurante (quien deduce).
//   · G01 Adquisición de mercancías — para quien compra para revender.
//   · S01 Sin efectos fiscales — quien no deduce (sueldos, sin obligaciones…). Sustituye al P01
//     «Por definir», que desapareció con CFDI 4.0 y que se seguía ofreciendo.

/** Regímenes del receptor que se ofrecen, en el orden en que la gente los busca. */
export const REGIMENES_RECEPTOR: { clave: string; nombre: string }[] = [
  { clave: "612", nombre: "Actividades empresariales y profesionales" },
  { clave: "626", nombre: "Régimen Simplificado de Confianza (RESICO)" },
  { clave: "601", nombre: "General de Ley Personas Morales" },
  { clave: "605", nombre: "Sueldos y salarios" },
  { clave: "625", nombre: "Plataformas tecnológicas (repartidores, choferes, ventas en línea)" },
  { clave: "606", nombre: "Arrendamiento" },
  { clave: "621", nombre: "Incorporación Fiscal" },
  { clave: "603", nombre: "Personas Morales con fines no lucrativos" },
  { clave: "614", nombre: "Ingresos por intereses" },
  { clave: "616", nombre: "Sin obligaciones fiscales" },
];

/** Regímenes para los que el SAT admite los usos G01/G03 (catálogo c_UsoCFDI, CFDI 4.0). */
const DEDUCEN = new Set(["601", "603", "606", "612", "620", "621", "622", "623", "624", "625", "626"]);
/** Regímenes para los que el SAT admite S01. */
const SIN_EFECTOS = new Set([
  "601", "603", "605", "606", "607", "608", "610", "611", "612", "614", "615", "616", "620", "621", "622", "623", "624", "625", "626",
]);

export const USOS_CFDI: Record<string, string> = {
  G03: "Gastos en general",
  G01: "Adquisición de mercancías",
  S01: "Sin efectos fiscales",
};

/** Usos que se ofrecen para un régimen, el recomendado primero. Vacío si el régimen no existe. */
export function usosParaRegimen(regimen: string): string[] {
  const usos: string[] = [];
  if (DEDUCEN.has(regimen)) usos.push("G03", "G01");
  if (SIN_EFECTOS.has(regimen)) usos.push("S01");
  return usos;
}

/** Usos por régimen para todos los regímenes que se ofrecen (lo que el portal recibe). */
export function usosPorRegimen(): Record<string, string[]> {
  return Object.fromEntries(REGIMENES_RECEPTOR.map((r) => [r.clave, usosParaRegimen(r.clave)]));
}

/** RFC: persona moral 12 caracteres, persona física 13. Misma regla en el portal y aquí. */
export const RFC_VALIDO = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** Qué campo del formulario resaltar cuando el PAC rechaza. */
export function campoDelRechazo(mensaje: string): string | null {
  if (/DomicilioFiscalReceptor|c[oó]digo postal/i.test(mensaje)) return "codigoPostal";
  if (/RegimenFiscalReceptor|r[eé]gimen fiscal/i.test(mensaje)) return "regimenFiscal";
  if (/Nombre del receptor/i.test(mensaje)) return "razonSocial";
  if (/UsoCFDI/i.test(mensaje)) return "usoCfdi";
  if (/Rfc/i.test(mensaje)) return "rfc";
  return null;
}

/**
 * Traduce el rechazo del PAC a algo accionable.
 *
 * No es cosmético: el error del código postal es el más frecuente de cualquier portal de
 * autofactura, porque mucha gente pone el CP de su casa y no el de su constancia. Mostrar el
 * mensaje del SAT tal cual —«debe encontrarse en la lista de RFC inscritos no cancelados»— hace
 * que abandonen; decirles dónde buscarlo los rescata.
 */
export function traducirRechazo(mensaje: string): string {
  if (/DomicilioFiscalReceptor/i.test(mensaje)) {
    return "El código postal no coincide con el que el SAT tiene registrado para tu RFC. Búscalo en tu Constancia de Situación Fiscal.";
  }
  if (/RegimenFiscalReceptor/i.test(mensaje)) {
    return "Ese régimen fiscal no es el que el SAT tiene registrado para tu RFC. Revísalo en tu Constancia de Situación Fiscal.";
  }
  if (/Nombre del receptor/i.test(mensaje)) {
    return "El nombre no coincide con el registrado en el SAT. Escríbelo igual que en tu Constancia, en mayúsculas y sin S.A. de C.V.";
  }
  if (/UsoCFDI/i.test(mensaje)) return "Ese uso de CFDI no aplica a tu régimen fiscal. Elige otro.";
  if (/Rfc/i.test(mensaje)) {
    return "El SAT no reconoce ese RFC. Revisa que esté escrito igual que en tu Constancia de Situación Fiscal.";
  }
  return "El SAT rechazó los datos. Revísalos en tu Constancia de Situación Fiscal e inténtalo de nuevo.";
}
