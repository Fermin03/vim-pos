/**
 * Anuncios de la pantalla del cliente: la lista que la caja ya tiene en disco, y qué imagen sigue.
 *
 * La pantalla no habla con la nube: le pide la lista al servidor local de la caja, que solo
 * incluye las imágenes ya descargadas. Por eso el carrusel funciona sin internet.
 */
import { z } from "zod";

const esquema = z.object({
  segundos: z.number().int().min(3).max(60),
  anuncios: z.array(z.object({
    id: z.string().min(1),
    // Solo lo que sirve la propia caja: una dirección externa no se pinta en el monitor del cliente.
    url: z.string().regex(/^\/__anuncios\/[0-9a-f-]{36}\.(jpg|png|webp)$/),
    // Lo que dura ESTE anuncio: la caja ya resolvió si es el suyo o el general.
    segundos: z.number().int().min(3).max(60),
  })),
});

export type ListaAnuncios = z.infer<typeof esquema>;
export type Anuncio = ListaAnuncios["anuncios"][number];
export const LISTA_VACIA: ListaAnuncios = { segundos: 8, anuncios: [] };

/** Nunca lanza: sin escritorio, sin anuncios o con una respuesta rara, la pantalla enseña el logo. */
export async function leerAnuncios(pedir: typeof fetch = fetch): Promise<ListaAnuncios> {
  try {
    const r = await pedir("/__anuncios", { cache: "no-store" });
    if (!r.ok) return LISTA_VACIA;
    const p = esquema.safeParse(await r.json());
    return p.success ? p.data : LISTA_VACIA;
  } catch {
    return LISTA_VACIA;
  }
}

/**
 * El anuncio que toca después de `actual`, saltándose los que no cargaron. PURA.
 * null = no hay ninguno que se pueda enseñar.
 */
export function siguienteAnuncio(ids: string[], actual: string | null, rotos: ReadonlySet<string>): string | null {
  const buenos = ids.filter((id) => !rotos.has(id));
  if (buenos.length === 0) return null;
  const desde = actual === null ? -1 : ids.indexOf(actual);
  for (let paso = 1; paso <= ids.length; paso++) {
    const candidato = ids[(desde + paso) % ids.length]!;
    if (!rotos.has(candidato)) return candidato;
  }
  return buenos[0]!;
}

/**
 * ¿La lista recién leída enseña lo mismo que la que ya corre? PURA. La pantalla vuelve a pedir la
 * lista cada 5 minutos; si no cambió, el carrusel sigue donde iba, sin reiniciarse ni parpadear.
 * El `segundos` general no cuenta: cada anuncio ya trae el suyo, que es el que se usa.
 */
export function mismaLista(a: ListaAnuncios, b: ListaAnuncios): boolean {
  return a.anuncios.length === b.anuncios.length && a.anuncios.every((x, i) => {
    const y = b.anuncios[i]!;
    return x.id === y.id && x.url === y.url && x.segundos === y.segundos;
  });
}

export type PasoCarrusel =
  /** Ninguna imagen se puede enseñar: la pantalla vuelve al logo. */
  | { hacer: "nada" }
  /** La que está es la única buena: se queda, sin temporizador. */
  | { hacer: "quedarse" }
  /** Precargar `anuncio` y enseñarlo dentro de `enMs` (0 = en cuanto cargue). */
  | { hacer: "cambiar"; anuncio: Anuncio; enMs: number };

/**
 * Qué hace el carrusel con la imagen que tiene en pantalla. PURA: todas las decisiones del
 * componente viven aquí, porque el componente no tiene pruebas.
 *
 * `enPantalla` es la imagen que se ve (null al empezar). Si ya no viene en la lista —la quitaron,
 * o cambió su archivo— o si se rompió, no se le espera: se pasa a otra en cuanto cargue.
 */
export function pasoSiguiente(lista: ListaAnuncios, enPantalla: Anuncio | null, rotos: ReadonlySet<string>): PasoCarrusel {
  const vigente = enPantalla && !rotos.has(enPantalla.id)
    ? lista.anuncios.find((a) => a.id === enPantalla.id && a.url === enPantalla.url) ?? null
    : null;
  const id = siguienteAnuncio(lista.anuncios.map((a) => a.id), enPantalla?.id ?? null, rotos);
  const anuncio = lista.anuncios.find((a) => a.id === id);
  if (!anuncio) return { hacer: "nada" };
  if (vigente && anuncio.id === vigente.id) return { hacer: "quedarse" };
  // Los segundos son los de la lista vigente: si el dueño cambió el tiempo, manda el nuevo.
  return { hacer: "cambiar", anuncio, enMs: vigente ? vigente.segundos * 1000 : 0 };
}
