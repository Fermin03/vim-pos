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

/**
 * Nunca lanza. Devuelve la lista que da la caja (vacía = el negocio no tiene anuncios) o `null`
 * si la lectura FALLÓ: sin escritorio, sin red, un error o una respuesta rara. No es lo mismo:
 * con `null` la pantalla se queda con la lista que ya tenía, en vez de quitar un carrusel que
 * funcionaba por una lectura que no salió.
 */
export async function leerAnuncios(pedir: typeof fetch = fetch): Promise<ListaAnuncios | null> {
  try {
    const r = await pedir("/__anuncios", { cache: "no-store" });
    if (!r.ok) return null;
    const p = esquema.safeParse(await r.json());
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

/**
 * ¿Se le pide la lista a la caja ahora? PURA. Solo en reposo y solo con el negocio conocido.
 *
 * Al desvincular la caja el negocio se olvida, pero su servidor local puede seguir dando la lista
 * del negocio ANTERIOR hasta que la base se reemplace: mientras no se sepa de quién es la caja
 * (`null`, o `undefined` = todavía no se ha mirado), no se lee, o volverían sus anuncios.
 */
export function puedeLeerAnuncios(fase: string, negocio: object | null | undefined): boolean {
  return fase === "reposo" && negocio != null;
}

/**
 * ¿Reposo enseña el carrusel? PURA. Sin negocio conocido no hay anuncios aunque la lista siga en
 * memoria: los anuncios de un negocio no salen en el siguiente, igual que su logo.
 */
export function seEnsenanAnuncios(lista: ListaAnuncios, sinImagenes: boolean, negocio: object | null | undefined): boolean {
  return negocio != null && !sinImagenes && lista.anuncios.length > 0;
}

/**
 * La lista con la que se queda la pantalla después de una lectura. PURA.
 * - La lectura falló (`null`): la que tenía.
 * - Vino lo mismo: la que tenía, EL MISMO objeto, para que el carrusel no se reinicie.
 * - Vino otra, aunque sea vacía (el dueño quitó todos los anuncios): la nueva.
 */
export function listaTrasLeer(actual: ListaAnuncios, leida: ListaAnuncios | null): ListaAnuncios {
  if (leida === null || mismaLista(actual, leida)) return actual;
  return leida;
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

/**
 * Si las imágenes de la lista se pueden enseñar.
 * - `bien`: manda el carrusel (y él salta las que no carguen).
 * - `rotas`: ninguna cargó; reposo enseña el logo.
 * - `probando`: se están precargando FUERA de pantalla; mientras, sigue el logo.
 */
export type EstadoImagenes = "bien" | "rotas" | "probando";

/**
 * Qué pasa con las imágenes rotas tras una lectura de la lista. PURA.
 *
 * Se reintentan solo si la lista cambió o en la relectura de cada 5 minutos (`porReloj`); la
 * lectura de volver a reposo, con la misma lista, NO. Antes cada lectura buena las daba por
 * buenas: entre cliente y cliente se montaba un carrusel vacío un instante y volvía el logo,
 * un parpadeo en cada vuelta a reposo.
 */
export function imagenesTrasLeer(estado: EstadoImagenes, s: { cambioLista: boolean; porReloj: boolean }): EstadoImagenes {
  if (estado === "rotas" && (s.cambioLista || s.porReloj)) return "probando";
  return estado;
}

/**
 * El resultado de la precarga fuera de pantalla. PURA. El carrusel vuelve solo cuando al menos
 * una imagen ya cargó: montarlo antes para ver si alguna sirve es enseñar un cuadro vacío.
 */
export function imagenesTrasProbar(cargoAlguna: boolean): EstadoImagenes {
  return cargoAlguna ? "bien" : "rotas";
}

export type CapaCarrusel = { anuncio: Anuncio; fundiendo: boolean };

/**
 * Las imágenes que se dibujan, de abajo arriba, y cuál lleva la animación de entrada. PURA.
 *
 * `asentada` es la url de la imagen cuyo fundido ya tuvo su tiempo. Desde ahí la imagen en
 * pantalla se dibuja SIN animación, es decir, opaca: su visibilidad no puede depender de que la
 * animación avance. Con las animaciones detenidas (ventana tapada, pestaña en segundo plano), la
 * que entraba se quedaba en opacidad 0 hasta que llegaba la siguiente, y cada anuncio parecía
 * durar el tiempo de la que seguía.
 */
export function capasCarrusel(cuadro: { actual: Anuncio | null; anterior: Anuncio | null }, asentada: string | null): CapaCarrusel[] {
  const { actual, anterior } = cuadro;
  const capas: CapaCarrusel[] = [];
  if (anterior && anterior.url !== actual?.url) capas.push({ anuncio: anterior, fundiendo: false });
  if (actual) capas.push({ anuncio: actual, fundiendo: actual.url !== asentada });
  return capas;
}

/**
 * Si el carrusel debe tener debajo el reposo sin anuncios (logo, nombre o marca). PURA.
 *
 * El carrusel arranca sin imagen cada vez que se monta (al volver a reposo, al terminar la prueba
 * de imágenes) y tarda en precargar la primera: sin esto, entre el logo de antes y el primer
 * anuncio la pantalla se veía vacía. El reposo se queda hasta que la primera imagen termina su
 * fundido (si se quitara al entrar, el fundido se haría sobre un fondo en blanco). Desde la
 * segunda imagen ya no vuelve: cada una tapa por completo a la anterior.
 */
export function fondoDelCarrusel(cuadro: { actual: Anuncio | null; anterior: Anuncio | null }, asentada: string | null): boolean {
  if (cuadro.anterior) return false;
  return cuadro.actual === null || cuadro.actual.url !== asentada;
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
 *
 * `transcurridoMs` es lo que lleva en pantalla. Al llegar una lista nueva el carrusel vuelve a
 * preguntar, y sin esto la imagen que se veía empezaba su tiempo de cero: le queda solo lo que le
 * falta de su tiempo (el de la lista nueva, si el dueño lo cambió), y si ya se pasó, cambia ya.
 */
export function pasoSiguiente(lista: ListaAnuncios, enPantalla: Anuncio | null, rotos: ReadonlySet<string>, transcurridoMs = 0): PasoCarrusel {
  const vigente = enPantalla && !rotos.has(enPantalla.id)
    ? lista.anuncios.find((a) => a.id === enPantalla.id && a.url === enPantalla.url) ?? null
    : null;
  const id = siguienteAnuncio(lista.anuncios.map((a) => a.id), enPantalla?.id ?? null, rotos);
  const anuncio = lista.anuncios.find((a) => a.id === id);
  if (!anuncio) return { hacer: "nada" };
  if (vigente && anuncio.id === vigente.id) return { hacer: "quedarse" };
  // Los segundos son los de la lista vigente: si el dueño cambió el tiempo, manda el nuevo.
  return { hacer: "cambiar", anuncio, enMs: vigente ? Math.max(0, vigente.segundos * 1000 - transcurridoMs) : 0 };
}
