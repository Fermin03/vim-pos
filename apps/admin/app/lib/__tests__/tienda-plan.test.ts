import { describe, expect, it } from "vitest";
import { TIENDA_INCLUYE, TIENDA_INVITACION, estadoTienda, invitacionTienda, mensajeQuieroTienda, ofertaTienda, ofreceFotoDeProducto } from "../tienda-plan";

// Entrega 7. REGLA DE ORO: con el complemento TIENDA inactivo en el catálogo (producción hoy), la
// invitación es letra por letra la de antes. Solo cambia cuando VIM lo activa.
describe("la invitación según el catálogo y el plan del negocio", () => {
  const QUIEN = { usuario: "Ana", negocio: "Mi Local", codigo: "mi-local" };
  const HOY = {
    cierre: "Estamos por lanzarla. Escríbenos y te avisamos en cuanto esté lista.",
    boton: "Avísenme cuando esté lista",
  };

  it("complemento inactivo: exactamente lo de hoy, lo incluya o no el plan y diga lo que diga el precio", () => {
    for (const planLaIncluye of [true, false]) {
      const i = invitacionTienda({ activo: false, planLaIncluye, precio: 100 });
      expect({ cierre: i.cierre, boton: i.boton }).toEqual(HOY);
      expect(i.mensaje(QUIEN)).toMatch(/Quiero la tienda en línea\. Avísenme cuando esté lista\.$/);
      expect(i.mensaje(QUIEN)).toBe(mensajeQuieroTienda(QUIEN));
    }
  });
  it("si no se pudo leer el catálogo o el plan: también lo de hoy", () => {
    const i = invitacionTienda(null);
    expect({ cierre: i.cierre, boton: i.boton }).toEqual(HOY);
    expect(i.mensaje(QUIEN)).toBe(mensajeQuieroTienda(QUIEN));
  });
  it("activo y el plan la incluye (todavía sin concederla): se pide activarla", () => {
    const i = invitacionTienda({ activo: true, planLaIncluye: true, precio: 100 });
    expect(i.cierre).toBe("Tu plan incluye la tienda en línea. Escríbenos para activarla.");
    expect(i.boton).toBe("Quiero mi tienda en línea");
    expect(i.mensaje(QUIEN)).toMatch(/Quiero activar la tienda en línea\.$/);
    expect(i.mensaje(QUIEN)).toContain("Mi Local");
    expect(i.mensaje(QUIEN)).not.toContain("Necesito ayuda");
  });
  it("activo y el plan no la incluye: dice el precio del catálogo", () => {
    const i = invitacionTienda({ activo: true, planLaIncluye: false, precio: 100 });
    expect(i.cierre).toBe("La tienda en línea cuesta $100 al mes en tu plan. Escríbenos para contratarla.");
    expect(i.boton).toBe("Quiero mi tienda en línea");
    expect(i.mensaje(QUIEN)).toMatch(/Quiero activar la tienda en línea\.$/);
    expect(invitacionTienda({ activo: true, planLaIncluye: false, precio: 149.5 }).cierre)
      .toBe("La tienda en línea cuesta $149.50 al mes en tu plan. Escríbenos para contratarla.");
    expect(invitacionTienda({ activo: true, planLaIncluye: false, precio: 1200 }).cierre).toContain("$1,200 al mes");
  });
  it("activo, el plan no la incluye y no hay precio que decir: el texto va sin cifra", () => {
    for (const precio of [null, 0, -5, Number.NaN]) {
      expect(invitacionTienda({ activo: true, planLaIncluye: false, precio }).cierre)
        .toBe("La tienda en línea se contrata aparte en tu plan. Escríbenos para contratarla.");
    }
  });

  it("ofertaTienda arma el dato con la fila del catálogo y las banderas del plan", () => {
    expect(ofertaTienda({ activo: false, precio_mensual_mxn: 100 }, { tienda_incluida: true })).toEqual({ activo: false, planLaIncluye: true, precio: 100 });
    // PostgREST entrega un numeric como número o como texto.
    expect(ofertaTienda({ activo: true, precio_mensual_mxn: "100.00" }, { tienda_incluida: false })).toEqual({ activo: true, planLaIncluye: false, precio: 100 });
    // Negocio sin plan, o plan sin la bandera: no la incluye.
    expect(ofertaTienda({ activo: true, precio_mensual_mxn: 100 }, null)).toEqual({ activo: true, planLaIncluye: false, precio: 100 });
    expect(ofertaTienda({ activo: true, precio_mensual_mxn: 100 }, { tienda_incluida: "true" })?.planLaIncluye).toBe(false);
    expect(ofertaTienda({ activo: true, precio_mensual_mxn: "gratis" }, {})?.precio).toBeNull();
    expect(ofertaTienda({ activo: true, precio_mensual_mxn: null }, {})?.precio).toBeNull();
  });
  it("ofertaTienda sin fila del complemento no inventa nada: null, y solo un true de verdad lo da por activo", () => {
    expect(ofertaTienda(null, { tienda_incluida: true })).toBeNull();
    expect(ofertaTienda("x", {})).toBeNull();
    expect(ofertaTienda({ precio_mensual_mxn: 100 }, {})?.activo).toBe(false);
    expect(ofertaTienda({ activo: "true", precio_mensual_mxn: 100 }, {})?.activo).toBe(false);
  });
});

