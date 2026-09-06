// Directivas que la caja obedece (ADR 0014, entrega 2).
//
// Vive fuera de main.mjs porque ahí no se puede probar: ese módulo importa Electron. El archivo
// y el reloj se inyectan, así que todo el comportamiento se verifica sin levantar la app.
//
// REGLA DURA: solo bloquea una directiva que diga `bloqueado: true`. Sin archivo, con el archivo
// corrupto o con un JSON incompleto, la caja SIGUE VENDIENDO. Una instalación nueva sin red, o un
// disco con un JSON a medias, no puede dejar a un negocio sin cobrar: eso sería un fallo nuestro
// castigando a quien está al corriente.
//
// Se guarda en un archivo y no en el Postgres local a propósito: las directivas tienen que estar
// disponibles aunque el backend local tarde en arrancar (el arranque intermitente de 0.4.56).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DIRECTIVAS_VACIAS = Object.freeze({
  servidor_hora: null,
  acceso: Object.freeze({ estado: null, bloqueado: false, bloquea_desde: null, mensaje: null }),
  modulos: Object.freeze({}),
  limites: Object.freeze({}),
  avisos: Object.freeze([]),
  version: Object.freeze({}),
});

/** Deja el JSON de la nube en una forma con la que el resto puede contar sin comprobar nada. */
export function normalizar(x) {
  if (!x || typeof x !== "object") return DIRECTIVAS_VACIAS;
  const a = x.acceso && typeof x.acceso === "object" ? x.acceso : {};
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const txt = (v) => (typeof v === "string" ? v : null);
  return {
    servidor_hora: txt(x.servidor_hora),
    acceso: {
      estado: txt(a.estado),
      // `=== true` a propósito: cualquier otra cosa (una cadena, un 1, undefined) NO bloquea.
      bloqueado: a.bloqueado === true,
      bloquea_desde: txt(a.bloquea_desde),
      mensaje: txt(a.mensaje),
    },
    modulos: obj(x.modulos),
    limites: obj(x.limites),
    avisos: Array.isArray(x.avisos) ? x.avisos : [],
    version: obj(x.version),
  };
}

export function crearAlmacenDirectivas({
  archivo,
  fs = { existsSync, readFileSync, writeFileSync },
  ahora = () => new Date().toISOString(),
  log = () => {},
}) {
  /** El JSON tal cual está en disco. `{}` si no existe o no se puede leer. */
  function leerCrudo() {
    try {
      if (!fs.existsSync(archivo)) return {};
      const j = JSON.parse(fs.readFileSync(archivo, "utf8"));
      return j && typeof j === "object" ? j : {};
    } catch {
      return {};
    }
  }

  function escribir(obj) {
    try {
      fs.writeFileSync(archivo, JSON.stringify(obj), "utf8");
    } catch (e) {
      // Que no se pueda guardar no puede tumbar la caja: se sigue con lo que ya había.
      log(`no se pudieron guardar las directivas: ${e?.message ?? e}`);
    }
  }

  return {
    guardar(directivas) {
      // Conserva los acuses pendientes: llega una directiva nueva cada 10 minutos y perderlos
      // haría que el cajero volviera a ver un aviso que ya cerró.
      const actual = leerCrudo();
      escribir({ recibido: ahora(), directivas: normalizar(directivas), vistos: actual.vistos ?? [] });
    },
    leer() {
      const j = leerCrudo();
      if (!j.directivas) return { directivas: DIRECTIVAS_VACIAS, recibidoIso: null };
      return {
        directivas: normalizar(j.directivas),
        recibidoIso: typeof j.recibido === "string" ? j.recibido : null,
      };
    },

    /**
     * Anota que el cajero cerró un aviso. Se guarda aquí y se reporta en el siguiente latido: si
     * se mandara al momento, un aviso leído sin internet se perdería y volvería a aparecerle
     * como si no lo hubiera cerrado.
     */
    marcarVisto(id) {
      if (typeof id !== "string" || !UUID.test(id)) return;
      const actual = leerCrudo();
      // Solo se acusa un aviso que esta caja recibió de verdad. Sin esto se podían "pre-acusar"
      // avisos futuros —conociendo o adivinando su id— y suprimirlos antes de que nadie los
      // viera, que es justo lo que el aviso viene a evitar.
      const recibidos = Array.isArray(actual.directivas?.avisos) ? actual.directivas.avisos : [];
      if (!recibidos.some((a) => a && typeof a === "object" && a.id === id)) return;
      const vistos = Array.isArray(actual.vistos) ? actual.vistos : [];
      if (vistos.includes(id)) return;
      // Tope por si una caja pasa semanas sin poder reportar: lo viejo ya no le importa a nadie.
      escribir({ ...actual, vistos: [...vistos, id].slice(-100) });
    },

    vistosPendientes() {
      const v = leerCrudo().vistos;
      return Array.isArray(v) ? v.filter((x) => typeof x === "string" && UUID.test(x)) : [];
    },

    /** Se llama DESPUÉS de que la nube confirmó el latido, nunca antes. */
    limpiarVistos(ids) {
      const actual = leerCrudo();
      const quedan = (Array.isArray(actual.vistos) ? actual.vistos : []).filter((x) => !ids.includes(x));
      escribir({ ...actual, vistos: quedan });
    },
  };
}
