"use client";
import { useEffect, useState } from "react";
import { enlaceWhatsapp, SOPORTE_POR_DEFECTO, textoHorario } from "@vim/db/soporte";
import { PageBody, PageHeader } from "./page-header";
import { usePerfil } from "./admin-shell";
import { leerAyuda, type AyudaAdmin } from "../lib/soporte";
import { LEALTAD_INCLUYE, mensajeQuieroLealtad } from "../lib/lealtad-plan";

/**
 * Lo que ve en Lealtad un negocio que todavía no tiene el programa (ADR 0030).
 *
 * No es un aviso ni un muro: ocupa el lugar de la pantalla y dice qué es y cómo pedirlo. Una sola
 * acción —escribir por WhatsApp, con el mensaje ya hecho— porque lo activa VIM. Sin precios: los
 * dice quien contesta, que sabe en qué plan está este cliente.
 */
export function LealtadSinContratar() {
  const perfil = usePerfil();
  // Arranca con el número de fábrica: el botón nunca queda sin a dónde escribir.
  const [ayuda, setAyuda] = useState<AyudaAdmin>({ soporte: SOPORTE_POR_DEFECTO, negocio: null, codigo: null });
  useEffect(() => { leerAyuda().then(setAyuda).catch(() => {}); }, []);

  const wa = enlaceWhatsapp(ayuda.soporte.whatsapp, mensajeQuieroLealtad({ usuario: perfil?.nombre, negocio: ayuda.negocio, codigo: ayuda.codigo }));
  const horario = textoHorario(ayuda.soporte);

  return (
    <>
      <PageHeader titulo="Lealtad" subtitulo="Premia a los clientes que vuelven." />
      <PageBody>
        <section className="max-w-[640px] rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-20 font-semibold tracking-tight">Un programa de lealtad para tu negocio</h2>
          <p className="mt-1.5 text-14 leading-relaxed text-ink-2">
            Tus clientes ganan algo cada vez que compran y lo usan en su siguiente visita. Tú decides cómo ganan y qué reciben.
          </p>

          <ul className="mt-4 flex flex-col gap-2.5">
            {LEALTAD_INCLUYE.map((x) => (
              <li key={x.titulo} className="text-14 leading-snug">
                <span className="font-semibold text-ink">{x.titulo}.</span>{" "}
                <span className="text-ink-2">{x.detalle}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4">
            <p className="text-14 text-ink-2">Si te interesa, escríbenos y lo activamos contigo.</p>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex h-10 w-fit items-center rounded bg-accent px-4 text-14 font-semibold text-white transition-colors hover:bg-accent-hover active:scale-[.97]"
              >
                Preguntar por el programa de lealtad
              </a>
            )}
            {horario && <p className="text-12 text-ink-3">{horario}. Se abre WhatsApp con el mensaje ya escrito.</p>}
          </div>
        </section>
      </PageBody>
    </>
  );
}
