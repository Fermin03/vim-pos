"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fechaLegible } from "@vim/fecha";
import type { AddonCatalogo, Detalle, Plan } from "../lib/tipos";
import { fmtMxn, input, label, NOMBRE_SUSCRIPCION, nombreFase } from "../lib/formato";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Accion = (b: Record<string, unknown>) => Promise<void>;

const sub = "mb-1.5 flex items-center justify-between";
const subTitulo = "text-[12px] font-semibold uppercase tracking-wide text-ink-2";
const bloque = "rounded-lg border border-line p-3";
const btnFantasma = "btn h-9 rounded border border-line-strong px-3 text-[13px] font-semibold hover:bg-hover disabled:opacity-50";

/**
 * Lo que dar de baja cada add-on le hace al cliente. Va en el diálogo porque la baja antes era un
 * clic, y la de delivery pausa sus tiendas de Uber.
 */
const CONSECUENCIA_BAJA: Record<string, string> = {
  DELIVERY: "Se pausan sus tiendas en Uber Eats y la caja deja de recibir pedidos de apps.",
  CFDI: "Deja de poder facturar: se apagan la sección de facturas del admin, el QR del ticket y el portal de autofactura.",
};

type Pendiente =
  | { tipo: "plan" }
  | { tipo: "addon_activar"; addon: AddonCatalogo }
  | { tipo: "addon_desactivar"; addon: AddonCatalogo; precio: number }
  | { tipo: "suscripcion"; estado: "ACTIVA" | "PAUSADA" | "NUEVA" }
  | { tipo: "abandonado" | "reactivar" }
  | { tipo: "cancelar_suscripcion" }
  | null;

/** Antes → después, en dos columnas. */
function Cambio({ antes, despues }: { antes: ReactNode; despues: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded border border-line bg-sel px-3 py-2.5 text-[13px]">
      <div>{antes}</div>
      <span className="text-ink-2" aria-hidden="true">→</span>
      <div className="font-semibold">{despues}</div>
    </div>
  );
}

/**
 * Contrato: qué paga y qué tiene contratado.
 *
 * Toda acción que mueve dinero u operación pasa por un diálogo con motivo (revisión de diseño, sep
 * 2026): el plan se cambiaba en el onChange de un <select> —una flecha del teclado con el foco ahí
 * cambiaba lo que paga el cliente— y la baja de un add-on era un clic. La fricción es graduada:
 * lo que cuesta dinero o corta la operación pide además el nombre del cliente; lo reversible, solo
 * el motivo; marcarlo en operación, nada.
 */
