/**
 * Guía «Hazlo tú» de la demo pública: los pasos 2–16 del recorrido (1 es la bienvenida y 17 la
 * pantalla final). La guía no conoce el estado de la caja: lee el DOM por los atributos
 * `data-tour` que llevan las pantallas, así que aquí todo es puro y se prueba con un DOM falso.
 *
 * Textos provisionales: los definitivos los escribe James (Task 6).
 */

export type Etapa = "Abrir turno" | "Hacer una venta" | "Monitor de ventas" | "Cerrar turno" | "Ver el corte";
export type Raiz = Pick<Document, "querySelector" | "querySelectorAll">;
export type Paso = {
  numero: number; // 2..16 (1 = bienvenida, 17 = pantalla final)
  etapa: Etapa;
  titulo: string;
  texto: string;
  ancla: string; // selector CSS
  tipo: "hazlo" | "explica"; // "explica" lleva botón Entendido
  /** Si falta `ancla`, se ilumina este selector con «Tócalo» (lo que hay que tocar para llegar). */
  abrir?: string;
  listo: (r: Raiz) => boolean;
};
/** Paso 12, «Hacer otra venta»: primero espera a que cierre el cobro de la venta guiada y luego al siguiente. */
export type Pausa = "cerrar" | "cobro";

/** El valor de `data-tour` para un nombre del catálogo: minúsculas y espacios a guiones. */
export const slugTour = (nombre: string) => nombre.toLowerCase().replace(/\s+/g, "-");

const t = (id: string) => `[data-tour="${id}"]`;
const hay = (r: Raiz, sel: string) => r.querySelector(sel) !== null;

// Productos reales de la semilla de Crazy Burgers: una hamburguesa (término obligatorio) y una bebida.
const HAMBURGUESA = t(`producto-${slugTour("Crazy Clásica")}`);
const BEBIDA = t(`producto-${slugTour("Refresco 600 ml")}`);
const COBRO_COMPLETADO = t("cobro-completado");
const RENGLON = t("ticket-item");

// Evidencia acumulada de los pasos «hazlo» 2–10: cada una vale también si ya hay señal de un paso
// posterior. Así, con un índice viejo (recarga) y la persona varias pantallas adelante, la guía
// salta hasta donde está y no se queda en «perdida» esperando un ancla que ya pasó.
const tras = (r: Raiz) => hay(r, t("monitor-pantalla")) || hay(r, t("conteo-efectivo")) || hay(r, t("corte"));
const cobrado = (r: Raiz) => hay(r, COBRO_COMPLETADO) || tras(r);
const enCobro = (r: Raiz) => hay(r, t("cobro")) || cobrado(r);
const conBebida = (r: Raiz) => r.querySelectorAll(RENGLON).length >= 2 || enCobro(r);
const conHamburguesa = (r: Raiz) => (hay(r, RENGLON) && !hay(r, t("modificadores"))) || conBebida(r);
const eligiendo = (r: Raiz) => hay(r, t("modificadores")) || hay(r, RENGLON) || conHamburguesa(r);
// «Para llevar» exige turno abierto, así que estar en la venta prueba que el turno ya se abrió.
const enVenta = (r: Raiz) => hay(r, '[data-tour^="producto-"]') || eligiendo(r);
const turnoAbierto = (r: Raiz) => hay(r, t("cerrar-turno")) || enVenta(r);
const enInicio = (r: Raiz) => hay(r, t("abrir-turno")) || turnoAbierto(r);

