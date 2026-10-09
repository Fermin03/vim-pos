// El menú de un negocio. De servidor: lee el negocio y, ya con la sucursal, su menú; el carrito y
// todo lo que se toca vive en <Tienda> (cliente).
//
// La sucursal viaja en la URL (`?s=<id>`) cuando hay más de una: así el menú correcto sale del
// servidor, el enlace se puede compartir y «atrás» funciona. Con una sola no hay parámetro.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Tienda } from "../components/tienda";
import { momentoMx } from "../lib/horario";
import { modosDe, motivoDeCierre, sucursalElegida } from "../lib/pantalla";
import { leerMenu, negocioDeLaPeticion } from "../lib/servidor/funcion";
import { textoCerrada } from "../lib/textos";

type Props = { params: Promise<{ negocio: string }>; searchParams: Promise<{ s?: string | string[] }> };

// Título y descripción del negocio. La imagen para compartir y el resto del SEO los pone la tarea 4.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const leido = await negocioDeLaPeticion((await params).negocio);
  if (leido.estado !== "ok") return {};
  const { nombre, descripcion } = leido.datos;
  return { title: `${nombre} · Pide en línea`, description: descripcion ?? `Pide en línea en ${nombre}, para recoger o a domicilio.` };
}

function Fallo({ titulo, hacer, reintentar }: { titulo: string; hacer: string; reintentar?: string }) {
  return (
    <main className="px-6 py-16 text-center">
      <h1 className="font-display text-20 font-semibold">{titulo}</h1>
      <p className="mt-2 text-16 text-ink-2">{hacer}</p>
      {reintentar && (
        // Un enlace normal, no <Link>: tiene que volver a pedir la página entera al servidor.
        <a href={reintentar} className="mt-6 inline-flex h-12 items-center rounded border border-line-strong px-5 font-display text-15 font-semibold text-ink hover:bg-hover">Volver a intentar</a>
      )}
    </main>
  );
}

export default async function PaginaDelNegocio({ params, searchParams }: Props) {
  const [{ negocio: slug }, { s }] = await Promise.all([params, searchParams]);
  const leido = await negocioDeLaPeticion(slug);
  if (leido.estado === "no-existe") notFound();
  if (leido.estado === "no-disponible") return <Fallo titulo="No pudimos cargar la tienda" hacer="Vuelve a intentar en unos minutos." reintentar={`/${slug}`} />;
  const negocio = leido.datos;
  if (negocio.sucursales.length === 0) return <Fallo titulo="Esta tienda no está disponible por ahora" hacer="Llama al restaurante para hacer tu pedido." />;

  const ahora = momentoMx();
  const sucursal = sucursalElegida(negocio, typeof s === "string" ? s : undefined);
  if (!sucursal) {
    return (
      <main className="px-4 pb-8">
        <h1 className="font-display text-20 font-semibold">¿De qué sucursal quieres pedir?</h1>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {negocio.sucursales.map((x) => {
            const modos = modosDe(x), cerrada = modos.every((m) => motivoDeCierre(x, m) !== null);
            return (
              <li key={x.id}>
                <Link href={`/${negocio.slug}?s=${x.id}`} className="flex min-h-14 flex-col gap-1 py-4 hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
                  <span className="text-16 font-semibold">{x.nombre}</span>
                  {x.direccion && <span className="text-14 text-ink-2">{x.direccion}</span>}
                  <span className="text-14 text-ink-2">{cerrada ? textoCerrada(motivoDeCierre(x, modos[0] ?? "RECOGER") ?? "", x.horario, ahora) : "Abierto"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    );
  }

  const menu = await leerMenu(negocio.slug, sucursal.id);
  if (menu.estado !== "ok") {
    return <Fallo titulo="No pudimos cargar el menú" hacer="Vuelve a intentar en unos minutos." reintentar={`/${negocio.slug}${negocio.sucursales.length > 1 ? `?s=${sucursal.id}` : ""}`} />;
  }
  // La llave: al cambiar de sucursal la tienda arranca de cero (otro menú, otro carrito).
  return <main><Tienda key={sucursal.id} negocio={negocio} sucursal={sucursal} menu={menu.datos} ahora={ahora} /></main>;
}
