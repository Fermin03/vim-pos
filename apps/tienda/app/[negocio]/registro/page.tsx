// Crear una cuenta en la tienda de un negocio.
// De servidor: valida el negocio (404 si no existe), lee `?volver=` ya validado y pinta la pantalla.
import { redirect } from "next/navigation";
import { Registro } from "../../components/acceso";
import { Fallo } from "../../components/piezas";
import { metadatosDeAcceso, negocioDeAcceso, type PropsDeAcceso } from "../../lib/servidor/acceso";
import { haySesion } from "../../lib/servidor/sesion";

export const generateMetadata = ({ params }: PropsDeAcceso) => metadatosDeAcceso(params, "Crear cuenta");

export default async function PaginaDeRegistro(props: PropsDeAcceso) {
  const { slug, negocio, volver } = await negocioDeAcceso(props);
  if (await haySesion(slug)) redirect(volver);
  if (!negocio) return <Fallo titulo="No pudimos cargar la tienda" hacer="Vuelve a intentar en unos minutos." reintentar={`/${slug}/registro`} />;
  return <Registro slug={slug} negocio={negocio.nombre} volver={volver} />;
}
