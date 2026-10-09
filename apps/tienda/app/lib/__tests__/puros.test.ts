// Los módulos chicos y sin efectos: dinero, horario, color, imagen, teléfono y textos.
import { describe, expect, it } from "vitest";
import type { Horario } from "@vim/fecha";
import { aCentavos, aTexto, formato, formatoMxn, leerImporte } from "../dinero";
import { aLaHora, abiertoAhora, hora12, momentoMx, proximaApertura, semanaLegible, textoApertura } from "../horario";
import { colorDeNegocio, variablesDeColor } from "../color";
import { urlDeFoto, urlDeLogo } from "../imagen";
import { enlaceTel, enlaceWhatsApp, formatoTelefono, normalizarTelefono } from "../telefono";
import { CODIGOS_DE_ERROR, reglaDeGrupo, textoCerrada, textoDeError, textoDeEstado } from "../textos";
import { u } from "./datos";

describe("dinero", () => {
  it("texto → centavos, sin pasar por flotante", () => {
    expect(aCentavos("0.00")).toBe(0);
    expect(aCentavos("19.99")).toBe(1999);          // 19.99 * 100 = 1998.9999999999998
    expect(aCentavos("1.15")).toBe(115);            // 1.15 * 100 = 114.99999999999999
    expect(aCentavos("999999.99")).toBe(99999999);
    expect(aCentavos("-5.00")).toBe(-500);
  });
  it("lo que no es un importe con dos decimales es null", () => {
    for (const malo of ["", "12", "12.5", "12.345", "1,234.50", "$12.00", " 12.00", "1e3", "abc", "12.00\n"]) {
      expect(aCentavos(malo), JSON.stringify(malo)).toBeNull();
    }
  });
  it("sumas que en flotante fallan", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(aTexto(aCentavos("0.10")! + aCentavos("0.20")!)).toBe("0.30");
    // 4.35 × 3 = 13.049999999999999 en flotante
    expect(aTexto(aCentavos("4.35")! * 3)).toBe("13.05");
    expect(aTexto(["139.20", "17.40", "17.40", "20.00"].reduce((s, t) => s + aCentavos(t)!, 0))).toBe("194.00");
  });
  it("centavos → texto", () => {
    expect(aTexto(0)).toBe("0.00");
    expect(aTexto(5)).toBe("0.05");
    expect(aTexto(123450)).toBe("1234.50");
    expect(aTexto(-500)).toBe("-5.00");
  });
  it("formato para el cliente", () => {
    expect(formato(123450)).toBe("$1,234.50");
    expect(formato(0)).toBe("$0.00");
    expect(formato(99)).toBe("$0.99");
    expect(formato(100000000)).toBe("$1,000,000.00");
    expect(formato(-3500)).toBe("-$35.00");
    expect(formatoMxn("1234.50")).toBe("$1,234.50");
    expect(formatoMxn("basura")).toBe("");
  });
  it("lo que escribe el cliente en «¿con cuánto pagas?»", () => {
    expect(leerImporte("500")).toBe(50000);
    expect(leerImporte(" $1,000.5 ")).toBe(100050);
    expect(leerImporte("200.00")).toBe(20000);
    for (const malo of ["", "abc", "12.345", "-5", "1.2.3", "1e3"]) expect(leerImporte(malo), malo).toBeNull();
  });
  it("la coma: decimal con una o dos cifras detrás, de miles con tres exactas", () => {
    // Coma decimal (como escribe mucha gente «cien cincuenta»): antes se leía como $1,005.
    expect(leerImporte("100,5")).toBe(10050);
    expect(leerImporte("100,50")).toBe(10050);
    expect(leerImporte("0,5")).toBe(50);
    expect(leerImporte("1234,5")).toBe(123450);
    // Coma de miles: grupos de tres exactos, con o sin centavos tras el punto.
    expect(leerImporte("1,234")).toBe(123400);
    expect(leerImporte("1,234.5")).toBe(123450);
    expect(leerImporte("1,234.50")).toBe(123450);
    expect(leerImporte("12,345,678")).toBe(1234567800);
    expect(leerImporte("100,500")).toBe(10050000);
    // Ni una cosa ni la otra: no se adivina.
    for (const malo of ["1,2345", "1,23,456", "1234,567", ",5", "5,", "1,,234", "1,234,5", "1,5.5", "100,5.0", "1.234,5", "0100,500.123"]) {
      expect(leerImporte(malo), malo).toBeNull();
    }
  });
});

