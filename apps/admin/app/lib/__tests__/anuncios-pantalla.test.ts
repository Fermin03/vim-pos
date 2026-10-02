import { describe, expect, it } from "vitest";
import {
  ANUNCIO_MAX_BYTES,
  dataUriAArchivo,
  opcionesSegundos,
  ordenTrasMover,
  segundosSchema,
  traducir,
} from "../anuncios-pantalla";

describe("dataUriAArchivo", () => {
  it("convierte un data URI de imagen en un archivo con su extensión", () => {
    const r = dataUriAArchivo("data:image/jpeg;base64,/9j/4AAQ");
    expect(r.ext).toBe("jpg");
    expect(r.tipo).toBe("image/jpeg");
    expect(r.blob.size).toBeGreaterThan(0);
    expect(dataUriAArchivo("data:image/png;base64,iVBORw0KGgo=").ext).toBe("png");
    expect(dataUriAArchivo("data:image/webp;base64,UklGRg==").ext).toBe("webp");
  });
  it("rechaza lo que no es una imagen permitida", () => {
    expect(() => dataUriAArchivo("data:image/svg+xml;base64,PHN2Zz4=")).toThrow();
    expect(() => dataUriAArchivo("data:text/html;base64,PGh0bWw+")).toThrow();
    expect(() => dataUriAArchivo("hola")).toThrow();
  });
  it("rechaza una imagen que pasa del tope, con un mensaje que dice qué hacer", () => {
    // 4 caracteres de base64 son 3 bytes.
    const grupos = Math.floor(ANUNCIO_MAX_BYTES / 3);
    const pasada = "data:image/jpeg;base64," + "AAAA".repeat(grupos + 1);
    expect(() => dataUriAArchivo(pasada)).toThrow(/demasiado/i);
    const justa = "data:image/jpeg;base64," + "AAAA".repeat(grupos);
    expect(dataUriAArchivo(justa).blob.size).toBe(grupos * 3);
    expect(grupos * 3).toBeLessThanOrEqual(ANUNCIO_MAX_BYTES);
  });
});

describe("ordenTrasMover", () => {
  const ids = ["a", "b", "c"];
  it("sube y baja un lugar", () => {
    expect(ordenTrasMover(ids, "b", "arriba")).toEqual(["b", "a", "c"]);
    expect(ordenTrasMover(ids, "b", "abajo")).toEqual(["a", "c", "b"]);
  });
  it("en los extremos no cambia nada", () => {
    expect(ordenTrasMover(ids, "a", "arriba")).toEqual(ids);
    expect(ordenTrasMover(ids, "c", "abajo")).toEqual(ids);
    expect(ordenTrasMover(ids, "z", "arriba")).toEqual(ids);
  });
});

describe("segundosSchema", () => {
  it("acepta enteros de 3 a 60", () => {
    expect(segundosSchema.safeParse("8").success).toBe(true);
    expect(segundosSchema.safeParse(3).success).toBe(true);
    expect(segundosSchema.safeParse(60).success).toBe(true);
  });
  it("rechaza lo demás", () => {
    for (const v of [2, 61, 4.5, "", "abc"]) expect(segundosSchema.safeParse(v).success).toBe(false);
  });
});

describe("opcionesSegundos", () => {
  it("ofrece la lista fija", () => {
    expect(opcionesSegundos(null)).toEqual([5, 8, 10, 15, 20, 30, 45, 60]);
    expect(opcionesSegundos(10)).toEqual([5, 8, 10, 15, 20, 30, 45, 60]);
  });
  it("agrega, en su lugar, el valor del anuncio si no está en la lista", () => {
    expect(opcionesSegundos(12)).toEqual([5, 8, 10, 12, 15, 20, 30, 45, 60]);
    expect(opcionesSegundos(3)).toEqual([3, 5, 8, 10, 15, 20, 30, 45, 60]);
  });
});

describe("traducir", () => {
  it("deja pasar el tope de 10, que ya viene dicho en español", () => {
    expect(traducir("Ya hay 10 anuncios. Quita uno para subir otro.")).toBe("Ya hay 10 anuncios. Quita uno para subir otro.");
  });
  it("un empleado sin permiso lee quién sí puede, no el rechazo de la base", () => {
    const esperado = "Solo el dueño o un administrador puede cambiar los anuncios.";
    expect(traducir('new row violates row-level security policy for table "anuncios_pantalla"')).toBe(esperado);
    expect(traducir("new row violates row-level security policy")).toBe(esperado); // así lo dice el almacén
    expect(traducir("permission denied for table anuncios_pantalla")).toBe(esperado);
    expect(traducir("Unauthorized")).toBe(esperado);
  });
  it("los rechazos del almacén dicen qué hacer", () => {
    expect(traducir("The object exceeded the maximum allowed size")).toMatch(/demasiado/i);
    expect(traducir("Payload too large")).toMatch(/demasiado/i);
    expect(traducir("mime type image/gif is not supported")).toMatch(/JPG, PNG o WebP/);
  });
  it("lo que no reconoce lo devuelve tal cual, para que lo traduzca la página", () => {
    expect(traducir("Failed to fetch")).toBe("Failed to fetch");
  });
});
