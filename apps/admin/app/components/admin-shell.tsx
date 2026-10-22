"use client";
import { LogoVim, Icono } from "@vim/ui/styles";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { leerSesion } from "../lib/supabase";
import { cargarPerfil, iniciales, type Perfil } from "../lib/perfil";
import { salir } from "../lib/supabase";
import { listarSucursales } from "../lib/configuracion";
import { JERARQUIA_MINIMA_PANEL, puedeVer } from "../lib/acceso";
import { leerAcceso, ACCESO_OK, type Acceso } from "../lib/acceso-tenant";
import { enlaceWhatsapp, mensajeAyudaAdmin, SOPORTE_POR_DEFECTO, textoHorario } from "@vim/db/soporte";
import { leerAyuda, type AyudaAdmin } from "../lib/soporte";
import { leerModulos } from "../lib/modulos";
import { rutasOcultas } from "../lib/operacion";
import { seccionEnLinea } from "../lib/tienda-plan";
import { estadoInventario, rutaEsDeInventario, type ModulosLeidos } from "../lib/inventario-plan";
import { estadoTienda } from "../lib/tienda-plan";
import { leerReportesDisponibles, type ReportesDisponibles } from "../lib/reportes";
import { idsGruposVisibles } from "../lib/reportes-grupos";
import { MENU, conSeccionEnLinea, filtrarMenu } from "../lib/menu-admin";
import { MenuLateral } from "./menu-lateral";

const PerfilCtx = createContext<Perfil | null>(null);
export const usePerfil = () => useContext(PerfilCtx);

/** Estado de la suscripción del negocio (ADR 0014). Las pantallas de alta lo consultan para
 *  apagar sus botones cuando el servicio está bloqueado. */
const AccesoCtx = createContext<Acceso>(ACCESO_OK);
export const useAccesoTenant = () => useContext(AccesoCtx);

/**
 * Lo que VIM le permite al negocio (ADR 0014), leído una vez al entrar. `null` = leyendo;
 * `"error"` = la consulta falló (quien lo use decide qué hacer: ver `estadoInventario`).
 */
const ModulosCtx = createContext<ModulosLeidos | "error" | null>(null);
export const useModulos = () => useContext(ModulosCtx);
/** Vuelve a leer los módulos: tras encender un interruptor del dueño, el menú cambia sin recargar. */
const RecargarModulosCtx = createContext<() => void>(() => {});
export const useRecargarModulos = () => useContext(RecargarModulosCtx);

