// ESQUELETO (entrega 5, tarea 2): comprueba la capa de servidor de punta a punta. El menú, la marca
// del negocio y el carrito los pone la tarea 3 encima de esto.
import { notFound } from "next/navigation";
import { leerNegocio } from "../lib/servidor/funcion";

export default async function PaginaDelNegocio({ params }: { params: Promise<{ negocio: string }> }) {
  const { negocio: slug } = await params;
  const negocio = await leerNegocio(slug);
  if (negocio.estado === "no-existe") notFound();
  if (negocio.estado === "no-disponible") {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-20 font-semibold">No pudimos cargar la tienda</h1>
        <p className="mt-2 text-16 text-ink-2">Vuelve a intentar en unos minutos.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-24 font-semibold">{negocio.datos.nombre}</h1>
    </main>
  );
}
