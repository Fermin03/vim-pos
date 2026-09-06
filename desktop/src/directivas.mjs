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
  return {
    guardar(directivas) {
      try {
        fs.writeFileSync(
          archivo,
          JSON.stringify({ recibido: ahora(), directivas: normalizar(directivas) }),
          "utf8",
        );
      } catch (e) {
        // Que no se puedan guardar no puede tumbar la caja: se sigue con lo que ya había.
        log(`no se pudieron guardar las directivas: ${e?.message ?? e}`);
      }
    },
    leer() {
      try {
        if (!fs.existsSync(archivo)) return { directivas: DIRECTIVAS_VACIAS, recibidoIso: null };
        const j = JSON.parse(fs.readFileSync(archivo, "utf8"));
        return {
          directivas: normalizar(j?.directivas),
          recibidoIso: typeof j?.recibido === "string" ? j.recibido : null,
        };
      } catch {
        // Archivo a medias o ilegible: se trata como ausencia. Nunca como bloqueo.
        return { directivas: DIRECTIVAS_VACIAS, recibidoIso: null };
      }
    },
  };
}