describe("horario", () => {
  const semana: Horario = { "1": ["13:00", "22:00"], "5": ["18:00", "02:00"], "6": ["09:00", "09:00"] };
  const m = (dia: string, hora: string) => ({ dia, hora }) as ReturnType<typeof momentoMx>;

  it("el momento se lee en hora del centro de México", () => {
    // 2026-10-09 es viernes. 03:30 UTC del sábado = 21:30 del viernes en México (UTC-6).
    expect(momentoMx(new Date("2026-10-10T03:30:00Z"))).toEqual({ dia: "5", hora: "21:30" });
    expect(momentoMx(new Date("2026-10-12T06:00:00Z"))).toEqual({ dia: "1", hora: "00:00" });
    expect(momentoMx(new Date("2026-10-12T05:59:00Z"))).toEqual({ dia: "7", hora: "23:59" });
  });
  it("abierto: desde que abre y hasta antes de cerrar", () => {
    expect(abiertoAhora(semana, m("1", "12:59"))).toBe(false);
    expect(abiertoAhora(semana, m("1", "13:00"))).toBe(true);
    expect(abiertoAhora(semana, m("1", "21:59"))).toBe(true);
    expect(abiertoAhora(semana, m("1", "22:00"))).toBe(false);
  });
  it("cierre pasada la medianoche: sigue abierto la madrugada del día siguiente", () => {
    expect(abiertoAhora(semana, m("5", "17:59"))).toBe(false);
    expect(abiertoAhora(semana, m("5", "23:59"))).toBe(true);
    expect(abiertoAhora(semana, m("6", "01:59"))).toBe(true);    // sábado, por el tramo del viernes
    expect(abiertoAhora(semana, m("6", "02:00"))).toBe(false);
    expect(abiertoAhora(semana, m("5", "01:00"))).toBe(false);   // el jueves no abrió
    // domingo → lunes da la vuelta a la semana
    expect(abiertoAhora({ "7": ["20:00", "03:00"] }, m("1", "02:30"))).toBe(true);
  });
  it("apertura = cierre: no cierra hasta la misma hora del día siguiente", () => {
    expect(abiertoAhora(semana, m("6", "08:59"))).toBe(false);
    expect(abiertoAhora(semana, m("6", "09:00"))).toBe(true);
    expect(abiertoAhora(semana, m("7", "08:59"))).toBe(true);
    expect(abiertoAhora(semana, m("7", "09:00"))).toBe(false);
  });
  it("día sin horario = cerrado", () => {
    expect(abiertoAhora(semana, m("3", "14:00"))).toBe(false);
    expect(abiertoAhora({}, m("3", "14:00"))).toBe(false);
  });
  it("próxima apertura: hoy si aún no abre; si no, el siguiente día con horario", () => {
    expect(proximaApertura(semana, m("1", "10:00"))).toEqual({ dia: "1", hora: "13:00", enDias: 0 });
    expect(proximaApertura(semana, m("1", "22:30"))).toEqual({ dia: "5", hora: "18:00", enDias: 4 });
    expect(proximaApertura(semana, m("3", "10:00"))).toEqual({ dia: "5", hora: "18:00", enDias: 2 });
    expect(proximaApertura(semana, m("7", "10:00"))).toEqual({ dia: "1", hora: "13:00", enDias: 1 });
    // solo abre los lunes y ya pasó la hora: el lunes que viene
    expect(proximaApertura({ "1": ["13:00", "22:00"] }, m("1", "23:00"))).toEqual({ dia: "1", hora: "13:00", enDias: 7 });
  });
  it("semana entera cerrada: no hay próxima apertura ni texto", () => {
    expect(proximaApertura({}, m("1", "10:00"))).toBeNull();
    expect(textoApertura({}, m("1", "10:00"))).toBeNull();
  });
  it("el texto: «hoy» o el día", () => {
    expect(textoApertura(semana, m("1", "22:30"))).toBe("Abre el viernes a las 6:00 p. m.");
    expect(textoApertura(semana, m("5", "10:00"))).toBe("Abre hoy a las 6:00 p. m.");
  });
  it("la una va en singular: «a la 1:00», de la tarde o de la madrugada; las demás, «a las»", () => {
    expect(textoApertura(semana, m("1", "10:00"))).toBe("Abre hoy a la 1:00 p. m.");
    expect(textoApertura(semana, m("7", "10:00"))).toBe("Abre el lunes a la 1:00 p. m.");
    const abre = (hora: string) => textoApertura({ "1": [hora, "23:00"] }, m("1", "00:00"));
    expect(abre("01:00")).toBe("Abre hoy a la 1:00 a. m.");
    expect(abre("01:30")).toBe("Abre hoy a la 1:30 a. m.");
    expect(abre("13:45")).toBe("Abre hoy a la 1:45 p. m.");
    expect(abre("10:00")).toBe("Abre hoy a las 10:00 a. m.");
    expect(abre("11:00")).toBe("Abre hoy a las 11:00 a. m.");
    expect(abre("12:00")).toBe("Abre hoy a las 12:00 p. m.");
    expect(abre("14:00")).toBe("Abre hoy a las 2:00 p. m.");
    expect(abre("21:00")).toBe("Abre hoy a las 9:00 p. m.");
    // La misma regla donde sea que se diga una hora («recibido a la 1:05 p. m.» en el seguimiento).
    expect(aLaHora("13:05")).toBe("a la 1:05 p. m.");
    expect(aLaHora("18:00")).toBe("a las 6:00 p. m.");
  });
  it("la hora en 12 horas", () => {
    expect(hora12("00:00")).toBe("12:00 a. m.");
    expect(hora12("09:05")).toBe("9:05 a. m.");
    expect(hora12("12:00")).toBe("12:00 p. m.");
    expect(hora12("13:00")).toBe("1:00 p. m.");
    expect(hora12("23:59")).toBe("11:59 p. m.");
  });
  it("la semana, legible", () => {
    const s = semanaLegible(semana);
    expect(s.map((d) => d.nombre)).toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
    expect(s.map((d) => d.texto)).toEqual([
      "1:00 p. m. – 10:00 p. m.", "Cerrado", "Cerrado", "Cerrado", "6:00 p. m. – 2:00 a. m.", "Abierto todo el día", "Cerrado",
    ]);
    expect(semanaLegible({}).every((d) => d.texto === "Cerrado")).toBe(true);
  });
});

