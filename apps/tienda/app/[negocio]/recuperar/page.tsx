// Recuperar la contraseña. Sin `?t=` pide el correo; con él (el enlace que llegó por correo) pide la
// contraseña nueva. El token es un secreto de un solo uso: aquí solo se mira si llegó y si tiene forma,
// para pintar el paso correcto. No se le pasa a la pantalla: el navegador lo lee de su barra de
// direcciones y lo saca de ahí en cuanto carga. No va al título ni a ningún registro, y
// next.config.mjs manda `Referrer-Policy: no-referrer` en esta ruta.
// ponytail: Next escribe la dirección completa (con `?t=`) en los datos de arranque de la página; es
// una respuesta dinámica que no se cachea. Para que ni ahí aparezca, el enlace del correo tendría que
// traerlo tras `#` (lo arma la función `tienda`).
// No redirige aunque haya sesión: quien olvidó su contraseña puede tener una abierta en este teléfono.
import { Recuperar } from "../../components/acceso";
import { Fallo } from "../../components/piezas";
import { tokenDelEnlace } from "../../lib/cuenta";
import { metadatosDeAcceso, negocioDeAcceso, type PropsDeAcceso } from "../../lib/servidor/acceso";

export const generateMetadata = ({ params }: PropsDeAcceso) => metadatosDeAcceso(params, "Recuperar tu contraseña");

export default async function PaginaDeRecuperar(props: PropsDeAcceso) {
  const { slug, negocio, volver, consulta } = await negocioDeAcceso(props);
  if (!negocio) return <Fallo titulo="No pudimos cargar la tienda" hacer="Vuelve a intentar en unos minutos." />;
  return <Recuperar slug={slug} volver={volver} enlace={consulta.t === undefined ? null : tokenDelEnlace(consulta.t) ? "bueno" : "roto"} />;
}
