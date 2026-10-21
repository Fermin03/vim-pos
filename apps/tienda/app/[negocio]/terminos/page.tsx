// Condiciones para pedir, PROVISIONALES: una página corta y veraz para que el cliente sepa a quién
// le compra y cómo funciona el pedido. No pretende ser un texto legal completo: el borrador del
// definitivo está en `docs/legal/tienda-terminos-para-el-comensal.md` y lo tiene que revisar una
// persona antes de publicarse. `terminos` es dirección reservada: ningún negocio la puede ocupar.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@vim/ui/styles";
import { negocioDeLaPeticion } from "../../lib/servidor/funcion";
import { ENLACE, Telefonos, TITULO } from "../legal";

type Props = { params: Promise<{ negocio: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const leido = await negocioDeLaPeticion((await params).negocio);
  return { title: leido.estado === "ok" ? `Condiciones para pedir · ${leido.datos.nombre}` : "Condiciones para pedir", robots: { index: false, follow: false } };
}

export default async function Terminos({ params }: Props) {
  const { negocio: slug } = await params;
  const leido = await negocioDeLaPeticion(slug);
  if (leido.estado === "no-existe") notFound();
  const negocio = leido.estado === "ok" ? leido.datos : null;
  const nombre = negocio?.nombre ?? "el restaurante";
  const conTelefono = negocio?.sucursales.filter((s) => s.telefono) ?? [];

  return (
    <main className="px-4 pb-10 text-16 leading-relaxed">
      <h1 className="font-display text-24 font-semibold">Condiciones para pedir</h1>
      <Aviso tono="warning" role="status" className="mt-4 !text-14">
        Texto provisional. Explica con palabras sencillas cómo funciona pedir aquí; todavía no son los términos definitivos.
      </Aviso>

      <h2 className={TITULO}>A quién le compras</h2>
      <p className="mt-2">
        A {nombre}. Es el restaurante quien prepara tu pedido, lo entrega, lo cobra y responde por él. VIM POS es el sistema con
        el que el restaurante recibe los pedidos: no vende la comida, no la entrega y no cobra nada por tu pedido.
      </p>

      <h2 className={TITULO}>Precios y pago</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Los precios del menú ya incluyen impuestos. Antes de enviar tu pedido ves el total, con el envío si lo hay.</li>
        <li>Se paga al recibir, con la forma de pago que elijas entre las que ofrece el restaurante. Aquí no se paga en línea ni se pide ningún dato de tu tarjeta.</li>
      </ul>

      <h2 className={TITULO}>Cuándo queda hecho tu pedido</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Enviar el pedido no lo confirma: el restaurante tiene que aceptarlo. Lo ves en la página de tu pedido, que se actualiza sola.</li>
        <li>El restaurante puede no aceptarlo, por ejemplo si se le agotó algo o tiene demasiados pedidos. Si nadie lo acepta en unos minutos, se cancela solo. En los dos casos no se te cobra nada.</li>
        <li>No se promete una hora de entrega. La página de tu pedido te dice en qué va.</li>
      </ul>

      <h2 className={TITULO}>Envío a domicilio</h2>
      <p className="mt-2">
        El restaurante entrega solo en las zonas que aparecen al pedir, cada una con su costo. Si tu dirección no está en ninguna,
        puedes pedir para recoger, si el restaurante lo ofrece.
      </p>

      <h2 className={TITULO}>Si quieres cambiar o cancelar tu pedido</h2>
      <p className="mt-2">
        Llama al restaurante lo antes posible{conTelefono.length > 0 ? ":" : "."} Desde esta página no se puede cancelar un pedido ya enviado, y si ya
        se está preparando, el restaurante decide si todavía se puede.
      </p>
      <Telefonos sucursales={conTelefono} />
      <p className="mt-2">Cualquier duda o problema con tu pedido se resuelve también con el restaurante.</p>

      <h2 className={TITULO}>Tu cuenta y tus datos</h2>
      <p className="mt-2">
        Puedes pedir sin cuenta. Si creas una, cuida tu contraseña: lo que se pida con tu sesión abierta queda a tu nombre. Qué
        datos se guardan y por cuánto tiempo está en el{" "}
        <Link href={`/${slug}/privacidad`} className={ENLACE}>Aviso de privacidad</Link>.
      </p>

      <p className="mt-8"><Link href={`/${slug}`} className={ENLACE}>Volver al menú</Link></p>
    </main>
  );
}