export const PASOS: Paso[] = [
  {
    numero: 2, etapa: "Abrir turno", tipo: "hazlo", ancla: t("empleado-ana"),
    titulo: "Elige a Ana",
    texto: "Cada empleado entra con su nombre. Toca a Ana, la cajera.",
    listo: (r) => hay(r, t("pin")) || enInicio(r),
  },
  {
    numero: 3, etapa: "Abrir turno", tipo: "hazlo", ancla: t("pin"),
    titulo: "Teclea su PIN: 1234",
    texto: "Con el PIN la caja sabe quién cobró qué.",
    // Llegó al inicio, con o sin turno.
    listo: enInicio,
  },
  {
    numero: 4, etapa: "Abrir turno", tipo: "hazlo", ancla: t("fondo"), abrir: t("abrir-turno"),
    titulo: "Abre el turno",
    texto: "Toca Abrir turno, escribe $500 de fondo de caja y confírmalo.",
    // El acceso «Cerrar turno» solo existe con el turno abierto.
    listo: turnoAbierto,
  },
  {
    numero: 5, etapa: "Hacer una venta", tipo: "hazlo", ancla: t("para-llevar"),
    titulo: "Elige el tipo de pedido",
    texto: "Toca Para llevar. Del tipo de pedido dependen el ticket y la comanda.",
    listo: (r) => hay(r, HAMBURGUESA) || enVenta(r),
  },
  {
    numero: 6, etapa: "Hacer una venta", tipo: "hazlo", ancla: HAMBURGUESA,
    titulo: "Toca una hamburguesa",
    texto: "Toca Crazy Clásica. Te pedirá el término y no deja seguir sin él.",
    listo: eligiendo,
  },
  {
    numero: 7, etapa: "Hacer una venta", tipo: "hazlo", ancla: t("modificadores"),
    titulo: "Término, extra y nota",
    texto: "Elige el término, agrega un extra con precio y escribe la nota «sin cebolla». Luego agrégala.",
    listo: conHamburguesa,
  },
  {
    numero: 8, etapa: "Hacer una venta", tipo: "hazlo", ancla: BEBIDA, abrir: t("categoria-bebidas"),
    titulo: "Agrega una bebida",
    texto: "Abre Bebidas y toca Refresco 600 ml. A la derecha ves cómo se arma el ticket.",
    listo: conBebida,
  },
  {
    numero: 9, etapa: "Hacer una venta", tipo: "hazlo", ancla: t("cobrar"),
    titulo: "Cobra",
    texto: "Toca Cobrar para pasar a la pantalla de cobro.",
    listo: enCobro,
  },
  {
    numero: 10, etapa: "Hacer una venta", tipo: "hazlo", ancla: t("cobro"),
    titulo: "Pago dividido",
    texto: "Agrega propina si quieres. Luego toca Pago dividido: una parte en efectivo y otra con tarjeta.",
    listo: cobrado,
  },
  {
    numero: 11, etapa: "Hacer una venta", tipo: "explica", ancla: t("ticket"),
    titulo: "El ticket",
    texto: "En tu negocio sale impreso, con su código para que el cliente facture. Aquí lo ves en pantalla.",
    listo: () => false,
  },
  {
    numero: 12, etapa: "Hacer una venta", tipo: "explica", ancla: COBRO_COMPLETADO,
    titulo: "¿Otra venta?",
    texto: "Puedes hacer una segunda venta por tu cuenta. La guía te espera hasta que la cobres.",
    listo: () => false,
  },
  {
    numero: 13, etapa: "Monitor de ventas", tipo: "explica", ancla: t("monitor-pantalla"), abrir: t("monitor"),
    titulo: "Monitor de ventas",
    texto: "Toca Monitor ventas: la venta del turno, los tickets cobrados, el ticket promedio y las propinas.",
    listo: () => false,
  },
  {
    numero: 14, etapa: "Cerrar turno", tipo: "hazlo", ancla: t("cerrar-turno"),
    titulo: "Cierra el turno",
    texto: "Toca Cerrar turno. El conteo es ciego: cuentas sin saber cuánto debería haber.",
    listo: (r) => hay(r, t("conteo-efectivo")) || hay(r, t("corte")),
  },
  {
    numero: 15, etapa: "Cerrar turno", tipo: "hazlo", ancla: t("conteo-efectivo"),
    titulo: "Cuenta $20 de menos",
    texto: "Escribe el fondo más lo que cobraste en efectivo, menos $20 a propósito. Captura la tarjeta y toca Generar corte.",
    listo: (r) => hay(r, t("corte")),
  },
  {
    numero: 16, etapa: "Ver el corte", tipo: "explica", ancla: t("corte"),
    titulo: "El corte",
    texto: "Lo que dice el sistema contra lo contado, con la diferencia marcada. Es lo que el dueño revisa cada noche.",
    listo: () => false,
  },
];

/** Primer índice ≥ `desde` cuyo `listo()` es false; `pasos.length` si todos están listos. */
export function pasoActual(pasos: Paso[], desde: number, r: Raiz): number {
  let i = desde;
  while (i < pasos.length && pasos[i]!.listo(r)) i++;
  return i;
}

/** "perdida" si en pantalla no está ni el ancla ni lo que la abre: la persona se fue a otra parte. */
export function estadoDelPaso(p: Paso, r: Raiz): "visible" | "perdida" {
  return hay(r, p.ancla) || (p.abrir !== undefined && hay(r, p.abrir)) ? "visible" : "perdida";
}

/**
 * Siguiente estado de la pausa del paso 12; `null` = la guía sigue: ya cobró otra venta, o se fue
 * al monitor, al cierre o al corte sin cobrarla (la pausa no puede dejarla fuera del final).
 */
export function seguirPausa(p: Pausa, r: Raiz): Pausa | null {
  if (tras(r)) return null;
  const hayCobro = hay(r, COBRO_COMPLETADO);
  if (p === "cerrar") return hayCobro ? "cerrar" : "cobro";
  return hayCobro ? null : "cobro";
}
