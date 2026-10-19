// La página de una cita reservada en línea. Como la del pedido: el servidor solo valida la forma del
// código; la cita la pide el navegador (components/reservas/cita.tsx). El código es la llave: no va
// al título, a registros ni a buscadores, y next.config.mjs manda `Referrer-Policy: no-referrer`.
// Con las reservas apagadas la cita se sigue viendo (la función la resuelve aparte).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hoyMx } from "@vim/fecha";
import { PaginaDeCita } from "../../../components/reservas/cita";
import { FORMA_CODIGO, FORMA_SLUG } from "../../../lib/contrato";
import { reservasDeLaPeticion } from "../../../lib/servidor/funcion";

type Props = { params: Promise<{ negocio: string; codigo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { negocio } = await params;
  const leido = FORMA_SLUG.test(negocio) ? await reservasDeLaPeticion(negocio) : null;
  return { title: leido?.estado === "ok" ? `Tu cita · ${leido.datos.nombre}` : "Tu cita", robots: { index: false, follow: false } };
}

export default async function PaginaDeLaCita({ params }: Props) {
  const { negocio, codigo } = await params;
  if (!FORMA_SLUG.test(negocio) || !FORMA_CODIGO.test(codigo)) notFound();
  const reservas = await reservasDeLaPeticion(negocio);
  return (
    <main>
      <PaginaDeCita slug={negocio} codigo={codigo} hoy={hoyMx()} diasReserva={reservas.estado === "ok" ? reservas.datos.reglas.dias_reserva : 30} />
    </main>
  );
}
