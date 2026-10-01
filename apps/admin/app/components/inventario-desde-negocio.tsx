"use client";
import { useEffect, useState, type ReactNode } from "react";
import { enlaceWhatsapp, SOPORTE_POR_DEFECTO, textoHorario } from "@vim/db/soporte";
import { PageBody, PageHeader } from "./page-header";
import { CatalogoTabs } from "./catalogo-tabs";
import { useModulos, usePerfil } from "./admin-shell";
import { leerAyuda, type AyudaAdmin } from "../lib/soporte";
import { estadoInventario, INVENTARIO_INCLUYE, mensajeQuieroInventario } from "../lib/inventario-plan";

/**
 * Lo que ve en Inventario (y en Recetas) un negocio cuyo plan no lo incluye (0148, ADR 0025).
 *
 * No es un aviso ni un muro: ocupa el lugar de la pantalla y dice, sin apuro, qué es el inventario
 * y cómo pedirlo. Una sola acción —escribir por WhatsApp, con el mensaje ya hecho— porque el cambio
 * de plan lo hace VIM, no hay nada que el dueño pueda activar aquí él solo. Nada de precios: los
 * dice quien contesta, que sabe qué promoción tiene este cliente.
 */
export function InventarioDesdeNegocio({ enRecetas = false }: { /** Desde Catálogo → Recetas: conserva su encabezado y sus pestañas. */ enRecetas?: boolean }) {
  const perfil = usePerfil();
  // Arranca con el número de fábrica: el botón nunca queda sin a dónde escribir.
  const [ayuda, setAyuda] = useState<AyudaAdmin>({ soporte: SOPORTE_POR_DEFECTO, negocio: null, codigo: null });
  useEffect(() => { leerAyuda().then(setAyuda).catch(() => {}); }, []);

  const wa = enlaceWhatsapp(ayuda.soporte.whatsapp, mensajeQuieroInventario({ usuario: perfil?.nombre, negocio: ayuda.negocio, codigo: ayuda.codigo }));
  const horario = textoHorario(ayuda.soporte);

  return (
    <>
      {enRecetas ? (
        <>
          <PageHeader titulo="Recetas y costos" subtitulo="Qué insumos lleva cada producto y cuánto te cuesta." migas={[{ label: "Catálogo" }, { label: "Recetas" }]} />
          <CatalogoTabs />
        </>
      ) : (
        <PageHeader titulo="Inventario" subtitulo="Insumos, recetas, compras y mermas." />
      )}
      <PageBody>
        <section className="max-w-[640px] rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-20 font-semibold tracking-tight">El inventario viene desde el plan Negocio</h2>
          <p className="mt-1.5 text-14 leading-relaxed text-ink-2">
            Tu plan cubre la caja, la cocina, tus mesas y tus reportes. Con el plan Negocio, además, VIM POS lleva la cuenta de lo
            que hay en tu bodega y de lo que te cuesta cada platillo.
          </p>

          <ul className="mt-4 flex flex-col gap-2.5">
            {INVENTARIO_INCLUYE.map((x) => (
              <li key={x.titulo} className="text-14 leading-snug">
                <span className="font-semibold text-ink">{x.titulo}.</span>{" "}
                <span className="text-ink-2">{x.detalle}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4">
            <p className="text-14 text-ink-2">Si te interesa, escríbenos y hacemos el cambio contigo. Lo que ya tienes capturado no se pierde.</p>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex h-10 w-fit items-center rounded bg-accent px-4 text-14 font-semibold text-white transition-colors hover:bg-accent-hover active:scale-[.97]"
              >
                Preguntar por el plan Negocio
              </a>
            )}
            {horario && <p className="text-12 text-ink-3">{horario}. Se abre WhatsApp con el mensaje ya escrito.</p>}
          </div>
        </section>
      </PageBody>
    </>
  );
}

/**
 * Envuelve las pantallas de inventario: con el módulo, las enseña; sin él, la explicación.
 * Mientras se lee, nada (un parpadeo de "Cargando…" es mejor que enseñar la pantalla equivocada).
 */
export function SoloConInventario({ children, enRecetas = false }: { children: ReactNode; enRecetas?: boolean }) {
  const estado = estadoInventario(useModulos());
  if (estado === "cargando") return <PageBody><p className="text-13 text-ink-3">Cargando…</p></PageBody>;
  if (estado === "no_incluido") return <InventarioDesdeNegocio enRecetas={enRecetas} />;
  return <>{children}</>;
}
