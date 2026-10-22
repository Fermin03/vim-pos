import { describe, it, expect } from "vitest";
import {
  accionDe, clasificarError, diasTira, ejecutarAccion, leerMiAgenda, leerMisComisiones, resumenComision, tramosDelDia, type MiTramo,
} from "../mi-agenda";

const tramo = (id: string, inicia: string, estado: MiTramo["cita"]["estado"] = "AGENDADA", ultimo = true): MiTramo => ({
  id, inicia, termina: inicia, servicio: "Corte", espacio: null, ultimo,
  cita: { id: `c-${id}`, estado, cliente_nombre: "Camila", nota: null },
});

/** Cliente falso: responde por nombre de RPC y anota las llamadas. */
function falso(respuestas: Record<string, (args: Record<string, unknown>) => unknown>) {
  const llamadas: [string, Record<string, unknown>][] = [];
  const sb = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      llamadas.push([fn, args]);
      const r = respuestas[fn];
      return Promise.resolve(r ? { data: r(args), error: null } : { data: null, error: { message: `sin ${fn}` } });
    },
  };
  return { sb: sb as unknown as Parameters<typeof leerMiAgenda>[0], llamadas };
}

describe("la lista por día, en México", () => {
  it("la tira son hoy y los 6 días siguientes, cruzando de mes", () => {
    expect(diasTira("2026-10-28")).toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("una cita a las 23:30 de México cae en su día, no en el de UTC; y se ordena por hora", () => {
    const tramos = [
      tramo("noche", "2026-10-21T05:30:00+00:00"), // 23:30 del 20 en México
      tramo("manana", "2026-10-20T16:00:00+00:00"), // 10:00 del 20
      tramo("otro", "2026-10-21T16:00:00+00:00"),
    ];
    expect(tramosDelDia(tramos, "2026-10-20").map((t) => t.id)).toEqual(["manana", "noche"]);
    expect(tramosDelDia(tramos, "2026-10-21").map((t) => t.id)).toEqual(["otro"]);
  });

  it("pide a mi_agenda los 7 días y rechaza una respuesta con otra forma", async () => {
    const { sb, llamadas } = falso({ mi_agenda: () => ({ colaborador: "Diego", tramos: [tramo("a", "2026-10-20T16:00:00+00:00")] }) });
    const a = await leerMiAgenda(sb, "2026-10-20");
    expect(a.colaborador).toBe("Diego");
    expect(llamadas[0]).toEqual(["mi_agenda", { p_desde: "2026-10-20", p_hasta: "2026-10-26" }]);
    const malo = falso({ mi_agenda: () => ({ tramos: "x" }) });
    await expect(leerMiAgenda(malo.sb, "2026-10-20")).rejects.toThrow();
  });
});

describe("el botón según el estado", () => {
  it("por llegar → «Llegó · empezar»; atendiendo → «Terminé» o «Terminé mi parte»; lo demás, nada", () => {
    expect(accionDe(tramo("a", "x", "AGENDADA"))).toEqual({ tipo: "empezar", etiqueta: "Llegó · empezar" });
    expect(accionDe(tramo("a", "x", "EN_CURSO", true))).toEqual({ tipo: "terminar", etiqueta: "Terminé" });
    expect(accionDe(tramo("a", "x", "EN_CURSO", false))).toEqual({ tipo: "terminar", etiqueta: "Terminé mi parte" });
    for (const e of ["TERMINADA", "COBRADA", "NO_LLEGO", "EN_ESPERA", "CANCELADA"] as const) expect(accionDe(tramo("a", "x", e))).toBeNull();
  });

  it("«Terminé mi parte» (la RPC devuelve EN_CURSO) avisa a la recepción", async () => {
    const parte = falso({ mi_cita_terminar: () => "EN_CURSO" });
    expect(await ejecutarAccion(parte.sb, "terminar", "c1")).toBe("Avisamos a la recepción");
    const fin = falso({ mi_cita_terminar: () => "TERMINADA" });
    expect(await ejecutarAccion(fin.sb, "terminar", "c1")).toBe("Cita terminada");
    const emp = falso({ mi_cita_empezar: () => null });
    expect(await ejecutarAccion(emp.sb, "empezar", "c1")).toBe("Cita empezada");
    expect(emp.llamadas[0]).toEqual(["mi_cita_empezar", { p_cita: "c1" }]);
  });
});

describe("mis comisiones", () => {
  const fila = { servicios: 3, ventas_mxn: "862.07", comision_servicios_mxn: "86.21", comision_productos_mxn: 10.1, sueldo_mxn: "1500.00", total_mxn: "1596.31" };

  it("mapea la fila: comisión = servicios + productos; sueldo solo en un periodo completo", () => {
    expect(resumenComision([fila], true)).toEqual({ servicios: 3, ventas: 862.07, comision: 96.31, sueldo: 1500, total: 1596.31 });
    expect(resumenComision([fila], false)).toEqual({ servicios: 3, ventas: 862.07, comision: 96.31, sueldo: null, total: 96.31 });
    expect(resumenComision([], true)).toEqual({ servicios: 0, ventas: 0, comision: 0, sueldo: 0, total: 0 });
  });

  it("hoy, el periodo actual y el anterior (el día antes de que empiece el actual)", async () => {
    const { sb, llamadas } = falso({
      mi_periodo_comisiones: (a) => (a.p_fecha === "2026-10-20" ? [{ desde: "2026-10-19", hasta: "2026-10-25" }] : [{ desde: "2026-10-12", hasta: "2026-10-18" }]),
      mis_comisiones: () => [fila],
    });
    const c = await leerMisComisiones(sb, "2026-10-20");
    expect(c.hoy.sueldo).toBeNull();
    expect(c.actual).toMatchObject({ desde: "2026-10-19", hasta: "2026-10-25", sueldo: 1500 });
    expect(c.anterior).toMatchObject({ desde: "2026-10-12", hasta: "2026-10-18" });
    expect(llamadas.filter(([f]) => f === "mi_periodo_comisiones").map(([, a]) => a.p_fecha)).toEqual(["2026-10-20", "2026-10-18"]);
    expect(llamadas.some(([f]) => f === "comisiones_periodo")).toBe(false);
  });
});

describe("errores", () => {
  it("sesión vencida o perdida → regresa a la entrada", () => {
    expect(clasificarError({ code: "PGRST301", message: "JWT expired" })).toEqual({ tipo: "sesion" });
    expect(clasificarError({ code: "42501", message: "permission denied for function mi_agenda" })).toEqual({ tipo: "sesion" });
    expect(clasificarError(new Error("Invalid Refresh Token: Refresh Token Not Found"))).toEqual({ tipo: "sesion" });
  });

  it("SIN_AGENDA, DATOS_INVALIDOS, sin red y lo raro, en español", () => {
    expect(clasificarError({ code: "42501", message: "SIN_AGENDA: Esta cuenta no tiene agenda." })).toEqual({ tipo: "sin_agenda" });
    expect(clasificarError({ code: "22023", message: "DATOS_INVALIDOS: la cita no está por llegar." }))
      .toEqual({ tipo: "mensaje", texto: "La cita no está por llegar." });
    expect(clasificarError(new TypeError("Failed to fetch"))).toEqual({ tipo: "mensaje", texto: "No hay conexión. Revisa tu internet e inténtalo de nuevo." });
    expect(clasificarError({ message: "boom" })).toMatchObject({ tipo: "mensaje" });
  });
});
