// «Envío a domicilio» de una sucursal (0179): las reglas del admin son las de tienda_guardar_envio.
import { describe, expect, it } from "vitest";
import { decimasDeKm, erroresDeEnvio, hayCambiosDeEnvio, revisar, type EnvioSucursal, type SucursalTienda } from "../tienda-reglas";
import { trasEscribir, type Leido } from "../tienda-pagina";

const P = { lat: 21.1223, lng: -101.6824 };
const envio = (o: Partial<EnvioSucursal> = {}): EnvioSucursal => ({ cobro: "DISTANCIA", tramos: [{ hastaKm: "3", costo: "25" }, { hastaKm: "5.5", costo: "35.50" }], punto: P, ...o });

describe("los kilómetros", () => {
  it("de 0.1 a 50 con un decimal, en décimas", () => {
    expect([decimasDeKm("3"), decimasDeKm("3.5"), decimasDeKm(" 0.1 "), decimasDeKm("50"), decimasDeKm("50.0")]).toEqual([30, 35, 1, 500, 500]);
    for (const k of ["0", "0.0", "50.1", "3.25", "3,5", "-1", "", "abc", "100"]) expect(decimasDeKm(k), k).toBeNull();
  });
});

describe("errores del envío", () => {
  it("una tabla bien hecha no tiene errores", () => {
    expect(erroresDeEnvio(envio())).toEqual({ general: null, porTramo: {} });
    expect(erroresDeEnvio(envio({ tramos: [{ hastaKm: "2", costo: "0" }] }))).toEqual({ general: null, porTramo: {} });
  });
  it("cada renglón dice lo suyo", () => {
    const e = erroresDeEnvio(envio({ tramos: [{ hastaKm: "3", costo: "25" }, { hastaKm: "3.0", costo: "30" }, { hastaKm: "51", costo: "1" }, { hastaKm: "8", costo: "1.005" }, { hastaKm: "9", costo: "10000" }] }));
    expect(e.porTramo).toEqual({
      1: "Cada tramo llega más lejos que el anterior.",
      2: "Los kilómetros van de 0.1 a 50, con un decimal.",
      3: "El costo va de $0 a $9,999.99.",
      4: "El costo va de $0 a $9,999.99.",
    });
  });
  it("por distancia hacen falta tramos y el punto; por zonas, no", () => {
    expect(erroresDeEnvio(envio({ tramos: [] })).general).toBe("Agrega al menos un tramo.");
    expect(erroresDeEnvio(envio({ punto: null })).general).toBe("Marca en el mapa dónde está tu sucursal.");
    expect(erroresDeEnvio(envio({ cobro: "ZONAS", tramos: [], punto: null })).general).toBeNull();
    const muchos = Array.from({ length: 21 }, (_, i) => ({ hastaKm: String(i + 1), costo: "1" }));
    expect(erroresDeEnvio(envio({ tramos: muchos })).general).toBe("Puedes tener hasta 20 tramos.");
  });
  it("cambios: modo, tramos (sin espacios) y punto", () => {
    expect(hayCambiosDeEnvio(envio(), envio())).toBe(false);
    expect(hayCambiosDeEnvio(envio({ tramos: [{ hastaKm: " 3 ", costo: "25" }, { hastaKm: "5.5", costo: "35.50" }] }), envio())).toBe(false);
    expect(hayCambiosDeEnvio(envio({ cobro: "ZONAS" }), envio())).toBe(true);
    expect(hayCambiosDeEnvio(envio({ punto: { lat: 21.1, lng: -101.6824 } }), envio())).toBe(true);
    expect(hayCambiosDeEnvio(envio({ tramos: [] }), envio())).toBe(true);
  });
});

const suc = (o: Partial<SucursalTienda> = {}): SucursalTienda => ({
  id: "s1", nombre: "Centro", telefono: "477", activa: true, participa: true, recoger: false, domicilio: true,
  horario: { "1": ["10:00", "22:00"] }, zonasActivas: 0, conexionId: null, envio: envio(), ...o,
});
const base = { hayDireccion: true, productosSinFoto: 0, productosSinDescripcion: 0, productosEnCategoriaInactiva: 0 };

describe("la lista de revisión", () => {
  it("por distancia con tramos y punto no pide zonas", () => {
    expect(revisar({ ...base, sucursales: [suc()] })).toEqual([]);
  });
  it("por distancia sin tramos o sin punto bloquea", () => {
    for (const e of [envio({ tramos: [] }), envio({ punto: null })]) {
      expect(revisar({ ...base, sucursales: [suc({ envio: e })] })[0]).toEqual({ nivel: "bloquea", texto: "Centro: para domicilio por distancia faltan los tramos o el punto de la sucursal." });
    }
  });
  it("por zonas sigue pidiendo una zona", () => {
    expect(revisar({ ...base, sucursales: [suc({ envio: envio({ cobro: "ZONAS" }) })] })[0]?.texto).toBe("Centro: para domicilio necesita al menos una zona de envío.");
  });
});

it("lo guardado se ve antes de volver a leer", () => {
  const l = { sucursales: [suc({ envio: envio({ cobro: "ZONAS" }) })] } as Leido;
  expect(trasEscribir(l, { tipo: "envio", id: "s1", envio: envio() }).sucursales[0]?.envio).toEqual(envio());
});
