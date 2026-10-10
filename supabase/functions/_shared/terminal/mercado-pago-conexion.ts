// Conexión del restaurante con Mercado Pago: OAuth, sucursales, cajas y terminales. ADR 0033.
// Fuente: docs/integraciones/mercado-pago-point/. Nada de este archivo está verificado todavía
// contra la API: al probarlo, marcar aquí lo que resulte (como en mercado-pago.ts).

const API = "https://api.mercadopago.com";
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const txt = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const idDe = (v: unknown): string | null => (typeof v === "number" || (typeof v === "string" && v !== "") ? String(v) : null);

/** Mercado Pago exige ids externos solo alfanuméricos: el uuid va sin guiones (32 caracteres). */
export const idExterno = (uuid: string): string => uuid.replace(/-/g, "").toLowerCase();

/** Dónde autoriza el dueño. `state` es el anti-CSRF que guarda el admin. */
export function urlAutorizacion(c: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL("https://auth.mercadopago.com/authorization");
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("platform_id", "mp");
  u.searchParams.set("state", c.state);
  u.searchParams.set("redirect_uri", c.redirectUri);
  return u.toString();
}

export type Tokens = { access_token: string; refresh_token: string; user_id: string; vence_at: string; de_prueba: boolean };

/** Lo que guardamos de la respuesta de /oauth/token; null si le falta algo (sin refresh no se renueva). */
export function tokensDeRespuesta(cuerpo: unknown, ahora = Date.now()): Tokens | null {
  const o = obj(cuerpo);
  const acc = txt(o.access_token), ref = txt(o.refresh_token), uid = idDe(o.user_id);
  const seg = Number(o.expires_in);
  if (!acc || !ref || !uid || !(seg > 0)) return null;
  return { access_token: acc, refresh_token: ref, user_id: uid, vence_at: new Date(ahora + seg * 1000).toISOString(), de_prueba: o.live_mode === false };
}

