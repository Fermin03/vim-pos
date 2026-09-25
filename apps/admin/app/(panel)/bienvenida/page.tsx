"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, botonClases } from "@vim/ui/styles";
import { usePerfil } from "../../components/admin-shell";
import {
  actualizarFase,
  leerEstadoOnboarding,
  type EstadoOnboarding,
} from "../../lib/onboarding";
import { mensajeError } from "../../lib/errores";

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5"><path d="M20 6L9 17l-5-5" /></svg>
  );
}

export default function BienvenidaPage() {
  const perfil = usePerfil();
  const router = useRouter();
  const primer = (perfil?.nombre ?? "").split(/\s+/)[0] || "";
  const [estado, setEstado] = useState<EstadoOnboarding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const e = await leerEstadoOnboarding();
      setEstado(e);
      // Al entrar por primera vez, marca que ya empezó la configuración.
      if (e.fase === "INVITADO") {
        await actualizarFase("EN_CONFIGURACION", 1).catch(() => {});
      }
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar"));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function finalizar() {
    setFinalizando(true);
    try {
      await actualizarFase("GO_LIVE");
      router.push("/dashboard");
    } catch (e) {
      setError(mensajeError(e, "No se pudo finalizar"));
      setFinalizando(false);
    }
  }

  const avance = estado ? estado.obligatoriosHechos / Math.max(1, estado.obligatoriosTotal) : 0;
  const faltan = estado ? estado.obligatoriosTotal - estado.obligatoriosHechos : 0;
  // El siguiente paso pendiente es el único botón primario: los demás, secundarios.
  const siguiente = estado?.pasos.find((p) => !p.completo && !p.opcional)?.clave;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-accent">Bienvenido a VIM POS</div>
      <h1 className="font-display text-[24px] font-bold leading-tight tracking-tight sm:text-[30px]">
        {primer ? `Hola, ${primer}.` : "¡Hola!"} Pongamos tu negocio a vender.
      </h1>
      <p className="mt-2 text-[15px] text-ink-2">
        Estos son los pasos para dejar todo listo. Puedes hacerlos en cualquier orden y se marcan solos
        cuando los terminas.
      </p>

      {error && <p className="mt-4 text-sm font-medium text-danger">{error}</p>}
      {estado === null && !error && <p className="mt-6 text-sm text-ink-2">Cargando…</p>}

      {estado && (
        <>
          {/* Progreso */}
          <div className="mt-6 rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between text-[13.5px]">
              <span id="progreso-titulo" className="font-semibold">Tu avance</span>
              <span className="tabular-nums text-ink-2">{estado.obligatoriosHechos} de {estado.obligatoriosTotal} pasos</span>
            </div>
            {/* scaleX en vez de width: se anima en el compositor, sin recalcular el layout. */}
            <div
              role="progressbar"
              aria-labelledby="progreso-titulo"
              aria-valuemin={0}
              aria-valuemax={estado.obligatoriosTotal}
              aria-valuenow={estado.obligatoriosHechos}
              className="h-2.5 overflow-hidden rounded-full bg-hover"
            >
              <div
                className="h-full origin-left rounded-full bg-accent transition-transform duration-500 ease-vim motion-reduce:transition-none"
                style={{ transform: `scaleX(${avance})` }}
              />
            </div>
          </div>

          {/* Pasos */}
          <div className="mt-4 flex flex-col gap-2.5">
            {estado.pasos.map((p, i) => (
              <div
                key={p.clave}
                className={`flex flex-col items-start gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-4 ${p.completo ? "border-line bg-sel" : "border-line-strong bg-surface"}`}
              >
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${p.completo ? "bg-success text-white" : "border border-line-strong text-ink-3"}`}>
                  {p.completo ? <IconCheck /> : <span className="text-[13px] font-bold">{i + 1}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[14.5px] font-semibold ${p.completo ? "text-ink-2" : ""}`}>{p.titulo}</span>
                    {p.opcional && <span className="rounded-full bg-hover px-2 py-0.5 text-[12px] font-semibold text-ink-2">Opcional</span>}
                  </div>
                  <div className="mt-0.5 text-[13.5px] text-ink-2">{p.descripcion}</div>
                </div>
                <Link
                  href={p.href}
                  className={`${botonClases({ variant: p.clave === siguiente ? "primary" : "ghost" })} w-full sm:w-auto`}
                >
                  {p.completo ? "Revisar" : p.clave === "vincular" ? "Conectar" : "Configurar"}
                </Link>
              </div>
            ))}
          </div>

          {/* Cierre */}
          <div className="mt-6 rounded-lg border border-line bg-surface p-5">
            {estado.listoParaVender ? (
              <>
                <h2 className="font-display text-[17px] font-semibold">Todo listo para vender</h2>
                <p className="mt-1 text-[14px] text-ink-2">
                  En la computadora de tu caja, entra a VIM POS con el PIN de un cajero y abre el turno.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={finalizar} disabled={finalizando}>{finalizando ? "Guardando…" : "Terminar configuración"}</Button>
                  <Link href="/dashboard" className={botonClases({ variant: "ghost" })}>Ir al panel</Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-display text-[15px] font-semibold">{faltan === 1 ? "Te falta 1 paso" : `Te faltan ${faltan} pasos`}</h2>
                <p className="mt-1 text-[14px] text-ink-2">
                  Puedes salir y volver cuando quieras: esta lista te espera en el inicio del panel hasta que termines.
                </p>
                <div className="mt-4">
                  <Link href="/dashboard" className={botonClases({ variant: "ghost" })}>Continuar después</Link>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
