import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";

/**
 * Quién soy (A8). El panel la llama al entrar para mostrar el nombre del operador y saber si entró
 * con su cuenta o con la clave compartida.
 *
 * Es también la primera petición con segundo factor de un operador recién dado de alta:
 * `autorizar` lo marca como activado ahí, y desde ese momento la clave compartida deja de servir.
 */
export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ nombre: auth.actor.nombre, via: auth.actor.via, id: auth.actor.id });
}
