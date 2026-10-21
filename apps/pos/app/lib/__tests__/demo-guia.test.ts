import { describe, expect, it } from "vitest";
import { PASOS, estadoDelPaso, pasoActual, puntoDeRetorno, seguirPausa, slugTour, type Raiz } from "../demo-guia";

/** Un DOM de mentira: `querySelector` responde según los selectores presentes (con su cuenta). */
function raizCon(presentes: Record<string, number> | string[]): Raiz {
  const cuenta = Array.isArray(presentes) ? Object.fromEntries(presentes.map((s) => [s, 1])) : presentes;
  // `[data-tour^="x"]` (prefijo) coincide con cualquier `[data-tour="x…"]` presente, como en el DOM.
  const prefijo = (s: string) => s.match(/^\[data-tour\^="(.*)"\]$/)?.[1];
  const existe = (s: string) => {
    const p = prefijo(s);
    return p === undefined ? !!cuenta[s] : Object.keys(cuenta).some((k) => k.startsWith(`[data-tour="${p}`));
  };
  return {
    querySelector: ((s: string) => (existe(s) ? ({} as Element) : null)) as Raiz["querySelector"],
    querySelectorAll: ((s: string) => ({ length: cuenta[s] ?? 0 })) as unknown as Raiz["querySelectorAll"],
  };
}

/** Una raíz donde exactamente los pasos `listos` (índices) dan true, sin tocar los demás. */
function conListos(indices: number[]): Raiz {
  const marcas: Record<string, number> = {};
  for (const i of indices) Object.assign(marcas, LISTO_CON[i]);
  return raizCon(marcas);
}

const t = (id: string) => `[data-tour="${id}"]`;
/** Lo que hace verdadero el `listo` de cada paso «hazlo» (los «explica» nunca lo son). */
const LISTO_CON: Record<number, Record<string, number>> = {
  0: { [t("pin")]: 1 },
  1: { [t("abrir-turno")]: 1 },
  2: { [t("cerrar-turno")]: 1 },
  3: { [t("producto-crazy-clásica")]: 1 },
  4: { [t("ticket-item")]: 1 }, // con el modal abierto el 7 no estaría listo
  5: { [t("ticket-item")]: 1 },
  6: { [t("ticket-item")]: 2 },
  7: { [t("cobro")]: 1 },
  8: { [t("cobro-completado")]: 1 },
  13: { [t("conteo-efectivo")]: 1 },
  14: { [t("corte")]: 1 },
};

const ETAPAS = ["Abrir turno", "Hacer una venta", "Monitor de ventas", "Cerrar turno", "Ver el corte"];

