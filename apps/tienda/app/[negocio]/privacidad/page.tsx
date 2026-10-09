// Aviso de privacidad PROVISIONAL (decisión 10 del plan): la página existe para que el enlace de
// «Tus datos» no quede roto y el cliente sepa qué pasa con lo que escribe. El texto definitivo es de
// la entrega 7 y lo revisa una persona; este no pretende ser un aviso legal completo.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@vim/ui/styles";
import { negocioDeLaPeticion } from "../../lib/servidor/funcion";
import { enlaceTel, formatoTelefono } from "../../lib/telefono";

type Props = { params: Promise<{ negocio: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const leido = await negocioDeLaPeticion((await params).negocio);
  return { title: leido.estado === "ok" ? `Aviso de privacidad · ${leido.datos.nombre}` : "Aviso de privacidad", robots: { index: false, follow: false } };
}

const TITULO = "mt-8 font-display text-18 font-semibold";
const ENLACE = "font-medium text-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export default async function Privacidad({ params }: Props) {
  const { negocio: slug } = await params;
  const leido = await negocioDeLaPeticion(slug);
  if (leido.estado === "no-existe") notFound();
  const negocio = leido.estado === "ok" ? leido.datos : null;
  const nombre = negocio?.nombre ?? "el restaurante";
  const conTelefono = negocio?.sucursales.filter((s) => s.telefono) ?? [];

  return (
    <main className="px-4 pb-10 text-16 leading-relaxed">
      <h1 className="font-display text-24 font-semibold">Aviso de privacidad</h1>
      <Aviso tono="warning" role="status" className="mt-4 !text-14">
        Aviso provisional. Explica con palabras sencillas qué pasa hoy con tus datos; el aviso de privacidad definitivo se publicará antes del lanzamiento.
      </Aviso>

      <h2 className={TITULO}>Qué datos te pedimos</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Tu nombre y tu teléfono.</li>
        <li>Tu correo, solo si quieres que te llegue el enlace de tu pedido.</li>
        <li>Tu dirección, solo si pides a domicilio.</li>
        <li>Lo que pediste, tus notas y cómo vas a pagar. No se pide ni se guarda ningún dato de tu tarjeta: se paga al recibir.</li>
        <li>
          Si creas una cuenta: tu nombre, apellido, correo, teléfono y una contraseña. Si quieres, también tu fecha de nacimiento
          y hasta cinco direcciones. Pedir sin cuenta sigue siendo posible.
        </li>
      </ul>

      <h2 className={TITULO}>Si creas una cuenta</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>La cuenta es de la tienda de {nombre}: no sirve en la de otro restaurante, y cada una tiene su propia sesión.</li>
        <li>
          Tu contraseña se guarda cifrada, de una forma que no se puede revertir: nadie puede leerla, ni el restaurante ni VIM POS.
          Si la olvidas no se te puede decir cuál era; eliges una nueva con un enlace que llega a tu correo.
        </li>
        <li>Tu correo se usa para entrar, para darte la bienvenida y para mandarte ese enlace cuando lo pides.</li>
        <li>En tu cuenta ves solo los pedidos que hiciste con tu sesión abierta.</li>
      </ul>

      <h2 className={TITULO}>Para qué se usan</h2>
      <p className="mt-2">
        Para preparar y entregar tu pedido, llamarte si hay alguna duda con él y, si dejaste tu correo, mandarte el enlace para
        seguirlo. No se usan para publicidad ni se venden a nadie.
      </p>

      <h2 className={TITULO}>Quién los recibe y los guarda</h2>
      <p className="mt-2">
        Los recibe y los guarda {nombre}: es el restaurante el que decide qué se hace con ellos. VIM POS es su proveedor de
        tecnología: el sistema con el que el restaurante toma los pedidos. VIM POS almacena los datos por encargo del restaurante
        y no los usa para nada propio.
      </p>

      <h2 className={TITULO}>Cuánto tiempo se guardan</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          Tu nombre, tu teléfono y tu dirección quedan en la lista de clientes del restaurante, como cuando pides por teléfono.
          Ahí se conservan hasta que le pidas al restaurante que los quite.
        </li>
        <li>
          El detalle de tu pedido en línea (lo que pediste, tus notas y los datos con los que lo hiciste) se anonimiza a los 30
          días: se le quita lo que lo relaciona contigo.
        </li>
      </ul>

      <h2 className={TITULO}>Otros servicios que usa esta página</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Cloudflare Turnstile, para comprobar que el formulario lo llena una persona y no un programa.</li>
        <li>Google Fonts, de donde se cargan las tipografías.</li>
      </ul>
      <p className="mt-2">
        Los dos reciben tu dirección IP, como cualquier sitio que tu navegador visita. Esta página no tiene publicidad ni
        herramientas de analítica.
      </p>

      <h2 className={TITULO}>Lo que guarda tu teléfono</h2>
      <p className="mt-2">
        Tu navegador guarda el pedido que estás armando durante un día y, después de pedir, tu nombre, teléfono, correo y
        dirección para que no los escribas otra vez. Eso se queda en tu teléfono. Lo borras con «Olvidar mis datos», que aparece
        al llenar tus datos. Si pides con tu cuenta abierta, esos datos no se guardan en el teléfono: salen de tu cuenta.
      </p>
      <p className="mt-2">
        Al entrar a tu cuenta, tu navegador guarda una cookie de sesión de esta página para no pedirte la contraseña en cada
        visita. Dura 30 días, es propia de esta tienda, las demás páginas no pueden leerla y no se usa para rastrearte ni para
        publicidad. Se borra al cerrar sesión. Si cambias o recuperas tu contraseña, se cierran las sesiones de tus otros
        dispositivos.
      </p>

      <h2 className={TITULO}>Cómo eliminar tu cuenta</h2>
      <p className="mt-2">
        Entra a <Link href={`/${slug}/cuenta`} className={ENLACE}>Mi cuenta</Link>, elige «Eliminar mi cuenta» y confirma con tu
        contraseña. Se borra en el momento tu cuenta, tu contraseña, tus direcciones guardadas y el acceso a tu historial.
      </p>
      <p className="mt-2">
        {nombre} conserva en su sistema los pedidos que ya le hiciste y, en su lista de clientes, el nombre, el teléfono y la
        dirección con los que pediste: son registros de sus ventas, como los de un pedido por teléfono. Para que también los
        quite, pídeselo como se explica abajo.
      </p>

      <h2 className={TITULO}>Cómo pedir que se quiten tus datos</h2>
      <p className="mt-2">
        Pídeselo al restaurante{conTelefono.length > 0 ? ". Su teléfono:" : ": es quien tiene tus datos y quien puede quitarlos de su lista de clientes."}
      </p>
      {conTelefono.length > 0 && (
        <ul className="mt-2 space-y-1">
          {conTelefono.map((s) => {
            const tel = enlaceTel(s.telefono);
            return (
              <li key={s.id}>
                {conTelefono.length > 1 && `${s.nombre}: `}
                {tel ? <a href={tel} className={ENLACE}>{formatoTelefono(s.telefono ?? "")}</a> : s.telefono}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8"><Link href={`/${slug}`} className={ENLACE}>Volver al menú</Link></p>
    </main>
  );
}
