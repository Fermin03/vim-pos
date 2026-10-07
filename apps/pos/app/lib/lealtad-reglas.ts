// Reglas PURAS de la lealtad en el POS (ADR 0030). Sin red, sin base, sin React: todo aquí tiene
// prueba en __tests__/lealtad-reglas.test.ts. Lo que lee o escribe está en lealtad.ts; el canje
// paso a paso, en lealtad-canje.ts.
import { redondearCentavos } from "./dinero";

export type Mecanica = "PUNTOS_DINERO" | "SELLOS" | "PUNTOS_PREMIOS";

/** La fila de `lealtad_programa` que le sirve al POS. */
export type Programa = {
  mecanica: Mecanica;
  version: number;
  porcentaje: number | null;      // PUNTOS_DINERO
  pesosPorPunto: number | null;   // PUNTOS_PREMIOS
  compraMinima: number;
  topeComprasDia: number;
};

/** Un premio del catálogo (`lealtad_premios` + el nombre de su producto). */
export type Premio = { id: string; productoId: string; nombre: string; costo: number };

/**
 * Cuánto gana una compra. ESPEJO de `lealtad_puntos_por_compra` (supabase/migrations/0156_lealtad.sql):
 * si cambias una, cambia la otra, y sus casos de prueba son los mismos. La de SQL es la que escribe
 * el movimiento; esta solo anuncia en pantalla lo que va a pasar.
 *
 * Se calcula en centavos enteros: `0.3 / 0.1` en coma flotante da 2.9999… y perdería un punto que
 * Postgres (numeric) sí da.
 */
export function puntosPorCompra(
  p: Pick<Programa, "mecanica" | "porcentaje" | "pesosPorPunto" | "compraMinima">,
  base: number,
): number {
  if (!Number.isFinite(base) || base <= 0 || base < (p.compraMinima ?? 0)) return 0;
  const baseCent = Math.round(base * 100);
  if (p.mecanica === "SELLOS") return 1;
  if (p.mecanica === "PUNTOS_DINERO") {
    const pctCent = Math.round((p.porcentaje ?? 0) * 100);
    return Math.floor((baseCent * pctCent) / 1_000_000);
  }
  if (p.mecanica === "PUNTOS_PREMIOS") {
    const porPuntoCent = Math.round((p.pesosPorPunto ?? 0) * 100);
    return porPuntoCent > 0 ? Math.floor(baseCent / porPuntoCent) : 0;
  }
  return 0;
}

/** Lo que se paga por comida: el total sin el envío. Es la base de ganar y el techo de canjear. */
export function baseDeLealtad(total: number, envioMxn: number): number {
  return Math.max(0, redondearCentavos(total - Math.max(0, envioMxn)));
}

/** Máximo de puntos-dinero que caben en la cuenta: 1 punto = $1, en pesos cerrados. */
export function maximoCanjeDinero(saldo: number, total: number, envioMxn: number): number {
  return Math.max(0, Math.min(Math.floor(saldo), Math.floor(baseDeLealtad(total, envioMxn))));
}

export function unidad(mecanica: Mecanica, n: number): string {
  if (mecanica === "SELLOS") return n === 1 ? "sello" : "sellos";
  return n === 1 ? "punto" : "puntos";
}

/** "120 puntos", "1 sello". */
export function cantidad(mecanica: Mecanica, n: number): string {
  return `${n} ${unidad(mecanica, n)}`;
}

/** "2027-04-05" → "05/04/2027". Se parte el texto: pasar por `Date` movería el día según la zona. */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function premiosConFaltante(premios: Premio[], saldo: number): (Premio & { alcanza: boolean; falta: number })[] {
  return [...premios]
    .sort((x, y) => x.costo - y.costo)
    .map((p) => ({ ...p, alcanza: saldo >= p.costo, falta: Math.max(0, p.costo - saldo) }));
}

/** Medianoche de HOY en México, como instante. México no tiene horario de verano: UTC−6 fijo. */
export function inicioDelDiaMexico(ahora: Date): string {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
  return `${dia}T00:00:00-06:00`;
}

/**
 * Un canje de DINERO está recortado cuando la cuenta ya no lo aguanta completo (se canceló un
 * platillo después de canjear): `tickets.lealtad_mxn` queda por debajo de lo autorizado, pero el
 * cliente ya pagó todos sus puntos. El POS lo quita y avisa. Un premio no se recorta: si su renglón
 * se cancela, la base devuelve los puntos sola.
 */
export function canjeRecortado(canje: { ticketItemId: string | null; monto: number } | null, lealtadMxn: number): boolean {
  if (!canje || canje.ticketItemId !== null) return false;
  return lealtadMxn + 0.005 < canje.monto;
}

export type FranjaLealtad = { saldoTexto: string; detalle: string | null; boton: "Canjear" | "Ver canje"; puedeAbrir: boolean };

