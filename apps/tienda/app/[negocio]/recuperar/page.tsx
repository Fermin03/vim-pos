// Recuperar la contraseña. Sin enlace pide el correo; con el enlace que llegó por correo pide la
// contraseña nueva. El token es un secreto de un solo uso y viaja en el FRAGMENTO (`#t=`), que el
// navegador no le manda al servidor: esta página no lo ve, no lo valida y no lo escribe en el HTML
// ni en ningún registro. Qué paso toca lo decide la pantalla al montar, leyendo `location.hash`.
// next.config.mjs manda además `Referrer-Policy: no-referrer` en esta ruta.
// No redirige aunque haya sesión: quien olvidó su contraseña puede tener una abierta en este teléfono.
import { Recuperar } from "../../components/acceso";
import { Fallo } from "../../components/piezas";
import { metadatosDeAcceso, negocioDeAcceso, type PropsDeAcceso } from "../../lib/servidor/acceso";

export const generateMetadata = ({ params }: PropsDeAcceso) => metadatosDeAcceso(params, "Recuperar tu contraseña");

export default async function PaginaDeRecuperar(props: PropsDeAcceso) {
  const { slug, negocio, volver } = await negocioDeAcceso(props);
  if (!negocio) return <Fallo titulo="No pudimos cargar la tienda" hacer="Vuelve a intentar en unos minutos." />;
  return <Recuperar slug={slug} volver={volver} />;
}
