// Lo que comparten las páginas de cuenta (entrar, registro, recuperar, «Mi cuenta») en el servidor:
// el negocio con la lectura cacheada de siempre, sus metadatos (título propio, fuera de buscadores)
// y el `?volver=` ya validado. Solo servidor.
import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Negocio } from "../contrato";
import { volverSeguro } from "../cuenta";
import { negocioDeLaPeticion } from "./funcion";

export type PropsDeAcceso = { params: Promise<{ negocio: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** «Entrar · Knock-Out»; sin negocio legible, solo el título. Nunca se indexa. */
export async function metadatosDeAcceso(params: PropsDeAcceso["params"], titulo: string): Promise<Metadata> {
  const leido = await negocioDeLaPeticion((await params).negocio);
  return { title: leido.estado === "ok" ? `${titulo} · ${leido.datos.nombre}` : titulo, robots: { index: false, follow: false } };
}

/**
 * El negocio de la página y a dónde se vuelve. 404 si el negocio no existe; `negocio: null` si no se
 * pudo leer ahora (la página lo dice y ofrece reintentar). `volver` siempre pasa por `volverSeguro`.
 */
export async function negocioDeAcceso({ params, searchParams }: PropsDeAcceso): Promise<{ slug: string; negocio: Negocio | null; volver: string }> {
  const [{ negocio: slug }, consulta] = await Promise.all([params, searchParams]);
  const leido = await negocioDeLaPeticion(slug);
  if (leido.estado === "no-existe") notFound();
  return { slug, negocio: leido.estado === "ok" ? leido.datos : null, volver: volverSeguro(slug, consulta.volver) };
}
