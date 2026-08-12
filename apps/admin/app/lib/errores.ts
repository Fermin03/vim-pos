/**
 * Traducción de errores a algo que el dueño de un restaurante pueda entender y accionar.
 *
 * Los errores de supabase-js y PostgREST llegan crudos, en inglés y con jerga: "Failed to fetch",
 * "JWT expired", "duplicate key value violates unique constraint …". Mostrarlos tal cual en el
 * panel no le dice al usuario qué pasó ni qué hacer, y en México es directamente ilegible.
 *
 * Regla: si el error cae en un caso conocido se traduce; si no, se muestra el mensaje del
 * servidor (suele ser una validación de negocio, que sí es útil) y, en última instancia, el
 * texto por defecto de quien llama.
 */

type Caso = { patron: RegExp; mensaje: string };

const CASOS: Caso[] = [
  // Red / conectividad — el más común y el más confuso para el usuario.
  {
    patron: /failed to fetch|networkerror|load failed|err_connection|fetch failed/i,
    mensaje: "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.",
  },
  { patron: /timeout|timed out|aborted/i, mensaje: "El servidor tardó demasiado en responder. Inténtalo de nuevo." },

  // Sesión.
  { patron: /jwt expired|token.*expired|invalid.*jwt|session.*expired/i, mensaje: "Tu sesión expiró. Vuelve a iniciar sesión." },
  { patron: /invalid login credentials/i, mensaje: "Correo o contraseña incorrectos." },
  { patron: /email not confirmed/i, mensaje: "Tu correo aún no está confirmado. Revisa la bandeja de entrada." },

  // Permisos / RLS. Un 42501 o una política que no deja pasar significan lo mismo para el usuario.
  {
    patron: /permission denied|violates row-level security|42501|insufficient privilege/i,
    mensaje: "No tienes permiso para hacer esto. Pídeselo a un administrador de tu negocio.",
  },

  // Integridad de datos.
  { patron: /duplicate key|already exists|unique constraint|23505/i, mensaje: "Ya existe un registro con esos datos." },
  {
    patron: /violates foreign key|23503|still referenced/i,
    mensaje: "No se puede eliminar: hay otros registros que dependen de este.",
  },
  { patron: /violates check constraint|23514/i, mensaje: "Alguno de los datos no es válido. Revisa el formulario." },
  { patron: /not-null constraint|23502/i, mensaje: "Falta un dato obligatorio." },

  // Límites.
  { patron: /payload too large|413/i, mensaje: "El archivo es demasiado grande." },
  { patron: /rate limit|too many requests|429/i, mensaje: "Demasiados intentos seguidos. Espera un momento e inténtalo otra vez." },
];

/**
 * Convierte cualquier error atrapado en un mensaje presentable.
 * @param e error del catch (unknown, puede ser cualquier cosa)
 * @param porDefecto qué decir si no se reconoce nada (ej. "No se pudo guardar")
 */
export function mensajeError(e: unknown, porDefecto = "Algo salió mal. Inténtalo de nuevo."): string {
  const crudo = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!crudo) return porDefecto;

  const caso = CASOS.find((c) => c.patron.test(crudo));
  if (caso) return caso.mensaje;

  // Mensajes de negocio que ya vienen en español desde las funciones SQL (RAISE EXCEPTION):
  // esos sí sirven tal cual, son la explicación exacta de por qué no se pudo.
  return crudo;
}