/** Lo que dice la franja de lealtad sobre los totales de la cuenta. */
export function franjaLealtad(e: {
  programa: Programa;
  saldo: number;
  /** Compras de hoy que ya le sumaron a este cliente en esta caja. */
  comprasHoy: number;
  base: number;
  canje: { puntos: number } | null;
  /** Un canje que quedó a medias en este dispositivo (ver lealtad-canje.ts). */
  pendiente?: { puntos: number } | null;
  online: boolean;
}): FranjaLealtad {
  const m = e.programa.mecanica;
  const saldoTexto = cantidad(m, Math.max(0, e.saldo));
  if (e.canje) return { saldoTexto, detalle: `Canje aplicado: ${cantidad(m, e.canje.puntos)}`, boton: "Ver canje", puedeAbrir: true };
  // Un canje a medias SIEMPRE deja abrir Lealtad, sin conexión y con saldo en cero: el cobro se
  // niega mientras exista, y si el botón se apagara (el cliente canjeó todo su saldo y la nube ya lo
  // descontó) la cuenta no se podría ni resolver ni cobrar.
  if (e.pendiente) return { saldoTexto, detalle: `Canje a medias: ${cantidad(m, e.pendiente.puntos)}`, boton: "Ver canje", puedeAbrir: true };
  if (!e.online) return { saldoTexto, detalle: "Canje no disponible sin conexión", boton: "Canjear", puedeAbrir: false };
  const tope = e.programa.topeComprasDia;
  const gana = puntosPorCompra(e.programa, e.base);
  const detalle = e.comprasHoy >= tope
    ? `Hoy ya no suma: tope de ${tope} ${tope === 1 ? "compra" : "compras"} al día`
    : gana > 0 ? `Gana ${cantidad(m, gana)} con esta compra` : null;
  return { saldoTexto, detalle, boton: "Canjear", puedeAbrir: e.saldo > 0 };
}

const MENSAJES: Record<string, string> = {
  SIN_RED: "Sin conexión con la nube. El canje necesita internet.",
  FUNCION_REQUIERE_NUBE: "Esta caja todavía no está conectada a la nube. El canje necesita internet.",
  SIN_MODULO_LEALTAD: "La lealtad está apagada para este negocio.",
  MODULO_APAGADO: "La lealtad está apagada para este negocio.",
  SOLO_EMPLEADO: "Entra con tu PIN para canjear.",
  SIN_PROGRAMA: "El negocio todavía no configura su programa de lealtad.",
  CLIENTE_NO_EXISTE: "Este cliente todavía no llega a la nube. Espera un minuto y vuelve a intentar.",
  SALDO_INSUFICIENTE: "El saldo ya no alcanza. Revisa el saldo y vuelve a intentar.",
  PREMIO_INVALIDO: "Ese premio ya no está disponible.",
  PUNTOS_INVALIDOS: "La cantidad a canjear no es válida.",
  CANJE_NO_EXISTE: "La nube no tiene ese canje. Empieza uno nuevo.",
  CANJE_REVERTIDO: "Ese canje ya se le devolvió al cliente. Empieza uno nuevo.",
  CANJE_DE_OTRA_CUENTA: "Ese canje es de otra cuenta.",
  CANJE_DE_OTRA_CAJA: "Ese canje se hizo en otra caja.",
  CANJE_NO_COINCIDE: "Ese canje no coincide con el que autorizó la nube.",
  CANJE_YA_ASENTADO: "Ese canje ya se aplicó a otra cuenta.",
  TICKET_YA_TIENE_CANJE: "Esta cuenta ya tiene un canje. Quítalo para poner otro.",
  TICKET_NO_ABIERTO: "Esta cuenta ya se cobró.",
  TICKET_NO_EXISTE: "Esta cuenta ya no existe.",
  TICKET_SIN_CLIENTE: "La cuenta no tiene cliente asignado.",
  CLIENTE_NO_COINCIDE: "El cliente de la cuenta no es el del canje.",
  PREMIO_SIN_RENGLON: "El premio no se pudo aplicar a ese producto.",
  RENGLON_NO_EXISTE: "El premio no se pudo aplicar a ese producto.",
  RENGLON_NO_ES_PREMIO: "El premio no se pudo aplicar a ese producto.",
  RENGLON_NO_APLICA: "El premio no se pudo aplicar a ese producto.",
  MONTO_INVALIDO: "El premio no se pudo aplicar a ese producto.",
};

/** El texto que ve quien cobra. Nunca el código en crudo, salvo que sea uno que no conocemos. */
export function mensajeErrorLealtad(codigo: string): string {
  return MENSAJES[codigo] ?? `No se pudo completar el canje (${codigo}).`;
}

/**
 * ¿No se sabe si la nube alcanzó a descontar? Entonces NO se da por perdido ni por hecho: se guarda
 * el canje a medias y se reintenta con el mismo id (repetirlo no descuenta dos veces).
 * `FUNCION_REQUIERE_NUBE` no es ambiguo: la caja ni siquiera lo mandó.
 */
export function esFalloAmbiguo(codigo: string): boolean {
  return codigo === "SIN_RED" || codigo === "RESPUESTA_INVALIDA" || codigo === "ERROR_INTERNO" || /^HTTP_5\d\d$/.test(codigo);
}
