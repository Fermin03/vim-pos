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
    };
  } catch {
    return CONFIG_POR_DEFECTO;
  }
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
