// Envío por distancia (0179) del lado del teléfono: la cuenta que enseña el precio mientras se mueve
// el pin tiene que ser la de la base (smoke_tienda_envio_distancia.sql usa los mismos puntos), el
// contrato lee la forma nueva y el carrito manda el punto solo cuando toca.
import { describe, expect, it } from "vitest";
import { FACTOR_CALLES, alcanceDe, decimasDeKm, kmDeDecimas, puntoValido, tramoDe } from "../distancia";
import { aCuerpo, carritoNuevo } from "../carrito";
import { cotizacionDe, negocioDe } from "../contrato";
import { desenlaceDelError } from "../envio";
import { rangoDeEnvio } from "../pantalla";
import { estadoDelPin } from "../../components/ubicacion";
import { cotizacionCruda, negocioCrudo } from "./datos";

const SUC = { lat: 21.1223, lng: -101.6824 };
const al = (lat: number) => ({ lat, lng: -101.6824 });
const TRAMOS = [{ hasta_km: "2.0", costo_mxn: "0.00" }, { hasta_km: "5.0", costo_mxn: "35.00" }, { hasta_km: "8.0", costo_mxn: "50.00" }];

describe("la distancia", () => {
  it("es la de la base: haversine × 1.3, en décimas", () => {
    expect(FACTOR_CALLES).toBe(1.3);
    // Zócalo → Ángel de la Independencia: 3.67 km en línea recta → 4.8 en calles.
    expect(decimasDeKm({ lat: 19.4326, lng: -99.1332 }, { lat: 19.427, lng: -99.1677 })).toBe(48);
    expect(decimasDeKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBe(1446);
    expect(decimasDeKm(SUC, SUC)).toBe(0);
    // Los mismos puntos del smoke, con lo que dio la base.
    for (const [lat, d] of [[21.129218, 10], [21.136412, 20], [21.136551, 21], [21.156751, 50], [21.157166, 50], [21.157304, 51], [21.176951, 79], [21.179026, 82]] as const) {
      expect(decimasDeKm(SUC, al(lat)), String(lat)).toBe(d);
    }
    expect(decimasDeKm(al(21.157304), SUC)).toBe(51);
  });
  it("se escribe con un decimal", () => {
    expect([kmDeDecimas(0), kmDeDecimas(32), kmDeDecimas(100), kmDeDecimas(1446)]).toEqual(["0.0", "3.2", "10.0", "144.6"]);
  });
  it("cobra el primer tramo que la alcanza; el borde cuenta; más allá del último no se entrega", () => {
    expect(tramoDe(TRAMOS, 0)?.costo_mxn).toBe("0.00");
    expect(tramoDe(TRAMOS, 20)?.costo_mxn).toBe("0.00");
    expect(tramoDe(TRAMOS, 21)?.costo_mxn).toBe("35.00");
    expect(tramoDe(TRAMOS, 50)?.costo_mxn).toBe("35.00");
    expect(tramoDe(TRAMOS, 51)?.costo_mxn).toBe("50.00");
    expect(tramoDe(TRAMOS, 80)?.costo_mxn).toBe("50.00");
    expect(tramoDe(TRAMOS, 81)).toBeNull();
    expect(tramoDe([], 1)).toBeNull();
    expect(alcanceDe(TRAMOS)).toBe("8.0");
  });
  it("un punto vale con números finitos en rango, a 6 decimales", () => {
    expect(puntoValido({ lat: 21.12345678, lng: -101.5 })).toEqual({ lat: 21.123457, lng: -101.5 });
    for (const p of [{ lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }]) expect(puntoValido(p)).toBeNull();
  });
});

describe("lo que se le dice del pin", () => {
  const base = { sucursal: SUC, tramos: TRAMOS, enVivo: null, cotizacion: null };
  it("sin pin, nada", () => expect(estadoDelPin({ ...base, pin: null })).toBeNull());
  it("dentro: a cuántos km y cuánto; gratis se dice", () => {
    expect(estadoDelPin({ ...base, pin: al(21.136551) })).toEqual({ texto: "Estás a 2.1 km · Envío $35.00", fuera: false });
    expect(estadoDelPin({ ...base, pin: al(21.129218) })).toEqual({ texto: "Estás a 1.0 km · Envío sin costo", fuera: false });
  });
  it("fuera del último tramo", () => {
    expect(estadoDelPin({ ...base, pin: al(21.179026) })).toEqual({ texto: "Esta dirección está fuera del área de entrega.", fuera: true });
  });
  it("arrastrando manda el punto de ese instante; quieto, la cotización de la base", () => {
    const cot = { distancia_km: "2.2", envio_total_mxn: "40.60" };
    expect(estadoDelPin({ ...base, pin: al(21.136551), cotizacion: cot })?.texto).toBe("Estás a 2.2 km · Envío $40.60");
    expect(estadoDelPin({ ...base, pin: al(21.136551), enVivo: al(21.157304), cotizacion: cot })?.texto).toBe("Estás a 5.1 km · Envío $50.00");
  });
});

describe("el contrato", () => {
  const conEnvio = (envio: unknown) => {
    const n = negocioCrudo() as { sucursales: Record<string, unknown>[] };
    n.sucursales[0]!.envio = envio;
    return negocioDe(n);
  };
  it("sin la clave `envio` (función anterior) es por zonas", () => {
    expect(negocioDe(negocioCrudo())?.sucursales[0]?.envio).toEqual({ cobro: "ZONAS" });
  });
  it("por distancia: tramos y punto", () => {
    expect(conEnvio({ cobro: "DISTANCIA", tramos: TRAMOS, punto: SUC })?.sucursales[0]?.envio).toEqual({ cobro: "DISTANCIA", tramos: TRAMOS, punto: SUC });
  });
  it("por distancia sin tramos o sin punto se lee como por zonas (no hay mapa que enseñar)", () => {
    expect(conEnvio({ cobro: "DISTANCIA", tramos: [], punto: SUC })?.sucursales[0]?.envio).toEqual({ cobro: "ZONAS" });
    expect(conEnvio({ cobro: "DISTANCIA", tramos: TRAMOS, punto: null })?.sucursales[0]?.envio).toEqual({ cobro: "ZONAS" });
  });
  it("un tramo mal formado tumba la respuesta entera", () => {
    expect(conEnvio({ cobro: "DISTANCIA", tramos: [{ hasta_km: "3", costo_mxn: "35.00" }], punto: SUC })).toBeNull();
    expect(conEnvio({ cobro: "DISTANCIA", tramos: [{ hasta_km: "3.0", costo_mxn: 35 }], punto: SUC })).toBeNull();
  });
  it("la cotización trae la distancia, o null", () => {
    expect(cotizacionDe({ ...(cotizacionCruda() as object), distancia_km: "3.2" })?.distancia_km).toBe("3.2");
    expect(cotizacionDe({ ...(cotizacionCruda() as object), distancia_km: "3" })?.distancia_km).toBeNull();
  });
});

describe("el carrito y los errores", () => {
  it("el punto viaja solo a domicilio, y nunca se guarda con el carrito", () => {
    const c = carritoNuevo("s", "DOMICILIO");
    expect(aCuerpo(c, SUC).punto).toEqual(SUC);
    expect("punto" in aCuerpo(c)).toBe(false);
    expect("punto" in aCuerpo({ ...c, modo: "RECOGER" }, SUC)).toBe(false);
    expect("punto" in c).toBe(false);
  });
  it("UBICACION_INVALIDA y FUERA_DE_AREA regresan a «Tu ubicación»", () => {
    for (const error of ["UBICACION_INVALIDA", "FUERA_DE_AREA"]) {
      expect(desenlaceDelError({ error, detalle: null }, { telefono: null, horario: {} }).tipo).toBe("campo");
      const d = desenlaceDelError({ error, detalle: "8.2" }, { telefono: null, horario: {} });
      expect(d.tipo === "campo" && d.campo).toBe("ubicacion");
    }
  });
  it("el rango por distancia lo dice así", () => {
    expect(rangoDeEnvio(TRAMOS, "distancia")).toBe("El envío puede costar entre $0.00 y $50.00, según la distancia.");
    expect(rangoDeEnvio(TRAMOS)).toBe("El envío puede costar entre $0.00 y $50.00, según tu zona.");
  });
});
