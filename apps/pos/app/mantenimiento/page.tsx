"use client";
import { PantallaEstado } from "../components/pantalla-estado";

const btnAccent = "inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-95";

export default function Mantenimiento() {
  return (
    <PantallaEstado
      icono={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z" /></svg>}
      titulo="Estamos en mantenimiento"
      texto="Estamos mejorando VIM POS para ti. El servicio volverá pronto — no necesitas hacer nada, tus datos están a salvo."
      acciones={<button type="button" onClick={() => window.location.reload()} className={btnAccent}>Comprobar de nuevo</button>}
      pie="Si necesitas operar con urgencia, el modo sin conexión sigue disponible en tus dispositivos. Para dudas, contacta a soporte."
    />
  );
}
