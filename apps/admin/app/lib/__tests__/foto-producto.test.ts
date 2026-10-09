import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fotos de productos y logo de la tienda, en el almacén público `productos` (0161). El almacén no
 * deja reescribir un archivo: cada imagen es una ruta nueva y la anterior se borra DESPUÉS de que la
 * fila ya apunta a la nueva. Lo que aquí se cuida es el orden y que nunca se borre un archivo ajeno.
 *
 * Mismo doble que `anuncios-pantalla-almacen.test.ts`, con una bitácora para comprobar el orden.
 */
const doble = vi.hoisted(() => {
  type Err = { message: string; code?: string };
  return {
    /** Todo lo que se le pidió al almacén y a la base, en orden. */
    pasos: [] as string[],
    subidas: [] as { almacen: string; ruta: string; opciones: Record<string, unknown> }[],
    escrituras: [] as { tabla: string; valores: Record<string, unknown>; filtro: Record<string, unknown> }[],
    quitadas: [] as string[],
    subidaError: null as Err | null,
    escrituraError: null as Err | null,
    /** La RLS que niega un UPDATE sin error: cero filas. */
    sinFilas: false,
    removeError: null as Err | null,
    removeLanza: false,
    reescalar: (async () => "data:image/jpeg;base64,/9j/4AAQ") as (archivo: File, o: { ladoMax?: number; maxBytes?: number }) => Promise<string>,
    reescalados: [] as { ladoMax?: number; maxBytes?: number }[],
    /** null = la sesión venció. */
    sesion: { tenantId: "t1" } as { tenantId: string | null } | null,
  };
});

vi.mock("../supabase", () => ({
  supabase: {
    from: (tabla: string) => ({
      update: (valores: Record<string, unknown>) => {
        const filtro: Record<string, unknown> = {};
        const q = {
          eq: (c: string, v: unknown) => { filtro[c] = v; return q; },
          select: () => q,
          then: (ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) => {
            doble.pasos.push(`escribir:${tabla}`);
            doble.escrituras.push({ tabla, valores, filtro });
            const r = doble.escrituraError ? { data: null, error: doble.escrituraError } : { data: doble.sinFilas ? [] : [{ id: "x" }], error: null };
            return Promise.resolve(r).then(ok, mal);
          },
        };
        return q;
      },
    }),
    storage: {
      from: (almacen: string) => ({
        upload: async (ruta: string, _blob: Blob, opciones: Record<string, unknown>) => {
          doble.pasos.push(`subir:${ruta}`);
          doble.subidas.push({ almacen, ruta, opciones });
          return { data: doble.subidaError ? null : {}, error: doble.subidaError };
        },
        remove: async (rutas: string[]) => {
          for (const r of rutas) { doble.pasos.push(`quitar:${r}`); doble.quitadas.push(r); }
          if (doble.removeLanza) throw new Error("sin red");
          return { data: null, error: doble.removeError };
        },
        getPublicUrl: (ruta: string) => ({ data: { publicUrl: `https://proyecto.test/storage/v1/object/public/${almacen}/${ruta}` } }),
      }),
    },
  },
  leerSesion: async () => doble.sesion,
}));

// La reducción usa el canvas del navegador; aquí basta un JPG ya reducido.
vi.mock("../imagen", () => ({
  reescalarImagen: (archivo: File, o: { ladoMax?: number; maxBytes?: number }) => { doble.reescalados.push(o); return doble.reescalar(archivo, o); },
}));

import { mensajeError } from "../errores";
import {
  FOTO_LADO_MAX, FOTO_MAX_BYTES, LOGO_LADO_MAX, ponerFotoProducto, ponerLogoTienda, quitarFotoProducto, quitarImagen, quitarLogoTienda, rutaDeUrl, subirImagen,
} from "../foto-producto";

const BASE = "https://proyecto.test/storage/v1/object/public/productos/";
const VIEJA = "t1/11111111-1111-4111-8111-111111111111.jpg";
const AJENA = "t2/22222222-2222-4222-8222-222222222222.jpg";
const RUTA_NUEVA = /^t1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
const SOLO_ADMIN = "Solo el dueño o un administrador puede cambiar esto.";
const jpg = () => new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });

