import { describe, it, expect } from "vitest";
import { horaCorta } from "@vim/db/agenda";
import { telefonoLegible } from "../telefono";
import {
  accionesCita, duracionCon, duracionTexto, enlaceRecordatorio, entradaCita, posicionTramo, precioCon, visitasCliente,
  type CitaDia, type ServicioAgenda,
} from "../agenda";

const t = (iso: string) => new Date(iso);

const cita = (c: Partial<CitaDia> = {}): CitaDia => ({
  id: "c", clienteId: "cl", clienteNombre: "Sara Vera", clienteTelefono: "4771234567", clienteEmail: null,
  estado: "AGENDADA", canal: "CAJA", inicia: t("2026-11-06T10:30:00-06:00"), termina: t("2026-11-06T11:45:00-06:00"),
  llegoAt: null, empalme: false, nota: null,
  tramos: [
    { id: "a", orden: 1, productoId: "mani", servicio: "Manicure", usuarioId: "berta", colaborador: "Berta M.", espacio: null, precio: 280,
      inicia: t("2026-11-06T10:30:00-06:00"), termina: t("2026-11-06T11:15:00-06:00"), empalme: false },
    { id: "b", orden: 2, productoId: "pedi", servicio: "Pedicure spa", usuarioId: "berta", colaborador: "Berta M.", espacio: null, precio: 240,
      inicia: t("2026-11-06T11:15:00-06:00"), termina: t("2026-11-06T11:45:00-06:00"), empalme: false },
  ],
  ...c,
});

describe("payload de guardar_cita", () => {
  it("varios servicios en orden; «quien esté libre» va como usuario_id null", () => {
    const p = entradaCita({
      sucursalId: "s", cliente: { id: null, nombre: "  Camila Vergara ", telefono: "477 123 4567", email: "" },
      inicia: t("2026-11-06T10:30:00-06:00"), nota: " ", clientIdLocal: "k",
      renglones: [{ productoId: "mani", usuarioId: "berta" }, { productoId: "pedi", usuarioId: null }],
    });
    expect(p).toEqual({
      sucursal_id: "s", cliente_id: null, cliente_nombre: "Camila Vergara", cliente_telefono: "4771234567", cliente_email: null,
      inicia: "2026-11-06T16:30:00.000Z", nota: null, client_id_local: "k",
      servicios: [{ producto_id: "mani", usuario_id: "berta" }, { producto_id: "pedi", usuario_id: null }],
    });
  });

  it("en edición lleva el id; para la espera no lleva hora", () => {
    const base = { sucursalId: "s", cliente: { id: "cl", nombre: "Sara", telefono: "", email: "sara@correo.mx" }, nota: "", renglones: [{ productoId: "mani", usuarioId: null }] };
    expect(entradaCita({ ...base, id: "c1", inicia: t("2026-11-06T10:30:00-06:00") })).toMatchObject({ id: "c1", cliente_id: "cl", cliente_email: "sara@correo.mx" });
    expect(entradaCita({ ...base, inicia: null })).not.toHaveProperty("inicia");
  });

  it("duración y precio del colaborador si tiene propios; si no, los del servicio", () => {
    const s: ServicioAgenda = { productoId: "mani", nombre: "Manicure", precio: 250, duracionMin: 45, colaboradores: [
      { usuarioId: "berta", precio: 280, duracionMin: 50 }, { usuarioId: "ana", precio: null, duracionMin: null }] };
    expect([duracionCon(s, "berta"), precioCon(s, "berta")]).toEqual([50, 280]);
    expect([duracionCon(s, "ana"), precioCon(s, "ana")]).toEqual([45, 250]);
    expect([duracionCon(s, null), precioCon(s, null)]).toEqual([45, 250]);
  });
});

