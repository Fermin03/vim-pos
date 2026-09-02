"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../../../components/page-header";
import { listarSucursales, type Sucursal } from "../../../../../lib/configuracion";
import { accionConexion, mensajeErrorIntegracion, validarState, type TiendaUber } from "../../../../../lib/integraciones";

/**
 * Callback del OAuth de Uber (spec F1b). Llega con ?code&state (o ?error). Valida el state,
 * canjea el code en la Edge Function y muestra el asistente tienda → sucursal.
 */
type Fase = { tipo: "validando" } | { tipo: "error"; mensaje: string } | { tipo: "tiendas"; tiendas: TiendaUber[] };
type Asignacion = { sucursal_id: string; auto_aceptar: boolean; tiempo_prep_min: number; resultado: "pendiente" | "activando" | "ok" | string };

export default function CallbackUberPage() {
  return (
    <Suspense fallback={<PageBody><p className="text-sm text-ink-3">Cargando…</p></PageBody>}>
      <Callback />
    </Suspense>
  );
}

function Callback() {
  const params = useSearchParams();
  const [fase, setFase] = useState<Fase>({ tipo: "validando" });
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [asig, setAsig] = useState<Record<string, Asignacion>>({});
  const [terminos, setTerminos] = useState(false);

  useEffect(() => {
    const err = params.get("error");
    const code = params.get("code");
    const state = params.get("state");
    if (err) {
      setFase({ tipo: "error", mensaje: err === "access_denied"
        ? "No autorizaste el acceso en Uber. Puedes volver a intentarlo cuando quieras."
        : `Uber devolvió un error (${err}).` });
      return;
    }
    if (!validarState(state)) {
      setFase({ tipo: "error", mensaje: "La sesión de conexión no es válida. Vuelve a empezar desde Apps de delivery." });
      return;
    }
    if (!code) {
      setFase({ tipo: "error", mensaje: "Uber no devolvió el código de autorización. Vuelve a intentarlo." });
      return;
    }
    (async () => {
      try {
        const [r, s] = await Promise.all([accionConexion("intercambiar", { code }), listarSucursales()]);
        setSucursales(s.filter((x) => x.activa));
        const inicial: Record<string, Asignacion> = {};
        for (const t of r.tiendas) inicial[t.id] = { sucursal_id: "", auto_aceptar: true, tiempo_prep_min: 15, resultado: "pendiente" };
        setAsig(inicial);
        setFase({ tipo: "tiendas", tiendas: r.tiendas });
      } catch (e) {
        setFase({ tipo: "error", mensaje: mensajeErrorIntegracion(e) });
      }
    })();
    // Solo al montar: los params no cambian dentro de esta pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const SIN_ASIGNAR: Asignacion = { sucursal_id: "", auto_aceptar: true, tiempo_prep_min: 15, resultado: "pendiente" };
  const pon = (id: string, cambios: Partial<Asignacion>) =>
    setAsig((a) => ({ ...a, [id]: { ...(a[id] ?? SIN_ASIGNAR), ...cambios } }));

  async function activar(t: TiendaUber) {
    const a = asig[t.id];
    if (!a?.sucursal_id) return;
    pon(t.id, { resultado: "activando" });
    try {
      await accionConexion("activar", {
        tienda_id: t.id, sucursal_id: a.sucursal_id, auto_aceptar: a.auto_aceptar,
        tiempo_prep_min: a.tiempo_prep_min, terminos_aceptados: terminos,
      });
      pon(t.id, { resultado: "ok" });
    } catch (e) {
      pon(t.id, { resultado: mensajeErrorIntegracion(e) });
    }
  }

  const usadas = new Set(Object.values(asig).map((a) => a.sucursal_id).filter(Boolean));
  const th = "border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3";

  return (
    <>
      <PageHeader
        titulo="Conectar Uber Eats"
        subtitulo="Elige a qué sucursal de VIM corresponde cada tienda de Uber."
        migas={[{ label: "Configuración" }, { label: "Apps de delivery", href: "/configuracion/integraciones" }, { label: "Conectar Uber Eats" }]}
      />
      <PageBody>
        {fase.tipo === "validando" && <p className="text-sm text-ink-3">Consultando tus tiendas en Uber…</p>}

        {fase.tipo === "error" && (
          <div className="max-w-[560px] rounded-lg border border-line bg-surface p-5">
            <p className="text-sm font-medium text-danger" role="alert">{fase.mensaje}</p>
            <div className="mt-4">
              <Link href="/configuracion/integraciones"><Button variant="ghost">Volver a Apps de delivery</Button></Link>
            </div>
          </div>
        )}

        {fase.tipo === "tiendas" && fase.tiendas.length === 0 && (
          <div className="max-w-[560px] rounded-lg border border-line bg-surface p-5 text-sm text-ink-2">
            Tu cuenta de Uber no tiene tiendas. Entra con la cuenta que administra el restaurante en Uber Eats Manager.
            <div className="mt-4">
              <Link href="/configuracion/integraciones"><Button variant="ghost">Volver a Apps de delivery</Button></Link>
            </div>
          </div>
        )}

        {fase.tipo === "tiendas" && fase.tiendas.length > 0 && (
          <div className="max-w-[860px]">
            <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Tienda en Uber</th>
                    <th className={`${th} w-[220px]`}>Sucursal en VIM</th>
                    <th className={`${th} w-[110px]`}>Auto-aceptar</th>
                    <th className={`${th} w-[100px]`}>Prep (min)</th>
                    <th className={`${th} w-[150px]`}></th>
                  </tr>
                </thead>
                <tbody>
                  {fase.tiendas.map((t) => {
                    const a: Asignacion = asig[t.id] ?? { sucursal_id: "", auto_aceptar: true, tiempo_prep_min: 15, resultado: "pendiente" };
                    const ya = t.conectada_a !== null;
                    const bloqueada = a.resultado === "ok" || a.resultado === "activando";
                    const fallo = a.resultado !== "ok" && a.resultado !== "pendiente" && a.resultado !== "activando";
                    return (
                      <tr key={t.id} className="border-b border-line last:border-none">
                        <td className="px-4 py-3.5">
                          <div className="text-[15px] font-semibold">{t.nombre}</div>
                          <div className="text-[13px] text-ink-3">{[t.direccion, t.ciudad].filter(Boolean).join(", ") || "Sin dirección"}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          {ya ? (
                            <span className="text-[13px] text-ink-2">Conectada a <b className="text-ink">{t.conectada_a!.sucursal_nombre}</b></span>
                          ) : (
                            <select
                              value={a.sucursal_id} disabled={bloqueada} aria-label={`Sucursal para ${t.nombre}`}
                              onChange={(e) => pon(t.id, { sucursal_id: e.target.value })}
                              className="h-9 w-full rounded border border-line bg-surface px-2 text-[13.5px]"
                            >
                              <option value="">No conectar</option>
                              {sucursales.map((s) => (
                                <option key={s.id} value={s.id} disabled={usadas.has(s.id) && a.sucursal_id !== s.id}>{s.nombre}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {!ya && <input type="checkbox" checked={a.auto_aceptar} disabled={bloqueada} onChange={(e) => pon(t.id, { auto_aceptar: e.target.checked })} className="h-4 w-4 accent-accent" aria-label="Auto-aceptar" />}
                        </td>
                        <td className="px-4 py-3.5">
                          {!ya && (
                            <input
                              type="number" min={1} max={180} value={a.tiempo_prep_min} disabled={bloqueada} aria-label="Minutos de preparación"
                              onChange={(e) => pon(t.id, { tiempo_prep_min: Number(e.target.value) || 15 })}
                              className="h-9 w-[76px] rounded border border-line bg-surface px-2 text-right text-[13.5px] tabular-nums"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {!ya && a.resultado === "ok" && <span className="text-[13px] font-semibold text-success">Conectada</span>}
                          {!ya && a.resultado !== "ok" && (
                            <Button disabled={!a.sucursal_id || !terminos || a.resultado === "activando"} onClick={() => activar(t)}>
                              {a.resultado === "activando" ? "Activando…" : "Activar"}
                            </Button>
                          )}
                          {!ya && fallo && <div className="mt-1 text-[12.5px] text-danger" role="alert">{a.resultado}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <label className="mt-4 flex items-start gap-2.5 text-[13px] text-ink-2">
              <input type="checkbox" checked={terminos} onChange={(e) => setTerminos(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent" />
              <span>
                Autorizo a VIM POS a recibir en mi nombre los pedidos y datos de mis tiendas de Uber Eats y a usarlos
                únicamente para operar y reportar mis ventas.
              </span>
            </label>

            <div className="mt-6">
              <Link href="/configuracion/integraciones"><Button variant="ghost">Ir a Apps de delivery</Button></Link>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
