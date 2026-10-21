// Entrar a la cuenta de la tienda de un negocio.
// De servidor: valida el negocio (404 si no existe), lee `?volver=` ya validado y pinta la pantalla.
import { redirect } from "next/navigation";
import { Entrar } from "../../components/acceso";
import { Fallo } from "../../components/piezas";
import { metadatosDeAcceso, negocioDeAcceso, type PropsDeAcceso } from "../../lib/servidor/acceso";
import { haySesion } from "../../lib/servidor/sesion";

export const generateMetadata = ({ params }: PropsDeAcceso) => metadatosDeAcceso(params, "Entrar");

export default async function PaginaDeEntrar(props: PropsDeAcceso) {
  const { slug, negocio, volver } = await negocioDeAcceso(props);
  // Ya hay sesión: no se le pide entrar otra vez. Si resulta vencida, «Mi cuenta» lo descubre y regresa aquí ya sin cookie.
  if (await haySesion(slug)) redirect(volver);
  if (!negocio) return <Fallo titulo="No pudimos cargar la tienda" hacer="Vuelve a intentar en unos minutos." reintentar={`/${slug}/entrar`} />;
  return <Entrar slug={slug} negocio={negocio.nombre} volver={volver} />;
}
