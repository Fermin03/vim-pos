import { redirect } from "next/navigation";

/** La primera pantalla es la bandeja de pendientes, a propósito (ver components/atencion.tsx). */
export default function Inicio() {
  redirect("/atencion");
}
