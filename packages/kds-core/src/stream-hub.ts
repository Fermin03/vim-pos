// Stream SSE de la caja-hub (`/kds/stream`), con el token del dispositivo.
//
// Auditoría integral 30/09/2026 (escritorio D-4): el stream no pedía autenticación, así que
// cualquiera en el Wi-Fi del restaurante veía pasar ids y folios de tickets. El gateway ahora
// exige un token válido de la caja. `EventSource` no admite cabeceras, así que viaja en
// `?access_token=`.
//
// La trampa que resuelve este módulo: `EventSource` reconecta SOLO, pero con la MISMA URL. Cuando
// el token caduca, la reconexión recibe un 401 y el navegador abandona el stream para siempre
// (readyState CLOSED): la cocina se quedaría sin tiempo real hasta recargar la pantalla. Aquí, si
// el stream queda cerrado, se vuelve a abrir tras una pausa pidiendo un token fresco.

export type FuenteEventos = {
  readyState: number;
  onerror: ((ev: unknown) => void) | null;
  addEventListener(tipo: string, fn: () => void): void;
  close(): void;
};

export type OpcionesStreamHub = {
  /** Base del hub (window.__VIM_SUPABASE_URL). */
  base: string;
  /** Parámetros extra de la URL (p. ej. `{ sucursal }`). */
  params?: Record<string, string>;
  /** Token vigente del dispositivo; se pide de nuevo en cada reapertura. */
  obtenerToken: () => Promise<string | null> | string | null;
  /** Eventos a escuchar → qué hacer. */
  eventos: Record<string, () => void>;
  /** Pausa antes de reabrir un stream cerrado (ms). */
  pausaMs?: number;
  /** Inyectable para pruebas. */
  crear?: (url: string) => FuenteEventos;
  programar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
};

/** EventSource.CLOSED: el navegador ya no reintenta por su cuenta. */
const CERRADO = 2;

export function urlStreamHub(base: string, token: string | null, params: Record<string, string> = {}): string {
  const q = new URLSearchParams(params);
  if (token) q.set("access_token", token);
  const s = q.toString();
  return `${base}/kds/stream${s ? `?${s}` : ""}`;
}

/** Abre el stream y lo mantiene vivo. Devuelve la función para cerrarlo. */
export function abrirStreamHub(o: OpcionesStreamHub): () => void {
  const crear = o.crear ?? ((url: string) => new EventSource(url) as unknown as FuenteEventos);
  const programar = o.programar ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancelar = o.cancelar ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const pausa = o.pausaMs ?? 5000;
  let actual: FuenteEventos | null = null;
  let espera: unknown = null;
  let cerrado = false;

  const abrir = async () => {
    espera = null;
    let token: string | null = null;
    try {
      token = await o.obtenerToken();
    } catch {
      token = null; // sin token el hub responde 401 y se reintenta tras la pausa
    }
    if (cerrado) return;
    const es = crear(urlStreamHub(o.base, token, o.params));
    for (const [tipo, fn] of Object.entries(o.eventos)) es.addEventListener(tipo, fn);
    es.onerror = () => {
      // Mientras el navegador reintente por su cuenta (CONNECTING), se le deja. Si ya se rindió
      // (token caducado → 401, hub reiniciándose), se reabre con un token nuevo.
      if (cerrado || es.readyState !== CERRADO || espera !== null) return;
      es.close();
      espera = programar(() => { void abrir(); }, pausa);
    };
    actual = es;
  };

  void abrir();
  return () => {
    cerrado = true;
    if (espera !== null) cancelar(espera);
    actual?.close();
  };
}
