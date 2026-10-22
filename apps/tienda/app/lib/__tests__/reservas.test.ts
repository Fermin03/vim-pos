// El sitio de reservas sin pantalla: catálogo por sucursal, cadena y cuerpo de `reservar`, datos de
// la clienta, fechas en México, la tira de días, qué se puede hacer con una cita y el recorrido
// reservar → POR_PAGAR → tarjeta → reto → hecho.
import { describe, expect, it } from "vitest";
import type { Resultado } from "../api";
import type { Cita, Huecos, Reserva, Reservas } from "../contrato";
import {
  FLUJO_INICIAL, categoriasDe, cobroEnLinea, sinCobroDe, textoDePausaDeReserva, cuerpoDeReserva, desdeDe, duracionLegible, erroresDeDatos, estadoDeCita, etiquetaDeDia, fechaLarga, flujo,
  horaDe, diaDe, intentoDeReserva, queSePuede, quienesHacen, resumenDe, serviciosDeSucursal, siguienteDiaConLugar, textoDeFallo, tiraDeDias,
  type Flujo,
} from "../reservas";
import { pasoDelReto } from "../verificacion";
import { CODIGO, u } from "./datos";

const SUC = u(1), OTRA = u(2), CORTE = u(10), TINTE = u(11), UNAS = u(12), DIEGO = u(40), ANA = u(41);
const catalogo: Pick<Reservas, "servicios" | "colaboradores"> = {
  servicios: [
    { producto_id: CORTE, nombre: "Corte", categoria: "Cabello", precio: "180.00", duracion_min: 40, anticipo_mxn: "72.00" },
    { producto_id: TINTE, nombre: "Tinte", categoria: "Cabello", precio: "650.50", duracion_min: 90, anticipo_mxn: "0.00" },
    { producto_id: UNAS, nombre: "Uñas", categoria: null, precio: "250.00", duracion_min: 60, anticipo_mxn: "25.10" },
  ],
  colaboradores: [
    { id: DIEGO, nombre_corto: "Diego R.", sucursal_id: SUC, servicios: [CORTE, TINTE] },
    { id: ANA, nombre_corto: "Ana P.", sucursal_id: OTRA, servicios: [CORTE, UNAS] },
  ],
};

describe("catálogo", () => {
  it("una sucursal solo ofrece lo que hace alguno de sus colaboradores", () => {
    expect(serviciosDeSucursal(catalogo, SUC).map((s) => s.nombre)).toEqual(["Corte", "Tinte"]);
    expect(serviciosDeSucursal(catalogo, OTRA).map((s) => s.nombre)).toEqual(["Corte", "Uñas"]);
  });
  it("categorías sin repetir, y las que no tienen van en «Otros servicios»", () => {
    expect(categoriasDe(catalogo.servicios)).toEqual(["Cabello", "Otros servicios"]);
  });
  it("¿con quién? solo quienes lo hacen en esa sucursal", () => {
    expect(quienesHacen(catalogo, SUC, CORTE).map((c) => c.nombre_corto)).toEqual(["Diego R."]);
    expect(quienesHacen(catalogo, SUC, UNAS)).toEqual([]);
  });
  it("duración legible", () => {
    expect([40, 60, 90, 150].map(duracionLegible)).toEqual(["40 min", "1 h", "1 h 30 min", "2 h 30 min"]);
  });
  it("el resumen suma en centavos", () => {
    expect(resumenDe(catalogo.servicios, [{ producto_id: TINTE, usuario_id: null }, { producto_id: UNAS, usuario_id: ANA }]))
      .toEqual({ total: "900.50", duracion: 150, anticipo: "25.10" });
  });
});

