import { redirect } from "next/navigation";

/** Los pasos de configuración viven ahora en el inicio. Esta dirección sigue en correos y enlaces viejos. */
export default function BienvenidaPage() {
  redirect("/dashboard");
}
