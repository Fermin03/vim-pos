"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fechaLegible, hoyMx, sumarDias, sumarMeses } from "@vim/fecha";
import { estadoPrueba, textoPrecio, type PrecioSuscripcion } from "@vim/db/cobro";
import type { AddonCatalogo, Detalle, Plan } from "../lib/tipos";
import { fechaValida, PILOTO, promocionPiloto } from "../lib/promocion";
import { vistaPreviaCambioPlan, type AddonDelTenant } from "../lib/cambio-plan";
import { precioValido } from "../lib/precio";
import { fmtMxn, input, label, NOMBRE_SUSCRIPCION, nombreFase } from "../lib/formato";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Accion = (b: Record<string, unknown>) => Promise<void>;

const sub = "mb-1.5 flex items-center justify-between";
const subTitulo = "text-12 font-semibold uppercase tracking-wide text-ink-2";
const bloque = "rounded-lg border border-line p-3";
const btnFantasma = "btn h-9 rounded border border-line-strong px-3 text-13 font-semibold hover:bg-hover disabled:opacity-50";

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
  | { tipo: "prueba" }
  | null;

type ModoPromo = "ninguna" | "piloto" | "otra";

/** Suscripción tal como llega en la ficha (con la promoción de 0141). */
type SuscripcionFicha = PrecioSuscripcion & { estado: string; proxima_fecha_cobro: string | null; ciclo_facturacion?: string };

const fmtPrecio = { fecha: fechaLegible, mxn: fmtMxn };

