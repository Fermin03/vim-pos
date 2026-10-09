import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASE_TIENDA, DIAS, DIRECCIONES_RESERVADAS, copiarATodos, cruzaMedianoche, errorDeDireccion,
  errorDeHorario, errorDeSucursal, erroresPorDia, hayCambiosDeSucursal, horaValida, interruptorDeSucursalBloqueado, leerHorario, notaDeRango, paraGuardarSucursal, mensajeTienda, puedeEncender, revisar, sugerirDireccion,
  type Horario, type SucursalTienda,
} from "../tienda-reglas";

describe("direcciones", () => {
  it("las reservadas son exactamente las de la migración", () => {
    const sql = readFileSync(resolve(__dirname, "../../../../../supabase/migrations/0163_tienda_admin.sql"), "utf8");
    const lista = /slug NOT IN \(([^)]*)\)/.exec(sql)?.[1] ?? "";
    const deSql = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(deSql).toHaveLength(16);
    expect([...DIRECCIONES_RESERVADAS].sort()).toEqual([...deSql].sort());
  });

  it("la base de la tienda", () => expect(BASE_TIENDA).toBe("pedidos.vimpos.com.mx"));

  it("sugiere desde el nombre del negocio", () => {
    expect(sugerirDireccion("Knock-Out Burger León")).toBe("knock-out-burger-leon");
    expect(sugerirDireccion("  Tacos   El Güero!! ")).toBe("tacos-el-guero");
  });
  it("corta a 40 sin terminar en guion", () => {
    const d = sugerirDireccion("a".repeat(39) + " bbbbbbbbbbbbbbbbbbbb");
    expect(d.length).toBeLessThanOrEqual(40);
    expect(d.endsWith("-")).toBe(false);
    expect(sugerirDireccion("a".repeat(60))).toHaveLength(40);
  });
  it("una reservada o un nombre vacío no sugieren nada", () => {
    expect(sugerirDireccion("VIM")).toBe("");
    expect(sugerirDireccion("¡¡!!")).toBe("");
    expect(sugerirDireccion("")).toBe("");
  });
  it("lo sugerido nunca lo rechaza errorDeDireccion", () => {
    for (const n of ["Ab", "Mi Taquería #1", "---x---", "Ñandú Ñoño", "Tienda", "API", "A B C", "  --Pollo  Loco--  ", "x".repeat(100), "123"]) {
      const d = sugerirDireccion(n);
      if (d !== "") expect(errorDeDireccion(d)).toBeNull();
    }
  });

  it("valida la dirección", () => {
    expect(errorDeDireccion("knock-out")).toBeNull();
    for (const mala of ["ab", "a".repeat(41), "Knock", "knock out", "-knock", "knock-"]) {
      expect(errorDeDireccion(mala), mala).toEqual(expect.any(String));
    }
    for (const r of DIRECCIONES_RESERVADAS) expect(errorDeDireccion(r), r).toEqual(expect.any(String));
  });

  it("las fronteras del largo: 3 y 40 pasan, 2 y 41 no", () => {
    expect(errorDeDireccion("abc")).toBeNull();
    expect(errorDeDireccion("a".repeat(40))).toBeNull();
    expect(errorDeDireccion("ab")).toBe("La dirección debe tener de 3 a 40 caracteres.");
    expect(errorDeDireccion("a".repeat(41))).toBe("La dirección debe tener de 3 a 40 caracteres.");
  });

  it("lo que no tiene la forma se explica sin decir «minúsculas» (una ü lo es)", () => {
    const FORMA = "Usa solo letras, números y guiones, sin acentos y sin guion al inicio ni al final.";
    for (const mala of ["tacos-el-güero", "Knock", "knock out", "-knock", "knock-"]) expect(errorDeDireccion(mala), mala).toBe(FORMA);
  });
});