describe("cuerpo de reservar", () => {
  const datos = { nombre: "  Camila  ", celular: "+52 1 477 123 4567", correo: " Camila@Mail.COM ", nota: "  " };
  it("arma la cadena en orden, normaliza el celular y el correo, y la nota vacía es null", () => {
    const c = cuerpoDeReserva({ sucursalId: SUC, inicia: "2026-10-20T16:00:00Z", cadena: [{ producto_id: CORTE, usuario_id: DIEGO }, { producto_id: TINTE, usuario_id: null }], datos, clave: CODIGO, captcha: "tok" });
    expect(c).toEqual({
      sucursal_id: SUC, inicia: "2026-10-20T16:00:00Z",
      servicios: [{ producto_id: CORTE, usuario_id: DIEGO }, { producto_id: TINTE, usuario_id: null }],
      cliente: { nombre: "Camila", telefono: "4771234567", email: "camila@mail.com" }, nota: null, captcha: "tok", clave: CODIGO,
    });
    expect("tarjeta" in c).toBe(false);
  });
  it("con tarjeta, la lleva", () => {
    const tarjeta = { token: "a".repeat(32), payment_method_id: "visa", type: "credit_card" as const };
    expect(cuerpoDeReserva({ sucursalId: SUC, inicia: "x", cadena: [], datos, clave: CODIGO, captcha: "", tarjeta }).tarjeta).toEqual(tarjeta);
  });
  it("la clave se queda mientras no cambie lo que se aparta", () => {
    let n = 0;
    const i = intentoDeReserva(() => `clave${++n}`);
    const cadena = [{ producto_id: CORTE, usuario_id: null }];
    expect(i.para(SUC, cadena, "h1")).toBe("clave1");
    expect(i.para(SUC, [{ ...cadena[0]! }], "h1")).toBe("clave1");
    expect(i.para(SUC, cadena, "h2")).toBe("clave2");
    i.olvidar();
    expect(i.para(SUC, cadena, "h2")).toBe("clave3");
  });
});

describe("tus datos", () => {
  const bien = { nombre: "Ca", celular: "477 123 4567", correo: "ca@x.mx", nota: "" };
  it("todo bien = sin errores", () => expect(erroresDeDatos(bien)).toEqual({}));
  it("nombre de 2, celular de 10 dígitos, correo obligatorio y válido, nota hasta 200", () => {
    const e = erroresDeDatos({ nombre: " C ", celular: "123", correo: "", nota: "x".repeat(201) });
    expect(Object.keys(e)).toEqual(["nombre", "celular", "correo", "nota"]);
    expect(erroresDeDatos({ ...bien, correo: "ca@x" }).correo).toBeTruthy();
    expect(erroresDeDatos({ ...bien, celular: "" }).celular).toBe("Escribe tu celular.");
    expect(erroresDeDatos({ ...bien, nota: "x".repeat(200) })).toEqual({});
  });
});

describe("fechas en México", () => {
  it("un instante UTC se lee en la hora del centro", () => {
    expect(horaDe("2026-10-20T16:00:00Z")).toBe("10:00 a. m.");
    expect(horaDe("2026-10-21T01:30:00Z")).toBe("7:30 p. m.");
    // 01:30 UTC del 21 todavía es el 20 en México.
    expect(diaDe("2026-10-21T01:30:00Z")).toBe("2026-10-20");
  });
  it("el día de calendario no se mueve con la zona", () => {
    expect(etiquetaDeDia("2026-10-20")).toEqual({ semana: "mar", numero: "20", mes: "oct" });
    expect(fechaLarga("2026-10-20")).toBe("martes 20 de octubre");
    expect(fechaLarga("2026-10-20", "2026-10-20")).toBe("hoy, martes 20 de octubre");
    expect(fechaLarga("2026-10-21", "2026-10-20")).toBe("mañana, miércoles 21 de octubre");
  });
});