describe("guía «Hazlo tú»", () => {
  it("15 pasos numerados 2..16, anclas únicas y las 5 etapas en orden", () => {
    expect(PASOS).toHaveLength(15);
    expect(PASOS.map((p) => p.numero)).toEqual(Array.from({ length: 15 }, (_, i) => i + 2));
    expect(new Set(PASOS.map((p) => p.ancla)).size).toBe(15);
    const etapas = PASOS.map((p) => p.etapa).filter((e, i, a) => a.indexOf(e) === i);
    expect(etapas).toEqual(ETAPAS);
    expect(PASOS.filter((p) => p.tipo === "explica").map((p) => p.numero)).toEqual([11, 12, 13, 16]);
  });

  it("nada listo → el primero", () => {
    expect(pasoActual(PASOS, 0, raizCon([]))).toBe(0);
  });

  it("se adelantó: con el turno abierto y la hamburguesa en el ticket, desde 0 va a la bebida", () => {
    const i8 = PASOS.findIndex((p) => p.numero === 8);
    expect(pasoActual(PASOS, 0, raizCon([t("cerrar-turno"), t("ticket-item")]))).toBe(i8);
  });

  it("índice viejo al recargar: en la venta con producto en pantalla salta a la hamburguesa", () => {
    const i6 = PASOS.findIndex((p) => p.numero === 6);
    expect(pasoActual(PASOS, 0, raizCon([t("producto-crazy-clásica"), t("cobrar")]))).toBe(i6);
  });

  it("índice viejo al recargar: en el inicio con turno abierto salta a Para llevar", () => {
    const i5 = PASOS.findIndex((p) => p.numero === 5);
    expect(pasoActual(PASOS, 1, raizCon([t("cerrar-turno"), t("para-llevar"), t("monitor")]))).toBe(i5);
  });

  it("índice viejo al recargar: ya cobró → se detiene en la explicación del ticket", () => {
    const i11 = PASOS.findIndex((p) => p.numero === 11);
    expect(pasoActual(PASOS, 0, raizCon([t("cobro-completado"), t("ticket")]))).toBe(i11);
    expect(pasoActual(PASOS, 2, raizCon([t("monitor-pantalla")]))).toBe(i11);
  });

  it("al recargar no retrocede: desde 6 se queda en 6 aunque 0–5 no se cumplan", () => {
    expect(pasoActual(PASOS, 6, raizCon([]))).toBe(6);
  });

  it("un paso «explica» detiene el avance aunque lo de después ya se cumpla", () => {
    expect(pasoActual(PASOS, 0, conListos([0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 14]))).toBe(9);
  });

  it("todos listos → PASOS.length", () => {
    const sinExplica = PASOS.map((p) => (p.tipo === "explica" ? { ...p, listo: () => true } : p));
    expect(pasoActual(sinExplica, 0, conListos(Object.keys(LISTO_CON).map(Number)))).toBe(15);
  });

  it("el modificador sigue abierto: el paso 7 no está listo aunque ya haya renglón", () => {
    const i7 = PASOS.findIndex((p) => p.numero === 7);
    expect(PASOS[i7]!.listo(raizCon([t("ticket-item"), t("modificadores")]))).toBe(false);
    expect(PASOS[i7]!.listo(raizCon([t("ticket-item")]))).toBe(true);
  });

  it("la bebida pide dos renglones", () => {
    const i8 = PASOS.findIndex((p) => p.numero === 8);
    expect(PASOS[i8]!.listo(raizCon({ [t("ticket-item")]: 1 }))).toBe(false);
    expect(PASOS[i8]!.listo(raizCon({ [t("ticket-item")]: 2 }))).toBe(true);
  });

  it("estadoDelPaso: perdida sin ancla, visible con ella", () => {
    const p = PASOS[0]!;
    expect(estadoDelPaso(p, raizCon([]))).toBe("perdida");
    expect(estadoDelPaso(p, raizCon([p.ancla]))).toBe("visible");
  });

  it("monitor (13): visible con el acceso para abrirlo o con la pantalla ya abierta", () => {
    const p = PASOS.find((x) => x.numero === 13)!;
    expect(p.abrir).toBe(t("monitor"));
    expect(estadoDelPaso(p, raizCon([]))).toBe("perdida");
    expect(estadoDelPaso(p, raizCon([t("monitor")]))).toBe("visible");
    expect(estadoDelPaso(p, raizCon([t("monitor-pantalla")]))).toBe("visible");
  });

  it("pausa de «Hacer otra venta»: espera a que cierre el cobro actual y al siguiente", () => {
    const con = raizCon([t("cobro-completado")]);
    const sin = raizCon([]);
    expect(seguirPausa("cerrar", con)).toBe("cerrar");
    expect(seguirPausa("cerrar", sin)).toBe("cobro");
    expect(seguirPausa("cobro", sin)).toBe("cobro");
    expect(seguirPausa("cobro", con)).toBeNull();
  });

  it("pausa: si se va al monitor, al cierre o al corte sin cobrar, la guía sigue", () => {
    for (const p of ["cerrar", "cobro"] as const) {
      for (const id of ["monitor-pantalla", "conteo-efectivo", "corte"]) {
        expect(seguirPausa(p, raizCon([t(id)]))).toBeNull();
      }
      // En el inicio (Cerrar turno visible) la pausa sigue: ahí se vuelve a vender.
      expect(seguirPausa(p, raizCon([t("cerrar-turno")]))).toBe("cobro");
    }
  });

  it("al recargar: vuelve a medir desde 0, salvo explicaciones ya leídas", () => {
    // Paso 9 (índice 7) con la caja recién recargada: pide entrar como Ana otra vez, no «Toca Cobrar».
    expect(puntoDeRetorno(PASOS, 7)).toBe(0);
    expect(pasoActual(PASOS, puntoDeRetorno(PASOS, 7), raizCon([]))).toBe(0);
    // Ya en el cierre (paso 15): no repite el monitor (13) ni el ticket (11).
    expect(PASOS[puntoDeRetorno(PASOS, 13)]!.numero).toBe(14);
    // En una explicación se queda: tras el corte (16) el turno ya cerró y solo falta «Entendido».
    expect(puntoDeRetorno(PASOS, 14)).toBe(14);
    expect(puntoDeRetorno(PASOS, 9)).toBe(9);
  });

  it("paso 15: con el efectivo escrito, pasa a señalar Generar corte", () => {
    const p15 = PASOS.find((p) => p.numero === 15)!;
    const conValor = (value: string): Raiz => ({
      querySelector: ((s: string) => (s.endsWith(" input") ? ({ value } as HTMLInputElement) : null)) as Raiz["querySelector"],
      querySelectorAll: (() => ({ length: 0 })) as unknown as Raiz["querySelectorAll"],
    });
    expect(p15.luego?.cuando(conValor(""))).toBe(false);
    expect(p15.luego?.cuando(conValor("644"))).toBe(true);
    expect(p15.luego?.ancla).toBe(t("generar-corte"));
  });

  it("slugTour: minúsculas y espacios a guiones", () => {
    expect(slugTour("Refresco 600 ml")).toBe("refresco-600-ml");
    expect(slugTour("Crazy Clásica")).toBe("crazy-clásica");
  });
});
