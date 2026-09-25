import { redirect } from "next/navigation";

/** "CFDI / PAC" ahora son los pasos 2 y 3 de Facturación: una sola pantalla para poder facturar. */
export default function CfdiRedirige() {
  redirect("/configuracion/facturacion#sello");
}
