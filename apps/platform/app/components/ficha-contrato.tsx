"use client";
import { useEffect, useState } from "react";
import type { Detalle, Plan } from "../lib/tipos";
import { fmtMxn, input, label } from "../lib/formato";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Accion = (b: Record<string, unknown>) => Promise<void>;

const sub = "mb-1.5 flex items-center justify-between";
const subTitulo = "text-[11px] font-bold uppercase tracking-wide text-ink-3";
const bloque = "rounded-lg border border-line p-3";
const btnFantasma = "btn h-8 rounded border border-line-strong px-3 text-[12.5px] font-semibold hover:bg-hover disabled:opacity-50";

/**
 * Contrato: qué paga y qué tiene contratado. Plan y suscripción a la izquierda, onboarding y
 * add-ons a la derecha, notas abajo. Los textos y las reglas vienen del cajón anterior; lo que
 * cambia es que ya no se apilan diez bloques en una columna.
 */
export function FichaContrato({ d, planes, accion, busy }: { d: Detalle; planes: Plan[]; accion: Accion; busy: boolean }) {
  const t = d.tenant;
  const nombre = String(t.nombre_comercial);
  const [notas, setNotas] = useState("");
  const [cancelandoSub, setCancelandoSub] = useState(false);

  useEffect(() => {
    setNotas(String(((t.onboarding as { notas_internas?: string } | null)?.notas_internas) ?? ""));
  }, [t.onboarding]);

  // La lista trae los planes vigentes MÁS el que tenga este cliente aunque esté retirado. Sin
  // eso, quien siguiera en uno de los planes por vertical —retirados en la 0086— veía el selector
  // en "— elegir —", porque un <select> cuyo valor no corresponde a ninguna opción cae a la
  // primera. Parecía un cliente sin plan, que es justo lo contrario de lo que pasa.
  const actual = t.plan as { id?: string; codigo?: string; nombre?: string; precio_mensual_mxn?: number } | null;
  const retirado = actual?.id && !planes.some((p) => p.id === actual.id) ? actual : null;

  const subs = (t.suscripcion as { estado: string; precio_mensual_mxn: number; proxima_fecha_cobro: string | null; ciclo_facturacion?: string }[]) ?? [];
  const suscripcion = subs.find((s) => s.estado === "ACTIVA" || s.estado === "PAUSADA") ?? null;

  const ob = t.onboarding as { fase?: string } | null;
  const fase = ob?.fase ?? "—";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Plan */}
      <div>
        <label className={label} htmlFor="plan-sel">Plan</label>
        <select id="plan-sel" className={input} value={String(actual?.id ?? "")} onChange={(e) => accion({ accion: "cambiar_plan", plan_id: e.target.value })} disabled={busy}>
          <option value="">— elegir —</option>
          {retirado && (
            <option value={String(retirado.id)}>
              {retirado.codigo} · {retirado.nombre} ({fmtMxn(Number(retirado.precio_mensual_mxn ?? 0))}) — plan retirado
            </option>
          )}
          {planes.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre} ({fmtMxn(p.precio_mensual_mxn)})</option>)}
        </select>
        {retirado && (
          <p className="mt-1 text-[12px] text-ink-3">Está en un plan que ya no se vende. Se le respeta mientras no se acuerde el cambio con él.</p>
        )}

        {/* Suscripción */}
        <div className={`${bloque} mt-4`}>
          <div className={sub}>
            <span className={subTitulo}>Suscripción</span>
            {suscripcion
              ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${suscripcion.estado === "ACTIVA" ? "bg-[#EAF3EE] text-success" : "bg-[#FCF3E6] text-warning"}`}>{suscripcion.estado}</span>
              : <span className="text-[12px] text-ink-3">sin cobro</span>}
          </div>
          {suscripcion && (
            <div className="mb-2 text-[12.5px] text-ink-2">
              {fmtMxn(suscripcion.precio_mensual_mxn)}/mes{suscripcion.proxima_fecha_cobro ? ` · próximo cobro ${suscripcion.proxima_fecha_cobro}` : ""}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(!suscripcion || suscripcion.estado === "PAUSADA") && (
              <button onClick={() => accion(suscripcion ? { accion: "suscripcion_estado", estado: "ACTIVA" } : { accion: "suscripcion_activar" })} disabled={busy} className="btn h-8 rounded bg-success px-3 text-[12.5px] font-semibold text-white disabled:opacity-50">
                {suscripcion ? "Reanudar" : "Activar cobro"}
              </button>
            )}
            {suscripcion?.estado === "ACTIVA" && (
              <button onClick={() => accion({ accion: "suscripcion_estado", estado: "PAUSADA" })} disabled={busy} className={btnFantasma}>Pausar</button>
            )}
            {suscripcion && (
              <button onClick={() => setCancelandoSub(true)} disabled={busy} className={`${btnFantasma} text-ink-3 hover:text-danger`}>Cancelar suscripción…</button>
            )}
          </div>
        </div>
      </div>

      <div>
        {/* Onboarding */}
        <div className={bloque}>
          <div className={sub}>
            <span className={subTitulo}>Onboarding</span>
            <span className="rounded-full bg-sel px-2 py-0.5 text-[11px] font-semibold text-ink-2">{fase}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {fase !== "ABANDONADO" && (
              <button onClick={() => accion({ accion: "marcar_fase", fase: "ABANDONADO" })} disabled={busy} className={`${btnFantasma} text-ink-3 hover:text-danger`}>Marcar abandonado</button>
            )}
            {fase === "ABANDONADO" && (
              <button onClick={() => accion({ accion: "marcar_fase", fase: "EN_CONFIGURACION" })} disabled={busy} className={btnFantasma}>Reactivar onboarding</button>
            )}
            {fase !== "GO_LIVE" && fase !== "ABANDONADO" && (
              <button onClick={() => accion({ accion: "marcar_fase", fase: "GO_LIVE" })} disabled={busy} className={btnFantasma}>Marcar GO_LIVE</button>
            )}
          </div>
        </div>

        {/* Add-ons contratados. El de facturación es el que enciende el CFDI en cascada:
            la sección de facturas en /admin, el QR del ticket y el portal público. */}
        <div className="mt-4">
          <label className={label}>Add-ons</label>
          <div className="flex flex-col gap-2">
            {d.catalogoAddons.length === 0 && <p className="text-[12px] text-ink-3">No hay add-ons en el catálogo.</p>}
            {d.catalogoAddons.map((a) => {
              const contratado = d.addons.find((x) => x.addon?.codigo === a.codigo && x.activo);
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">{a.nombre}</div>
                    <div className="text-[11.5px] text-ink-3">
                      {fmtMxn(Number(a.precio_mensual_mxn))}/mes{contratado ? ` · activo desde ${contratado.fecha_inicio}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => accion({ accion: contratado ? "addon_desactivar" : "addon_activar", addon_codigo: a.codigo })}
                    disabled={busy}
                    className={`btn h-9 shrink-0 rounded px-3 text-[12.5px] font-semibold disabled:opacity-50 ${contratado ? "border border-line-strong hover:bg-hover" : "bg-ink text-white"}`}
                  >
                    {contratado ? "Dar de baja" : "Activar"}
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
        <button onClick={() => accion({ accion: "notas", notas })} disabled={busy} className="btn mt-2 h-9 rounded border border-line-strong px-3 text-[13px] font-semibold hover:bg-hover disabled:opacity-50">
          Guardar notas
        </button>
      </div>

      <DialogoConfirmar
        abierto={cancelandoSub}
        onCerrar={() => setCancelandoSub(false)}
        titulo="Cancelar suscripción"
        descripcion={<>Se detiene el cobro de <b>{nombre}</b>. El acceso sigue hasta que cambies su estado en la zona peligrosa.</>}
        nombreEsperado={nombre}
        etiquetaBoton="Cancelar suscripción"
        peligroso
        ocupado={busy}
        onConfirmar={async ({ motivo }) => {
          await accion({ accion: "suscripcion_estado", estado: "CANCELADA", motivo });
          setCancelandoSub(false);
        }}
      />
    </div>
  );
}
