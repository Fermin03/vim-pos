import { describe, it, expect, beforeEach, vi } from "vitest";
import { encolarComanda, leerCola, vaciarCola, VIGENCIA_MS } from "../cola-comandas";
import type { PrintJob } from "../tipos";

const job = (n: string): PrintJob => ({ tipo: "TICKET", ancho: 80, destino: "COCINA", bloques: [{ t: "texto", valor: n }] });
const nombre = (j: PrintJob) => (j.bloques[0] as { valor: string }).valor;

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  });
});

describe("cola de comandas", () => {
  it("con la impresora caída guarda todo, y al volver imprime en el orden en que se pidió", async () => {
    let enLinea = false;
    const impresas: string[] = [];
    const imprimir = async (c: { job: PrintJob }) => { if (enLinea) impresas.push(nombre(c.job)); return enLinea; };

    for (const n of ["A", "B", "C"]) { encolarComanda({ estacion: "estacion1", area: "cocina", job: job(n) }); await vaciarCola(imprimir); }
    expect(impresas).toEqual([]);
    expect(leerCola()).toHaveLength(3);

    enLinea = true;
    await vaciarCola(imprimir);
    expect(impresas).toEqual(["A", "B", "C"]);
    expect(leerCola()).toHaveLength(0);
  });

  it("no se salta a la que falla: si la primera no sale, las de esa estación esperan", async () => {
    const intentadas: string[] = [];
    encolarComanda({ estacion: "estacion1", area: "cocina", job: job("A") });
    encolarComanda({ estacion: "estacion1", area: "cocina", job: job("B") });
    await vaciarCola(async (c) => { intentadas.push(nombre(c.job)); return false; });
    expect(intentadas).toEqual(["A"]);
  });

  it("una estación caída no detiene a la otra", async () => {
    encolarComanda({ estacion: "estacion2", area: "Barra", job: job("bebida") });
    encolarComanda({ estacion: "estacion1", area: "cocina", job: job("hamburguesa") });
    await vaciarCola(async (c) => c.estacion === "estacion1");
    expect(leerCola().map((c) => c.area)).toEqual(["Barra"]);
  });

  it("avisa el primer resultado y cuando por fin sale, no cada reintento", async () => {
    const avisos: boolean[] = [];
    encolarComanda({ estacion: "estacion1", area: "cocina", job: job("A") });
    for (const ok of [false, false, true]) await vaciarCola(async () => ok, (_c, salio) => avisos.push(salio));
    expect(avisos).toEqual([false, true]);
  });

  it("una comanda vencida ya no se imprime", async () => {
    encolarComanda({ estacion: "estacion1", area: "cocina", job: job("vieja") });
    const imprimir = vi.fn(async () => true);
    await vaciarCola(imprimir, undefined, () => Date.now() + VIGENCIA_MS + 1);
    expect(imprimir).not.toHaveBeenCalled();
    expect(leerCola()).toHaveLength(0);
  });
});
