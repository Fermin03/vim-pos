// El contrato de las reservas en línea (belleza, entrega 3): lo que la función `tienda` contesta en
// `reservas`, `huecos`, `reservar`, `cita` (y cancelar/mover) visto desde el sitio.
import { describe, expect, it } from "vitest";
import { citaDe, errorDe, huecosDe, reservaDe, reservasDe } from "../contrato";
import { CODIGO, u } from "./datos";

const SUC = u(1), PROD = u(10), DIEGO = u(40);

const reservasCrudas = (): Record<string, unknown> => ({
  nombre: "Salón Ana", slug: "salon-ana", logo_ruta: null, color: "#111111", descripcion: "Cortes y color", whatsapp: "4771112233",
  pago_de_prueba: false,
  sucursales: [{ id: SUC, nombre: "Centro", direccion: "Madero 1, Centro, León", ubicacion: { lat: 21.12, lng: -101.68 }, whatsapp: "4771112233",
                 pago_en_linea: true, public_key: "APP_USR-1234567890abcdef-xyz", horario: { "2": ["10:00", "19:00"] } }],
  servicios: [{ producto_id: PROD, nombre: "Corte de cabello", categoria: "Cabello", precio: "180.00", duracion_min: 40, anticipo_mxn: "72.00" }],
  colaboradores: [{ id: DIEGO, nombre_corto: "Diego R.", sucursal_id: SUC, servicios: [PROD] }],
  reglas: { cancelar_horas: 24, dias_reserva: 30, intervalo_min: 15, aviso_min_horas: 2, cobro_modo: "ANTICIPO", pago_en_linea_disponible: true },
});

const citaCruda = (): Record<string, unknown> => ({
  inicia: "2026-10-20T16:00:00+00:00", termina: "2026-10-20T16:40:00+00:00", dia: "2026-10-20", hora: "10:00",
  sucursal: { id: SUC, nombre: "Centro", direccion: null },
  servicios: [{ producto_id: PROD, nombre: "Corte de cabello", colaborador_id: DIEGO, colaborador: "Diego R.", inicia: "2026-10-20T16:00:00+00:00", precio: "180.00" }],
  colaborador: "Diego R.", total_mxn: "180.00", estado: "AGENDADA", cancelada_motivo: null,
  anticipo_mxn: "72.00", anticipo_pagado_mxn: "0.00", pago_hasta: "2026-10-19T18:15:00+00:00",
  puede_cambiar: true, cancelar_horas: 24, whatsapp: "4771112233", reembolso: null,
});

describe("reservas (el catálogo)", () => {
  it("lee el negocio con sus sucursales, servicios, colaboradores y reglas", () => {
    const r = reservasDe(reservasCrudas());
    expect(r?.nombre).toBe("Salón Ana");
    expect(r?.sucursales[0]).toMatchObject({ id: SUC, pago_en_linea: true, public_key: "APP_USR-1234567890abcdef-xyz", ubicacion: { lat: 21.12, lng: -101.68 } });
    expect(r?.servicios[0]).toEqual({ producto_id: PROD, nombre: "Corte de cabello", categoria: "Cabello", precio: "180.00", duracion_min: 40, anticipo_mxn: "72.00" });
    expect(r?.colaboradores[0]).toEqual({ id: DIEGO, nombre_corto: "Diego R.", sucursal_id: SUC, servicios: [PROD] });
    expect(r?.reglas.cobro_modo).toBe("ANTICIPO");
  });
  it("no copia lo que no conoce (el id del negocio, si un día viniera)", () => {
    const r = reservasDe({ ...reservasCrudas(), tenant: u(99) });
    expect(JSON.stringify(r)).not.toContain(u(99));
  });
  it("una llave pública sin forma no se usa; un importe numérico o un modo desconocido invalidan todo", () => {
    const c = reservasCrudas();
    (c.sucursales as Record<string, unknown>[])[0]!.public_key = "<script>";
    expect(reservasDe(c)?.sucursales[0]?.public_key).toBeNull();
    const n = reservasCrudas();
    (n.servicios as Record<string, unknown>[])[0]!.precio = 180;
    expect(reservasDe(n)).toBeNull();
    expect(reservasDe({ ...reservasCrudas(), reglas: { ...(reservasCrudas().reglas as object), cobro_modo: "OTRO" } })).toBeNull();
    expect(reservasDe(null)).toBeNull();
  });
});

