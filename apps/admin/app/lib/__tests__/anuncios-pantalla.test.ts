import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `supabase` es un singleton: el doble sustituye el módulo entero (mismo patrón que modulos.test.ts).
 * Cada cadena (`select().is().order()...`) es "thenable": se puede encadenar lo que sea y al
 * esperarla contesta lo que el caso dejó fijado en `doble`.
 */
const doble = vi.hoisted(() => ({
  conteo: 0 as number | null,
  filasUpdate: [] as unknown[] | null,
  errUpdate: null as { message: string } | null,
  errInsert: null as { message: string } | null,
  errRpc: null as { code?: string; message: string } | null,
  upload: vi.fn(async (..._a: unknown[]) => ({ error: null as { message: string } | null })),
  remove: vi.fn(async (..._a: unknown[]) => ({ error: null as { message: string } | null })),
  rpc: vi.fn(async (..._a: unknown[]) => ({ error: null as { code?: string; message: string } | null })),
}));

vi.mock("../supabase", () => {
  type Cadena = { is: () => Cadena; order: () => Cadena; limit: () => Cadena; eq: () => Cadena; select: () => Cadena; then: PromiseLike<unknown>["then"] };
  const cadena = (resolver: () => unknown): Cadena => {
    const c: Cadena = {
      is: () => c, order: () => c, limit: () => c, eq: () => c, select: () => c,
      then: (ok, ko) => Promise.resolve(resolver()).then(ok, ko),
    };
    return c;
  };
  return {
    supabase: {
      from: () => ({
        select: (_cols: string, opts?: { head?: boolean }) =>
          cadena(() => (opts?.head ? { count: doble.conteo, error: null } : { data: [{ orden: 20 }], error: null })),
        update: () => cadena(() => ({ data: doble.filasUpdate, error: doble.errUpdate })),
        insert: async () => ({ error: doble.errInsert }),
      }),
      storage: { from: () => ({ upload: doble.upload, remove: doble.remove, getPublicUrl: () => ({ data: { publicUrl: "u" } }) }) },
      rpc: (...a: unknown[]) => doble.rpc(...a).then((r) => ({ data: null, error: doble.errRpc ?? r.error })),
    },
    leerSesion: async () => ({ email: "d@d.com", userId: "u1", tenantId: "t1", tipoIdentidad: "ADMIN_WEB" }),
  };
});
vi.mock("../imagen", () => ({ reescalarImagen: vi.fn(async () => "data:image/jpeg;base64,/9j/4AAQ") }));

import {
  ANUNCIO_MAX_BYTES,
  dataUriAArchivo,
  eliminarAnuncio,
  moverAnuncio,
  opcionesSegundos,
  ordenTrasMover,
  segundosSchema,
  setActivoAnuncio,
  setSegundosAnuncio,
  subirAnuncio,
  traducir,
  type Anuncio,
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
  it("el tope de 10 sale siempre con el mismo texto, venga como venga redactado", () => {
    const esperado = "Ya hay 10 anuncios. Quita uno para subir otro.";
    expect(traducir(esperado)).toBe(esperado);
    // Una redacción distinta: solo la rama del tope la convierte; sin ella saldría tal cual.
    expect(traducir("P0001: Ya hay 10 anuncios activos en este negocio")).toBe(esperado);
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

const ESPERA_ADMIN = "Solo el dueño o un administrador puede cambiar los anuncios.";
const anuncio = (id: string, orden: number): Anuncio => ({ id, ruta: `t1/${id}.jpg`, url: "u", orden, activo: true, segundos: null });
const archivo = () => new File(["x"], "a.png", { type: "image/png" });

beforeEach(() => {
  doble.conteo = 0;
  doble.filasUpdate = [{ id: "a" }];
  doble.errUpdate = null;
  doble.errInsert = null;
  doble.errRpc = null;
  doble.upload.mockClear();
  doble.remove.mockClear();
  doble.rpc.mockClear();
});

describe("subirAnuncio: tope antes de subir", () => {
  it("con 10 anuncios vivos avisa y no toca el almacén", async () => {
    doble.conteo = 10;
    await expect(subirAnuncio(archivo())).rejects.toThrow("Ya hay 10 anuncios. Quita uno para subir otro.");
    expect(doble.upload).not.toHaveBeenCalled();
    expect(doble.remove).not.toHaveBeenCalled();
  });
  it("con 9 sube la imagen", async () => {
    doble.conteo = 9;
    await subirAnuncio(archivo());
    expect(doble.upload).toHaveBeenCalledTimes(1);
  });
  it("si otra pestaña llenó la lista a mitad (la base rechaza la fila), la imagen subida se quita", async () => {
    doble.conteo = 9;
    doble.errInsert = { message: "Ya hay 10 anuncios" };
    await expect(subirAnuncio(archivo())).rejects.toThrow("Ya hay 10 anuncios. Quita uno para subir otro.");
    expect(doble.remove).toHaveBeenCalledTimes(1);
  });
});

describe("cambios de un anuncio: el UPDATE que no encuentra fila (quien no es dueño ni admin)", () => {
  const casos: [string, () => Promise<void>][] = [
    ["setActivoAnuncio", () => setActivoAnuncio("a", false)],
    ["setSegundosAnuncio", () => setSegundosAnuncio("a", 10)],
    ["eliminarAnuncio", () => eliminarAnuncio(anuncio("a", 0))],
  ];
  for (const [nombre, llamar] of casos) {
    it(`${nombre}: cero filas = mensaje de permiso, sin error de la base`, async () => {
      doble.filasUpdate = [];
      await expect(llamar()).rejects.toThrow(ESPERA_ADMIN);
    });
    it(`${nombre}: una fila = listo`, async () => {
      doble.filasUpdate = [{ id: "a" }];
      await expect(llamar()).resolves.toBeUndefined();
    });
  }
  it("eliminarAnuncio con cero filas no toca el almacén", async () => {
    doble.filasUpdate = [];
    await expect(eliminarAnuncio(anuncio("a", 0))).rejects.toThrow();
    expect(doble.remove).not.toHaveBeenCalled();
  });
});

describe("moverAnuncio: un solo reordenar_anuncios", () => {
  const lista = [anuncio("a", 0), anuncio("b", 10), anuncio("c", 20)];
  it("manda la lista completa en el nuevo orden, en una llamada", async () => {
    await moverAnuncio(lista, "b", "arriba");
    expect(doble.rpc).toHaveBeenCalledTimes(1);
    expect(doble.rpc).toHaveBeenCalledWith("reordenar_anuncios", { p_ids: ["b", "a", "c"] });
  });
  it("en un extremo no cambia nada y no llama", async () => {
    await moverAnuncio(lista, "a", "arriba");
    expect(doble.rpc).not.toHaveBeenCalled();
  });
  it("sin permiso (42501) dice quién sí puede", async () => {
    doble.errRpc = { code: "42501", message: "lo que sea" };
    await expect(moverAnuncio(lista, "b", "abajo")).rejects.toThrow(ESPERA_ADMIN);
  });
  it("lista cambiada (P0002) pide recargar", async () => {
    doble.errRpc = { code: "P0002", message: "lo que sea" };
    await expect(moverAnuncio(lista, "b", "abajo")).rejects.toThrow("La lista de anuncios cambió. Recarga la página.");
  });
});