let aviso: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  doble.pasos = [];
  doble.subidas = [];
  doble.escrituras = [];
  doble.quitadas = [];
  doble.subidaError = null;
  doble.escrituraError = null;
  doble.sinFilas = false;
  doble.removeError = null;
  doble.removeLanza = false;
  doble.reescalar = async () => "data:image/jpeg;base64,/9j/4AAQ";
  doble.reescalados = [];
  doble.sesion = { tenantId: "t1" };
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => aviso.mockRestore());

describe("rutaDeUrl", () => {
  it("de la URL pública de este almacén y este negocio saca la ruta", () => {
    expect(rutaDeUrl(BASE + VIEJA, "t1")).toBe(VIEJA);
    expect(rutaDeUrl(`${BASE}t1/11111111-1111-4111-8111-111111111111.webp`, "t1")).toBe("t1/11111111-1111-4111-8111-111111111111.webp");
  });
  it("sin URL no hay ruta", () => {
    expect(rutaDeUrl(null, "t1")).toBeNull();
    expect(rutaDeUrl("", "t1")).toBeNull();
  });
  it("la carpeta de otro negocio no se reconoce", () => {
    expect(rutaDeUrl(BASE + AJENA, "t1")).toBeNull();
  });
  it("otro almacén del mismo proyecto no se reconoce", () => {
    expect(rutaDeUrl(`https://proyecto.test/storage/v1/object/public/anuncios/${VIEJA}`, "t1")).toBeNull();
  });
  it("una URL externa no se reconoce, aunque termine igual", () => {
    expect(rutaDeUrl(`https://otro.test/storage/v1/object/public/productos/${VIEJA}`, "t1")).toBeNull();
    expect(rutaDeUrl("https://ejemplo.com/hamburguesa.jpg", "t1")).toBeNull();
    expect(rutaDeUrl("data:image/png;base64,AAAA", "t1")).toBeNull();
  });
  it("una ruta con `..` no se reconoce", () => {
    expect(rutaDeUrl(`${BASE}t1/../t2/22222222-2222-4222-8222-222222222222.jpg`, "t1")).toBeNull();
    expect(rutaDeUrl(`${BASE}t2/../${VIEJA}`, "t1")).toBeNull();
    expect(rutaDeUrl(`${BASE}t1/..%2Ft2%2F22222222-2222-4222-8222-222222222222.jpg`, "t1")).toBeNull();
  });
  it("con parámetros o ancla no se reconoce", () => {
    expect(rutaDeUrl(`${BASE}${VIEJA}?v=2`, "t1")).toBeNull();
    expect(rutaDeUrl(`${BASE}${VIEJA}#x`, "t1")).toBeNull();
  });
  it("un nombre de archivo con otra forma no se reconoce", () => {
    expect(rutaDeUrl(`${BASE}t1/logo.png`, "t1")).toBeNull();
    expect(rutaDeUrl(`${BASE}t1/11111111-1111-4111-8111-111111111111.gif`, "t1")).toBeNull();
    expect(rutaDeUrl(`${BASE}t1/11111111-1111-4111-8111-111111111111.JPG`, "t1")).toBeNull();
    expect(rutaDeUrl(`${BASE}t1/sub/11111111-1111-4111-8111-111111111111.jpg`, "t1")).toBeNull();
    expect(rutaDeUrl(`${BASE}t1/`, "t1")).toBeNull();
  });
  // Las dos dan null A PROPÓSITO. La URL la escribió este mismo módulo con `getPublicUrl` y el nombre
  // con `crypto.randomUUID()` (siempre minúsculas), y en el almacén `A.jpg` y `a.jpg` son archivos
  // distintos: una variante en mayúsculas no es algo que este módulo haya subido. Lo que no se
  // reconoce no se borra; lo peor que pasa es un archivo huérfano.
  it("con el servidor en mayúsculas no se reconoce", () => {
    expect(rutaDeUrl(`HTTPS://PROYECTO.TEST/storage/v1/object/public/productos/${VIEJA}`, "t1")).toBeNull();
    expect(rutaDeUrl(`https://Proyecto.Test/storage/v1/object/public/productos/${VIEJA}`, "t1")).toBeNull();
  });
  it("con el nombre del archivo en mayúsculas no se reconoce", () => {
    expect(rutaDeUrl(`${BASE}t1/AAAAAAAA-1111-4111-8111-111111111111.jpg`, "t1")).toBeNull();
    expect(rutaDeUrl(`${BASE}T1/11111111-1111-4111-8111-111111111111.jpg`, "t1")).toBeNull();
  });
  it("sin negocio en la sesión no reconoce nada", () => {
    expect(rutaDeUrl(`${BASE}/11111111-1111-4111-8111-111111111111.jpg`, "")).toBeNull();
  });
});

