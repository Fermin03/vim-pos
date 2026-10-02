import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Quitar una imagen del almacén `anuncios` (0150). supabase-js no lanza cuando el almacén rechaza:
 * contesta `{ error }`. Un `.catch(() => {})` nunca se enteraba y el fallo se perdía en silencio.
 * Al dueño no se le dice (una imagen sin fila nadie la enseña), pero queda en la consola con contexto.
 *
 * `supabase` es un singleton (mismo patrón que modulos.test.ts): el doble sustituye el módulo entero.
 * Todo vive dentro de `vi.hoisted` porque las fábricas de `vi.mock` corren antes que el resto del archivo.
 */
const doble = vi.hoisted(() => {
  type Resultado = { data: unknown; error: { message: string } | null };
  /** Una consulta de PostgREST encadenable que, al esperarla, da `resultado`. */
  function consulta(resultado: () => Resultado) {
    const q = {
      select: () => q, is: () => q, order: () => q, limit: () => q, eq: () => q,
      then: (ok: (r: Resultado) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, mal),
    };
    return q;
  }
  return {
    consulta,
    insertError: null as { message: string } | null,
    removeError: null as { message: string } | null,
    removeLanza: false,
    quitadas: [] as string[][],
  };
});

vi.mock("../supabase", () => ({
  supabase: {
    from: () => ({
      select: () => doble.consulta(() => ({ data: [], error: null })),
      update: () => doble.consulta(() => ({ data: [{ id: "a1" }], error: null })),
      insert: async () => ({ error: doble.insertError }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ data: {}, error: null }),
        remove: async (rutas: string[]) => {
          doble.quitadas.push(rutas);
          if (doble.removeLanza) throw new Error("sin red");
          return { data: null, error: doble.removeError };
        },
        getPublicUrl: (ruta: string) => ({ data: { publicUrl: `https://x/${ruta}` } }),
      }),
    },
  },
  leerSesion: async () => ({ email: "d@d.com", userId: "u1", tenantId: "t1", tipoIdentidad: "ADMIN_WEB" }),
}));

// La reducción de la imagen usa el canvas del navegador; aquí basta un JPG ya reducido.
vi.mock("../imagen", () => ({ reescalarImagen: async () => "data:image/jpeg;base64,/9j/4AAQ" }));

import { eliminarAnuncio, subirAnuncio, type Anuncio } from "../anuncios-pantalla";

const ANUNCIO: Anuncio = { id: "a1", ruta: "t1/a1.jpg", url: "https://x/t1/a1.jpg", orden: 0, activo: true, segundos: null };
let aviso: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  doble.insertError = null;
  doble.removeError = null;
  doble.removeLanza = false;
  doble.quitadas = [];
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => aviso.mockRestore());

describe("eliminarAnuncio", () => {
  it("si el almacén rechaza quitar la imagen, lo avisa en la consola con la ruta y no falla", async () => {
    doble.removeError = { message: "Object not found" };
    await expect(eliminarAnuncio(ANUNCIO)).resolves.toBeUndefined();
    expect(doble.quitadas).toEqual([["t1/a1.jpg"]]);
    expect(aviso).toHaveBeenCalledTimes(1);
    const texto = aviso.mock.calls[0]!.map(String).join(" ");
    expect(texto).toContain("t1/a1.jpg");
    expect(texto).toContain("Object not found");
  });

  it("si quitar la imagen lanza (sin red), tampoco falla y también lo avisa", async () => {
    doble.removeLanza = true;
    await expect(eliminarAnuncio(ANUNCIO)).resolves.toBeUndefined();
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("si el almacén la quita, no avisa nada", async () => {
    await eliminarAnuncio(ANUNCIO);
    expect(aviso).not.toHaveBeenCalled();
  });
});

describe("subirAnuncio", () => {
  const archivo = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });

  it("si la fila no entra y quitar la imagen huérfana falla, el dueño ve el error de la fila y la consola el del almacén", async () => {
    doble.insertError = { message: "Ya hay 10 anuncios" };
    doble.removeError = { message: "Bucket not found" };
    await expect(subirAnuncio(archivo)).rejects.toThrow("Ya hay 10 anuncios. Quita uno para subir otro.");
    expect(doble.quitadas).toHaveLength(1);
    expect(doble.quitadas[0]![0]).toMatch(/^t1\/[0-9a-f-]{36}\.jpg$/);
    expect(aviso).toHaveBeenCalledTimes(1);
    const texto = aviso.mock.calls[0]!.map(String).join(" ");
    expect(texto).toContain("Bucket not found");
    expect(texto).toContain(doble.quitadas[0]![0]);
  });
});
