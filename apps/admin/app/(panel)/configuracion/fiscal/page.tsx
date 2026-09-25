import { redirect } from "next/navigation";

/** "Datos fiscales" ahora es el paso 1 de Facturación: una sola pantalla para poder facturar. */
export default function DatosFiscalesRedirige() {
  redirect("/configuracion/facturacion#datos");
}
