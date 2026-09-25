import { describe, it, expect } from "vitest";
import { leerTodas } from "../reportes";

/** Simula PostgREST: entrega como máximo 1000 filas por petición, las que pida `range`. */
function servidor(total: number) {
  const pedidas: [number, number][] = [];
  const pagina = (desde: number, hasta: number) => {
    pedidas.push([desde, hasta]);
    const fin = Math.min(hasta, desde + 999, total - 1);
    const data = fin >= desde ? Array.from({ length: fin - desde + 1 }, (_, i) => ({ n: desde + i })) : [];
    return Promise.resolve({ data, error: null });
  };
  return { pagina, pedidas };
}

describe("leerTodas — sin el corte silencioso de 1000 filas", () => {
  it("junta todas las páginas", async () => {
    const s = servidor(2005);
    const filas = await leerTodas(s.pagina);
    expect(filas).toHaveLength(2005);
    expect(filas.at(-1)).toEqual({ n: 2004 });
    expect(s.pedidas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("exactamente 1000: pide una página más y se detiene al llegar vacía", async () => {
    const s = servidor(1000);
    expect(await leerTodas(s.pagina)).toHaveLength(1000);
    expect(s.pedidas).toHaveLength(2);
  });

  it("un error en cualquier página no devuelve datos a medias", async () => {
    let llamada = 0;
    const pagina = () => Promise.resolve(++llamada === 2 ? { data: null, error: { message: "timeout" } } : { data: Array(1000).fill({}), error: null });
    await expect(leerTodas(pagina)).rejects.toThrow("timeout");
  });
});