export function FichaContrato({ d, planes, accion, busy }: { d: Detalle; planes: Plan[]; accion: Accion; busy: boolean }) {
  const t = d.tenant;
  const nombre = String(t.nombre_comercial);
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const [planNuevo, setPlanNuevo] = useState("");

  // Notas: el refresco automático (cada 60 s) traía la versión del servidor y pisaba lo que se
  // estaba escribiendo. Solo se reponen si no hay cambios sin guardar.
  const notasServidor = String(((t.onboarding as { notas_internas?: string } | null)?.notas_internas) ?? "");
  const [notas, setNotas] = useState(notasServidor);
  const ultimaServidor = useRef(notasServidor);
  const notasSucias = notas !== ultimaServidor.current;
  useEffect(() => {
    setNotas((actual) => (actual === ultimaServidor.current ? notasServidor : actual));
    ultimaServidor.current = notasServidor;
  }, [notasServidor]);

  // La lista trae los planes vigentes MÁS el que tenga este cliente aunque esté retirado.
  const actual = t.plan as { id?: string; codigo?: string; nombre?: string; precio_mensual_mxn?: number } | null;
  const retirado = actual?.id && !planes.some((p) => p.id === actual.id) ? actual : null;
  const elegido = planes.find((p) => p.id === planNuevo) ?? null;

  const subs = (t.suscripcion as { estado: string; precio_mensual_mxn: number; proxima_fecha_cobro: string | null; ciclo_facturacion?: string }[]) ?? [];
  const suscripcion = subs.find((s) => s.estado === "ACTIVA" || s.estado === "PAUSADA") ?? null;

  const ob = t.onboarding as { fase?: string } | null;
  const fase = ob?.fase ?? "—";

  const cerrar = () => setPendiente(null);
  const hacer = async (body: Record<string, unknown>) => {
    await accion(body);
    setPendiente(null);
  };

  const planTexto = (p: { codigo?: string; nombre?: string; precio_mensual_mxn?: number } | null) =>
    p ? <>{p.nombre ?? p.codigo} · {fmtMxn(Number(p.precio_mensual_mxn ?? 0))}/mes</> : <span className="text-ink-2">Sin plan</span>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        {/* Plan: se ve, y se cambia con un botón que abre el diálogo. */}
        <div className={bloque}>
          <div className={sub}>
            <span className={subTitulo}>Plan</span>
            <button type="button" onClick={() => { setPlanNuevo(""); setPendiente({ tipo: "plan" }); }} disabled={busy} className={btnFantasma}>
              Cambiar plan…
            </button>
          </div>
          <div className="text-[14px] font-semibold">{planTexto(actual)}</div>
          {retirado && (
            <p className="mt-1 text-[12.5px] text-ink-2">Está en un plan que ya no se vende. Se le respeta mientras no se acuerde el cambio con él.</p>
          )}
        </div>

        {/* Suscripción */}
        <div className={`${bloque} mt-4`}>
          <div className={sub}>
            <span className={subTitulo}>Cobro</span>
            {suscripcion
              ? <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${suscripcion.estado === "ACTIVA" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{NOMBRE_SUSCRIPCION[suscripcion.estado] ?? suscripcion.estado}</span>
              : <span className="text-[12.5px] text-ink-2">sin cobro</span>}
          </div>
          {suscripcion && (
            <div className="mb-2 text-[13px] text-ink-2">
              {fmtMxn(suscripcion.precio_mensual_mxn)}/mes{suscripcion.proxima_fecha_cobro ? ` · próximo cobro el ${fechaLegible(suscripcion.proxima_fecha_cobro)}` : ""}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(!suscripcion || suscripcion.estado === "PAUSADA") && (
              <button onClick={() => setPendiente({ tipo: "suscripcion", estado: suscripcion ? "ACTIVA" : "NUEVA" })} disabled={busy} className="btn h-9 rounded bg-ink px-3 text-[13px] font-semibold text-white disabled:opacity-50">
                {suscripcion ? "Reanudar cobro…" : "Activar cobro…"}
              </button>
            )}
            {suscripcion?.estado === "ACTIVA" && (
              <button onClick={() => setPendiente({ tipo: "suscripcion", estado: "PAUSADA" })} disabled={busy} className={btnFantasma}>Pausar cobro…</button>
            )}
          </div>
          {/* Cancelar, aparte y abajo: antes estaba junto a "Pausar", a un clic de distancia. */}
          {suscripcion && (
            <button onClick={() => setPendiente({ tipo: "cancelar_suscripcion" })} disabled={busy} className="mt-3 text-[13px] font-semibold text-danger underline-offset-2 hover:underline disabled:opacity-50">
              Cancelar suscripción…
            </button>
          )}
        </div>
      </div>

      <div>
        {/* Onboarding */}
        <div className={bloque}>
          <div className={sub}>
            <span className={subTitulo}>Alta</span>
            <span className="rounded-full bg-sel px-2 py-0.5 text-[12px] font-semibold text-ink-2">{nombreFase(fase)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {fase !== "GO_LIVE" && fase !== "ABANDONADO" && (
              <button onClick={() => void accion({ accion: "marcar_fase", fase: "GO_LIVE" }).catch(() => {})} disabled={busy} className={btnFantasma}>Marcar en operación</button>
            )}
            {fase === "ABANDONADO" && (
              <button onClick={() => setPendiente({ tipo: "reactivar" })} disabled={busy} className={btnFantasma}>Reactivar alta…</button>
            )}
          </div>
          {fase !== "ABANDONADO" && (
            <button onClick={() => setPendiente({ tipo: "abandonado" })} disabled={busy} className="mt-3 text-[13px] font-semibold text-ink-2 underline-offset-2 hover:text-danger hover:underline disabled:opacity-50">
              Marcar como abandonado…
            </button>
          )}
        </div>

        {/* Add-ons contratados. El de facturación enciende el CFDI en cascada: la sección de
            facturas en /admin, el QR del ticket y el portal público. */}
        <div className="mt-4">
          <span className={label}>Add-ons</span>
          <div className="flex flex-col gap-2">
            {d.catalogoAddons.length === 0 && <p className="text-[12.5px] text-ink-2">No hay add-ons en el catálogo.</p>}
            {d.catalogoAddons.map((a) => {
              const contratado = d.addons.find((x) => x.addon?.codigo === a.codigo && x.activo);
              const precio = Number(contratado ? contratado.precio_mensual_mxn : a.precio_mensual_mxn);
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">{a.nombre}</div>
                    <div className="text-[12.5px] text-ink-2">
                      {/* Con fila contratada, el precio real es el que se grabó al contratar (puede ser
                          $0.00 si el plan lo incluye), no el de catálogo. */}
                      {fmtMxn(precio)}/mes{contratado ? ` · activo desde el ${fechaLegible(contratado.fecha_inicio)}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => setPendiente(contratado ? { tipo: "addon_desactivar", addon: a, precio } : { tipo: "addon_activar", addon: a })}
                    disabled={busy}
                    className={`btn h-9 shrink-0 rounded px-3 text-[13px] font-semibold disabled:opacity-50 ${contratado ? "border border-line-strong hover:bg-hover" : "bg-ink text-white"}`}
                  >
                    {contratado ? "Dar de baja…" : "Activar…"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Notas internas */}
      <div className="lg:col-span-2">
        <label className={label} htmlFor="notas">Notas internas</label>
        <textarea id="notas" className={`${input} h-20 py-2`} value={notas} onChange={(e) => setNotas(e.target.value)} />
        <div className="mt-2 flex items-center gap-3">
          <button onClick={() => void accion({ accion: "notas", notas }).catch(() => {})} disabled={busy || !notasSucias} className="btn h-9 rounded border border-line-strong px-3 text-[13px] font-semibold hover:bg-hover disabled:opacity-50">
            Guardar notas
          </button>
          {notasSucias && <span className="text-[12.5px] text-ink-2" aria-live="polite">Sin guardar: el refresco automático no las toca.</span>}
        </div>
      </div>

      {/* ── Diálogos ─────────────────────────────────────────────────────────── */}
      <DialogoConfirmar
        abierto={pendiente?.tipo === "plan"}
        onCerrar={cerrar}
        titulo="Cambiar plan"
        descripcion={<>Cambia lo que paga <b>{nombre}</b> y lo que puede usar. Si tiene cobro activo, el precio de la suscripción no cambia solo: ajústalo aparte.</>}
        detalle={
          <div className="flex flex-col gap-2">
            <label className={label} htmlFor="plan-nuevo">Plan nuevo</label>
            <select id="plan-nuevo" className={input} value={planNuevo} onChange={(e) => setPlanNuevo(e.target.value)}>
              <option value="">Elige un plan…</option>
              {planes.map((p) => <option key={p.id} value={p.id} disabled={p.id === actual?.id}>{p.nombre} · {fmtMxn(p.precio_mensual_mxn)}/mes</option>)}
            </select>
            {elegido && <Cambio antes={planTexto(actual)} despues={planTexto(elegido)} />}
          </div>
        }
        listo={{ ok: !!elegido && elegido.id !== actual?.id, falta: "elegir un plan distinto al actual" }}
        nombreEsperado={nombre}
        etiquetaBoton="Cambiar plan"
        ocupado={busy}
        onConfirmar={({ motivo }) => hacer({ accion: "cambiar_plan", plan_id: planNuevo, motivo })}
      />

      <DialogoConfirmar
        abierto={pendiente?.tipo === "addon_desactivar"}
        onCerrar={cerrar}
        titulo={pendiente?.tipo === "addon_desactivar" ? `Dar de baja ${pendiente.addon.nombre}` : ""}
        descripcion={
          pendiente?.tipo === "addon_desactivar" ? (
            <>
              <b>{nombre}</b> deja de pagar {fmtMxn(pendiente.precio)}/mes por él.{" "}
              {CONSECUENCIA_BAJA[pendiente.addon.codigo] ?? "Pierde acceso a lo que incluye."}
            </>
          ) : null
        }
        nombreEsperado={nombre}
        etiquetaBoton="Dar de baja"
        peligroso
        ocupado={busy}
        onConfirmar={({ motivo }) => hacer({ accion: "addon_desactivar", addon_codigo: pendiente?.tipo === "addon_desactivar" ? pendiente.addon.codigo : "", motivo })}
      />

      <DialogoConfirmar
        abierto={pendiente?.tipo === "addon_activar"}
        onCerrar={cerrar}
        titulo={pendiente?.tipo === "addon_activar" ? `Activar ${pendiente.addon.nombre}` : ""}
        descripcion={pendiente?.tipo === "addon_activar" ? <>Se le empieza a cobrar a <b>{nombre}</b> desde hoy, con el precio que corresponda a su plan (puede ser $0 si lo incluye).</> : null}
        sinNombre
        nombreEsperado={nombre}
        etiquetaBoton="Activar"
        ocupado={busy}
        onConfirmar={({ motivo }) => hacer({ accion: "addon_activar", addon_codigo: pendiente?.tipo === "addon_activar" ? pendiente.addon.codigo : "", motivo })}
      />

      <DialogoConfirmar
        abierto={pendiente?.tipo === "suscripcion"}
        onCerrar={cerrar}
        titulo={pendiente?.tipo === "suscripcion" ? (pendiente.estado === "PAUSADA" ? "Pausar el cobro" : pendiente.estado === "NUEVA" ? "Activar el cobro" : "Reanudar el cobro") : ""}
        descripcion={
          pendiente?.tipo === "suscripcion" && pendiente.estado === "PAUSADA"
            ? <>No se le cobra a <b>{nombre}</b> mientras esté en pausa. La caja sigue funcionando.</>
            : <>Se le empieza a cobrar a <b>{nombre}</b> {actual ? <>{fmtMxn(Number(actual.precio_mensual_mxn ?? 0))}/mes, el precio de su plan</> : "el precio de su plan"}. Si estaba en prueba, pasa a activo.</>
        }
        sinNombre
        nombreEsperado={nombre}
        etiquetaBoton={pendiente?.tipo === "suscripcion" && pendiente.estado === "PAUSADA" ? "Pausar" : "Activar"}
        ocupado={busy}
        onConfirmar={({ motivo }) =>
          hacer(
            pendiente?.tipo === "suscripcion" && pendiente.estado === "NUEVA"
              ? { accion: "suscripcion_activar", motivo }
              : { accion: "suscripcion_estado", estado: pendiente?.tipo === "suscripcion" ? pendiente.estado : "ACTIVA", motivo },
          )
        }
      />

      <DialogoConfirmar
        abierto={pendiente?.tipo === "abandonado" || pendiente?.tipo === "reactivar"}
        onCerrar={cerrar}
        titulo={pendiente?.tipo === "abandonado" ? "Marcar como abandonado" : "Reactivar el alta"}
        descripcion={
          pendiente?.tipo === "abandonado"
            ? <>El alta de <b>{nombre}</b> se da por perdida: sale de las alertas de altas estancadas. La caja y el cobro no cambian.</>
            : <>El alta de <b>{nombre}</b> vuelve a «En configuración».</>
        }
        sinNombre
        nombreEsperado={nombre}
        etiquetaBoton={pendiente?.tipo === "abandonado" ? "Marcar abandonado" : "Reactivar"}
        ocupado={busy}
        onConfirmar={({ motivo }) => hacer({ accion: "marcar_fase", fase: pendiente?.tipo === "abandonado" ? "ABANDONADO" : "EN_CONFIGURACION", motivo })}
      />

      <DialogoConfirmar
        abierto={pendiente?.tipo === "cancelar_suscripcion"}
        onCerrar={cerrar}
        titulo="Cancelar suscripción"
        descripcion={<>Se detiene el cobro de <b>{nombre}</b>. El acceso sigue hasta que cambies su estado en la zona peligrosa.</>}
        nombreEsperado={nombre}
        etiquetaBoton="Cancelar suscripción"
        peligroso
        ocupado={busy}
        onConfirmar={({ motivo }) => hacer({ accion: "suscripcion_estado", estado: "CANCELADA", motivo })}
      />
    </div>
  );
}