describe("tienda-plan", () => {
  it("la sección se enseña si está permitida; si la lectura de módulos falla, también", () => {
    expect(estadoTienda(null)).toBe("cargando");
    expect(estadoTienda("error")).toBe("permitida");
    expect(estadoTienda({ permitidos: { tienda: true }, efectivos: {} })).toBe("permitida");
    expect(estadoTienda({ permitidos: { tienda: false }, efectivos: {} })).toBe("sin_contratar");
    expect(estadoTienda({ permitidos: {}, efectivos: {} })).toBe("sin_contratar");
  });
  it("el mensaje de WhatsApp ya dice qué se quiere", () => {
    const m = mensajeQuieroTienda({ usuario: "Ana", negocio: "Mi Local", codigo: "mi-local" });
    expect(m).toMatch(/Quiero la tienda en línea\. Avísenme cuando esté lista\.$/);
    expect(m).toContain("Ana");
    expect(m).toContain("Mi Local");
    expect(m).not.toContain("Necesito ayuda");
  });
  it("mientras no se pueda contratar, la invitación pide que le avisen: no promete activarla", () => {
    expect(TIENDA_INVITACION).toEqual({
      cierre: "Estamos por lanzarla. Escríbenos y te avisamos en cuanto esté lista.",
      boton: "Avísenme cuando esté lista",
    });
  });
  it("lista lo que incluye", () => {
    expect(TIENDA_INCLUYE.map((i) => i.titulo)).toEqual(["Tu menú, siempre al día", "Pago al recibir", "Tus horarios", "Sin comisión"]);
  });
  it("la foto del producto solo se ofrece con la tienda concedida; cargando o sin poder leer, no", () => {
    expect(ofreceFotoDeProducto({ permitidos: { tienda: true }, efectivos: {} })).toBe(true);
    // Concedida aunque todavía apagada: lo que cuenta es lo permitido, como en el apartado.
    expect(ofreceFotoDeProducto({ permitidos: { tienda: true }, efectivos: { tienda: false } })).toBe(true);
    expect(ofreceFotoDeProducto({ permitidos: { tienda: false }, efectivos: { tienda: true } })).toBe(false);
    expect(ofreceFotoDeProducto({ permitidos: {}, efectivos: {} })).toBe(false);
    expect(ofreceFotoDeProducto(null)).toBe(false);
    expect(ofreceFotoDeProducto("error")).toBe(false);
  });
});
