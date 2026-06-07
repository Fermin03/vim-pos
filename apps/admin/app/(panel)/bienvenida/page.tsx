"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { usePerfil } from "../../components/admin-shell";
import {
  actualizarFase,
  leerEstadoOnboarding,
  type EstadoOnboarding,
} from "../../lib/onboarding";

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
      setError(e instanceof Error ? e.message : "No se pudo cargar");
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
      setError(e instanceof Error ? e.message : "No se pudo finalizar");
      setFinalizando(false);
    }
  }

  const pct = estado ? Math.round((estado.obligatoriosHechos / Math.max(1, estado.obligatoriosTotal)) * 100) : 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col px-6 py-10">
      <div className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-accent">Bienvenido a VIM POS</div>
      <h1 className="font-display text-[30px] font-bold leading-tight tracking-tight">
        {primer ? `Hola, ${primer}.` : "¡Hola!"} Pongamos tu negocio a vender.
      </h1>
      <p className="mt-2 text-[14.5px] text-ink-2">
        Estos son los pasos para dejar todo listo. Puedes hacerlos en cualquier orden; se marcan solos
        cuando los completas.
      </p>

      {error && <p className="mt-4 text-sm font-medium text-danger">{error}</p>}
      {estado === null && !error && <p className="mt-6 text-sm text-ink-3">Cargando…</p>}

      {estado && (
        <>
          {/* Progreso */}
          <div className="mt-6 rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span className="font-semibold">Progreso de configuración</span>
              <span className="tabular-nums text-ink-2">{estado.obligatoriosHechos}/{estado.obligatoriosTotal} pasos</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-hover">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Pasos */}
          <div className="mt-4 flex flex-col gap-2.5">
            {estado.pasos.map((p, i) => (
              <div
                key={p.clave}
                className={`flex items-center gap-4 rounded-lg border p-4 ${p.completo ? "border-line bg-sel" : "border-line-strong bg-surface"}`}
              >
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${p.completo ? "bg-success text-white" : "border border-line-strong text-ink-3"}`}>
                  {p.completo ? <IconCheck /> : <span className="text-[13px] font-bold">{i + 1}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[14.5px] font-semibold ${p.completo ? "text-ink-2" : ""}`}>{p.titulo}</span>
                    {p.opcional && <span className="rounded-full bg-hover px-2 py-0.5 text-[10.5px] font-bold text-ink-3">Opcional</span>}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink-3">{p.descripcion}</div>
                </div>
                <Link href={p.href}>
                  <Button variant={p.completo ? "ghost" : "primary"}>{p.completo ? "Revisar" : "Configurar"}</Button>
                </Link>
              </div>
            ))}
          </div>

          {/* Cierre */}
          <div className="mt-6 rounded-lg border border-line bg-surface p-5">
            {estado.listoParaVender ? (
              <>
                <h2 className="font-display text-[17px] font-semibold">¡Todo listo para vender! 🎉</h2>
                <p className="mt-1 text-[13.5px] text-ink-2">
                  Completaste lo esencial. Abre el POS en tu tablet, inicia sesión con el PIN de un cajero y abre el turno.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button onClick={finalizar} disabled={finalizando}>{finalizando ? "Guardando…" : "Finalizar configuración"}</Button>
                  <Link href="/dashboard"><Button variant="ghost">Ir al panel</Button></Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-display text-[15px] font-semibold">Te faltan {estado.obligatoriosTotal - estado.obligatoriosHechos} pasos</h2>
                <p className="mt-1 text-[13.5px] text-ink-2">
                  Completa los pasos obligatorios y aquí aparecerá el botón para finalizar. Puedes salir y volver cuando quieras.
                </p>
                <div className="mt-4">
                  <Link href="/dashboard"><Button variant="ghost">Continuar después</Button></Link>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
