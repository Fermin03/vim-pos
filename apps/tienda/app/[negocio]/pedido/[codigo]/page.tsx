// El seguimiento de un pedido. Esta página de servidor solo valida la forma del código y pinta el
// marco: el estado lo pide el navegador (components/seguimiento.tsx). El código es la llave del
// pedido: no va al título, a `og:*`, a registros ni a buscadores, y next.config.mjs manda
// `Referrer-Policy: no-referrer` en esta ruta.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeguimientoDelPedido } from "../../../components/seguimiento";
import { FORMA_CODIGO, FORMA_SLUG } from "../../../lib/contrato";
import { negocioDeLaPeticion } from "../../../lib/servidor/funcion";

type Props = { params: Promise<{ negocio: string; codigo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { negocio } = await params;
  const leido = FORMA_SLUG.test(negocio) ? await negocioDeLaPeticion(negocio) : null;
  return { title: leido?.estado === "ok" ? `Tu pedido · ${leido.datos.nombre}` : "Tu pedido", robots: { index: false, follow: false } };
}

export default async function PaginaDelPedido({ params }: Props) {
  const { negocio, codigo } = await params;
  if (!FORMA_SLUG.test(negocio) || !FORMA_CODIGO.test(codigo)) notFound();
  if ((await negocioDeLaPeticion(negocio)).estado === "no-existe") notFound();
  return <main><SeguimientoDelPedido slug={negocio} codigo={codigo} /></main>;
}
