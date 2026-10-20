"use client";
import { useEffect, useState } from "react";
import { BrandMark } from "../components/topbar-pos";
import { salirColaborador, sesionColaborador } from "../lib/sesion-colaborador";
import { Entrada } from "./entrada";

/**
 * /mi-agenda: la agenda del colaborador en su celular, fuera del cascarón de la caja. Su sesión es
 * de correo y contraseña (lib/sesion-colaborador); la caja y su dispositivo no intervienen.
 */
export default function MiAgendaPage() {
  // undefined = leyendo la sesión guardada; null = sin sesión.
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  const leer = () => void sesionColaborador().then(setEmail, () => setEmail(null));
  useEffect(leer, []);

  if (email === undefined) return <main className="min-h-[100dvh]" aria-busy="true" />;
  if (email === null) return <Entrada alEntrar={leer} />;

  return (
    <main className="flex min-h-[100dvh] flex-col">
      <header className="flex h-14 items-center gap-3 border-b border-line px-4">
        <BrandMark size={28} />
        <span className="min-w-0 flex-1 truncate text-14 text-ink-2">{email}</span>
        <button type="button" onClick={() => void salirColaborador().then(() => setEmail(null))}
          className="min-h-[44px] rounded px-3 text-14 font-semibold text-ink-2 transition-transform active:scale-[.97]">
          Cerrar sesión
        </button>
      </header>
    </main>
  );
}
