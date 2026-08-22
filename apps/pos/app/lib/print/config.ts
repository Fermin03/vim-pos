// C3 — Config de impresoras POR DISPOSITIVO (la IP de cada impresora es local a cada caja, no
// global del tenant). Se guarda en localStorage como las credenciales del dispositivo.
//
// Dos estaciones físicas independientes (p. ej. Estación 1 = caja, Estación 2 = cocina), cada una
// con su propio tipo/IP/ancho. Cada destino de impresión (CAJA: ticket+corte, COCINA: comanda) se
// asigna a una de las dos estaciones. Por defecto ambos destinos usan la Estación 1, para que un
// dispositivo con una sola impresora siga funcionando igual que antes.

// 'epson'    → Epson de red, protocolo ePOS-Print por HTTP (/cgi-bin/epos).
// 'generica' → cualquier impresora ESC/POS por el puerto RAW 9100 (Soluciones MyPOS, Xprinter,
//              3nStar, etc.). El navegador no abre sockets TCP, así que el envío lo hace el proceso
//              de Electron vía el relay local (ui-server /__imprimir → main).
export type TipoImpresora = "preview" | "epson" | "generica";
export type ConfigImpresora = { tipo: TipoImpresora; ip?: string; puerto?: number; ancho?: 58 | 80 };

export type IdEstacion = "estacion1" | "estacion2";
export type Destino = "CAJA" | "COCINA";

export type ConfigImpresoras = {
  estaciones: Record<IdEstacion, ConfigImpresora>;
  /** Qué estación imprime cada tipo de documento. */
  asignacion: Record<Destino, IdEstacion>;
  /**
   * Estación física de cada área de preparación (`areas_cocina.id` → estación).
   *
   * Vive AQUÍ y no en la nube, como el resto de la configuración de impresoras: qué impresora hay
   * y dónde está es propio de cada caja. `areas_cocina` tiene una columna `impresora_config` que
   * no se usa por esa misma razón — una segunda caja del mismo negocio heredaría IPs que no son
   * las suyas.
   *
   * Un área sin entrada aquí imprime en la estación de COCINA. Es lo que hace que un negocio que
   * no configure nada siga imprimiendo igual que siempre.
   */
  areas?: Record<string, IdEstacion>;
};

export const ESTACIONES: IdEstacion[] = ["estacion1", "estacion2"];
export const NOMBRE_ESTACION: Record<IdEstacion, string> = { estacion1: "Estación 1", estacion2: "Estación 2" };

/** Puerto RAW por defecto de las impresoras de tickets (JetDirect/RAW). */
export const PUERTO_RAW = 9100;

const KEY = "vim_impresora";

const CONFIG_POR_DEFECTO: ConfigImpresoras = {
  estaciones: { estacion1: { tipo: "preview" }, estacion2: { tipo: "preview" } },
  asignacion: { CAJA: "estacion1", COCINA: "estacion1" },
};

function normalizar(c: unknown): ConfigImpresora {
  if (!c || typeof c !== "object") return { tipo: "preview" };
  const o = c as Record<string, unknown>;
  const tipo = o.tipo === "epson" || o.tipo === "generica" || o.tipo === "preview" ? o.tipo : "preview";
  const cfg: ConfigImpresora = { tipo };
  if (typeof o.ip === "string") cfg.ip = o.ip;
  if (typeof o.puerto === "number") cfg.puerto = o.puerto;
  if (o.ancho === 58 || o.ancho === 80) cfg.ancho = o.ancho;
  return cfg;
}

/** Lee la config de las 2 estaciones + asignación. Migra sola la config previa (una sola
 *  impresora, sin "estaciones") a Estación 1 usada por ambos destinos. */
export function leerConfigImpresoras(): ConfigImpresoras {
  if (typeof window === "undefined") return CONFIG_POR_DEFECTO;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return CONFIG_POR_DEFECTO;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (!parsed || typeof parsed !== "object" || !("estaciones" in parsed)) {
      // Config previa a la Fase 2-estaciones: un único ConfigImpresora en la raíz.
      const previa = normalizar(parsed);
      return { estaciones: { estacion1: previa, estacion2: { tipo: "preview" } }, asignacion: { CAJA: "estacion1", COCINA: "estacion1" } };
    }

    const estaciones = parsed.estaciones as Record<string, unknown>;
    const asignacion = (parsed.asignacion ?? {}) as Record<string, unknown>;
    return {
      estaciones: { estacion1: normalizar(estaciones.estacion1), estacion2: normalizar(estaciones.estacion2) },
      asignacion: {
        CAJA: asignacion.CAJA === "estacion2" ? "estacion2" : "estacion1",
        COCINA: asignacion.COCINA === "estacion2" ? "estacion2" : "estacion1",
      },
      areas: normalizarAreas(parsed.areas),
    };
  } catch {
    return CONFIG_POR_DEFECTO;
  }
}

function normalizarAreas(v: unknown): Record<string, IdEstacion> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, IdEstacion> = {};
  for (const [area, est] of Object.entries(v as Record<string, unknown>)) {
    if (est === "estacion1" || est === "estacion2") out[area] = est;
  }
  return out;
}

/**
 * Estación que imprime la comanda de un área. Sin área, o con un área que esta caja no tiene
 * mapeada, cae en la de COCINA: una comanda que no sabemos dónde va se imprime igual, en el sitio
 * de siempre. Perderla sería mucho peor que imprimirla en la impresora equivocada.
 */
export function estacionParaArea(areaId: string | null | undefined): IdEstacion {
  const cfg = leerConfigImpresoras();
  const asignada = areaId ? cfg.areas?.[areaId] : undefined;
  return asignada ?? cfg.asignacion.COCINA;
}

/** Config de la impresora de una estación concreta (para imprimir por área). */
export function leerConfigDeEstacion(est: IdEstacion): ConfigImpresora {
  return leerConfigImpresoras().estaciones[est];
}

export function guardarConfigImpresoras(c: ConfigImpresoras): void {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(c));
}

/** Config de la impresora que debe usarse para un destino dado (CAJA o COCINA). */
export function leerConfigParaDestino(destino: Destino): ConfigImpresora {
  const cfg = leerConfigImpresoras();
  return cfg.estaciones[cfg.asignacion[destino]];
}

/** true si COCINA está asignada a una estación distinta de CAJA (dos impresoras reales
 *  configuradas aparte). Se usa para decidir si la comanda se manda sola al cobrar: en un
 *  dispositivo con una sola impresora (el caso de hoy) NO debe duplicar el ticket con una
 *  comanda extra en el mismo papel. */
export function hayEstacionDeCocinaDedicada(): boolean {
  const cfg = leerConfigImpresoras();
  return cfg.asignacion.CAJA !== cfg.asignacion.COCINA;
}
