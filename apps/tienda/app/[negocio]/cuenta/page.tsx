// «Mi cuenta». De servidor solo se decide si hay con qué entrar: sin cookie de sesión de este negocio
// se va a «Entrar» (y de ahí se vuelve). Los datos los pide el navegador: son del visitante, no del
// negocio, y no deben pasar por la caché de la página. Si la sesión resulta vencida, la pantalla lo
// descubre al leer y hace el mismo viaje.
import { redirect } from "next/navigation";
import { MiCuentaDelNegocio } from "../../components/cuenta";
import { Fallo } from "../../components/piezas";
import { enlaceDeAcceso } from "../../lib/cuenta";
import { metadatosDeAcceso, negocioDeAcceso, type PropsDeAcceso } from "../../lib/servidor/acceso";
import { haySesion } from "../../lib/servidor/sesion";

export const generateMetadata = ({ params }: PropsDeAcceso) => metadatosDeAcceso(params, "Mi cuenta");

export default async function PaginaDeMiCuenta(props: PropsDeAcceso) {
  const { slug, negocio } = await negocioDeAcceso(props);
  if (!(await haySesion(slug))) redirect(enlaceDeAcceso(slug, "entrar", `/${slug}/cuenta`));
  if (!negocio) return <Fallo titulo="No pudimos cargar la tienda" hacer="Vuelve a intentar en unos minutos." reintentar={`/${slug}/cuenta`} />;
  // Solo lo que la pantalla usa: el nombre, y las sucursales para «pedir de nuevo».
  return <MiCuentaDelNegocio negocio={{ slug, nombre: negocio.nombre, sucursales: negocio.sucursales.map((s) => ({ id: s.id, nombre: s.nombre })) }} />;
}
