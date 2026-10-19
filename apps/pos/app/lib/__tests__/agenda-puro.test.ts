import { describe, it, expect } from "vitest";
import { ETIQUETA_ESTADO_CITA, mensajeRecordatorio, pasoTolerancia, seCruzan, tramosEncadenados } from "@vim/db/agenda";
import { ALTO_MIN, diaSemana, posicionTramo, rangoHoras, trabajaA, type CitaDia, type ColaboradorDia } from "../agenda";

const t = (iso: string) => new Date(iso);

describe("tramos encadenados", () => {
  it("manicure 45 + pedicure 30: el segundo empieza cuando termina el primero", () => {
    const [a, b] = tramosEncadenados(t("2026-11-06T10:00:00-06:00"), [45, 30]);
    expect(a).toEqual({ inicia: t("2026-11-06T10:00:00-06:00"), termina: t("2026-11-06T10:45:00-06:00") });
    expect(b).toEqual({ inicia: t("2026-11-06T10:45:00-06:00"), termina: t("2026-11-06T11:15:00-06:00") });
  });
});

describe("seCruzan", () => {
  const tramo = (i: string, f: string) => ({ inicia: t(`2026-11-06T${i}:00-06:00`), termina: t(`2026-11-06T${f}:00-06:00`) });
  it("un minuto encimado se cruza; solo tocarse no", () => {
    expect(seCruzan(tramo("10:00", "11:00"), tramo("10:59", "12:00"))).toBe(true);
    expect(seCruzan(tramo("10:00", "11:00"), tramo("11:00", "12:00"))).toBe(false);
    expect(seCruzan(tramo("11:00", "12:00"), tramo("10:00", "11:00"))).toBe(false);
    expect(seCruzan(tramo("10:00", "12:00"), tramo("10:30", "11:00"))).toBe(true);
  });
});

describe("pasoTolerancia", () => {
  const inicia = t("2026-11-06T10:30:00-06:00");
  it("hasta el minuto de tolerancia todavía no; después sí", () => {
    expect(pasoTolerancia(inicia, t("2026-11-06T10:45:00-06:00"), 15)).toBe(false);
    expect(pasoTolerancia(inicia, t("2026-11-06T10:46:00-06:00"), 15)).toBe(true);
    expect(pasoTolerancia(inicia, t("2026-11-06T10:31:00-06:00"), 0)).toBe(true);
  });
});

describe("etiquetas de estado", () => {
  it("son las del diseño", () => {
    expect(ETIQUETA_ESTADO_CITA).toEqual({
      AGENDADA: "Por llegar", EN_ESPERA: "En espera", EN_CURSO: "Atendiendo",
      TERMINADA: "Terminada", NO_LLEGO: "No llegó", CANCELADA: "Cancelada", COBRADA: "Cobrada",
    });
  });
});

describe("mensajeRecordatorio", () => {
  it("texto exacto, con día y hora de México aunque el instante caiga en otro día UTC", () => {
    // 19:30 en México = 01:30 UTC del día siguiente.
    expect(mensajeRecordatorio({ nombre: "Sara", negocio: "Estudio Lía", inicia: t("2026-11-06T19:30:00-06:00"), servicios: ["Manicure", "Pedicure"] }))
      .toBe("Hola Sara, te recordamos tu cita en Estudio Lía el viernes 6 de noviembre a las 19:30: Manicure y Pedicure.");
    expect(mensajeRecordatorio({ nombre: "Ana", negocio: "Lía", inicia: t("2026-11-05T09:00:00-06:00"), servicios: ["Corte"] }))
      .toBe("Hola Ana, te recordamos tu cita en Lía el jueves 5 de noviembre a las 9:00: Corte.");
  });
});

describe("layout del calendario", () => {
  const dia = "2026-11-06";
  it("una cita de 10:00 a 11:30 en una rejilla que empieza a las 9:00", () => {
    expect(posicionTramo(t(`${dia}T10:00:00-06:00`), t(`${dia}T11:30:00-06:00`), dia, 9 * 60)).toEqual({ top: 120, alto: 180 });
  });
  it("una cita corta se queda tocable", () => {
    expect(posicionTramo(t(`${dia}T10:00:00-06:00`), t(`${dia}T10:10:00-06:00`), dia, 9 * 60).alto).toBe(ALTO_MIN);
  });

  const diego: ColaboradorDia = { usuarioId: "d", nombre: "Diego R.", color: "#2C5AA0", horario: { inicia: 600, termina: 1140, comida: [840, 900] }, ausente: false };
  const cita = (i: string, f: string): CitaDia => ({
    id: "c", clienteId: null, clienteNombre: "X", clienteTelefono: null, clienteEmail: null, estado: "AGENDADA", canal: "CAJA", inicia: null, termina: null, llegoAt: null, empalme: false, nota: null,
    tramos: [{ id: "t", orden: 1, productoId: "p", servicio: "Corte", usuarioId: "d", colaborador: "Diego R.", espacio: null, precio: 150, inicia: t(`${dia}T${i}:00-06:00`), termina: t(`${dia}T${f}:00-06:00`), empalme: false }],
  });

  it("horas: la unión de 9 a 20, el horario de los colaboradores y las citas", () => {
    expect(rangoHoras([diego], [], dia)).toEqual({ desde: 540, hasta: 1200 });
    expect(rangoHoras([{ ...diego, horario: { inicia: 480, termina: 1290, comida: null } }], [], dia)).toEqual({ desde: 480, hasta: 1320 });
    // Domingo sin horario con una cita a las 17:00: igual se ve de 9 a 20, no solo 17 a 19.
    expect(rangoHoras([{ ...diego, horario: null }], [cita("17:00", "18:30")], dia)).toEqual({ desde: 540, hasta: 1200 });
    expect(rangoHoras([], [cita("07:15", "08:00"), cita("21:00", "21:40")], dia)).toEqual({ desde: 420, hasta: 1320 });
    expect(rangoHoras([diego], [cita("09:30", "10:15"), cita("18:30", "19:20")], dia)).toEqual({ desde: 540, hasta: 1200 });
    expect(rangoHoras([], [], dia)).toEqual({ desde: 540, hasta: 1200 });
  });

  it("trabaja dentro de su horario, fuera de la comida y si no falta", () => {
    expect(trabajaA(diego, 600)).toBe(true);
    expect(trabajaA(diego, 850)).toBe(false);
    expect(trabajaA(diego, 1140)).toBe(false);
    expect(trabajaA({ ...diego, ausente: true }, 700)).toBe(false);
  });

  it("día de la semana como la base (0 = domingo)", () => {
    expect(diaSemana("2026-11-08")).toBe(0);
    expect(diaSemana("2026-10-20")).toBe(2);
  });
});
