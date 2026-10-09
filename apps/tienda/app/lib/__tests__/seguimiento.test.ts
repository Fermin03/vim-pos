// El seguimiento: la máquina del sondeo (ritmo, pausas, errores) y los pasos del recorrido.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Resultado } from "../api";
import { seguimientoDe, type EstadoDePedido, type Seguimiento } from "../contrato";
import { SONDEO_INICIAL, alLeer, esperaDe, recorrido, sinConexion, sondear, tardando, terminado, type Sondeo } from "../seguimiento";
import { seguimientoCrudo } from "./datos";

const base = seguimientoDe(seguimientoCrudo()) as Seguimiento;
const en = (estado: EstadoDePedido): Resultado<Seguimiento> => ({ ok: true, datos: { ...base, estado } });
const fallo = (error: string): Resultado<Seguimiento> => ({ ok: false, error, detalle: null });
const tras = (...rs: Resultado<Seguimiento>[]): Sondeo => rs.reduce(alLeer, SONDEO_INICIAL);

describe("alLeer y esperaDe", () => {
  it("vivo: 10 s", () => {
    for (const estado of ["EN_PROCESO", "EN_PREPARACION", "EN_CAMINO", "LISTO_PARA_RECOGER"] as const) {
      const s = tras(en(estado));
      expect(esperaDe(s), estado).toBe(10_000);
      expect(terminado(s), estado).toBe(false);
    }
  });
  it("entregado o cancelado: se deja de preguntar", () => {
    for (const estado of ["ENTREGADO", "CANCELADO"] as const) {
      expect(esperaDe(tras(en(estado))), estado).toBeNull();
      expect(terminado(tras(en(estado))), estado).toBe(true);
    }
  });
  it("tras errores seguidos baja el ritmo: 10, 20, 40 y 60 s de tope", () => {
    const e = fallo("SIN_CONEXION");
    expect([1, 2, 3, 4, 5, 9].map((n) => esperaDe(tras(en("EN_PROCESO"), ...Array<Resultado<Seguimiento>>(n).fill(e))))).toEqual([10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
  });
  it("un fallo conserva lo último que se supo, y una lectura buena lo deja como nuevo", () => {
    const s = tras(en("EN_PREPARACION"), fallo("SERVICIO_NO_DISPONIBLE"), fallo("SIN_CONEXION"));
    expect(s.pedido?.estado).toBe("EN_PREPARACION");
    expect(s.fallos).toBe(2);
    expect(alLeer(s, en("EN_CAMINO"))).toEqual({ pedido: { ...base, estado: "EN_CAMINO" }, fallos: 0, lento: false, noEncontrado: false });
  });
  it("«Sin conexión»: con dos fallos seguidos, o con uno si no hay nada que enseñar", () => {
    expect(sinConexion(tras(en("EN_PROCESO"), fallo("SIN_CONEXION")))).toBe(false);
    expect(sinConexion(tras(en("EN_PROCESO"), fallo("SIN_CONEXION"), fallo("SIN_CONEXION")))).toBe(true);
    expect(sinConexion(tras(fallo("SIN_CONEXION")))).toBe(true);
    expect(sinConexion(tras(en("EN_PROCESO")))).toBe(false);
  });
  it("PEDIDO_NO_ENCONTRADO: no se encontró y se deja de preguntar", () => {
    for (const codigo of ["PEDIDO_NO_ENCONTRADO", "CODIGO_INVALIDO", "TIENDA_NO_DISPONIBLE"]) {
      const s = tras(fallo(codigo));
      expect(s.noEncontrado, codigo).toBe(true);
      expect(esperaDe(s), codigo).toBeNull();
      expect(sinConexion(s), codigo).toBe(false);
    }
  });
  it("DEMASIADOS_INTENTOS: baja a 60 s sin contarlo como fallo ni avisar; una lectura buena lo quita", () => {
    const s = tras(en("EN_PROCESO"), fallo("DEMASIADOS_INTENTOS"));
    expect(esperaDe(s)).toBe(60_000);
    expect(s.fallos).toBe(0);
    expect(sinConexion(s)).toBe(false);
    expect(s.pedido?.estado).toBe("EN_PROCESO");
    expect(esperaDe(alLeer(s, en("EN_PROCESO")))).toBe(10_000);
  });
  it("«Estamos tardando»: la PRIMERA lectura falló (red, servicio o demasiadas lecturas) y no hay nada que enseñar", () => {
    expect(tardando(SONDEO_INICIAL)).toBe(false);                       // aún no se sabe: «Buscando tu pedido…»
    for (const codigo of ["DEMASIADOS_INTENTOS", "SIN_CONEXION", "SERVICIO_NO_DISPONIBLE"]) expect(tardando(tras(fallo(codigo))), codigo).toBe(true);
    expect(tardando(tras(en("EN_PROCESO"), fallo("DEMASIADOS_INTENTOS")))).toBe(false);   // ya hay pedido: se sigue viendo
    expect(tardando(tras(fallo("PEDIDO_NO_ENCONTRADO")))).toBe(false);                    // eso es «no encontramos»
    expect(tardando(tras(fallo("SIN_CONEXION"), en("EN_PROCESO")))).toBe(false);
  });
  it("una lectura cancelada no cambia nada", () => {
    const s = tras(en("EN_PROCESO"));
    expect(alLeer(s, fallo("CANCELADA"))).toBe(s);
  });
});

describe("sondear", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function documento(hidden = false) {
    const oyentes = new Set<() => void>();
    const doc = {
      hidden,
      addEventListener: (_: string, f: () => void) => { oyentes.add(f); },
      removeEventListener: (_: string, f: () => void) => { oyentes.delete(f); },
    };
    return { doc: doc as unknown as Document, oyentes, mostrar: (visible: boolean) => { doc.hidden = !visible; oyentes.forEach((f) => f()); } };
  }
  /** Un lector que contesta lo que toque, en orden (lo último se repite). */
  function lector(...respuestas: Resultado<Seguimiento>[]) {
    let i = 0;
    return vi.fn(async (_s: AbortSignal) => respuestas[Math.min(i++, respuestas.length - 1)]!);
  }

  it("lee de inmediato y luego cada 10 s", async () => {
    const leer = lector(en("EN_PROCESO")), alCambiar = vi.fn(), { doc } = documento();
    sondear(leer, alCambiar, doc);
    await vi.advanceTimersByTimeAsync(0);
    expect(leer).toHaveBeenCalledTimes(1);
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ fallos: 0, pedido: expect.objectContaining({ estado: "EN_PROCESO" }) }));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(leer).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(leer).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(leer).toHaveBeenCalledTimes(3);
  });
  it("se detiene al llegar a un estado final", async () => {
    const leer = lector(en("EN_CAMINO"), en("ENTREGADO")), { doc } = documento();
    sondear(leer, vi.fn(), doc);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(leer).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(leer).toHaveBeenCalledTimes(2);
  });
  it("no encontrado: avisa una vez y no vuelve a preguntar", async () => {
    const leer = lector(fallo("PEDIDO_NO_ENCONTRADO")), alCambiar = vi.fn(), { doc } = documento();
    sondear(leer, alCambiar, doc);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(leer).toHaveBeenCalledTimes(1);
    expect(alCambiar).toHaveBeenCalledWith(expect.objectContaining({ noEncontrado: true }));
  });
  it("con errores seguidos espacia las lecturas: 10, 20, 40, 60, 60 s", async () => {
    const leer = lector(fallo("SIN_CONEXION")), { doc } = documento();
    sondear(leer, vi.fn(), doc);
    await vi.advanceTimersByTimeAsync(0);
    const llamadas: number[] = [];
    for (const espera of [10_000, 20_000, 40_000, 60_000, 60_000]) {
      await vi.advanceTimersByTimeAsync(espera - 1);
      llamadas.push(leer.mock.calls.length);
      await vi.advanceTimersByTimeAsync(1);
      llamadas.push(leer.mock.calls.length);
    }
    expect(llamadas).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  });
  it("con la pestaña oculta no pregunta; al volver relee sin esperar", async () => {
    const leer = lector(en("EN_PROCESO")), { doc, mostrar } = documento();
    sondear(leer, vi.fn(), doc);
    await vi.advanceTimersByTimeAsync(0);
    mostrar(false);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(leer).toHaveBeenCalledTimes(1);
    mostrar(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(leer).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(leer).toHaveBeenCalledTimes(3);
  });
  it("si empieza oculta, espera a que se vea", async () => {
    const leer = lector(en("EN_PROCESO")), { doc, mostrar } = documento(true);
    sondear(leer, vi.fn(), doc);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(leer).not.toHaveBeenCalled();
    mostrar(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(leer).toHaveBeenCalledTimes(1);
  });
  it("al ocultarse suelta la lectura en vuelo y su respuesta no cuenta", async () => {
    let senal: AbortSignal | undefined, contestar: (r: Resultado<Seguimiento>) => void = () => {};
    const leer = vi.fn((s: AbortSignal) => { senal = s; return new Promise<Resultado<Seguimiento>>((ok) => { contestar = ok; }); });
    const alCambiar = vi.fn(), { doc, mostrar } = documento();
    sondear(leer, alCambiar, doc);
    await vi.advanceTimersByTimeAsync(0);
    mostrar(false);
    expect(senal?.aborted).toBe(true);
    contestar(en("ENTREGADO"));
    await vi.advanceTimersByTimeAsync(0);
    expect(alCambiar).not.toHaveBeenCalled();
  });
  it("al detenerlo deja de leer y de escuchar la pestaña", async () => {
    const leer = lector(en("EN_PROCESO")), { doc, oyentes, mostrar } = documento();
    const detener = sondear(leer, vi.fn(), doc);
    await vi.advanceTimersByTimeAsync(0);
    detener();
    expect(oyentes.size).toBe(0);
    mostrar(true);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(leer).toHaveBeenCalledTimes(1);
  });
  it("ya terminado, volver a la pestaña no pregunta de nuevo", async () => {
    const leer = lector(en("CANCELADO")), { doc, mostrar } = documento();
    sondear(leer, vi.fn(), doc);
    await vi.advanceTimersByTimeAsync(0);
    mostrar(false); mostrar(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(leer).toHaveBeenCalledTimes(1);
  });
});

describe("recorrido", () => {
  const fases = (modo: "RECOGER" | "DOMICILIO", estado: EstadoDePedido) => recorrido(modo, estado)?.map((p) => `${p.titulo}:${p.fase}`);
  it("para recoger: En proceso → En preparación → Listo para recoger → Entregado", () => {
    expect(recorrido("RECOGER", "EN_PROCESO")?.map((p) => p.titulo)).toEqual(["En proceso", "En preparación", "Listo para recoger", "Entregado"]);
    expect(fases("RECOGER", "LISTO_PARA_RECOGER")).toEqual(["En proceso:hecho", "En preparación:hecho", "Listo para recoger:actual", "Entregado:pendiente"]);
  });
  it("a domicilio: … → En camino → Entregado", () => {
    expect(fases("DOMICILIO", "EN_PREPARACION")).toEqual(["En proceso:hecho", "En preparación:actual", "En camino:pendiente", "Entregado:pendiente"]);
    expect(fases("DOMICILIO", "EN_PROCESO")).toEqual(["En proceso:actual", "En preparación:pendiente", "En camino:pendiente", "Entregado:pendiente"]);
  });
  it("entregado: todo hecho", () => {
    expect(fases("RECOGER", "ENTREGADO")?.every((f) => f.endsWith(":hecho"))).toBe(true);
  });
  it("cancelado rompe el recorrido", () => {
    expect(recorrido("DOMICILIO", "CANCELADO")).toBeNull();
  });
  it("un estado del otro modo no adelanta de más: se lee como en preparación", () => {
    expect(fases("RECOGER", "EN_CAMINO")).toEqual(["En proceso:hecho", "En preparación:actual", "Listo para recoger:pendiente", "Entregado:pendiente"]);
  });
});
