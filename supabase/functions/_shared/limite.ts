// Límites de tasa de las Edge Functions públicas, con el contador en la base (0136).
//
// Auditoría integral 30/09/2026 (C2-1). Antes cada función llevaba su `Map` en memoria indexado
// por el PRIMER valor de `X-Forwarded-For`. Los dos defectos:
//   · la primera entrada de XFF la escribe quien llama: basta un `X-Forwarded-For: <otra IP>` por
//     petición para tener un contador nuevo cada vez;
//   · cada instancia tenía su contador, y las instancias van y vienen.
//
// ── QUÉ IP ES DE CONFIANZA ───────────────────────────────────────────────────────────────────────
//
// Las Edge Functions de Supabase van detrás de Cloudflare y del gateway de Supabase. Cloudflare
// escribe `cf-connecting-ip` con la IP que le abrió la conexión y SOBREESCRIBE la que mande el
// cliente (comportamiento documentado de Cloudflare); `x-real-ip` la pone el proxy de delante, no
// el cliente. `x-forwarded-for`, en cambio, es una lista a la que cada salto AÑADE al final: lo de
// la izquierda lo puso quien quiso. Por eso el orden:
//
//   1. `cf-connecting-ip`   2. `x-real-ip`   3. la ÚLTIMA entrada de `x-forwarded-for`
//
// En el repo no hay ningún registro de las cabeceras que llegan de verdad en producción (se buscó en
// docs/, supabase/ y apps/: todos los usos anteriores tomaban la primera de XFF, que es justo el
// error), así que esto NO está verificado contra producción. Si Supabase no pasara por Cloudflare,
// un cliente podría inventarse `cf-connecting-ip` y el límite POR IP no valdría: queda el tope
// GLOBAL de cada función, que no depende de ninguna cabecera. Por eso la cabecera se puede fijar con el secreto `VIM_IP_CABECERA` sin volver a desplegar
// código: si un día `cf-connecting-ip` no llegara, `supabase secrets set VIM_IP_CABECERA=x-real-ip`.
// Para comprobarlo una vez: loguear `ipCliente(req.headers)` junto a una petición hecha desde una IP
// conocida con un `X-Forwarded-For` falso; tiene que salir la IP real.
//
// Y si todas fallan, "desconocida": todos los que caigan ahí comparten UN contador. Es a propósito
// —es el caso degradado, y compartir cupo es más seguro que no tener ninguno—, y por eso cada
// función pone además un tope GLOBAL por hora que no depende de la IP en absoluto.
//
// ── SI LA BASE NO RESPONDE ───────────────────────────────────────────────────────────────────────
//
// `consumirCupo` no decide por su cuenta: quien llama dice `alFallar: "abrir" | "cerrar"`.
//   · solicitar-demo → "abrir": un lead vale más que el riesgo de unos minutos sin límite, y si la
//     base no responde el insert del prospecto fallará igual (no hay nada que abusar).
//   · signup-tenant y provisionar-tenant → "cerrar": crean cuentas de Auth (otro servicio, que
//     puede seguir vivo aunque falle la RPC). Sin límite, un fallo de la base se convertiría en
//     barra libre de altas. Un visitante legítimo recibe un "intenta en un momento".
//   · autofacturar (lo cablea el principal) → se recomienda "abrir": la consulta del ticket ya
//     necesita la base, así que "cerrar" solo añadiría un modo de fallo sin quitar abuso.
//
// Módulo puro salvo por el cliente que se le pasa: se prueba con `node --test` (limite.test.ts).

/** Lo mínimo del cliente de supabase-js que usa este módulo (así se puede simular en pruebas). */
export type ClienteRpc = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type Cupo = {
  /** Qué se cuenta: `"demo:ip:1.2.3.4"`, `"signup:global"`… Máx. 200 caracteres. */
  clave: string;
  /** Tamaño de la ventana fija, en segundos (1 s – 7 días). */
  ventanaSeg: number;
  /** Cuántos usos caben en una ventana. */
  max: number;
};

export type ResultadoCupo = { permitido: boolean; motivo: "OK" | "AGOTADO" | "BD_NO_RESPONDE" };

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:.]{2,45}$/i;

/** ¿Parece una IP? Evita que una cabecera basura (o gigante) acabe como clave de la base. */
export function pareceIp(v: string): boolean {
  if (v.length > 45) return false;
  if (IPV4.test(v)) return v.split(".").every((o) => Number(o) <= 255);
  return v.includes(":") && IPV6.test(v);
}

