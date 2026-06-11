"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { ConfigSideNav } from "../../../components/config-sidenav";
import { activarNotificaciones, desactivarNotificaciones, enviarPrueba, estadoSuscripcion, pushSoportado } from "../../../lib/push";

/** Fase 2 — notificaciones push de eventos críticos (conflictos de sync, cierres con diferencia). */
export default function NotificacionesPage() {
  const [soportado, setSoportado] = useState(true);
  const [activo, setActivo] = useState<boolean | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSoportado(pushSoportado());
    estadoSuscripcion().then(setActivo).catch(() => setActivo(false));
  }, []);

  async function correr(fn: () => Promise<void>, ok: string) {
    setTrabajando(true); setError(null); setMsg(null);
    try { await fn(); setActivo(await estadoSuscripcion()); setMsg(ok); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setTrabajando(false); }
  }

  return (
    <>
      <PageHeader titulo="Notificaciones" subtitulo="Avisos push de eventos críticos en este dispositivo." migas={[{ label: "Configuración" }, { label: "Notificaciones" }]} />
      <div className="flex">
        <ConfigSideNav />
        <PageBody>
          <div className="max-w-[560px] rounded-lg border border-line bg-surface p-5">
            <h2 className="font-display text-[16px] font-semibold tracking-tight">Eventos críticos</h2>
            <p className="mt-1 text-[13px] text-ink-3">
              Recibe un aviso en este dispositivo cuando pase algo que requiera tu atención:
              <b className="text-ink-2"> conflictos de sincronización</b> entre cajas y
              <b className="text-ink-2"> cierres de turno con diferencia de efectivo</b>.
            </p>

            {!soportado && (
              <p className="mt-4 rounded border border-[#E8DCC0] bg-[#F6EEDD] px-3 py-2 text-[12.5px] font-medium text-warning">
                Este navegador no soporta notificaciones push (o falta configurar la llave pública VAPID).
              </p>
            )}

            {soportado && activo !== null && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-sel px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className={["h-2.5 w-2.5 rounded-full", activo ? "bg-success" : "bg-ink-3"].join(" ")} />
                  <span className="text-[13.5px] font-semibold">{activo ? "Activas en este dispositivo" : "Desactivadas"}</span>
                </div>
                {activo ? (
                  <Button variant="ghost" onClick={() => correr(desactivarNotificaciones, "Notificaciones desactivadas.")} disabled={trabajando}>
                    Desactivar
                  </Button>
                ) : (
                  <Button onClick={() => correr(activarNotificaciones, "Notificaciones activadas en este dispositivo.")} disabled={trabajando}>
                    {trabajando ? "Activando…" : "Activar notificaciones"}
                  </Button>
                )}
              </div>
            )}

            {activo && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-line px-4 py-3">
                <span className="text-[13px] text-ink-2">Verifica que llegan correctamente:</span>
                <Button variant="ghost" disabled={trabajando}
                  onClick={() => correr(async () => { const r = await enviarPrueba(); setMsg(`Prueba enviada a ${r.enviadas} dispositivo${r.enviadas === 1 ? "" : "s"}.`); }, "")}>
                  Enviar prueba
                </Button>
              </div>
            )}

            {msg && <p className="mt-3 text-sm font-medium text-success">{msg}</p>}
            {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
          </div>
        </PageBody>
      </div>
    </>
  );
}
