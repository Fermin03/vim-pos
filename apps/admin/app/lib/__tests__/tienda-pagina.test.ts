import { describe, expect, it } from "vitest";
import { normalizarDireccion, trasEscribir, type Leido } from "../tienda-pagina";
import { errorDeDireccion } from "../tienda-reglas";

const CONFIG = {
  direccion: "knockout", color: "#111111", descripcion: "Hamburguesas", logoRuta: "t1/logo.png", logoUrl: "https://x/t1/logo.png",
  aceptacion: "MANUAL" as const, minutosAceptacion: 5, pagoEfectivo: true, pagoTarjeta: false,
};
const SUCURSAL = {
  id: "s1", nombre: "Centro", telefono: "4771234567", activa: true,
  participa: false, recoger: true, domicilio: false, horario: {}, zonasActivas: 2,
};
const LEIDO: Leido = {
  config: CONFIG, sucursales: [SUCURSAL, { ...SUCURSAL, id: "s2", nombre: "Norte" }], interruptor: false, enPlan: true,
  pendientes: { sinFoto: 1, sinDescripcion: 0, enCategoriaInactiva: 0 },
};
const DATOS = { direccion: "ko-burger", color: "#0078C9", descripcion: "Nueva", aceptacion: "AUTO" as const, minutosAceptacion: 9, pagoEfectivo: false, pagoTarjeta: true };

describe("lo guardado después de una escritura que sí entró", () => {
  it("«Tu tienda» deja en memoria solo lo suyo: dirección, color y descripción; lo de Pedidos y el logo siguen", () => {
    const r = trasEscribir(LEIDO, { tipo: "config", bloque: "datos", datos: DATOS });
    expect(r.config).toEqual({ ...CONFIG, direccion: "ko-burger", color: "#0078C9", descripcion: "Nueva" });
  });

  it("«Pedidos» deja en memoria solo lo suyo: la dirección que viajaba en la memoria vieja no se pinta", () => {
    const r = trasEscribir(LEIDO, { tipo: "config", bloque: "pedidos", datos: DATOS });
    expect(r.config).toEqual({ ...CONFIG, aceptacion: "AUTO", minutosAceptacion: 9, pagoEfectivo: false, pagoTarjeta: true });
  });

  it("el primer guardado crea la configuración (sin logo): Pedidos se abre y Compartir aparece", () => {
    const r = trasEscribir({ ...LEIDO, config: null }, { tipo: "config", bloque: "datos", datos: DATOS });
    expect(r.config).toEqual({ ...DATOS, logoRuta: null, logoUrl: null });
  });

  it("una descripción en blanco queda vacía, como la devuelve la base", () => {
    expect(trasEscribir(LEIDO, { tipo: "config", bloque: "datos", datos: { ...DATOS, descripcion: "   " } }).config?.descripcion).toBe("");
  });

  it("el caso que se revertía: guardar Datos y luego Pedidos manda la dirección NUEVA", () => {
    const trasDatos = trasEscribir(LEIDO, { tipo: "config", bloque: "datos", datos: { ...CONFIG, direccion: "ko-burger" } });
    // Lo que «Pedidos» arma: lo guardado + lo suyo.
    const envioDePedidos = { ...trasDatos.config!, aceptacion: "AUTO" as const };
    expect(envioDePedidos.direccion).toBe("ko-burger");
  });

  it("el interruptor queda como se mandó", () => {
    expect(trasEscribir(LEIDO, { tipo: "interruptor", encendida: true }).interruptor).toBe(true);
    expect(trasEscribir({ ...LEIDO, interruptor: true }, { tipo: "interruptor", encendida: false }).interruptor).toBe(false);
  });

  it("la sucursal guardada toma lo mandado; las demás y sus otros datos no cambian", () => {
    const datos = { participa: true, recoger: false, domicilio: true, horario: { "1": ["09:00", "22:00"] as [string, string] } };
    const r = trasEscribir(LEIDO, { tipo: "sucursal", id: "s1", datos });
    expect(r.sucursales[0]).toEqual({ ...SUCURSAL, ...datos });
    expect(r.sucursales[1]).toBe(LEIDO.sucursales[1]);
  });

  it("el logo recién subido queda con su ruta y su URL; lo demás de la configuración no cambia", () => {
    const r = trasEscribir(LEIDO, { tipo: "logo", ruta: "t1/nuevo.webp", url: "https://x/t1/nuevo.webp" });
    expect(r.config).toEqual({ ...CONFIG, logoRuta: "t1/nuevo.webp", logoUrl: "https://x/t1/nuevo.webp" });
    expect(r.sucursales).toBe(LEIDO.sucursales);
  });

  it("al quitar el logo queda sin ruta y sin URL", () => {
    const r = trasEscribir(LEIDO, { tipo: "logo", ruta: null, url: null });
    expect(r.config).toEqual({ ...CONFIG, logoRuta: null, logoUrl: null });
  });

  it("el caso que pisaría el logo: tras subirlo, guardar Datos lo conserva", () => {
    const trasLogo = trasEscribir(LEIDO, { tipo: "logo", ruta: "t1/nuevo.webp", url: "https://x/t1/nuevo.webp" });
    expect(trasEscribir(trasLogo, { tipo: "config", bloque: "datos", datos: DATOS }).config?.logoRuta).toBe("t1/nuevo.webp");
    expect(trasEscribir(trasLogo, { tipo: "config", bloque: "pedidos", datos: DATOS }).config?.logoRuta).toBe("t1/nuevo.webp");
  });

  it("sin dirección guardada no hay dónde poner el logo: no inventa una configuración", () => {
    const sin = { ...LEIDO, config: null };
    expect(trasEscribir(sin, { tipo: "logo", ruta: "t1/nuevo.webp", url: "https://x/t1/nuevo.webp" }).config).toBeNull();
  });

  it("no toca lo demás ni muta lo leído", () => {
    const r = trasEscribir(LEIDO, { tipo: "config", bloque: "datos", datos: DATOS });
    expect(r.sucursales).toBe(LEIDO.sucursales);
    expect(r.pendientes).toBe(LEIDO.pendientes);
    expect(r.enPlan).toBe(true);
    expect(LEIDO.config).toBe(CONFIG);
  });
});

describe("la dirección como se escribe", () => {
  it("minúsculas, sin espacios a los lados y con guiones en vez de espacios", () => {
    expect(normalizarDireccion("  Mi  Tienda ")).toBe("mi-tienda");
    expect(normalizarDireccion("KnockOut")).toBe("knockout");
  });
  it("quita los acentos igual que la sugerencia: la ü y la ñ no son un error del dueño", () => {
    expect(normalizarDireccion("tacos-el-güero")).toBe("tacos-el-guero");
    expect(normalizarDireccion("Tacos El Güero")).toBe("tacos-el-guero");
    expect(normalizarDireccion("Ñandú Ñoño")).toBe("nandu-nono");
    expect(errorDeDireccion(normalizarDireccion("Tacos El Güero"))).toBeNull();
  });
  it("lo normalizado pasa la validación", () => {
    expect(errorDeDireccion(normalizarDireccion("Mi Tienda"))).toBeNull();
  });
  it("no inventa: lo que sigue mal, sigue mal", () => {
    expect(errorDeDireccion(normalizarDireccion("ñandú!"))).not.toBeNull();
    expect(normalizarDireccion("")).toBe("");
  });
});
