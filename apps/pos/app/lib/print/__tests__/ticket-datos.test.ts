import { describe, it, expect } from "vitest";
import { foldearHijosEnPadre } from "../ticket-datos";
import type { LineaImpresion } from "../tipos";

/** Fixture mínima: solo llena lo que cada caso necesita, el resto son valores neutros. */
const L = (x: Partial<LineaImpresion> & { id: string; nombre: string; totalMxn: number }): LineaImpresion => ({
  cantidad: 1,
  modificadores: [],
  notaCocina: null,
  comboRol: null,
  parentId: null,
  grupoNombre: null,
  extras: [],
  ...x,
});

describe("foldearHijosEnPadre", () => {
  it("suma al PADRE el extra de un HIJO con costo", () => {
    const out = foldearHijosEnPadre([
      L({ id: "P", nombre: "Combo", totalMxn: 170, comboRol: "PADRE" }),
      L({ id: "H1", nombre: "Doble", totalMxn: 15, comboRol: "HIJO", parentId: "P" }),
    ]);
    expect(out.find((l) => l.id === "P")!.totalMxn).toBe(185);
    expect(out.find((l) => l.id === "H1")!.totalMxn).toBe(15); // el hijo no cambia
  });

  it("dos hijos, solo uno con extra: suma solo lo que corresponde", () => {
    const out = foldearHijosEnPadre([
      L({ id: "P", nombre: "Combo", totalMxn: 170, comboRol: "PADRE" }),
      L({ id: "H1", nombre: "Doble", totalMxn: 15, comboRol: "HIJO", parentId: "P" }), // trae extra
      L({ id: "H2", nombre: "Refresco", totalMxn: 0, comboRol: "HIJO", parentId: "P" }), // sin extra
    ]);
    expect(out.find((l) => l.id === "P")!.totalMxn).toBe(185);
  });

  it("dos combos en el mismo ticket: cada padre suma solo lo de sus propios hijos", () => {
    const out = foldearHijosEnPadre([
      L({ id: "P1", nombre: "Combo A", totalMxn: 170, comboRol: "PADRE" }),
      L({ id: "H1", nombre: "Doble", totalMxn: 10, comboRol: "HIJO", parentId: "P1" }),
      L({ id: "P2", nombre: "Combo B", totalMxn: 130, comboRol: "PADRE" }),
      L({ id: "H2", nombre: "Tocino", totalMxn: 20, comboRol: "HIJO", parentId: "P2" }),
    ]);
    expect(out.find((l) => l.id === "P1")!.totalMxn).toBe(180);
    expect(out.find((l) => l.id === "P2")!.totalMxn).toBe(150);
  });

  it("ticket sin combos: no toca nada", () => {
    const lineas = [
      L({ id: "A", nombre: "Hamburguesa Clásica", totalMxn: 120 }),
      L({ id: "B", nombre: "Papas", totalMxn: 45 }),
    ];
    const out = foldearHijosEnPadre(lineas);
    expect(out.map((l) => l.totalMxn)).toEqual([120, 45]);
  });

  it("hijo huérfano (padre ausente de la lista): no revienta y no inventa un total", () => {
    const out = foldearHijosEnPadre([
      L({ id: "H1", nombre: "Doble", totalMxn: 15, comboRol: "HIJO", parentId: "P-QUE-NO-ESTA" }),
      L({ id: "P2", nombre: "Combo B", totalMxn: 130, comboRol: "PADRE" }),
    ]);
    expect(out.find((l) => l.id === "H1")!.totalMxn).toBe(15);
    // El padre que sí existe no recibe nada del huérfano de otro combo.
    expect(out.find((l) => l.id === "P2")!.totalMxn).toBe(130);
  });

  it("PADRE sin ningún hijo: se queda igual (?? 0, no NaN ni undefined)", () => {
    const out = foldearHijosEnPadre([L({ id: "P", nombre: "Combo", totalMxn: 170, comboRol: "PADRE" })]);
    expect(out[0]!.totalMxn).toBe(170);
  });

  it("no muta el arreglo recibido ni los objetos que contiene", () => {
    const padre = L({ id: "P", nombre: "Combo", totalMxn: 170, comboRol: "PADRE" });
    const hijo = L({ id: "H1", nombre: "Doble", totalMxn: 15, comboRol: "HIJO", parentId: "P" });
    const lineas = [padre, hijo];
    const copiaJson = JSON.parse(JSON.stringify(lineas));

    const out = foldearHijosEnPadre(lineas);

    expect(lineas).toEqual(copiaJson); // el arreglo original, intacto
    expect(padre.totalMxn).toBe(170); // el objeto original del padre, intacto
    expect(out).not.toBe(lineas); // devuelve un arreglo nuevo
    expect(out.find((l) => l.id === "P")).not.toBe(padre); // el padre modificado es una copia nueva
  });

  it("redondea a centavos (evita arrastrar errores de punto flotante)", () => {
    const out = foldearHijosEnPadre([
      L({ id: "P", nombre: "Combo", totalMxn: 100.1, comboRol: "PADRE" }),
      L({ id: "H1", nombre: "Extra", totalMxn: 0.2, comboRol: "HIJO", parentId: "P" }),
    ]);
    expect(out.find((l) => l.id === "P")!.totalMxn).toBe(100.3);
  });
});