describe("horario", () => {
  it("lee lo que viene de la base y descarta lo malo", () => {
    expect(leerHorario(null)).toEqual({});
    expect(leerHorario([])).toEqual({});
    expect(leerHorario({ "1": "siempre" })).toEqual({});
    expect(leerHorario({ "8": ["10:00", "12:00"] })).toEqual({});
    expect(leerHorario({ "1": ["25:00", "12:00"] })).toEqual({});
    expect(leerHorario({ "1": ["10:00"] })).toEqual({});
    expect(leerHorario({ "1": ["10:00", "12:00"], "2": "x" })).toEqual({ "1": ["10:00", "12:00"] });
  });
  it("valida horas", () => {
    expect(errorDeHorario({ "1": ["9:00", "12:00"] })).toEqual(expect.any(String));
    expect(errorDeHorario({ "1": ["10:00", "24:00"] })).toEqual(expect.any(String));
    expect(errorDeHorario({ "1": ["10:00", "12:60"] })).toEqual(expect.any(String));
    expect(errorDeHorario({ "1": ["18:00", "02:00"] })).toBeNull();
    expect(errorDeHorario({ "1": ["00:00", "00:00"] })).toBeNull();
    expect(errorDeHorario({})).toBeNull();
  });
  it("cruza la medianoche si cierra antes de abrir", () => {
    expect(cruzaMedianoche(["18:00", "02:00"])).toBe(true);
    expect(cruzaMedianoche(["09:00", "18:00"])).toBe(false);
    expect(cruzaMedianoche(["00:00", "00:00"])).toBe(false);
  });
  it("copia un día a los siete, o cierra todos si ese está cerrado", () => {
    expect(DIAS).toHaveLength(7);
    expect(DIAS[0]).toEqual({ dia: "1", nombre: "Lunes" });
    expect(DIAS[6]).toEqual({ dia: "7", nombre: "Domingo" });
    const h: Horario = { "3": ["13:00", "22:00"] };
    const todos = copiarATodos(h, "3");
    expect(Object.keys(todos)).toHaveLength(7);
    expect(todos["7"]).toEqual(["13:00", "22:00"]);
    expect(copiarATodos(h, "4")).toEqual({});
  });
});

const suc = (o: Partial<SucursalTienda> = {}): SucursalTienda => ({
  id: "s1", nombre: "Centro", telefono: "477 123 4567", activa: true, participa: true,
  recoger: true, domicilio: false, horario: { "1": ["10:00", "22:00"] }, zonasActivas: 0, ...o,
});
const base = { hayDireccion: true, sucursales: [suc()], productosSinFoto: 0, productosSinDescripcion: 0, productosEnCategoriaInactiva: 0 };

describe("revisar", () => {
  it("todo en orden: nada que decir", () => {
    const r = revisar(base);
    expect(r).toEqual([]);
    expect(puedeEncender(r)).toBe(true);
  });
  it("sin dirección", () => {
    expect(revisar({ ...base, hayDireccion: false })).toEqual([{ nivel: "bloquea", texto: "Elige la dirección de tu tienda." }]);
  });
  it("ninguna sucursal participa; las que no participan no generan nada", () => {
    expect(revisar({ ...base, sucursales: [suc({ participa: false, telefono: "", activa: false })] }))
      .toEqual([{ nivel: "bloquea", texto: "Elige al menos una sucursal que venda en la tienda." }]);
    expect(revisar({ ...base, sucursales: [suc(), suc({ id: "s2", nombre: "Norte", participa: false, telefono: "" })] })).toEqual([]);
  });
  it("sin recoger ni domicilio", () => {
    expect(revisar({ ...base, sucursales: [suc({ recoger: false })] }))
      .toEqual([{ nivel: "bloquea", texto: "Centro: elige si ofrece recoger, domicilio o ambos." }]);
  });
  it("sin horario", () => {
    expect(revisar({ ...base, sucursales: [suc({ horario: {} })] }))
      .toEqual([{ nivel: "bloquea", texto: "Centro: ponle horario." }]);
  });
  it("sin teléfono", () => {
    expect(revisar({ ...base, sucursales: [suc({ telefono: "  " })] })).toEqual([
      { nivel: "bloquea", texto: "Centro: le falta teléfono.", enlace: { href: "/configuracion/sucursales", etiqueta: expect.any(String) } },
    ]);
  });
  it("domicilio sin zonas activas", () => {
    expect(revisar({ ...base, sucursales: [suc({ domicilio: true })] })).toEqual([
      { nivel: "bloquea", texto: "Centro: para domicilio necesita al menos una zona de envío.", enlace: { href: "/configuracion/envios", etiqueta: expect.any(String) } },
    ]);
    expect(revisar({ ...base, sucursales: [suc({ domicilio: true, zonasActivas: 1 })] })).toEqual([]);
  });
  it("sucursal inactiva", () => {
    expect(revisar({ ...base, sucursales: [suc({ activa: false })] }))
      .toEqual([{ nivel: "bloquea", texto: "Centro está inactiva." }]);
  });
  it("productos: advierte, con singular y plural", () => {
    const r = revisar({ ...base, productosSinFoto: 3, productosSinDescripcion: 1, productosEnCategoriaInactiva: 2 });
    expect(r.map((x) => x.nivel)).toEqual(["advierte", "advierte", "advierte"]);
    expect(r[0]?.texto).toBe("3 productos no tienen foto. Se venden igual, pero con foto se piden más.");
    expect(r[0]?.enlace?.href).toBe("/catalogo/productos");
    expect(r[1]?.texto).toBe("1 producto no tiene descripción.");
    expect(r[2]?.texto).toBe("2 productos están en una categoría inactiva y no aparecen en la tienda.");
    expect(revisar({ ...base, productosSinFoto: 1 })[0]?.texto).toBe("1 producto no tiene foto. Se vende igual, pero con foto se pide más.");
    expect(revisar({ ...base, productosEnCategoriaInactiva: 1 })[0]?.texto).toBe("1 producto está en una categoría inactiva y no aparece en la tienda.");
    expect(puedeEncender(r)).toBe(true);
  });
  it("puedeEncender es falso con cualquier bloqueo", () => {
    expect(puedeEncender([{ nivel: "advierte", texto: "a" }, { nivel: "bloquea", texto: "b" }])).toBe(false);
  });
});

