import { describe, expect, it } from "vitest";
import { vigenteAhora } from "../promociones";

/**
 * `vigenteAhora` es la única regla de promociones que NO vive en la base.
 *
 * El resto —vigencia por fechas, usos, sucursal, modo de servicio, monto mínimo—
 * lo filtra `evaluar_promociones_aplicables()` en SQL. El horario y el día de la
 * semana se quedaron en la caja porque es la que sabe qué hora es en el local, y
 * por eso son justo lo que hay que probar aquí.
 */

const alas = (h: number, m = 0, dia = 3): Date => {
  // 2026-08-26 es miércoles (día 3). Se ajusta el día del mes para caer en el
  // día de la semana pedido, en hora local, que es la que lee la función.
  const d = new Date(2026, 7, 26, h, m, 0);
  d.setDate(d.getDate() + (dia - d.getDay()));
  return d;
};

describe("vigenteAhora", () => {
  it("sin condiciones, siempre aplica", () => {
    expect(vigenteAhora({}, alas(3))).toBe(true);
    expect(vigenteAhora(null, alas(15))).toBe(true);
    expect(vigenteAhora(undefined, alas(23))).toBe(true);
  });

  it("respeta un horario normal", () => {
    const c = { horario: { desde: "13:00", hasta: "17:00" } };
    expect(vigenteAhora(c, alas(12, 59))).toBe(false);
    expect(vigenteAhora(c, alas(13, 0))).toBe(true);
    expect(vigenteAhora(c, alas(15, 30))).toBe(true);
    expect(vigenteAhora(c, alas(17, 0))).toBe(true);
    expect(vigenteAhora(c, alas(17, 1))).toBe(false);
  });

  /**
   * El caso que motivó escribir la función con cuidado: un bar pone «happy hour
   * de 22:00 a 02:00». Con la comparación ingenua `desde <= hora <= hasta` esa
   * promoción no se activaría NUNCA, y el fallo no da error — simplemente no
   * aparece en la caja, que es la peor forma de romperse.
   */
  it("respeta un horario que cruza la medianoche", () => {
    const c = { horario: { desde: "22:00", hasta: "02:00" } };
    expect(vigenteAhora(c, alas(21, 59))).toBe(false);
    expect(vigenteAhora(c, alas(22, 0))).toBe(true);
    expect(vigenteAhora(c, alas(23, 30))).toBe(true);
    expect(vigenteAhora(c, alas(0, 30))).toBe(true);
    expect(vigenteAhora(c, alas(2, 0))).toBe(true);
    expect(vigenteAhora(c, alas(2, 1))).toBe(false);
  });

  it("respeta los días de la semana", () => {
    const martes = { dias_semana: [2] };
    expect(vigenteAhora(martes, alas(15, 0, 2))).toBe(true);
    expect(vigenteAhora(martes, alas(15, 0, 3))).toBe(false);
  });

  it("una lista de días vacía no filtra nada", () => {
    // Es lo que deja el panel si alguien guarda sin elegir día. Debe leerse como
    // "todos los días", no como "ningún día": lo segundo apagaría la promoción
    // en silencio.
    expect(vigenteAhora({ dias_semana: [] }, alas(15, 0, 1))).toBe(true);
  });

  it("día y horario se exigen juntos", () => {
    const c = { dias_semana: [2], horario: { desde: "13:00", hasta: "17:00" } };
    expect(vigenteAhora(c, alas(15, 0, 2))).toBe(true);
    expect(vigenteAhora(c, alas(19, 0, 2))).toBe(false); // martes, fuera de hora
    expect(vigenteAhora(c, alas(15, 0, 4))).toBe(false); // en hora, otro día
  });

  it("un horario a medias se ignora en vez de bloquear", () => {
    // Si falta un extremo no hay rango que evaluar. Se deja pasar: una promoción
    // mal capturada que no se puede aplicar es un reclamo del cliente en caja.
    expect(vigenteAhora({ horario: { desde: "13:00" } }, alas(3))).toBe(true);
    expect(vigenteAhora({ horario: { hasta: "17:00" } }, alas(23))).toBe(true);
  });
});
