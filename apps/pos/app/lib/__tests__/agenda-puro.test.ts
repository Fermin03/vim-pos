import { describe, it, expect } from "vitest";
import { ETIQUETA_ESTADO_CITA, mensajeRecordatorio, pasoTolerancia, seCruzan, tramosEncadenados } from "@vim/db/agenda";
import { ALTO_MIN, colaboradorDeLaCita, diaCita, diaSemana, gruposCitasCobro, lineasDeCita, nombreCorto, posicionTramo, precioEnCaja, rangoHoras, servicioSinColaborador, trabajaA, type CitaDia, type ColaboradorDia, type ServicioAgenda } from "../agenda";
import type { Producto } from "../catalogo";

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

describe("cobrar la cita", () => {
  const tramo = (id: string, productoId: string, usuarioId: string | null, precio = 180) => ({
    id, orden: 1, productoId, servicio: productoId, usuarioId, colaborador: usuarioId, espacio: null, precio, inicia: null, termina: null, empalme: false,
  });
  const cita = (id: string, estado: CitaDia["estado"], inicia: string, tramos = [tramo(`${id}-t`, "corte", "diego")]): CitaDia => ({
    id, clienteId: null, clienteNombre: id, clienteTelefono: null, clienteEmail: null, estado, canal: "CAJA",
    inicia: t(inicia), termina: t(inicia), llegoAt: null, empalme: false, nota: null, tramos,
  });
  const producto = (id: string, precio: number): Producto => ({ id, nombre: id, descripcion: null, precio_base_mxn: precio, categoria_id: "c", agotado: false, esCombo: false, seVendeAqui: true });
  const servicios: ServicioAgenda[] = [{ productoId: "corte", nombre: "Corte", precio: 150, duracionMin: 40, colaboradores: [{ usuarioId: "adriana", precio: 250, duracionMin: null }, { usuarioId: "diego", precio: null, duracionMin: null }] }];

  it("agrupa: termina pronto (en curso y terminadas, la que acaba antes arriba), en espera y cobradas de hoy", () => {
    const g = gruposCitasCobro([
      cita("laura", "EN_CURSO", "2026-11-06T12:00:00-06:00"),
      cita("camila", "TERMINADA", "2026-11-06T10:00:00-06:00"),
      cita("emilia", "COBRADA", "2026-11-06T09:00:00-06:00"),
      cita("vieja", "COBRADA", "2026-11-05T09:00:00-06:00"),
      cita("sin-tramos", "TERMINADA", "2026-11-06T09:00:00-06:00", []),
    ], [cita("luis", "EN_ESPERA", "2026-11-06T11:40:00-06:00", [])], "2026-11-06");
    expect(g.terminaPronto.map((c) => c.id)).toEqual(["camila", "laura"]);
    expect(g.enEspera.map((c) => c.id)).toEqual(["luis"]);
    expect(g.cobradas.map((c) => c.id)).toEqual(["emilia"]);
  });

  it("los renglones llevan quién lo hizo y el precio con esa persona (el del catálogo si no tiene uno propio)", () => {
    const c = cita("x", "TERMINADA", "2026-11-06T10:00:00-06:00", [tramo("t1", "corte", "adriana"), tramo("t2", "corte", "diego")]);
    const { lineas, faltan } = lineasDeCita(c, [producto("corte", 180)], servicios, new Set(["adriana", "diego"]));
    expect(faltan).toEqual([]);
    expect(lineas.map((l) => [l.colaboradorId, l.producto.precio_base_mxn, l.citaServicioId, l.cantidad])).toEqual([["adriana", 250, "t1", 1], ["diego", 180, "t2", 1]]);
  });

  it("un colaborador que ya no está activo no viaja: el servicio pide quién lo hizo y bloquea el cobro", () => {
    const c = cita("x", "TERMINADA", "2026-11-06T10:00:00-06:00", [tramo("t1", "corte", "baja"), tramo("t2", "tinte", "diego")]);
    const { lineas, faltan } = lineasDeCita(c, [producto("corte", 180)], servicios, new Set(["diego"]));
    expect(faltan).toEqual(["tinte"]);
    expect(lineas[0]).not.toHaveProperty("colaboradorId");
    expect(servicioSinColaborador(lineas, new Set(["corte"]))?.clientId).toBe(lineas[0]!.clientId);
    // Un producto sin colaborador no bloquea.
    expect(servicioSinColaborador([{ ...lineas[0]!, producto: producto("shampoo", 240) }], new Set(["corte"]))).toBeUndefined();
  });

  it("nombre corto del colaborador", () => {
    expect(nombreCorto("Adriana Castro")).toBe("Adriana C.");
    expect(nombreCorto("Diego R.")).toBe("Diego R.");
    expect(nombreCorto(" Berta ")).toBe("Berta");
  });

  it("precio en caja: el propio del colaborador o el del catálogo de la sucursal", () => {
    expect(precioEnCaja(producto("corte", 190), servicios[0], "adriana")).toBe(250);
    expect(precioEnCaja(producto("corte", 190), servicios[0], "diego")).toBe(190);
    expect(precioEnCaja(producto("corte", 190), servicios[0], null)).toBe(190);
  });
});

describe("diaCita", () => {
  it("de hoy no dice nada; ayer dice «ayer»; antes, el día corto", () => {
    expect(diaCita(t("2026-11-06T09:00:00-06:00"), "2026-11-06")).toBeNull();
    expect(diaCita(t("2026-11-05T23:30:00-06:00"), "2026-11-06")).toBe("ayer");
    expect(diaCita(t("2026-11-02T12:00:00-06:00"), "2026-11-06")).toBe("lun 2");
    expect(diaCita(null, "2026-11-06")).toBeNull();
  });
});

describe("colaboradorDeLaCita", () => {
  const p = (id: string): Producto => ({ id, nombre: id, descripcion: null, precio_base_mxn: 100, categoria_id: "c", agotado: false, esCombo: false, seVendeAqui: true });
  const l = (id: string, extra: { colaboradorId?: string; citaServicioId?: string } = {}) => ({ clientId: id, producto: p(id), cantidad: 1, modificadores: [], notaCocina: null, ...extra });
  const servicios = new Set(["corte", "tinte"]);

  it("con la cita cargada, lo agregado es de su colaborador (también releída de la base, sin el tramo)", () => {
    expect(colaboradorDeLaCita({ citaId: "c1", lineas: [l("corte", { colaboradorId: "diego", citaServicioId: "t1" })] }, servicios)).toBe("diego");
    expect(colaboradorDeLaCita({ citaId: "c1", lineas: [l("corte", { colaboradorId: "diego" })] }, servicios)).toBe("diego");
  });

  it("sin cita nunca se asigna en silencio, aunque otro servicio ya tenga colaborador", () => {
    expect(colaboradorDeLaCita({ citaId: null, lineas: [l("corte", { colaboradorId: "diego" })] }, servicios)).toBeUndefined();
    expect(colaboradorDeLaCita({ lineas: [] }, servicios)).toBeUndefined();
  });
});
