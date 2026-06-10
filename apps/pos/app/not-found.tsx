import Link from "next/link";
import { PantallaEstado } from "./components/pantalla-estado";

const btnAccent = "inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-95";

export default function NotFound() {
  return (
    <PantallaEstado
      codigo="404"
      titulo="No encontramos esta página"
      texto="La página que buscas no existe o fue movida. Revisa la dirección o vuelve al inicio para continuar."
      acciones={<Link href="/" className={btnAccent}>Volver al inicio</Link>}
      pie={<>¿Crees que es un error? <a href="mailto:soporte@vimpos.com.mx" className="font-semibold text-accent hover:underline">Avísale a soporte</a>.</>}
    />
  );
}