describe("subirImagen", () => {
  it("sube a <negocio>/<uuid>.<ext>, sin reescribir, y devuelve ruta y URL pública", async () => {
    const r = await subirImagen(jpg());
    expect(r.ruta).toMatch(RUTA_NUEVA);
    expect(r.url).toBe(BASE + r.ruta);
    expect(doble.subidas).toHaveLength(1);
    expect(doble.subidas[0]).toMatchObject({ almacen: "productos", ruta: r.ruta, opciones: { contentType: "image/jpeg", upsert: false } });
  });

  it("la extensión sale de lo que quedó tras reducir, no del archivo original", async () => {
    doble.reescalar = async () => "data:image/png;base64,iVBORw0KGgo=";
    const r = await subirImagen(new File([new Uint8Array([1])], "logo.webp", { type: "image/webp" }));
    expect(r.ruta).toMatch(/\.png$/);
    expect(doble.subidas[0]!.opciones.contentType).toBe("image/png");
  });

  it("reduce a 1200 px por lado y por debajo del tope del almacén", async () => {
    await subirImagen(jpg());
    expect(FOTO_LADO_MAX).toBe(1200);
    expect(FOTO_MAX_BYTES).toBeLessThanOrEqual(1_048_576);
    // `maxBytes` mide el texto en base64: 4 caracteres por cada 3 bytes del archivo.
    expect(doble.reescalados).toEqual([{ ladoMax: 1200, maxBytes: Math.floor((FOTO_MAX_BYTES * 4) / 3) }]);
  });

  it("si aun reducida pasa del tope, no se sube", async () => {
    doble.reescalar = async () => `data:image/jpeg;base64,${"A".repeat(Math.ceil((FOTO_MAX_BYTES + 3) / 3) * 4)}`;
    await expect(subirImagen(jpg())).rejects.toThrow(/pesa demasiado/);
    expect(doble.subidas).toHaveLength(0);
  });

  it.each([
    ["image/gif", "animada.gif"], ["application/pdf", "menu.pdf"], ["image/svg+xml", "logo.svg"], ["image/heic", "foto.heic"], ["", "sin-tipo"],
  ])("un archivo %s se rechaza antes de reducir y de subir", async (tipo, nombre) => {
    await expect(subirImagen(new File([new Uint8Array([1])], nombre, { type: tipo }))).rejects.toThrow("Ese archivo no se puede usar. Sube una imagen JPG, PNG o WebP.");
    expect(doble.reescalados).toHaveLength(0);
    expect(doble.pasos).toEqual([]);
  });

  it("si la imagen no se puede leer, lo dice claro y no sube nada", async () => {
    doble.reescalar = async () => { throw new Error("No se pudo leer la imagen."); };
    await expect(subirImagen(jpg())).rejects.toThrow("No se pudo leer la imagen. Prueba con otro archivo JPG, PNG o WebP.");
    expect(doble.pasos).toEqual([]);
  });

  it("el rechazo de la política del almacén se traduce", async () => {
    doble.subidaError = { message: "new row violates row-level security policy" };
    await expect(subirImagen(jpg())).rejects.toThrow("Solo el dueño o un administrador puede subir fotos.");
  });

  it("el rechazo del almacén por tamaño o por tipo también se dice en claro", async () => {
    doble.subidaError = { message: "The object exceeded the maximum allowed size" };
    await expect(subirImagen(jpg())).rejects.toThrow(/pesa demasiado/);
    doble.subidaError = { message: "mime type image/gif is not supported" };
    await expect(subirImagen(jpg())).rejects.toThrow("Ese archivo no se puede usar. Sube una imagen JPG, PNG o WebP.");
  });
});