describe("acciones de la ficha", () => {
  it("por llegar antes de su hora no ofrece «No llegó»; desde la hora, sí", () => {
    const antes = accionesCita(cita(), t("2026-11-06T10:00:00-06:00"));
    expect(antes).toMatchObject({ atender: true, recordar: true, mover: true, cancelar: true, noLlego: false, terminar: false });
    expect(accionesCita(cita(), t("2026-11-06T10:50:00-06:00")).noLlego).toBe(true);
  });

  it("atendiendo ofrece «Terminé» y nada más", () => {
    expect(accionesCita(cita({ estado: "EN_CURSO" }), t("2026-11-06T11:00:00-06:00")))
      .toEqual({ atender: false, recordar: false, mover: false, terminar: true, noLlego: false, cancelar: false, empalme: false });
  });

  it("terminada, no llegó o cancelada: sin acciones; el empalme de un tramo se avisa", () => {
    for (const estado of ["TERMINADA", "NO_LLEGO", "CANCELADA"] as const) {
      expect(Object.values(accionesCita(cita({ estado }), t("2026-11-06T12:00:00-06:00"))).some(Boolean)).toBe(false);
    }
    const c = cita();
    c.tramos[1]!.empalme = true;
    expect(accionesCita(c, t("2026-11-06T10:00:00-06:00")).empalme).toBe(true);
    // Cerrada ya no ocupa: el aviso y «Ya lo moví» no salen.
    for (const estado of ["TERMINADA", "NO_LLEGO", "CANCELADA"] as const) {
      expect(accionesCita({ ...c, estado, empalme: true }, t("2026-11-06T12:00:00-06:00")).empalme).toBe(false);
    }
  });
});

describe("recordatorio por WhatsApp", () => {
  it("wa.me con el 52 y el texto exacto", () => {
    const url = enlaceRecordatorio(cita(), "Estudio Lía");
    expect(url?.startsWith("https://wa.me/524771234567?text=")).toBe(true);
    expect(decodeURIComponent(url!.split("?text=")[1]!))
      .toBe("Hola Sara, te recordamos tu cita en Estudio Lía el viernes 6 de noviembre a las 10:30: Manicure y Pedicure spa.");
  });

  it("sin teléfono de 10 dígitos no hay enlace", () => {
    expect(enlaceRecordatorio(cita({ clienteTelefono: null }), "Lía")).toBeNull();
    expect(enlaceRecordatorio(cita({ clienteTelefono: "12345" }), "Lía")).toBeNull();
  });
});

describe("ficha de la clienta", () => {
  it("visitas: las terminadas, la más reciente arriba (las faltas salen de faltas_cliente)", () => {
    const r = visitasCliente([
      cita({ id: "1", estado: "TERMINADA", inicia: t("2026-10-01T10:00:00-06:00") }),
      cita({ id: "2", estado: "NO_LLEGO" }),
      cita({ id: "3", estado: "TERMINADA", inicia: t("2026-10-15T10:00:00-06:00") }),
      cita({ id: "4", estado: "CANCELADA" }),
      cita({ id: "5", estado: "AGENDADA" }),
      cita({ id: "6", estado: "NO_LLEGO" }),
    ]);
    expect(r.map((c) => c.id)).toEqual(["3", "1"]);
  });

  it("teléfono legible «477 123 4567»; si no son 10 dígitos, como venga", () => {
    expect(telefonoLegible("4771234567")).toBe("477 123 4567");
    expect(telefonoLegible("12345")).toBe("12345");
  });
});

describe("horas y duraciones", () => {
  it("la medianoche lleva su cero; las demás horas no", () => {
    expect(horaCorta(t("2026-11-06T00:30:00-06:00"))).toBe("00:30");
    expect(horaCorta(t("2026-11-06T09:00:00-06:00"))).toBe("9:00");
    expect(horaCorta(t("2026-11-06T17:00:00-06:00"))).toBe("17:00");
  });

  it("un tramo que cruza la medianoche se corta al final del día", () => {
    const dia = "2026-11-06";
    expect(posicionTramo(t(`${dia}T23:00:00-06:00`), t("2026-11-07T01:00:00-06:00"), dia, 22 * 60)).toEqual({ top: 120, alto: 120 });
  });

  it("«1 h 15 min», «45 min», «2 h»", () => {
    expect([duracionTexto(75), duracionTexto(45), duracionTexto(120)]).toEqual(["1 h 15 min", "45 min", "2 h"]);
  });
});
