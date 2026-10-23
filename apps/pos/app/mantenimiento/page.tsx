"use client";
import { Icono } from "@vim/ui/styles";
import { PantallaEstado } from "../components/pantalla-estado";

const btnAccent = "inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-14 font-semibold text-white transition hover:brightness-95";

export default function Mantenimiento() {
  return (
    <PantallaEstado
      icono={<Icono nombre="llave-inglesa" className="h-7 w-7" />}
      titulo="Estamos en mantenimiento"
      texto="Estamos mejorando VIM POS. Volvemos pronto; tus datos están a salvo."
      acciones={<button type="button" onClick={() => window.location.reload()} className={btnAccent}>Comprobar de nuevo</button>}
      pie="Si te urge vender, tus dispositivos siguen funcionando sin conexión."
    />
  );
}