describe("color del negocio", () => {
  it("negro: texto blanco, y el hover se aclara (no se puede oscurecer)", () => {
    const c = colorDeNegocio("#000000");
    expect(c).toMatchObject({ acento: "0 0 0", texto: "255 255 255" });
    expect(c.hover).not.toBe("0 0 0");
  });
  it("blanco: texto negro", () => {
    expect(colorDeNegocio("#FFFFFF")).toMatchObject({ acento: "255 255 255", texto: "0 0 0", suave: "255 255 255" });
  });
  it("un amarillo: texto negro (el blanco no se leería)", () => {
    expect(colorDeNegocio("#FFD400")).toMatchObject({ acento: "255 212 0", texto: "0 0 0" });
  });
  it("el azul de VIM: texto blanco, como el botón de siempre", () => {
    expect(colorDeNegocio("#0078C9")).toMatchObject({ acento: "0 120 201", texto: "255 255 255" });
    expect(colorDeNegocio("#0078c9").acento).toBe("0 120 201");
  });
  it("el texto elegido siempre contrasta al menos 4.5:1 con el color", () => {
    const lum = (canales: string) => {
      const [r, g, b] = canales.split(" ").map((v) => { const c = Number(v) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const hex of ["#000000", "#FFFFFF", "#FFD400", "#0078C9", "#777777", "#FF0000", "#00FF00", "#808000", "#C2185B", "#111111"]) {
      const c = colorDeNegocio(hex);
      const [a, b] = [lum(c.acento), lum(c.texto)].sort((x, y) => y - x) as [number, number];
      expect((a + 0.05) / (b + 0.05), hex).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("lo que no es #RRGGBB cae al color de fábrica", () => {
    for (const malo of ["rojo", "#FFF", "", "0078C9", "#0078C9; background:url(x)", "#GGGGGG"]) {
      expect(colorDeNegocio(malo).acento, malo).toBe("17 17 17");
    }
  });
  it("las variables CSS llevan solo canales", () => {
    const v = variablesDeColor("#0078C9");
    expect(Object.keys(v).sort()).toEqual(["--accent", "--accent-hover", "--accent-soft", "--sobre-accent"]);
    for (const valor of Object.values(v)) expect(valor).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });
});

describe("imágenes", () => {
  const BASE = "https://abc.supabase.co";
  const ruta = `${u(1)}/${u(2)}`;
  const buena = `${BASE}/storage/v1/object/public/productos/${ruta}.webp`;
  it("la forma exacta del almacén público pasa", () => {
    expect(urlDeFoto(buena, BASE)).toBe(buena);
    expect(urlDeFoto(buena.replace(".webp", ".jpg"), BASE)).not.toBeNull();
    expect(urlDeFoto(buena.replace(".webp", ".png"), `${BASE}/`)).not.toBeNull();
  });
  it("todo lo demás se queda sin foto", () => {
    const malas = [
      null, "", "javascript:alert(1)", "data:image/png;base64,AAAA",
      buena.replace("abc.supabase.co", "evil.example.com"),
      buena.replace("abc.supabase.co", "xyz.supabase.co"),   // otro proyecto, mismo largo
      buena.replace("https://abc.supabase.co", "https://abc.supabase.co.evil.example.com"),
      buena.replace("https:", "http:"),
      `${buena}?token=1`, `${buena}#x`, `${buena}/`, ` ${buena}`,
      `${BASE}/storage/v1/object/public/productos/../otro/${ruta}.webp`,
      `${BASE}/storage/v1/object/public/productos/${u(1)}/../${u(2)}.webp`,
      `${BASE}/storage/v1/object/public/otro/${ruta}.webp`,
      `${BASE}/storage/v1/object/public/productos/${ruta}.svg`,
      `${BASE}/storage/v1/object/public/productos/${ruta}.webp.exe`,
      `${BASE}/storage/v1/object/public/productos/${u(2)}.webp`,
      `${BASE}/storage/v1/object/sign/productos/${ruta}.webp`,
      `//abc.supabase.co/storage/v1/object/public/productos/${ruta}.webp`,
    ];
    for (const mala of malas) expect(urlDeFoto(mala, BASE), String(mala)).toBeNull();
  });
  it("sin la URL de Supabase configurada no hay fotos", () => {
    expect(urlDeFoto(buena, "")).toBeNull();
    expect(urlDeLogo(`${ruta}.png`, "")).toBeNull();
  });
  it("el logo: de la ruta a la URL, solo si la ruta tiene su forma", () => {
    expect(urlDeLogo(`${ruta}.png`, BASE)).toBe(`${BASE}/storage/v1/object/public/productos/${ruta}.png`);
    for (const mala of [null, "", `../${ruta}.png`, `${ruta}.png?x=1`, `${ruta}.gif`, `https://evil.example.com/${ruta}.png`, `${u(1)}/${u(2)}/${u(3)}.png`]) {
      expect(urlDeLogo(mala, BASE), String(mala)).toBeNull();
    }
  });
});

describe("teléfono", () => {
  it("normaliza igual que la función: diez dígitos nacionales", () => {
    expect(normalizarTelefono("477 123 4567")).toBe("4771234567");
    expect(normalizarTelefono("+52 (477) 123-4567")).toBe("4771234567");
    expect(normalizarTelefono("5214771234567")).toBe("4771234567");
    expect(normalizarTelefono("52.477.123.4567")).toBe("4771234567");
    for (const malo of ["", "123", "477123456", "47712345678", "0771234567", "1771234567", "477 123 4567 ext 2", "4771234567a"]) {
      expect(normalizarTelefono(malo), malo).toBeNull();
    }
  });
  it("formato para mostrar", () => {
    expect(formatoTelefono("+52 4771234567")).toBe("477 123 4567");
    expect(formatoTelefono(" 01 800 algo ")).toBe("01 800 algo");
  });
  it("enlaces para llamar y para WhatsApp", () => {
    expect(enlaceTel("477 123 4567")).toBe("tel:+524771234567");
    expect(enlaceWhatsApp("477 123 4567")).toBe("https://wa.me/524771234567");
    expect(enlaceWhatsApp("477 123 4567", "Hola, pedido TAB12C")).toBe("https://wa.me/524771234567?text=Hola%2C%20pedido%20TAB12C");
    for (const malo of [null, "", "sin teléfono", "123"]) {
      expect(enlaceTel(malo)).toBeNull();
      expect(enlaceWhatsApp(malo)).toBeNull();
    }
  });
});

describe("textos", () => {
  it("los estados del seguimiento, tal como los decidió Fermín", () => {
    expect(textoDeEstado("EN_PROCESO", null)).toEqual({ titulo: "En proceso", apoyo: "Le avisamos al restaurante. En un momento confirma tu pedido." });
    expect(textoDeEstado("EN_PREPARACION", null)).toEqual({ titulo: "En preparación", apoyo: "El restaurante ya está preparando tu pedido." });
    expect(textoDeEstado("EN_CAMINO", null)).toEqual({ titulo: "En camino", apoyo: "Tu pedido va hacia ti." });
    expect(textoDeEstado("LISTO_PARA_RECOGER", null)).toEqual({ titulo: "Listo para recoger", apoyo: "Ya puedes pasar por tu pedido." });
    expect(textoDeEstado("ENTREGADO", null)).toEqual({ titulo: "Entregado", apoyo: "¡Buen provecho!" });
  });
  it("cancelado: el apoyo es el motivo", () => {
    const apoyo = (motivo: string | null) => textoDeEstado("CANCELADO", motivo).apoyo;
    expect(textoDeEstado("CANCELADO", "AGOTADO").titulo).toBe("Cancelado");
    expect(apoyo("SIN_RESPUESTA")).toBe("El restaurante no confirmó tu pedido a tiempo. No se te cobró nada.");
    expect(apoyo("AGOTADO")).toBe("Se agotó algo de tu pedido.");
    expect(apoyo("CERRADO")).toBe("El restaurante ya cerró.");
    expect(apoyo("SATURADO")).toBe("El restaurante tiene demasiados pedidos en este momento.");
    for (const otro of ["OTRO", "ALGO_NUEVO", null]) expect(apoyo(otro)).toBe("El restaurante no pudo tomar tu pedido.");
  });
  it("tienda cerrada, por motivo", () => {
    const horario: Horario = { "1": ["13:00", "22:00"] };
    const lunesTemprano = { dia: "1", hora: "10:00" } as const, martes = { dia: "2", hora: "10:00" } as const;
    expect(textoCerrada("FUERA_DE_HORARIO", horario, lunesTemprano)).toBe("Cerrado ahora. Abre hoy a la 1:00 p. m.");
    expect(textoCerrada("FUERA_DE_HORARIO", horario, martes)).toBe("Cerrado ahora. Abre el lunes a la 1:00 p. m.");
    expect(textoCerrada("FUERA_DE_HORARIO", {}, martes)).toBe("Cerrado ahora.");
    expect(textoCerrada("EN_PAUSA", horario, martes)).toBe("No estamos tomando pedidos en este momento. Vuelve a intentar en unos minutos.");
    expect(textoCerrada("CAJA_NO_LISTA", horario, martes)).toBe("Aún no abrimos. Vuelve a intentar en unos minutos.");
    expect(textoCerrada("MODO_NO_DISPONIBLE", horario, martes)).toBe("Esta opción no está disponible por ahora.");
    for (const otro of ["TIENDA_NO_DISPONIBLE", "NO_PARTICIPA", "LO_QUE_SEA"]) {
      expect(textoCerrada(otro, horario, martes)).toBe("Esta tienda no está disponible por ahora.");
    }
  });
  it("cada código de error tiene su texto y qué hacer, sin palabras internas", () => {
    // Los de la función (anexo §1.3, HTTP y SQL) y los que pone la propia tienda.
    const DEL_ANEXO = [
      "METODO_NO_PERMITIDO", "NO_AUTORIZADO", "CUERPO_DEMASIADO_GRANDE", "CUERPO_INVALIDO", "ACCION_INVALIDA",
      "NEGOCIO_INVALIDO", "CODIGO_INVALIDO", "SUCURSAL_INVALIDA", "MODO_INVALIDO", "ZONA_INVALIDA", "CARRITO_INVALIDO",
      "CLIENTE_INVALIDO", "DIRECCION_INVALIDA", "PAGO_INVALIDO", "TIENDA_NO_DISPONIBLE", "PEDIDO_NO_ENCONTRADO",
      "CAPTCHA_INVALIDO", "DEMASIADOS_INTENTOS", "SERVICIO_NO_DISPONIBLE", "ERROR_INTERNO",
      "TIENDA_CERRADA", "PRODUCTO_NO_DISPONIBLE", "MODIFICADORES_INVALIDOS", "COMBO_INVALIDO", "TOTAL_CAMBIO",
      "PRECIO_INVALIDO", "SUCURSAL_DE_OTRO_NEGOCIO", "SEGUIMIENTO_INVALIDO", "CUENTA_INVALIDA", "NO_SE_PUDO_CREAR",
    ];
    for (const c of DEL_ANEXO) expect(CODIGOS_DE_ERROR, c).toContain(c);
    for (const c of ["SIN_CONEXION", "SIN_CONFIRMAR", "ORIGEN_NO_PERMITIDO"]) expect(CODIGOS_DE_ERROR, c).toContain(c);
    const generico = textoDeError("ALGO_QUE_NO_EXISTE");
    for (const c of CODIGOS_DE_ERROR) {
      const t = textoDeError(c, { telefono: "477 123 4567" });
      expect(t.texto.length, c).toBeGreaterThan(10);
      expect(t.hacer.length, c).toBeGreaterThan(10);
      expect(`${t.texto} ${t.hacer}`, c).not.toMatch(/[A-Z]{2,}_[A-Z]|undefined|null|captcha|servidor|JSON|slug/i);
    }
    expect(generico.texto.length).toBeGreaterThan(10);
  });
  it("los errores que piden algo concreto lo dicen", () => {
    expect(textoDeError("NO_SE_PUDO_CREAR", { telefono: "4771234567" })).toEqual({
      texto: "No pudimos tomar tu pedido.", hacer: "Llama al restaurante: 477 123 4567.",
    });
    expect(textoDeError("NO_SE_PUDO_CREAR").hacer).toBe("Llama al restaurante para hacer tu pedido.");
    expect(textoDeError("TOTAL_CAMBIO", { detalle: "310.00" }).texto).toBe("El total de tu pedido cambió: ahora es $310.00.");
    expect(textoDeError("TOTAL_CAMBIO").texto).toBe("El total de tu pedido cambió.");
    expect(textoDeError("SIN_CONFIRMAR", { telefono: "4771234567" }).hacer).toContain("Antes de volver a intentar");
    expect(textoDeError("TIENDA_CERRADA", { detalle: "EN_PAUSA" }).texto).toBe("No estamos tomando pedidos en este momento.");
  });
  it("la regla de un grupo, en palabras", () => {
    expect(reglaDeGrupo(1, 1)).toBe("Elige 1");
    expect(reglaDeGrupo(2, 2)).toBe("Elige 2");
    expect(reglaDeGrupo(0, 1)).toBe("Opcional");
    expect(reglaDeGrupo(0, 3)).toBe("Opcional · hasta 3");
    expect(reglaDeGrupo(0, null)).toBe("Opcional");
    expect(reglaDeGrupo(1, 3)).toBe("Elige de 1 a 3");
    expect(reglaDeGrupo(2, null)).toBe("Elige al menos 2");
  });
});