/** Canjea el `code` o renueva con el refresh token. Los parámetros van en el cuerpo, nunca en la query. */
export async function pedirTokens(
  c: { clientId: string; clientSecret: string } & ({ code: string; redirectUri: string } | { refreshToken: string }),
  pedir: typeof fetch = fetch,
): Promise<{ tokens: Tokens | null; status: number; codigo: string | null }> {
  const cuerpo = "code" in c
    ? { grant_type: "authorization_code", code: c.code, redirect_uri: c.redirectUri }
    : { grant_type: "refresh_token", refresh_token: c.refreshToken };
  const r = await pedir(`${API}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, ...cuerpo }),
    signal: AbortSignal.timeout(15000),
  });
  const json: unknown = await r.json().catch(() => null);
  return { tokens: r.ok ? tokensDeRespuesta(json) : null, status: r.status, codigo: txt(obj(json).error) ?? txt(obj(json).message) };
}

/**
 * Mercado Pago exige la ciudad y el estado escritos EXACTAMENTE como en su catálogo, mayúsculas
 * incluidas («San Francisco Del Rincón», no «…del Rincón»). VERIFICADO (9 oct 2026): cuando no
 * coinciden responde 400 con `location.<campo> was invalid. Valid values are: A, B, …`. De ahí se
 * saca el valor bueno, comparando sin acentos ni mayúsculas. null si no es ese error o no hay parecido.
 */
export function valorDelCatalogo(cuerpoError: unknown, valor: string): { campo: "city_name" | "state_name"; correcto: string } | null {
  const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/s+/g, " ").trim();
  const causas = obj(cuerpoError).causes;
  for (const c of Array.isArray(causas) ? causas : []) {
    const m = /location.(city_name|state_name) was invalid. Valid values are: (.+)/.exec(String(obj(c).description ?? ""));
    if (!m) continue;
    const correcto = m[2].replace(/.s*$/, "").split(", ").find((v) => plano(v) === plano(valor));
    if (correcto) return { campo: m[1] as "city_name" | "state_name", correcto };
  }
  return null;
}

export type DireccionSucursal = { nombre: string; calle: string; numero: string; ciudad: string; estado: string; latitud: number; longitud: number };
export type TerminalMp = { id: string; pos_id: string | null; modo: string | null };

/** Llamadas de configuración con el token del restaurante. */
export function clienteMpConfig(token: string, pedir: typeof fetch = fetch) {
  const llamar = async (metodo: string, ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}) => {
    const r = await pedir(API + ruta, {
      method: metodo, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(15000),
    });
    const json: unknown = await r.json().catch(() => null);
    // El cuerpo de un error de configuración no trae datos del restaurante: va al log para diagnosticar.
    if (!r.ok && r.status !== 404) console.error(`[mercado-pago] ${metodo} ${ruta.split("?")[0]} HTTP ${r.status} ${JSON.stringify(json).slice(0, 300)}`);
    return { ok: r.ok, status: r.status, cuerpo: obj(json) };
  };

  return {
    /** El nombre de la cuenta, para que el dueño la reconozca en el admin. */
    async nombre(): Promise<string | null> {
      const r = await llamar("GET", "/users/me");
      return txt(r.cuerpo.nickname) ?? txt(r.cuerpo.email);
    },

    /** Crea la sucursal o, si ya existía con ese id externo (reconexión), devuelve la que hay. */
    async sucursal(userId: string, sucursalId: string, d: DireccionSucursal): Promise<string | null> {
      const ext = idExterno(sucursalId);
      const ya = await llamar("GET", `/users/${userId}/stores/search?external_id=${ext}`);
      const previa = Array.isArray(ya.cuerpo.results) ? idDe(obj(ya.cuerpo.results[0]).id) : null;
      if (previa) return previa;
      const location: Record<string, unknown> = {
        street_name: d.calle, street_number: d.numero, city_name: d.ciudad, state_name: d.estado, latitude: d.latitud, longitude: d.longitud,
      };
      // Hasta dos correcciones: el estado y luego la ciudad, cada uno contra el catálogo que devuelve el error.
      for (let intento = 0; ; intento++) {
        const r = await llamar("POST", `/users/${userId}/stores`, { name: d.nombre, external_id: ext, location });
        if (r.ok) return idDe(r.cuerpo.id);
        const arreglo = intento < 2 ? (valorDelCatalogo(r.cuerpo, d.estado) ?? valorDelCatalogo(r.cuerpo, d.ciudad)) : null;
        if (!arreglo || location[arreglo.campo] === arreglo.correcto) return null;
        location[arreglo.campo] = arreglo.correcto;
      }
    },

    /** Crea la caja («pos») dentro de la sucursal. La llave de idempotencia es el id de la caja. */
    async caja(storeId: string, cajaId: string, nombre: string): Promise<string | null> {
      const ext = idExterno(cajaId);
      const r = await llamar("POST", "/v2/pos",
        { name: nombre.replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 45) || ext, store_id: storeId, external_id: ext },
        { "X-Idempotency-Key": cajaId });
      return r.ok ? idDe(r.cuerpo.id) : null;
    },

    async terminales(): Promise<TerminalMp[]> {
      const r = await llamar("GET", "/terminals/v1/list?limit=50");
      const lista = obj(r.cuerpo.data).terminals;
      return (Array.isArray(lista) ? lista : [])
        .map((t) => ({ id: String(obj(t).id ?? ""), pos_id: idDe(obj(t).pos_id), modo: txt(obj(t).operating_mode) }))
        .filter((t) => t.id !== "");
    },

    /** Después de cambiar el modo hay que reiniciar la terminal. */
    modo: async (terminalId: string, modo: "PDV" | "STANDALONE"): Promise<boolean> =>
      (await llamar("PATCH", "/terminals/v1/setup", { terminals: [{ id: terminalId, operating_mode: modo }] })).ok,
  };
}