type LectorCabeceras = { get(nombre: string): string | null };

/**
 * La IP del cliente según las cabeceras que pone la plataforma (ver el encabezado).
 * `cabeceraFija`: si viene, SOLO se mira esa (y para `x-forwarded-for`, su última entrada).
 */
export function ipCliente(h: LectorCabeceras, cabeceraFija?: string | null): string {
  const ultimaDeXff = (): string | null => {
    const partes = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return partes.length ? partes[partes.length - 1]! : null;
  };
  const leer = (nombre: string): string | null =>
    nombre === "x-forwarded-for" ? ultimaDeXff() : (h.get(nombre)?.trim() || null);

  const fija = (cabeceraFija ?? "").trim().toLowerCase();
  const orden = fija ? [fija] : ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"];
  for (const nombre of orden) {
    const v = leer(nombre);
    if (v && pareceIp(v)) return v.toLowerCase();
  }
  return "desconocida";
}

/** `ipCliente` con la cabecera que diga el secreto `VIM_IP_CABECERA` (si existe). Solo Deno. */
export function ipDeLaPeticion(req: Request): string {
  const d = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return ipCliente(req.headers, d?.env.get("VIM_IP_CABECERA") ?? null);
}

/**
 * Suma un uso al cupo y dice si todavía cabe (RPC `consumir_cupo`, 0136).
 * Si la base no responde, decide `alFallar` — ver el encabezado — y lo deja en el log.
 */
export async function consumirCupo(
  db: ClienteRpc,
  cupo: Cupo,
  alFallar: "abrir" | "cerrar",
): Promise<ResultadoCupo> {
  try {
    const { data, error } = await db.rpc("consumir_cupo", {
      p_clave: cupo.clave, p_ventana: `${Math.floor(cupo.ventanaSeg)} seconds`, p_max: cupo.max,
    });
    if (error || typeof data !== "boolean") throw new Error(error?.message ?? "respuesta no booleana");
    return { permitido: data, motivo: data ? "OK" : "AGOTADO" };
  } catch (e) {
    console.error(`[limite] consumir_cupo(${cupo.clave}) falló; ${alFallar === "abrir" ? "se deja pasar" : "se rechaza"}:`,
      e instanceof Error ? e.message : String(e));
    return { permitido: alFallar === "abrir", motivo: "BD_NO_RESPONDE" };
  }
}

/** Consume varios cupos (p. ej. por IP y global). Se detiene en el primero que no cabe. */
export async function consumirCupos(
  db: ClienteRpc,
  cupos: Cupo[],
  alFallar: "abrir" | "cerrar",
): Promise<ResultadoCupo> {
  for (const c of cupos) {
    const r = await consumirCupo(db, c, alFallar);
    if (!r.permitido) return r;
  }
  return { permitido: true, motivo: "OK" };
}

/**
 * ¿El cupo ya está lleno? Sin sumar (RPC `cupo_agotado`). Para contar solo fallos: se pregunta
 * antes de intentar y se llama a `consumirCupo` únicamente cuando el intento falla.
 */
export async function cupoAgotado(db: ClienteRpc, cupo: Cupo, alFallar: "abrir" | "cerrar"): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("cupo_agotado", {
      p_clave: cupo.clave, p_ventana: `${Math.floor(cupo.ventanaSeg)} seconds`, p_max: cupo.max,
    });
    if (error || typeof data !== "boolean") throw new Error(error?.message ?? "respuesta no booleana");
    return data;
  } catch (e) {
    console.error(`[limite] cupo_agotado(${cupo.clave}) falló:`, e instanceof Error ? e.message : String(e));
    return alFallar === "cerrar";
  }
}

/**
 * Lee el cuerpo sin pasar de `max` bytes. Devuelve null si se pasa.
 *
 * Primero mira `content-length` (un cuerpo anunciado como gigante no se lee en absoluto) y luego
 * cuenta mientras lee, porque la cabecera puede faltar (chunked) o mentir. Antes el webhook de Uber
 * hacía `await req.text()` y comprobaba el tamaño DESPUÉS: el cuerpo ya estaba entero en memoria.
 */
export async function leerCuerpoAcotado(req: Request, max: number): Promise<string | null> {
  const anunciado = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(anunciado) && anunciado > max) return null;
  if (!req.body) return "";

  const lector = req.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch(() => {});
      return null;
    }
    trozos.push(value);
  }
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const t of trozos) { todo.set(t, pos); pos += t.byteLength; }
  return new TextDecoder().decode(todo);
}