describe("con la sesión vencida", () => {
  const VENCIDA = "Tu sesión expiró. Vuelve a iniciar sesión.";
  it.each([["sin sesión", null], ["sin negocio en la sesión", { tenantId: null }]])("%s: lo dice con palabras del dueño y no toca nada", async (_c, sesion) => {
    doble.sesion = sesion;
    await expect(subirImagen(jpg())).rejects.toThrow(VENCIDA);
    await expect(ponerFotoProducto("p1", jpg(), BASE + VIEJA)).rejects.toThrow(VENCIDA);
    await expect(quitarFotoProducto("p1", BASE + VIEJA)).rejects.toThrow(VENCIDA);
    await expect(ponerLogoTienda(jpg(), VIEJA)).rejects.toThrow(VENCIDA);
    await expect(quitarLogoTienda(VIEJA)).rejects.toThrow(VENCIDA);
    expect(doble.pasos).toEqual([]);
  });
  it("quitarImagen no lanza: no borra nada y lo deja en la consola", async () => {
    doble.sesion = null;
    await expect(quitarImagen(VIEJA)).resolves.toBeUndefined();
    expect(doble.quitadas).toEqual([]);
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe("quitarImagen", () => {
  it("quita un archivo de este negocio", async () => {
    await quitarImagen(VIEJA);
    expect(doble.quitadas).toEqual([VIEJA]);
    expect(aviso).not.toHaveBeenCalled();
  });
  it.each([AJENA, "t1/../t2/22222222-2222-4222-8222-222222222222.jpg", "t1/logo.png", `${VIEJA}?x=1`, ""])(
    "«%s» no se le pasa al almacén", async (ruta) => {
      await expect(quitarImagen(ruta)).resolves.toBeUndefined();
      expect(doble.quitadas).toEqual([]);
    });
  it("si el almacén rechaza o no hay red, no lanza y lo deja en la consola con la ruta", async () => {
    doble.removeError = { message: "Object not found" };
    await expect(quitarImagen(VIEJA)).resolves.toBeUndefined();
    doble.removeLanza = true;
    await expect(quitarImagen(VIEJA)).resolves.toBeUndefined();
    expect(aviso).toHaveBeenCalledTimes(2);
    const texto = aviso.mock.calls[0]!.map(String).join(" ");
    expect(texto).toContain(VIEJA);
    expect(texto).toContain("Object not found");
  });
});

describe("ponerFotoProducto", () => {
  it("al reemplazar: sube la nueva, escribe la fila y DESPUÉS borra la anterior", async () => {
    const url = await ponerFotoProducto("p1", jpg(), BASE + VIEJA);
    const nueva = doble.subidas[0]!.ruta;
    expect(nueva).toMatch(RUTA_NUEVA);
    expect(url).toBe(BASE + nueva);
    expect(doble.pasos).toEqual([`subir:${nueva}`, "escribir:productos", `quitar:${VIEJA}`]);
  });

  it("escribe solo `imagen_url` (la URL pública completa) y solo en ese producto", async () => {
    const url = await ponerFotoProducto("p1", jpg(), null);
    expect(doble.escrituras).toEqual([{ tabla: "productos", valores: { imagen_url: url }, filtro: { id: "p1" } }]);
  });

  it("la primera foto no borra nada", async () => {
    await ponerFotoProducto("p1", jpg(), null);
    expect(doble.quitadas).toEqual([]);
  });

  it("si la fila no entra, se borra la recién subida y la anterior sigue en su lugar", async () => {
    doble.escrituraError = { message: "Tu rol no puede modificar el catálogo (productos).", code: "42501" };
    await expect(ponerFotoProducto("p1", jpg(), BASE + VIEJA)).rejects.toThrow(SOLO_ADMIN);
    expect(doble.quitadas).toEqual([doble.subidas[0]!.ruta]);
    expect(doble.quitadas).not.toContain(VIEJA);
  });

  it("si la escritura no afecta ninguna fila, dice quién puede y también limpia la nueva", async () => {
    doble.sinFilas = true;
    await expect(ponerFotoProducto("p1", jpg(), BASE + VIEJA)).rejects.toThrow(SOLO_ADMIN);
    expect(doble.quitadas).toEqual([doble.subidas[0]!.ruta]);
  });

  it("si la subida falla, no se escribe ni se borra nada", async () => {
    doble.subidaError = { message: "new row violates row-level security policy" };
    await expect(ponerFotoProducto("p1", jpg(), BASE + VIEJA)).rejects.toThrow("Solo el dueño o un administrador puede subir fotos.");
    expect(doble.escrituras).toEqual([]);
    expect(doble.quitadas).toEqual([]);
  });

  it("si no se puede borrar la anterior, la foto queda puesta y se avisa en la consola", async () => {
    doble.removeError = { message: "Object not found" };
    await expect(ponerFotoProducto("p1", jpg(), BASE + VIEJA)).resolves.toMatch(/^https:/);
    doble.removeLanza = true;
    await expect(ponerFotoProducto("p1", jpg(), BASE + VIEJA)).resolves.toMatch(/^https:/);
    expect(aviso).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["de otro negocio", BASE + AJENA],
    ["externa", "https://ejemplo.com/hamburguesa.jpg"],
    ["de otro almacén", `https://proyecto.test/storage/v1/object/public/anuncios/${VIEJA}`],
    ["con `..`", `${BASE}t1/../${AJENA}`],
    ["con parámetros", `${BASE}${VIEJA}?v=1`],
  ])("una foto anterior %s nunca se intenta borrar", async (_caso, anterior) => {
    await ponerFotoProducto("p1", jpg(), anterior);
    expect(doble.quitadas).toEqual([]);
  });
});

describe("quitarFotoProducto", () => {
  it("deja el producto sin foto y después borra el archivo", async () => {
    await quitarFotoProducto("p1", BASE + VIEJA);
    expect(doble.escrituras).toEqual([{ tabla: "productos", valores: { imagen_url: null }, filtro: { id: "p1" } }]);
    expect(doble.pasos).toEqual(["escribir:productos", `quitar:${VIEJA}`]);
  });
  it("si la fila no entra, el archivo no se toca", async () => {
    doble.sinFilas = true;
    await expect(quitarFotoProducto("p1", BASE + VIEJA)).rejects.toThrow(SOLO_ADMIN);
    doble.sinFilas = false;
    doble.escrituraError = { message: "permission denied for table productos" };
    await expect(quitarFotoProducto("p1", BASE + VIEJA)).rejects.toThrow(SOLO_ADMIN);
    expect(doble.quitadas).toEqual([]);
  });
  it("una foto externa se quita del producto sin pedirle nada al almacén", async () => {
    await quitarFotoProducto("p1", "https://ejemplo.com/hamburguesa.jpg");
    expect(doble.escrituras).toHaveLength(1);
    expect(doble.quitadas).toEqual([]);
  });
  it("si el archivo no se puede borrar, no falla", async () => {
    doble.removeError = { message: "Object not found" };
    await expect(quitarFotoProducto("p1", BASE + VIEJA)).resolves.toBeUndefined();
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe("ponerLogoTienda", () => {
  it("sube, escribe la RUTA en la tienda de este negocio y después borra el logo anterior", async () => {
    const ruta = await ponerLogoTienda(jpg(), VIEJA);
    expect(ruta).toMatch(RUTA_NUEVA);
    expect(doble.pasos).toEqual([`subir:${ruta}`, "escribir:tienda_config", `quitar:${VIEJA}`]);
    expect(doble.escrituras[0]).toMatchObject({ tabla: "tienda_config", valores: { logo_ruta: ruta }, filtro: { tenant_id: "t1" } });
    // Solo el logo: la dirección, el color y lo demás no viajan.
    expect(Object.keys(doble.escrituras[0]!.valores).sort()).toEqual(["logo_ruta", "updated_at"]);
  });
  it("si la fila no entra, se borra el recién subido y el anterior sigue", async () => {
    doble.sinFilas = true;
    await expect(ponerLogoTienda(jpg(), VIEJA)).rejects.toThrow(SOLO_ADMIN);
    expect(doble.quitadas).toEqual([doble.subidas[0]!.ruta]);
    doble.sinFilas = false;
    doble.quitadas = [];
    doble.escrituraError = { message: 'new row for relation "tienda_config" violates check constraint "tienda_config_logo_ruta_check"' };
    await expect(ponerLogoTienda(jpg(), VIEJA)).rejects.toThrow(/^No se pudo guardar el logo\.$/);
    expect(doble.quitadas).toEqual([doble.subidas[1]!.ruta]);
  });
  it("sin internet al escribir la fila, el dueño ve el mismo aviso de conexión que con la foto", async () => {
    const CONEXION = "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
    doble.escrituraError = { message: "TypeError: Failed to fetch" };
    // Lo que pinta la página es `mensajeError(e, …)`: aquí se comprueba el texto final, no el crudo.
    const logo = await ponerLogoTienda(jpg(), VIEJA).catch((e: unknown) => e);
    expect(mensajeError(logo, "No se pudo subir el logo")).toBe(CONEXION);
    const quitar = await quitarLogoTienda(VIEJA).catch((e: unknown) => e);
    expect(mensajeError(quitar, "No se pudo quitar el logo")).toBe(CONEXION);
    const foto = await ponerFotoProducto("p1", jpg(), null).catch((e: unknown) => e);
    expect(mensajeError(foto, "No se pudo subir la foto")).toBe(CONEXION);
  });
  it("el logo se reduce a 800 px por lado (un PNG transparente así sí cabe); la foto sigue en 1200", async () => {
    await ponerLogoTienda(jpg(), null);
    await ponerFotoProducto("p1", jpg(), null);
    expect(LOGO_LADO_MAX).toBe(800);
    expect(doble.reescalados.map((o) => o.ladoMax)).toEqual([800, 1200]);
  });
  it("una ruta anterior ajena o mal formada nunca se intenta borrar", async () => {
    await ponerLogoTienda(jpg(), AJENA);
    await ponerLogoTienda(jpg(), "t1/../t2/x.jpg");
    await ponerLogoTienda(jpg(), null);
    expect(doble.quitadas).toEqual([]);
  });
  it("si no se puede borrar el anterior, el logo queda puesto", async () => {
    doble.removeLanza = true;
    await expect(ponerLogoTienda(jpg(), VIEJA)).resolves.toMatch(RUTA_NUEVA);
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe("lo que no se reconoce nunca llega crudo al dueño", () => {
  const SUBIR = "No se pudo subir la imagen. Inténtalo de nuevo.";
  const QUITAR = "No se pudo quitar la imagen. Inténtalo de nuevo.";
  /** Lo que acaba pintando la pantalla: el error pasado por `mensajeError`, como hacen la página y la ficha. */
  const enPantalla = async (p: Promise<unknown>): Promise<string> =>
    mensajeError(await p.then(() => new Error("no falló"), (e: unknown) => e), "texto de quien llama");
  const enConsola = () => aviso.mock.calls.flat().map(String).join(" ");

  it.each(["database error, code: 42P10", "Bucket not found"])("una subida que falla con «%s»: frase genérica, y el crudo a la consola", async (crudo) => {
    doble.subidaError = { message: crudo };
    expect(await enPantalla(subirImagen(jpg()))).toBe(SUBIR);
    expect(await enPantalla(ponerFotoProducto("p1", jpg(), BASE + VIEJA))).toBe(SUBIR);
    expect(await enPantalla(ponerLogoTienda(jpg(), VIEJA))).toBe(SUBIR);
    expect(enConsola()).toContain(crudo);
    expect(doble.escrituras).toEqual([]);
    expect(doble.quitadas).toEqual([]);
  });

  it("si la reducción falla por algo que no se conoce, tampoco sale crudo", async () => {
    doble.reescalar = async () => { throw new Error("SecurityError: The canvas has been tainted"); };
    expect(await enPantalla(subirImagen(jpg()))).toBe(SUBIR);
    expect(enConsola()).toContain("tainted");
    expect(doble.pasos).toEqual([]);
  });

  it("la escritura de la fila con un mensaje desconocido: «No se pudo guardar…», nunca el texto de la base", async () => {
    const crudo = 'record "new" has no field "imagen_url"';
    doble.escrituraError = { message: crudo, code: "42703" };
    expect(await enPantalla(ponerFotoProducto("p1", jpg(), BASE + VIEJA))).toBe("No se pudo guardar la foto.");
    expect(await enPantalla(ponerLogoTienda(jpg(), VIEJA))).toBe("No se pudo guardar el logo.");
    expect(enConsola()).toContain(crudo);
    // La recién subida se limpia en los dos casos; la anterior sigue.
    expect(doble.quitadas).toEqual(doble.subidas.map((s) => s.ruta));
  });

  it("al quitar, un error desconocido de la fila dice que no se pudo quitar y no toca el archivo", async () => {
    const crudo = "database error, code: 42P10";
    doble.escrituraError = { message: crudo };
    expect(await enPantalla(quitarFotoProducto("p1", BASE + VIEJA))).toBe(QUITAR);
    expect(await enPantalla(quitarLogoTienda(VIEJA))).toBe(QUITAR);
    expect(enConsola()).toContain(crudo);
    expect(doble.quitadas).toEqual([]);
  });

  it("sin internet o con la sesión vencida, en la subida y en la fila, sale la frase de siempre", async () => {
    const CONEXION = "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
    const VENCIDA = "Tu sesión expiró. Vuelve a iniciar sesión.";
    doble.subidaError = { message: "TypeError: Failed to fetch" };
    expect(await enPantalla(ponerFotoProducto("p1", jpg(), null))).toBe(CONEXION);
    doble.subidaError = { message: "jwt expired" };
    expect(await enPantalla(ponerLogoTienda(jpg(), null))).toBe(VENCIDA);
    doble.subidaError = null;
    doble.escrituraError = { message: "JWT expired", code: "PGRST301" };
    expect(await enPantalla(ponerFotoProducto("p1", jpg(), null))).toBe(VENCIDA);
    expect(await enPantalla(quitarLogoTienda(VIEJA))).toBe(VENCIDA);
  });

  it("la guarda del catálogo (42501) se dice como en el resto de la tienda", async () => {
    doble.escrituraError = { message: "cualquier cosa", code: "42501" };
    expect(await enPantalla(ponerFotoProducto("p1", jpg(), null))).toBe(SOLO_ADMIN);
  });
});

describe("quitarLogoTienda", () => {
  it("deja la tienda sin logo y después borra el archivo", async () => {
    await quitarLogoTienda(VIEJA);
    expect(doble.escrituras[0]).toMatchObject({ tabla: "tienda_config", valores: { logo_ruta: null }, filtro: { tenant_id: "t1" } });
    expect(doble.pasos).toEqual(["escribir:tienda_config", `quitar:${VIEJA}`]);
  });
  it("si la fila no entra, el archivo no se toca", async () => {
    doble.sinFilas = true;
    await expect(quitarLogoTienda(VIEJA)).rejects.toThrow(SOLO_ADMIN);
    expect(doble.quitadas).toEqual([]);
  });
});