/** Lo que ve quien llega a una sección que su rol no alcanza. */
function SinAcceso({ rol }: { rol: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
        <Icono nombre="candado" className="h-6 w-6" />
      </div>
      <h1 className="font-display text-20 font-semibold tracking-tight">Esta sección no está disponible para ti</h1>
      <p className="max-w-sm text-14 leading-snug text-ink-2">
        Tu cuenta tiene el rol <b>{rol}</b>. Si necesitas entrar aquí, pídele al dueño del negocio
        que ajuste tus permisos.
      </p>
      <Link href="/dashboard" className="mt-2 inline-flex h-10 items-center rounded border border-line-strong px-4 text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
        Ir al panel
      </Link>
    </main>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [listo, setListo] = useState(false);
  const [sinAcceso, setSinAcceso] = useState<string | null>(null);
  // Cuenta del registro público SIN negocio: el alta se quedó a medias (0142). No es "no te han
  // invitado": se le dice que escriba a soporte.
  const [altaIncompleta, setAltaIncompleta] = useState(false);
  const [sucursales, setSucursales] = useState<{ nombre: string; total: number } | null>(null);
  const [acceso, setAcceso] = useState<Acceso>(ACCESO_OK);
  // Soporte de VIM (0142). Arranca con el de fábrica: el enlace nunca queda en blanco.
  const [ayuda, setAyuda] = useState<AyudaAdmin>({ soporte: SOPORTE_POR_DEFECTO, negocio: null, codigo: null });
  // Módulos que el plan (o una excepción de VIM) le permite. Hoy lo usa Inventario (0148).
  const [modulos, setModulos] = useState<ModulosLeidos | "error" | null>(null);
  // Qué grupos de reportes enseña el índice: el submenú de Informes enseña los mismos.
  const [reportes, setReportes] = useState<ReportesDisponibles | null>(null);
  // Cajón lateral: solo existe por debajo de `lg`. En escritorio el <aside> es estático.
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Navegar cierra el cajón (si no, queda tapando la pantalla nueva).
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  // Estado de la suscripción, cada 10 minutos: el mismo ritmo con el que la caja late, porque
  // es la misma decisión y no tiene sentido que el dueño y su cajero vean cosas distintas.
  useEffect(() => {
    let vivo = true;
    const cargar = () => { leerAcceso().then((a) => { if (vivo) setAcceso(a); }).catch(() => {}); };
    cargar();
    const id = setInterval(cargar, 10 * 60_000);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  // Bloquea el scroll del documento y permite cerrar con Esc mientras el cajón está abierto.
  useEffect(() => {
    if (!menuAbierto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuAbierto(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuAbierto]);

  useEffect(() => {
    (async () => {
      const s = await leerSesion();
      if (!s) {
        router.replace("/");
        return;
      }
      // Fase 4 (SSO): sesión válida pero SIN tenant = correo no invitado a ningún negocio.
      if (!s.tenantId) {
        setSinAcceso(s.email);
        setAltaIncompleta(s.autoservicio);
        setListo(true);
        return;
      }
      setPerfil(await cargarPerfil());
      setListo(true);
      leerAyuda().then(setAyuda).catch(() => {});
      leerModulos().then(setModulos).catch(() => setModulos("error"));
      leerReportesDisponibles().then(setReportes).catch(() => {});
      // El selector del sidebar muestra la sucursal real del tenant (antes decía "León Centro"
      // fijo, que es el dato del mockup: cualquier cliente nuevo veía el nombre equivocado).
      listarSucursales()
        .then((subs) => {
          const activas = subs.filter((x) => x.activa);
          const lista = activas.length > 0 ? activas : subs;
          if (lista.length > 0) setSucursales({ nombre: lista[0]!.nombre, total: lista.length });
        })
        .catch(() => {});
    })();
  }, [router]);

  // El menú filtrado se recalcula solo cuando cambia lo que lo decide: si no, el acordeón se
  // reiniciaría en cada render.
  const jerMenu = perfil?.jerarquia ?? null;
  const menu = useMemo(() => {
    const ocultas = new Set(rutasOcultas(modulos));
    // Sin el add-on concedido (ADR 0014) se esconde la conexión, no la conciliación. Mientras carga
    // también: esconder de más es recuperable (misma regla que tenía Configuración).
    if (!(modulos !== null && modulos !== "error" && modulos.permitidos.delivery_apps === true)) ocultas.add("/configuracion/integraciones");
    const tienda = estadoTienda(modulos);
    // Con agenda (belleza) la tienda también lleva las reservas: se llama «En línea».
    return filtrarMenu(conSeccionEnLinea(MENU, seccionEnLinea(modulos)), {
      jerarquia: jerMenu,
      ocultas,
      tiendaContratada: tienda === "cargando" ? null : tienda !== "sin_contratar",
      gruposInformes: reportes ? idsGruposVisibles(reportes, jerMenu) : null,
    });
  }, [modulos, reportes, jerMenu]);

  if (listo && sinAcceso && altaIncompleta) {
    // Sin tenant la RPC de soporte no devuelve nada: va el número oficial de fábrica.
    const wa = enlaceWhatsapp(
      SOPORTE_POR_DEFECTO.whatsapp,
      `Hola, me registré en VIM POS con ${sinAcceso} y mi cuenta no terminó de crearse. ¿Me ayudan?`,
    );
    const horario = textoHorario(SOPORTE_POR_DEFECTO);
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <Icono nombre="info" className="h-6 w-6" />
        </div>
        <h1 className="font-display text-24 font-semibold tracking-tight">Tu cuenta no terminó de crearse</h1>
        <p className="max-w-md text-14 leading-relaxed text-ink-3">
          Tu correo <b className="text-ink-2">{sinAcceso}</b> quedó confirmado, pero tu negocio no se dio de alta. No tienes que
          registrarte otra vez: escríbenos por WhatsApp y lo terminamos contigo.
        </p>
        {horario && <p className="text-13 text-ink-3">{horario}</p>}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-accent px-5 py-2.5 text-14 font-semibold text-white transition hover:bg-accent-hover">
              Escríbenos por WhatsApp
            </a>
          )}
          <button type="button" onClick={async () => { const { supabase } = await import("../lib/supabase"); await supabase.auth.signOut(); router.replace("/"); }}
            className="rounded-lg border border-line-strong px-5 py-2.5 text-14 font-semibold text-ink-2 transition hover:border-ink">
            Salir
          </button>
        </div>
      </main>
    );
  }

  if (listo && sinAcceso) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <Icono nombre="info" className="h-6 w-6" />
        </div>
        <h1 className="font-display text-24 font-semibold tracking-tight">Tu correo no tiene acceso todavía</h1>
        <p className="max-w-md text-14 leading-relaxed text-ink-3">
          Entraste como <b className="text-ink-2">{sinAcceso}</b>, pero ese correo no está invitado a ningún negocio en VIM POS.
          Pide al dueño que te invite desde su panel (Usuarios) con este mismo correo, o crea tu negocio.
        </p>
        <div className="mt-2 flex gap-2">
          <a href="/registro" className="rounded-lg bg-accent px-5 py-2.5 text-14 font-semibold text-white transition hover:brightness-95">Crear mi negocio</a>
          <button type="button" onClick={async () => { const { supabase } = await import("../lib/supabase"); await supabase.auth.signOut(); router.replace("/"); }}
            className="rounded-lg border border-line-strong px-5 py-2.5 text-14 font-semibold text-ink-2 transition hover:border-ink">
            Salir
          </button>
        </div>
      </main>
    );
  }

  if (!listo) {
    return (
      <main className="flex h-[100dvh] items-center justify-center">
        <p className="text-sm text-ink-3">Cargando…</p>
      </main>
    );
  }

  // El panel no es para quien opera la caja.
  //
  // Un cajero con correo y contraseña podía entrar: el menú le mostraba solo "Panel", pero el
  // panel enseña la venta del día, y las políticas de la base filtran por NEGOCIO, no por rol —
  // así que los datos seguían a su alcance para quien supiera consultarlos. Se corta en la
  // puerta: su herramienta es el POS, donde entra con su PIN.
  //
  // No se le quita la cuenta: su acceso al punto de venta no depende de este correo, y borrarla
  // sería irreversible por un problema que se resuelve cerrando una puerta.
  if (perfil && perfil.jerarquia < JERARQUIA_MINIMA_PANEL) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <Icono nombre="candado" className="h-6 w-6" />
        </div>
        <h1 className="font-display text-24 font-semibold tracking-tight">Este panel es para la administración</h1>
        <p className="max-w-md text-14 leading-relaxed text-ink-3">
          Tu cuenta tiene el rol <b className="text-ink-2">{perfil.rolNombre}</b>, que opera el
          punto de venta. Entra desde la caja con tu PIN. Si necesitas ver reportes o
          configuración, pídele al dueño del negocio que ajuste tus permisos.
        </p>
        <button
          type="button"
          onClick={async () => { const { supabase } = await import("../lib/supabase"); await supabase.auth.signOut(); router.replace("/"); }}
          className="mt-2 rounded-lg border border-line-strong px-5 py-2.5 text-14 font-semibold text-ink-2 transition hover:border-ink"
        >
          Salir
        </button>
      </main>
    );
  }

  const jer = perfil?.jerarquia ?? 0;
  const waAyuda = enlaceWhatsapp(
    ayuda.soporte.whatsapp,
    mensajeAyudaAdmin({ usuario: perfil?.nombre, negocio: ayuda.negocio, codigo: ayuda.codigo }),
  );
  const horarioAyuda = textoHorario(ayuda.soporte);
  // Inventario sigue en el menú aunque el plan no lo incluya: se marca, no se esconde (0148).
  const sinInventario = estadoInventario(modulos) === "no_incluido";

  return (
    <PerfilCtx.Provider value={perfil}>
     <ModulosCtx.Provider value={modulos}>
     <RecargarModulosCtx.Provider value={() => { leerModulos().then(setModulos).catch(() => {}); }}>
     <AccesoCtx.Provider value={acceso}>
      <div className="flex h-[100dvh] lg:h-screen">
        {/* Velo del cajón (solo móvil/tablet). */}
        <div
          onClick={() => setMenuAbierto(false)}
          aria-hidden="true"
          className={[
            "fixed inset-0 z-40 bg-ink/50 transition-opacity duration-200 lg:hidden",
            menuAbierto ? "opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
        />

        {/* ===== Sidebar (cajón deslizable por debajo de lg, estático en escritorio) ===== */}
        <aside
          id="menu-lateral"
          className={[
            "fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-shrink-0 flex-col bg-ink text-[#C8C8CC]",
            "transition-transform duration-200 ease-out",
            menuAbierto ? "translate-x-0" : "-translate-x-full",
            "lg:static lg:z-auto lg:w-[248px] lg:translate-x-0 lg:transition-none",
          ].join(" ")}
        >
          <div className="flex h-14 flex-shrink-0 items-center gap-[11px] border-b border-[#2C2C32] px-5 lg:h-16">
            <LogoVim className="h-8 w-8 flex-shrink-0" />
            <div className="font-display text-base font-bold tracking-tight text-white">VIM POS</div>
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setMenuAbierto(false)}
              className="-mr-2 ml-auto flex h-11 w-11 items-center justify-center rounded text-[#76767E] transition-colors hover:text-white lg:hidden"
            >
              <Icono nombre="cerrar" className="h-5 w-5" />
            </button>
          </div>

          {/* El negocio arriba, como en Square. Solo texto: la sucursal se elige en cada página. */}
          <div className="mx-3 mt-4 flex items-center gap-2.5 rounded border border-[#2C2C32] bg-[#1E1E23] px-3 py-2.5">
            <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-md bg-[#2A2A30]">
              <Icono nombre="edificio" className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-14 font-semibold text-white">{ayuda.negocio ?? sucursales?.nombre ?? "—"}</div>
              <div className="mt-px truncate text-12 text-[#76767E]">
                {sucursales
                  ? `${ayuda.negocio ? `${sucursales.nombre} · ` : ""}1 de ${sucursales.total} ${sucursales.total === 1 ? "sucursal" : "sucursales"}`
                  : "Cargando…"}
              </div>
            </div>
          </div>

          <MenuLateral menu={menu} pathname={pathname} marcaPlan={(href) => sinInventario && rutaEsDeInventario(href)} alNavegar={() => setMenuAbierto(false)} />

          {/* Ayuda por WhatsApp (0142): fuera de las secciones porque no es una pantalla, y a la
              vista en el cajón del celular igual que en el escritorio. Abre en otra pestaña. */}
          {waAyuda && (
            <a
              href={waAyuda}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-3 mb-3 flex min-h-[44px] items-center gap-[11px] rounded border border-[#2C2C32] px-3 py-2 text-sm font-medium text-[#C8C8CC] transition-colors hover:bg-[#1E1E23] hover:text-white lg:min-h-0"
            >
              <Icono nombre="chat" className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="min-w-0">
                <span className="block">Ayuda por WhatsApp</span>
                {horarioAyuda && <span className="block text-12 font-normal text-[#76767E]">{horarioAyuda}</span>}
              </span>
            </a>
          )}

          <div className="flex flex-shrink-0 items-center gap-2.5 border-t border-[#2C2C32] p-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:pb-3">
            <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border border-[#2C2C32] bg-[#2A2A30] font-display text-13 font-semibold text-white">
              {iniciales(perfil?.nombre ?? "U")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-14 font-semibold text-white">{perfil?.nombre}</div>
              <div className="text-12 text-[#76767E]">{perfil?.rolNombre}</div>
            </div>
            <button
              type="button"
              aria-label="Cerrar sesión"
              onClick={async () => {
                await salir();
                router.replace("/");
              }}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-[#76767E] transition-colors hover:text-white lg:h-auto lg:w-auto"
            >
              <Icono nombre="salir" width="17" height="17" />
            </button>
          </div>
        </aside>

        {/* ===== Main ===== */}
        <div className="flex min-w-0 flex-1 flex-col bg-bg">
          {/* Barra superior móvil: abre el cajón. Oculta en escritorio (el sidebar ya está visible). */}
          <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-[#2C2C32] bg-ink px-2 pr-4 lg:hidden">
            <button
              type="button"
              aria-label="Abrir menú"
              aria-expanded={menuAbierto}
              aria-controls="menu-lateral"
              onClick={() => setMenuAbierto(true)}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-white transition-colors hover:bg-[#1E1E23]"
            >
              <Icono nombre="menu" className="h-[22px] w-[22px]" />
            </button>
            <LogoVim className="h-7 w-7 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-14 font-bold leading-tight tracking-tight text-white">VIM POS</div>
              <div className="truncate text-12 leading-tight text-[#76767E]">{sucursales?.nombre ?? "—"}</div>
            </div>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[#2C2C32] bg-[#2A2A30] font-display text-12 font-semibold text-white">
              {iniciales(perfil?.nombre ?? "U")}
            </div>
          </header>
          {/* Guardián de rutas. El menú ya oculta lo que no corresponde al rol, pero ocultar un
              enlace no impide teclear la dirección: sin esto, un cajero llegaba a la configuración
              fiscal o al reporte Z escribiéndolos en la barra. Usa la MISMA tabla que el menú.

              Mientras el perfil carga no se bloquea nada: hacerlo mostraría un "sin acceso" de un
              parpadeo a todo el mundo, y enseñar a ignorar ese aviso es peor que no tenerlo. */}
          {/* Estado de la suscripción (ADR 0014). Bloqueado no cierra el panel: lo deja en solo
              lectura, porque el dueño necesita sus reportes y sus datos fiscales justo para
              poder pagar y cerrar su contabilidad. */}
          {acceso.nivel !== "ok" && (
            <div
              role="status"
              className={[
                "flex-shrink-0 px-5 py-2.5 text-center text-13 font-semibold",
                acceso.nivel === "bloqueado" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
              ].join(" ")}
            >
              {acceso.mensaje}
              {acceso.nivel === "bloqueado" && (
                <span className="ml-2 font-normal text-ink-2">Tu panel quedó en solo lectura hasta que se reactive.</span>
              )}
            </div>
          )}
          {perfil && !puedeVer(jer, pathname) ? <SinAcceso rol={perfil.rolNombre} /> : children}
        </div>
      </div>
     </AccesoCtx.Provider>
     </RecargarModulosCtx.Provider>
     </ModulosCtx.Provider>
    </PerfilCtx.Provider>
  );
}