describe("mensajeTienda", () => {
  const caso = (message: string, code?: string) => mensajeTienda({ message, code }, "por defecto");
  it("traduce", () => {
    expect(caso('duplicate key value violates unique constraint "tienda_config_slug_key"', "23505")).toBe("Esa dirección ya la usa otro negocio. Prueba con otra.");
    expect(caso('violates check constraint "tienda_config_slug_check"', "23514")).toBe("La dirección solo puede llevar letras, números y guiones, de 3 a 40 caracteres, y no puede ser una palabra reservada.");
    expect(caso('violates check constraint "tienda_config_color_check"')).toBe("El color no es válido.");
    expect(caso('violates check constraint "tienda_config_algun_pago"')).toBe("Deja activa al menos una forma de pago.");
    expect(caso("SIN_ADDON_TIENDA")).toBe("Tu plan no incluye la tienda en línea.");
    expect(caso("SIN_TIENDA_CONFIGURADA")).toBe("Primero guarda la dirección de tu tienda.");
    const solo = "Solo el dueño o un administrador puede cambiar esto.";
    expect(caso('new row violates row-level security policy for table "tienda_config"')).toBe(solo);
    expect(caso("permission denied for table x")).toBe(solo);
    expect(caso("SOLO_ADMIN")).toBe(solo);
  });
  it("el código 42501 también es «solo el dueño o un administrador», diga lo que diga el mensaje", () => {
    expect(mensajeTienda({ code: "42501", message: "cualquier cosa" }, "por defecto")).toBe("Solo el dueño o un administrador puede cambiar esto.");
    // Los candados de la tienda salen con ese mismo código: su frase va primero.
    expect(caso("SIN_ADDON_TIENDA", "42501")).toBe("Tu plan no incluye la tienda en línea.");
    expect(caso("SIN_TIENDA_CONFIGURADA", "42501")).toBe("Primero guarda la dirección de tu tienda.");
  });
  it("lo demás usa el texto por defecto", () => {
    expect(caso("algo raro")).toBe("por defecto");
    expect(mensajeTienda(null, "por defecto")).toBe("por defecto");
    expect(mensajeTienda(undefined, "x")).toBe("x");
  });
});