describe("tira de días", () => {
  it("14 días con flechas, sin pasar del plazo", () => {
    const a = tiraDeDias("2026-10-19", 0, 30);
    expect(a.dias).toHaveLength(14);
    expect(a.dias[0]).toBe("2026-10-19");
    expect(a).toMatchObject({ anterior: null, siguiente: 14 });
    const c = tiraDeDias("2026-10-19", 28, 30);
    expect(c.dias).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
    expect(c).toMatchObject({ anterior: 14, siguiente: null });
  });
  it("un plazo corto cabe en una sola tira", () => {
    expect(tiraDeDias("2026-10-19", 0, 3)).toMatchObject({ dias: ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"], anterior: null, siguiente: null });
  });
  it("a qué tira saltar para un día", () => {
    expect(desdeDe("2026-10-19", "2026-10-19")).toBe(0);
    expect(desdeDe("2026-10-19", "2026-11-02")).toBe(14);
  });
  it("busca el siguiente día con lugar, uno por uno, y se detiene en el primero", async () => {
    const pedidos: string[] = [];
    const consultar = async (dia: string): Promise<Resultado<Huecos>> => {
      pedidos.push(dia);
      return { ok: true, datos: { dia, huecos: dia === "2026-10-22" ? ["2026-10-22T16:00:00Z"] : [] } };
    };
    expect(await siguienteDiaConLugar("2026-10-19", "2026-11-18", consultar)).toEqual({ ok: true, datos: { dia: "2026-10-22", huecos: ["2026-10-22T16:00:00Z"] } });
    expect(pedidos).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
  });
  it("como mucho 14 preguntas, sin pasar del último día; un fallo (429) corta y se devuelve, no es «sin lugar»", async () => {
    let n = 0;
    const vacio = async (dia: string): Promise<Resultado<Huecos>> => { n++; return { ok: true, datos: { dia, huecos: [] } }; };
    expect(await siguienteDiaConLugar("2026-10-19", "2026-12-31", vacio)).toEqual({ ok: true, datos: null });
    expect(n).toBe(14);
    n = 0;
    expect(await siguienteDiaConLugar("2026-10-19", "2026-10-21", vacio)).toEqual({ ok: true, datos: null });
    expect(n).toBe(2);
    let m = 0;
    const r = await siguienteDiaConLugar("2026-10-19", "2026-12-31", async () => { m++; return { ok: false, error: "DEMASIADOS_INTENTOS", detalle: null }; });
    expect(r).toMatchObject({ ok: false, error: "DEMASIADOS_INTENTOS" });
    expect(m).toBe(1);
  });
});

const cita = (x: Partial<Cita> = {}): Cita => ({
  inicia: "2026-10-20T16:00:00Z", termina: null, dia: "2026-10-20", hora: "10:00",
  sucursal: { id: SUC, nombre: "Centro", direccion: null }, servicios: [], colaborador: "Diego R.", total_mxn: "180.00",
  estado: "AGENDADA", cancelada_motivo: null, anticipo_mxn: "0.00", anticipo_pagado_mxn: "0.00", pago_hasta: null,
  puede_cambiar: true, cancelar_horas: 24, whatsapp: null, reembolso: null, ...x,
});

describe("la cita", () => {
  it("puede cambiar → cambiar; tarde → contactar; ya pasó o cancelada → nada", () => {
    expect(queSePuede(cita())).toBe("cambiar");
    expect(queSePuede(cita({ puede_cambiar: false }))).toBe("contactar");
    for (const estado of ["CANCELADA", "TERMINADA", "COBRADA", "NO_LLEGO", "EN_CURSO", "EN_ESPERA"] as const) {
      expect(queSePuede(cita({ estado, puede_cambiar: true }))).toBe("nada");
    }
  });
  it("el rótulo dice si falta pagar el anticipo", () => {
    expect(estadoDeCita(cita()).etiqueta).toBe("Confirmada");
    expect(estadoDeCita(cita({ anticipo_mxn: "72.00", pago_hasta: "2026-10-19T17:00:00Z" })).etiqueta).toBe("Falta pagar el anticipo");
    expect(estadoDeCita(cita({ anticipo_mxn: "72.00", anticipo_pagado_mxn: "72.00", pago_hasta: "2026-10-19T17:00:00Z" })).etiqueta).toBe("Confirmada");
    expect(estadoDeCita(cita({ estado: "CANCELADA" })).tono).toBe("danger");
  });
  it("el texto de la base gana; si no, el nuestro", () => {
    expect(textoDeFallo({ error: "HUECO_OCUPADO", mensaje: "Ese horario ya no está disponible" })).toBe("Ese horario ya no está disponible");
    expect(textoDeFallo({ error: "SIN_CONFIRMAR" })).toMatch(/no se duplica/);
    expect(textoDeFallo({ error: "LO_QUE_SEA" })).toMatch(/Algo salió mal/);
  });
});

describe("reservar → anticipo", () => {
  const ok = (d: Partial<Reserva>): Resultado<Reserva> => ({ ok: true, datos: { codigo: CODIGO, cita: cita(), anticipo_mxn: "72.00", total_a_pagar_mxn: "72.00", pago: null, ...d } });
  const enviar = (s: Flujo, conTarjeta = false) => flujo(s, { tipo: "enviar", conTarjeta });

  it("sin anticipo: reservar → hecho", () => {
    const s = flujo(enviar(FLUJO_INICIAL), { tipo: "respuesta", r: ok({ anticipo_mxn: "0.00" }) });
    expect(s).toMatchObject({ fase: "hecho", codigo: CODIGO, porConfirmar: false });
  });

  it("POR_PAGAR → tarjeta → VERIFICACION → reto → pagado", () => {
    let s = flujo(enviar(FLUJO_INICIAL), { tipo: "respuesta", r: ok({ pago: { estado: "POR_PAGAR" } }) });
    expect(s).toMatchObject({ fase: "tarjeta", codigo: CODIGO, aviso: null });
    s = enviar(s, true);
    expect(s).toMatchObject({ fase: "enviando", conTarjeta: true });
    // En el reintento la cita no siempre viene: se conserva la que ya se tenía.
    s = flujo(s, { tipo: "respuesta", r: ok({ cita: null, codigo: null, pago: { estado: "VERIFICACION", url: null } }) });
    expect(s).toMatchObject({ fase: "reto", codigo: CODIGO, reto: { codigo: CODIGO, url: null, esperando: false, cancelado: false } });
    expect(s.cita).not.toBeNull();
    s = flujo(s, { tipo: "reto", paso: { tipo: "sigue", url: "https://www.mercadopago.com.mx/reto" } });
    expect(s.reto?.url).toBe("https://www.mercadopago.com.mx/reto");
    s = flujo(s, { tipo: "reto", paso: { tipo: "pedido" } });
    expect(s).toMatchObject({ fase: "hecho", porConfirmar: false });
  });

  it("tarjeta rechazada: se queda en la tarjeta con el motivo; en el reto también", () => {
    const enTarjeta: Flujo = { ...FLUJO_INICIAL, fase: "tarjeta", codigo: CODIGO };
    const s = flujo(enviar(enTarjeta, true), { tipo: "respuesta", r: { ok: false, error: "PAGO_RECHAZADO", detalle: "FONDOS" } });
    expect(s.fase).toBe("tarjeta");
    expect(s.aviso).toMatch(/fondos suficientes.*No se te cobró nada/);
    const enReto: Flujo = { ...enTarjeta, fase: "reto", reto: { codigo: CODIGO, url: "https://www.mercadopago.com.mx/r", esperando: false, cancelado: false } };
    const r = flujo(flujo(enReto, { tipo: "reto-cancelar" }), { tipo: "reto", paso: { tipo: "rechazado", detalle: "SIN_VERIFICAR" } });
    expect(r).toMatchObject({ fase: "tarjeta", reto: null, aviso: expect.stringMatching(/Cancelaste/) });
  });

  it("otro error vuelve a donde estaba, con el texto", () => {
    expect(flujo(enviar(FLUJO_INICIAL), { tipo: "respuesta", r: { ok: false, error: "CAPTCHA_INVALIDO", detalle: null } }).fase).toBe("datos");
    const t = flujo(enviar({ ...FLUJO_INICIAL, fase: "tarjeta" }, true), { tipo: "respuesta", r: { ok: false, error: "SIN_CONFIRMAR", detalle: null } });
    expect(t).toMatchObject({ fase: "tarjeta", aviso: expect.stringMatching(/no se duplica/) });
  });

  it("horario ocupado o cita vencida: a elegir otro horario", () => {
    const o = flujo(enviar(FLUJO_INICIAL), { tipo: "respuesta", r: { ok: false, error: "HUECO_OCUPADO", detalle: null, mensaje: "Ese horario ya no está disponible" } });
    expect(o).toMatchObject({ fase: "horario", aviso: "Ese horario ya no está disponible" });
    // Un reintento sobre una cita que ya se canceló devuelve pago: null — NO es «hecho».
    const v = flujo(enviar(FLUJO_INICIAL, true), { tipo: "respuesta", r: ok({ cita: cita({ estado: "CANCELADA" }), pago: null }) });
    expect(v.fase).toBe("horario");
    expect(v.codigo).toBeNull();
  });

  it("sin código no hay reto que seguir: hecho, por confirmar (el correo lleva el enlace)", () => {
    const s = flujo(enviar(FLUJO_INICIAL, true), { tipo: "respuesta", r: ok({ codigo: null, pago: { estado: "VERIFICACION", url: null } }) });
    expect(s).toMatchObject({ fase: "hecho", codigo: null, porConfirmar: true });
  });

  it("un paso del reto fuera del reto no hace nada", () => {
    expect(flujo(FLUJO_INICIAL, { tipo: "reto", paso: { tipo: "pedido" } })).toBe(FLUJO_INICIAL);
  });
});

describe("reto como en la tienda", () => {
  const enReto: Flujo = { ...FLUJO_INICIAL, fase: "reto", codigo: CODIGO, reto: { codigo: CODIGO, url: "https://www.mercadopago.com.mx/r", esperando: false, cancelado: false } };
  it("el banco avisa que terminó: se espera; si el servidor sigue diciendo que no, el marco vuelve", () => {
    const t = flujo(enReto, { tipo: "reto-termino" });
    expect(t.reto).toMatchObject({ esperando: true, cancelado: false });
    expect(flujo(t, { tipo: "reto", paso: { tipo: "sigue", url: null, conPrisa: true } }).reto?.esperando).toBe(true);
    expect(flujo(t, { tipo: "reto", paso: { tipo: "sigue", url: null } }).reto?.esperando).toBe(false);
  });
  it("cancelado no vuelve a pintar el marco", () => {
    const c = flujo(enReto, { tipo: "reto-cancelar" });
    expect(flujo(c, { tipo: "reto", paso: { tipo: "sigue", url: null } }).reto).toMatchObject({ esperando: true, cancelado: true });
  });
  it("una cita que ya no existe termina el reto", () => {
    expect(pasoDelReto({ ok: false, error: "CITA_NO_ENCONTRADA", detalle: null })).toEqual({ tipo: "rechazado", detalle: "SIN_VERIFICAR" });
  });
});

describe("riesgo y pausa", () => {
  const ahora = Date.parse("2026-10-19T18:00:00Z");
  it("RIESGO no invita a otra tarjeta: pausa con hora y «comunícate con el negocio»", () => {
    const s = flujo(flujo({ ...FLUJO_INICIAL, fase: "tarjeta" }, { tipo: "enviar", conTarjeta: true }),
      { tipo: "respuesta", r: { ok: false, error: "PAGO_RECHAZADO", detalle: "RIESGO", hasta: "2026-10-19T18:30:00Z" } });
    expect(s).toMatchObject({ fase: "tarjeta", pausa: true });
    expect(s.aviso).toMatch(/No fue tu banco.*comunícate con el negocio/);
    expect(s.aviso).not.toMatch(/otra tarjeta/);
    expect(textoDePausaDeReserva("2026-10-19T18:30:00Z", true, ahora)).toMatch(/a partir de las 12:30 p. m./);
  });
  it("PAGO_EN_PAUSA también pausa", () => {
    const s = flujo(flujo(FLUJO_INICIAL, { tipo: "enviar", conTarjeta: false }), { tipo: "respuesta", r: { ok: false, error: "PAGO_EN_PAUSA", detalle: null } });
    expect(s).toMatchObject({ fase: "datos", pausa: true });
  });
});

describe("cobro en línea", () => {
  it("anticipo: hay resto; TODO o anticipo = total: no", () => {
    expect(cobroEnLinea("ANTICIPO", "72.00", "180.00")).toEqual({ etiqueta: "Anticipo en línea", resto: true });
    expect(cobroEnLinea("TODO", "180.00", "180.00")).toEqual({ etiqueta: "Pago en línea", resto: false });
    expect(cobroEnLinea("ANTICIPO", "180.00", "180.00")?.resto).toBe(false);
    expect(cobroEnLinea("AL_FINAL", "0.00", "180.00")).toBeNull();
  });
  it("sin Mercado Pago y con algo que cobrar: no se puede reservar", () => {
    expect(sinCobroDe({ pago_en_linea: false, public_key: null }, "72.00")).toBe(true);
    expect(sinCobroDe({ pago_en_linea: true, public_key: null }, "72.00")).toBe(true);
    expect(sinCobroDe({ pago_en_linea: false, public_key: null }, "0.00")).toBe(false);
    expect(sinCobroDe({ pago_en_linea: true, public_key: "APP_USR-x" }, "72.00")).toBe(false);
  });
});