/** Antes → después, en dos columnas. */
function Cambio({ antes, despues }: { antes: ReactNode; despues: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded border border-line bg-sel px-3 py-2.5 text-13">
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
export function FichaContrato({ d, planes, accion, busy, accesoDueno }: { d: Detalle; planes: Plan[]; accion: Accion; busy: boolean; /** El acceso del dueño (correo confirmado o reenviar), dentro del bloque Alta. */ accesoDueno?: ReactNode }) {
  const t = d.tenant;
  const nombre = String(t.nombre_comercial);
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const [planNuevo, setPlanNuevo] = useState("");
  const [precioPlan, setPrecioPlan] = useState("");
  // Activar el cobro (0141): precio pactado, ciclo y promoción opcional.
  const [precioAct, setPrecioAct] = useState("");
  const [ciclo, setCiclo] = useState<"MENSUAL" | "ANUAL">("MENSUAL");
  const [modoPromo, setModoPromo] = useState<ModoPromo>("ninguna");
  const [promoPrecio, setPromoPrecio] = useState("");
  const [promoHasta, setPromoHasta] = useState("");
  const [promoNombre, setPromoNombre] = useState("");
  const [pruebaNueva, setPruebaNueva] = useState("");
  const hoy = hoyMx();

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
  const actual = t.plan as { id?: string; codigo?: string; nombre?: string; precio_mensual_mxn?: number; timbres_cfdi_mensuales?: number | null; features_incluidos?: Record<string, unknown> | null } | null;
  const retirado = actual?.id && !planes.some((p) => p.id === actual.id) ? actual : null;
  const elegido = planes.find((p) => p.id === planNuevo) ?? null;

  const subs = (t.suscripcion as SuscripcionFicha[]) ?? [];
  const suscripcion = subs.find((s) => s.estado === "ACTIVA" || s.estado === "PAUSADA") ?? null;

  const prueba = estadoPrueba(String(t.estado), (t.prueba_hasta as string | null | undefined) ?? null, hoy);

  // Vista previa del cambio de plan: espejo de lo que hará cambiar_plan_tenant (0141).
  const addonsTenant: AddonDelTenant[] = d.addons.map((x) => ({
    codigo: x.addon?.codigo ?? "", activo: x.activo, precio: Number(x.precio_mensual_mxn), incluidoEnPlan: Boolean(x.incluido_en_plan),
  }));
  const precioPlanNum = precioPlan.trim() === "" ? null : precioValido(precioPlan);
  const vista = elegido
    ? vistaPreviaCambioPlan({ nuevo: elegido, addons: addonsTenant, foliosAntes: d.foliosBase?.mensuales ?? null, suscripcion, precio: precioPlanNum, hoy })
    : null;
  const nombreAddon = (c: string) => d.catalogoAddons.find((a) => a.codigo === c)?.nombre ?? c;

  // Activar: precio de lista del plan por omisión; el piloto solo se ofrece en Esencial.
  const listaPlan = Number(actual?.precio_mensual_mxn ?? 0);
  const precioActNum = precioAct.trim() === "" ? listaPlan : precioValido(precioAct);
  const esEsencial = actual?.codigo === PILOTO.plan;
  // Promociones solo con cobro mensual (0141): en anual no se ofrecen.
  const promo = ciclo !== "MENSUAL" ? null
    : modoPromo === "piloto" ? promocionPiloto(hoy)
      : modoPromo === "otra" ? { precio: precioValido(promoPrecio), hasta: promoHasta, nombre: promoNombre.trim() || null }
        : null;
  const faltaActivar =
    precioActNum === null ? "un precio válido"
      : promo && (promo.precio === null || !fechaValida(promo.hasta)) ? "el precio y la fecha de fin de la promoción"
        : promo && promo.precio !== null && promo.precio >= precioActNum ? "una promoción menor que el precio de lista"
          : promo && promo.hasta < hoy ? "una promoción que dure al menos hasta el primer cobro (hoy)"
            : null;
  const abrirActivar = () => {
    setPrecioAct(String(listaPlan)); setCiclo("MENSUAL"); setModoPromo("ninguna");
    setPromoPrecio(""); setPromoHasta(sumarDias(sumarMeses(hoy, 3), -1)); setPromoNombre("");
    setPendiente({ tipo: "suscripcion", estado: "NUEVA" });
  };

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
          <div className="text-14 font-semibold">{planTexto(actual)}</div>
          {retirado && (
            <p className="mt-1 text-13 text-ink-2">Está en un plan que ya no se vende. Se le respeta mientras no se acuerde el cambio con él.</p>
          )}
        </div>

        {/* Suscripción */}
        <div className={`${bloque} mt-4`}>
          <div className={sub}>
            <span className={subTitulo}>Cobro</span>
            {suscripcion
              ? <span className={`rounded-full px-2 py-0.5 text-12 font-semibold ${suscripcion.estado === "ACTIVA" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{NOMBRE_SUSCRIPCION[suscripcion.estado] ?? suscripcion.estado}</span>
              : <span className="text-13 text-ink-2">sin cobro</span>}
          </div>
          {suscripcion && (
            <div className="mb-2 text-13 text-ink-2">
              {textoPrecio(suscripcion, hoy, fmtPrecio)}/mes{suscripcion.promocion_nombre && suscripcion.promocion_hasta && suscripcion.promocion_hasta >= hoy ? ` (${suscripcion.promocion_nombre})` : ""}
              {suscripcion.proxima_fecha_cobro ? ` · próximo cobro el ${fechaLegible(suscripcion.proxima_fecha_cobro)}` : ""}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(!suscripcion || suscripcion.estado === "PAUSADA") && (
              <button onClick={() => (suscripcion ? setPendiente({ tipo: "suscripcion", estado: "ACTIVA" }) : abrirActivar())} disabled={busy} className="btn h-9 rounded bg-ink px-3 text-13 font-semibold text-white disabled:opacity-50">
                {suscripcion ? "Reanudar cobro…" : "Activar cobro…"}
              </button>
            )}
            {suscripcion?.estado === "ACTIVA" && (
              <button onClick={() => setPendiente({ tipo: "suscripcion", estado: "PAUSADA" })} disabled={busy} className={btnFantasma}>Pausar cobro…</button>
            )}
          </div>
          {/* Cancelar, aparte y abajo: antes estaba junto a "Pausar", a un clic de distancia. */}
          {suscripcion && (
            <button onClick={() => setPendiente({ tipo: "cancelar_suscripcion" })} disabled={busy} className="mt-3 text-13 font-semibold text-danger underline-offset-2 hover:underline disabled:opacity-50">
              Cancelar suscripción…
            </button>
          )}
        </div>

        {/* Prueba gratis (0141): no bloquea nada, solo avisa; extenderla queda en la bitácora. */}
        {prueba.tipo !== "NO_APLICA" && (
          <div className={`${bloque} mt-4`}>
            <div className={sub}>
              <span className={subTitulo}>Prueba gratis</span>
              <span className={`rounded-full px-2 py-0.5 text-12 font-semibold ${prueba.tipo === "VENCIDA" ? "bg-warning-soft text-warning" : "bg-sel text-ink-2"}`}>
                {prueba.tipo === "VENCIDA" ? `Vencida hace ${prueba.dias} ${prueba.dias === 1 ? "día" : "días"}` : prueba.dias === 0 ? "Último día" : `Faltan ${prueba.dias} ${prueba.dias === 1 ? "día" : "días"}`}
              </span>
            </div>
            <div className="mb-2 text-13 text-ink-2">
              {prueba.tipo === "VENCIDA" ? "Terminó" : "Termina"} el {fechaLegible(prueba.hasta)}. La caja sigue vendiendo: para cortarla se suspende con gracia.
            </div>
            <button onClick={() => { setPruebaNueva(sumarDias(prueba.hasta < hoy ? hoy : prueba.hasta, 15)); setPendiente({ tipo: "prueba" }); }} disabled={busy} className={btnFantasma}>
              Extender prueba…
            </button>
          </div>
        )}
      </div>

      <div>
        {/* Onboarding */}
        <div className={bloque}>
          <div className={sub}>
            <span className={subTitulo}>Alta</span>
            <span className="rounded-full bg-sel px-2 py-0.5 text-12 font-semibold text-ink-2">{nombreFase(fase)}</span>
          </div>
          {accesoDueno}
          <div className="flex flex-wrap gap-2">
            {fase !== "GO_LIVE" && fase !== "ABANDONADO" && (
              <button onClick={() => void accion({ accion: "marcar_fase", fase: "GO_LIVE" }).catch(() => {})} disabled={busy} className={btnFantasma}>Marcar en operación</button>
            )}
            {fase === "ABANDONADO" && (
              <button onClick={() => setPendiente({ tipo: "reactivar" })} disabled={busy} className={btnFantasma}>Reactivar alta…</button>
            )}
          </div>
          {fase !== "ABANDONADO" && (
            <button onClick={() => setPendiente({ tipo: "abandonado" })} disabled={busy} className="mt-3 text-13 font-semibold text-ink-2 underline-offset-2 hover:text-danger hover:underline disabled:opacity-50">
              Marcar como abandonado…
            </button>
          )}
        </div>

        {/* Add-ons contratados. El de facturación enciende el CFDI en cascada: la sección de
            facturas en /admin, el QR del ticket y el portal público. */}
        <div className="mt-4">
          <span className={label}>Add-ons</span>
          <div className="flex flex-col gap-2">
            {d.catalogoAddons.length === 0 && <p className="text-13 text-ink-2">No hay add-ons en el catálogo.</p>}
            {d.catalogoAddons.map((a) => {
              const contratado = d.addons.find((x) => x.addon?.codigo === a.codigo && x.activo);
              const precio = Number(contratado ? contratado.precio_mensual_mxn : a.precio_mensual_mxn);
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-14 font-semibold">{a.nombre}</div>
                    <div className="text-13 text-ink-2">
                      {/* Con fila contratada, el precio real es el que se grabó al contratar (puede ser
                          $0.00 si el plan lo incluye), no el de catálogo. */}
                      {fmtMxn(precio)}/mes{contratado ? ` · activo desde el ${fechaLegible(contratado.fecha_inicio)}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => setPendiente(contratado ? { tipo: "addon_desactivar", addon: a, precio } : { tipo: "addon_activar", addon: a })}
                    disabled={busy}
                    className={`btn h-9 shrink-0 rounded px-3 text-13 font-semibold disabled:opacity-50 ${contratado ? "border border-line-strong hover:bg-hover" : "bg-ink text-white"}`}
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
          <button onClick={() => void accion({ accion: "notas", notas }).catch(() => {})} disabled={busy || !notasSucias} className="btn h-9 rounded border border-line-strong px-3 text-13 font-semibold hover:bg-hover disabled:opacity-50">
            Guardar notas
          </button>
          {notasSucias && <span className="text-13 text-ink-2" aria-live="polite">Sin guardar: el refresco automático no las toca.</span>}
        </div>
      </div>

      {/* ── Diálogos ─────────────────────────────────────────────────────────── */}
      <DialogoConfirmar
        abierto={pendiente?.tipo === "plan"}
        onCerrar={cerrar}
        titulo="Cambiar plan"
        descripcion={<>Cambia lo que paga <b>{nombre}</b> y lo que puede usar. Los folios del mes, los add-ons que incluye el plan y el precio del cobro cambian junto con él.</>}
        detalle={
          <div className="flex flex-col gap-2">
            <label className={label} htmlFor="plan-nuevo">Plan nuevo</label>
            <select id="plan-nuevo" className={input} value={planNuevo} onChange={(e) => { setPlanNuevo(e.target.value); setPrecioPlan(""); }}>
              <option value="">Elige un plan…</option>
              {planes.map((p) => <option key={p.id} value={p.id} disabled={p.id === actual?.id}>{p.nombre} · {fmtMxn(p.precio_mensual_mxn)}/mes</option>)}
            </select>
            {elegido && <Cambio antes={planTexto(actual)} despues={planTexto(elegido)} />}
            {elegido && vista && (
              <>
                {vista.precio && (
                  <div>
                    <label className={label} htmlFor="plan-precio">Precio pactado al mes (vacío = el de lista)</label>
                    <input id="plan-precio" className={`${input} w-40`} inputMode="decimal" value={precioPlan} placeholder={String(elegido.precio_mensual_mxn)} onChange={(e) => setPrecioPlan(e.target.value)} />
                  </div>
                )}
                <ul className="flex flex-col gap-1 rounded border border-line px-3 py-2.5 text-13 text-ink-2">
                  <li>Folios CFDI del mes: <b className="text-ink">{vista.folios.antes ?? "—"} → {vista.folios.despues}</b></li>
                  {vista.precio && (
                    <li>Cobro: <b className="text-ink">{fmtMxn(vista.precio.antes)} → {fmtMxn(vista.precio.despues)}/mes</b></li>
                  )}
                  {vista.quitaPromocion && <li>Se quita la promoción «{vista.quitaPromocion}»: se pactó para el plan actual.</li>}
                  {vista.concede.map((c) => (
                    <li key={`c-${c}`}>Gana <b className="text-ink">{nombreAddon(c)}</b>, incluido a $0{vista.dejaDePagar.some((x) => x.codigo === c) ? ` (deja de pagar ${fmtMxn(vista.dejaDePagar.find((x) => x.codigo === c)?.precio ?? 0)} aparte)` : ""}.</li>
                  ))}
                  {vista.retira.map((c) => (
                    <li key={`r-${c}`} className="text-danger">Pierde <b>{nombreAddon(c)}</b>: lo tenía por el plan.{c === "DELIVERY" ? " Se pausan sus tiendas en Uber Eats." : ""}</li>
                  ))}
                  {!vista.precio && <li>No tiene cobro activo: el precio se fija al activarlo.</li>}
                </ul>
              </>
            )}
          </div>
        }
        listo={{
          ok: !!elegido && elegido.id !== actual?.id && (precioPlan.trim() === "" || precioPlanNum !== null),
          falta: !elegido || elegido.id === actual?.id ? "elegir un plan distinto al actual" : "un precio válido",
        }}
        nombreEsperado={nombre}
        etiquetaBoton="Cambiar plan"
        ocupado={busy}
        onConfirmar={({ motivo }) => hacer({ accion: "cambiar_plan", plan_id: planNuevo, precio: precioPlanNum, motivo })}
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
            : pendiente?.tipo === "suscripcion" && pendiente.estado === "NUEVA"
              ? <>El cobro es por adelantado: el primer pago de <b>{nombre}</b> vence hoy y cubre el mes que empieza. Si estaba en prueba, pasa a activo.</>
              : <>Se le vuelve a cobrar a <b>{nombre}</b> con el precio que ya tenía.</>
        }
        detalle={pendiente?.tipo === "suscripcion" && pendiente.estado === "NUEVA" ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="act-precio">Precio de lista al mes</label>
                <input id="act-precio" className={input} inputMode="decimal" value={precioAct} onChange={(e) => setPrecioAct(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="act-ciclo">Se cobra</label>
                <select id="act-ciclo" className={input} value={ciclo} onChange={(e) => { const c = e.target.value === "ANUAL" ? "ANUAL" : "MENSUAL"; setCiclo(c); if (c === "ANUAL") setModoPromo("ninguna"); }}>
                  <option value="MENSUAL">Cada mes</option>
                  <option value="ANUAL">Cada año (12 meses)</option>
                </select>
              </div>
            </div>
            {ciclo === "ANUAL" ? (
              <p className="text-13 text-ink-2">Las promociones son solo para cobro mensual.</p>
            ) : (
            <fieldset>
              <legend className={label}>Promoción</legend>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setModoPromo("ninguna")} aria-pressed={modoPromo === "ninguna"} className={`${btnFantasma} ${modoPromo === "ninguna" ? "border-ink bg-sel" : ""}`}>Sin promoción</button>
                {esEsencial && (
                  <button type="button" onClick={() => setModoPromo("piloto")} aria-pressed={modoPromo === "piloto"} className={`${btnFantasma} ${modoPromo === "piloto" ? "border-ink bg-sel" : ""}`}>
                    {PILOTO.nombre}: {fmtMxn(PILOTO.precio)} por {PILOTO.meses} meses
                  </button>
                )}
                <button type="button" onClick={() => setModoPromo("otra")} aria-pressed={modoPromo === "otra"} className={`${btnFantasma} ${modoPromo === "otra" ? "border-ink bg-sel" : ""}`}>Otra…</button>
              </div>
              {modoPromo === "otra" && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className={label} htmlFor="promo-precio">Precio de promoción</label>
                    <input id="promo-precio" className={input} inputMode="decimal" value={promoPrecio} onChange={(e) => setPromoPrecio(e.target.value)} />
                  </div>
                  <div>
                    <label className={label} htmlFor="promo-hasta">Vale hasta (inclusive)</label>
                    <input id="promo-hasta" type="date" className={input} min={hoy} value={promoHasta} onChange={(e) => setPromoHasta(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className={label} htmlFor="promo-nombre">Nombre (opcional, lo ve el cliente)</label>
                    <input id="promo-nombre" className={input} maxLength={80} value={promoNombre} onChange={(e) => setPromoNombre(e.target.value)} />
                  </div>
                </div>
              )}
            </fieldset>
            )}
            {precioActNum !== null && (
              <Cambio
                antes={<span className="text-ink-2">{prueba.tipo !== "NO_APLICA" ? "En prueba" : "Sin cobro"}</span>}
                despues={promo && promo.precio !== null && /^\d{4}-\d{2}-\d{2}$/.test(promo.hasta)
                  ? <>{textoPrecio({ precio_mensual_mxn: precioActNum, precio_promocional_mxn: promo.precio, promocion_hasta: promo.hasta }, hoy, fmtPrecio)}/mes</>
                  : <>{fmtMxn(precioActNum)}/mes</>}
              />
            )}
          </div>
        ) : undefined}
        listo={pendiente?.tipo === "suscripcion" && pendiente.estado === "NUEVA" ? { ok: faltaActivar === null, falta: faltaActivar ?? "" } : undefined}
        sinNombre
        nombreEsperado={nombre}
        etiquetaBoton={pendiente?.tipo === "suscripcion" && pendiente.estado === "PAUSADA" ? "Pausar" : "Activar"}
        ocupado={busy}
        onConfirmar={({ motivo }) =>
          hacer(
            pendiente?.tipo === "suscripcion" && pendiente.estado === "NUEVA"
              ? {
                accion: "suscripcion_activar", motivo, precio: precioActNum, ciclo,
                promocion: promo ? { precio: promo.precio, hasta: promo.hasta, nombre: promo.nombre } : null,
              }
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

      <DialogoConfirmar
        abierto={pendiente?.tipo === "prueba"}
        onCerrar={cerrar}
        titulo="Extender la prueba"
        descripcion={<>Mueve la fecha en que termina la prueba gratis de <b>{nombre}</b>. No cambia nada en su caja: solo corre los avisos, a él y a este panel.</>}
        detalle={
          <div>
            <label className={label} htmlFor="prueba-hasta">Nueva fecha de fin</label>
            <input id="prueba-hasta" type="date" className={`${input} w-48`} min={hoy} max={sumarMeses(hoy, 6)} value={pruebaNueva} onChange={(e) => setPruebaNueva(e.target.value)} />
            {prueba.tipo !== "NO_APLICA" && <p className="mt-1 text-13 text-ink-2">Hoy termina el {fechaLegible(prueba.hasta)}.</p>}
          </div>
        }
        listo={{ ok: /^\d{4}-\d{2}-\d{2}$/.test(pruebaNueva) && pruebaNueva >= hoy && pruebaNueva <= sumarMeses(hoy, 6), falta: "una fecha de hoy a seis meses" }}
        sinNombre
        nombreEsperado={nombre}
        etiquetaBoton="Extender prueba"
        ocupado={busy}
        onConfirmar={({ motivo }) => hacer({ accion: "prueba_extender", prueba_hasta: pruebaNueva, motivo })}
      />
    </div>
  );
}