describe("borrador de una sucursal", () => {
  const guardada = { participa: true, recoger: true, domicilio: false, horario: { "1": ["13:00", "22:00"] } as Horario };
  it("sin cambios: igual aunque el horario sea otro objeto o venga en otro orden", () => {
    expect(hayCambiosDeSucursal({ ...guardada, horario: { "1": ["13:00", "22:00"] } }, guardada)).toBe(false);
    const a: Horario = { "2": ["09:00", "10:00"], "1": ["13:00", "22:00"] };
    const b: Horario = { "1": ["13:00", "22:00"], "2": ["09:00", "10:00"] };
    expect(hayCambiosDeSucursal({ ...guardada, horario: a }, { ...guardada, horario: b })).toBe(false);
  });
  it("ignora lo que no es del borrador (nombre, zonas)", () => {
    const s: SucursalTienda = { id: "s1", nombre: "Centro", telefono: "", activa: true, zonasActivas: 3, ...guardada };
    expect(hayCambiosDeSucursal(guardada, s)).toBe(false);
  });
  it("cambia con cada casilla", () => {
    expect(hayCambiosDeSucursal({ ...guardada, participa: false }, guardada)).toBe(true);
    expect(hayCambiosDeSucursal({ ...guardada, recoger: false }, guardada)).toBe(true);
    expect(hayCambiosDeSucursal({ ...guardada, domicilio: true }, guardada)).toBe(true);
  });
  it("cambia con el horario: una hora, un día de más, un día de menos", () => {
    expect(hayCambiosDeSucursal({ ...guardada, horario: { "1": ["13:00", "23:00"] } }, guardada)).toBe(true);
    expect(hayCambiosDeSucursal({ ...guardada, horario: { "1": ["13:00", "22:00"], "2": ["13:00", "22:00"] } }, guardada)).toBe(true);
    expect(hayCambiosDeSucursal({ ...guardada, horario: {} }, guardada)).toBe(true);
  });
  it("errorDeSucursal: si participa necesita recoger o domicilio", () => {
    expect(errorDeSucursal({ ...guardada, recoger: false, domicilio: false })).toBe("Elige si ofrece recoger, domicilio o ambos.");
    expect(errorDeSucursal(guardada)).toBeNull();
    expect(errorDeSucursal({ ...guardada, recoger: false, domicilio: true })).toBeNull();
  });
  it("errorDeSucursal: si no participa no se le exige nada", () => {
    expect(errorDeSucursal({ participa: false, recoger: false, domicilio: false, horario: {} })).toBeNull();
  });
  it("erroresPorDia: el error de cada renglón, con el texto de errorDeHorario", () => {
    expect(erroresPorDia({ "1": ["13:00", "22:00"] })).toEqual({});
    expect(erroresPorDia({ "1": ["", "22:00"], "2": ["13:00", "22:00"], "7": ["13:00", ""] })).toEqual({
      "1": "Lunes: escribe las horas como 09:00 o 22:30.",
      "7": "Domingo: escribe las horas como 09:00 o 22:30.",
    });
  });
});

describe("ajustes de la tarjeta de sucursal", () => {
  it("interruptorDeSucursalBloqueado: lo decide lo GUARDADO, no el borrador", () => {
    expect(interruptorDeSucursalBloqueado({ activa: false, participa: false })).toBe(true);
    // Inactiva que ya vende: se puede apagar y volver a encender mientras no se guarde.
    expect(interruptorDeSucursalBloqueado({ activa: false, participa: true })).toBe(false);
    expect(interruptorDeSucursalBloqueado({ activa: true, participa: false })).toBe(false);
    expect(interruptorDeSucursalBloqueado({ activa: true, participa: true })).toBe(false);
  });
  it("paraGuardarSucursal: si no participa manda el horario guardado, no el del borrador", () => {
    const guardada = { participa: true, recoger: true, domicilio: false, horario: { "1": ["13:00", "22:00"] } as Horario };
    const roto: Horario = { "1": ["", "22:00"] };
    expect(paraGuardarSucursal({ ...guardada, participa: false, horario: roto }, guardada))
      .toEqual({ participa: false, recoger: true, domicilio: false, horario: { "1": ["13:00", "22:00"] } });
    const nuevo: Horario = { "2": ["09:00", "18:00"] };
    expect(paraGuardarSucursal({ ...guardada, domicilio: true, horario: nuevo }, guardada))
      .toEqual({ participa: true, recoger: true, domicilio: true, horario: nuevo });
  });
  it("horaValida", () => {
    expect(horaValida("09:00")).toBe(true);
    expect(horaValida("23:59")).toBe(true);
    expect(horaValida("")).toBe(false);
    expect(horaValida("24:00")).toBe(false);
    expect(horaValida("9:00")).toBe(false);
  });
  it("notaDeRango: solo con las dos horas válidas", () => {
    expect(notaDeRango(["18:00", "02:00"])).toBe("Cierra al día siguiente");
    expect(notaDeRango(["09:00", "09:00"])).toBe("Abre todo el día");
    expect(notaDeRango(["13:00", "22:00"])).toBeNull();
    expect(notaDeRango(["13:00", ""])).toBeNull();
    expect(notaDeRango(["", "22:00"])).toBeNull();
    expect(notaDeRango(["", ""])).toBeNull();
  });
});
