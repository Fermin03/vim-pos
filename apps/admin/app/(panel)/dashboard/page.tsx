"use client";
import Link from "next/link";
import { PageHeader, PageBody } from "../../components/page-header";
import { usePerfil } from "../../components/admin-shell";

const ACCESOS = [
  { href: "/catalogo", nombre: "Catálogo", desc: "Categorías, productos, modificadores y precios" },
  { href: "/usuarios", nombre: "Usuarios", desc: "Empleados, roles y PIN de acceso" },
  { href: "/configuracion", nombre: "Configuración", desc: "Negocio, fiscal, sucursales, impresión" },
  { href: "/reportes", nombre: "Reportes", desc: "Ventas, cortes Z, desempeño" },
];

export default function DashboardPage() {
  const perfil = usePerfil();
  const primer = (perfil?.nombre ?? "").split(/\s+/)[0] || "";

  return (
    <>
      <PageHeader titulo={`Hola, ${primer}`} subtitulo="Esto es lo que pasa hoy en León Centro" />
      <PageBody>
        <div className="mb-6 rounded-lg border border-line bg-surface p-6">
          <h2 className="font-display text-base font-semibold">Panel en construcción</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-2">
            Las métricas en vivo (ventas por hora, tickets, top productos) aparecerán cuando el POS
            empiece a registrar ventas (F5). Por ahora, administra tu negocio desde los accesos de abajo.
          </p>
        </div>

        <h3 className="mb-3 font-display text-base font-semibold">Accesos</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {ACCESOS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-ink hover:bg-sel"
            >
              <div className="text-[13.5px] font-semibold">{a.nombre}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{a.desc}</div>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
