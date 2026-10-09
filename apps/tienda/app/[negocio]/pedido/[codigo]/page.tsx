// ESQUELETO (entrega 5, tarea 2). El seguimiento en vivo lo pone la tarea 4: un componente de
// cliente que sondea con `seguimiento()` de app/lib/api.ts. El código es la llave del pedido: no
// va a registros ni a buscadores, y next.config.mjs manda `Referrer-Policy: no-referrer` aquí.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FORMA_CODIGO, FORMA_SLUG } from "../../../lib/contrato";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false, follow: false } };

export default async function PaginaDelPedido({ params }: { params: Promise<{ negocio: string; codigo: string }> }) {
  const { negocio, codigo } = await params;
  if (!FORMA_SLUG.test(negocio) || !FORMA_CODIGO.test(codigo)) notFound();
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-24 font-semibold">Tu pedido</h1>
    </main>
  );
}