describe("huecos", () => {
  it("el día y las horas en ISO UTC", () => {
    expect(huecosDe({ dia: "2026-10-20", huecos: ["2026-10-20T16:00:00.000Z", "2026-10-20T16:15:00.000Z"] }))
      .toEqual({ dia: "2026-10-20", huecos: ["2026-10-20T16:00:00.000Z", "2026-10-20T16:15:00.000Z"] });
    expect(huecosDe({ dia: "2026-10-20", huecos: [] })).toEqual({ dia: "2026-10-20", huecos: [] });
  });
  it("una hora sin zona o sin lista no es una respuesta", () => {
    expect(huecosDe({ dia: "2026-10-20", huecos: ["2026-10-20T10:00"] })).toBeNull();
    expect(huecosDe({ dia: "2026-10-20" })).toBeNull();
  });
});

describe("cita", () => {
  it("lee la cita con su estado, si se puede cambiar y su reembolso", () => {
    const c = citaDe(citaCruda());
    expect(c).toMatchObject({ estado: "AGENDADA", puede_cambiar: true, anticipo_mxn: "72.00", reembolso: null, hora: "10:00" });
    expect(c?.servicios[0]?.colaborador).toBe("Diego R.");
    const devolviendo = citaDe({ ...citaCruda(), estado: "CANCELADA", cancelada_motivo: "Cancelada por ti", puede_cambiar: false,
      reembolso: { estado: "EN_PROCESO", mensaje: "Estamos procesando tu reembolso; si no lo ves en 10 días, comunícate con el negocio." } });
    expect(devolviendo?.reembolso?.estado).toBe("EN_PROCESO");
  });
  it("un estado desconocido o un reembolso raro invalidan la cita", () => {
    expect(citaDe({ ...citaCruda(), estado: "BORRADA" })).toBeNull();
    expect(citaDe({ ...citaCruda(), reembolso: { estado: "QUIZA", mensaje: "x" } })).toBeNull();
    expect(citaDe({ ...citaCruda(), puede_cambiar: "sí" })).toBeNull();
  });
});

describe("reservar", () => {
  it("con anticipo cobrado: código, cita y PAGADO", () => {
    const r = reservaDe({ codigo: CODIGO, cita: citaCruda(), anticipo_mxn: "72.00", total_a_pagar_mxn: "72.00", pago: { estado: "PAGADO" } });
    expect(r).toMatchObject({ codigo: CODIGO, anticipo_mxn: "72.00", total_a_pagar_mxn: "72.00", pago: { estado: "PAGADO" } });
    expect(r?.cita?.estado).toBe("AGENDADA");
  });
  it("sin anticipo: pago null; con anticipo y sin tarjeta: POR_PAGAR; en el reto del banco: VERIFICACION", () => {
    expect(reservaDe({ codigo: CODIGO, cita: citaCruda(), anticipo_mxn: "0.00", total_a_pagar_mxn: null, pago: null })?.pago).toBeNull();
    expect(reservaDe({ codigo: CODIGO, cita: citaCruda(), anticipo_mxn: "72.00", total_a_pagar_mxn: "72.00", pago: { estado: "POR_PAGAR" } })?.pago).toEqual({ estado: "POR_PAGAR" });
    expect(reservaDe({ codigo: CODIGO, cita: null, anticipo_mxn: "72.00", total_a_pagar_mxn: "72.00", pago: { estado: "VERIFICACION", url: "https://evil.example" } })?.pago)
      .toEqual({ estado: "VERIFICACION", url: null });
  });
  it("una cita ilegible no tumba la reserva; un código sin forma sí", () => {
    expect(reservaDe({ codigo: CODIGO, cita: { raro: true }, anticipo_mxn: "0.00", total_a_pagar_mxn: null, pago: null })?.cita).toBeNull();
    expect(reservaDe({ codigo: null, cita: null, anticipo_mxn: "0.00", total_a_pagar_mxn: null, pago: null })?.codigo).toBeNull();
    expect(reservaDe({ codigo: "corto", cita: null, anticipo_mxn: "0.00", total_a_pagar_mxn: null, pago: null })).toBeNull();
  });
});

describe("error de reservas", () => {
  it("el mensaje de la base para la clienta pasa; uno de varias líneas, no", () => {
    expect(errorDe({ error: "HUECO_OCUPADO", mensaje: "Ese horario ya no está disponible" }))
      .toEqual({ error: "HUECO_OCUPADO", detalle: null, mensaje: "Ese horario ya no está disponible" });
    expect(errorDe({ error: "HUECO_OCUPADO", mensaje: "a\nb" })).toEqual({ error: "HUECO_OCUPADO", detalle: null });
    expect(errorDe({ error: "PAGO_EN_PAUSA", hasta: "2026-10-20T16:30:00.123Z" })).toEqual({ error: "PAGO_EN_PAUSA", detalle: null, hasta: "2026-10-20T16:30:00.123Z" });
  });
});
