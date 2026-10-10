"use client";
import { useEffect, useState, type ReactNode } from "react";
import { enlaceWhatsapp, SOPORTE_POR_DEFECTO, textoHorario } from "@vim/db/soporte";
import { usePerfil } from "./admin-shell";
import { leerAyuda, type AyudaAdmin } from "../lib/soporte";

/**
 * La tarjeta de una sección que el negocio todavía no tiene (inventario, lealtad).
 *
 * No es un aviso ni un muro: ocupa el lugar de la pantalla y dice qué es y cómo pedirlo. Una sola
 * acción —escribir por WhatsApp, con el mensaje ya hecho— porque lo activa VIM. Sin precios (salvo el
 * de lista de la tienda en línea, que va en su `cierre` cuando el plan no la incluye): los
 * dice quien contesta, que sabe en qué plan y con qué promoción está este cliente.
 */
export function PedirModulo({ titulo, texto, incluye, cierre, boton, mensaje }: {
  titulo: string;
  texto: ReactNode;
  incluye: readonly { titulo: string; detalle: string }[];
  cierre: string;
  boton: string;
  mensaje: (quien: { usuario: string | null | undefined; negocio: string | null; codigo: string | null }) => string;
}) {
  const perfil = usePerfil();
  // Arranca con el número de fábrica: el botón nunca queda sin a dónde escribir.
  const [ayuda, setAyuda] = useState<AyudaAdmin>({ soporte: SOPORTE_POR_DEFECTO, negocio: null, codigo: null });
  useEffect(() => { leerAyuda().then(setAyuda).catch(() => {}); }, []);

  const wa = enlaceWhatsapp(ayuda.soporte.whatsapp, mensaje({ usuario: perfil?.nombre, negocio: ayuda.negocio, codigo: ayuda.codigo }));
  const horario = textoHorario(ayuda.soporte);

  return (
    <section className="max-w-[640px] rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-20 font-semibold tracking-tight">{titulo}</h2>
      <p className="mt-1.5 text-14 leading-relaxed text-ink-2">{texto}</p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {incluye.map((x) => (
          <li key={x.titulo} className="text-14 leading-snug">
            <span className="font-semibold text-ink">{x.titulo}.</span>{" "}
            <span className="text-ink-2">{x.detalle}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4">
        <p className="text-14 text-ink-2">{cierre}</p>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex h-10 w-fit items-center rounded bg-accent px-4 text-14 font-semibold text-white transition-colors hover:bg-accent-hover active:scale-[.97]"
          >
            {boton}
          </a>
        )}
        {horario && <p className="text-12 text-ink-3">{horario}. Se abre WhatsApp con el mensaje ya escrito.</p>}
      </div>
    </section>
  );
}
