"use client";
import { useEffect, useState } from "react";
import { Aviso, StatusChip, type TonoEstado } from "@vim/ui/styles";
import { fechaLegible, hoyMx } from "@vim/fecha";
import { ETIQUETA_METODO_COBRO, estadoCobro, precioVigente, promocionVigente, textoEstadoCobro, type EstadoCobro } from "@vim/db/cobro";
import { PageHeader, PageBody } from "../../../components/page-header";
import { AvisoPrueba } from "../../../components/aviso-prueba";
import { BotonCopiar } from "../../../components/boton-copiar";
import { desgloseMensual, leerPlanYPagos, textoLimites, type PlanYPagos } from "../../../lib/plan";
import { clabeLegible, enlaceWhatsapp, hayDatosPago, mensajeComprobante, mesDe, type DatosPago } from "../../../lib/datos-pago";
import { mensajeError } from "../../../lib/errores";

const TONO: Record<EstadoCobro["tipo"], TonoEstado> = {
  SIN_COBRO: "neutral", AL_CORRIENTE: "success", POR_VENCER: "warning", HOY: "warning", VENCIDO: "danger",
};

const mxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/**
 * Plan y pagos (0130): qué plan tiene el negocio, cuándo le toca pagar a VIM y qué pagos se le han
 * registrado. Antes el dueño no veía nada de esto: se enteraba de que debía cuando le llamaban.
 * Solo lectura; los pagos los registra VIM al recibirlos.
 */
export default function PlanPage() {
  const [d, setD] = useState<PlanYPagos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leerPlanYPagos().then(setD).catch((e) => setError(mensajeError(e, "No se pudo cargar tu plan")));
  }, []);

  const s = d?.suscripcion ?? null;
  const estado = estadoCobro(s?.estado === "ACTIVA" ? s.proxima_fecha_cobro : null, hoyMx());
  const anual = s?.ciclo_facturacion === "ANUAL";
  const hoy = hoyMx();
  // Lo que se paga HOY (con promoción mientras dure, 0141) y, si hay promoción, hasta cuándo.
  const promo = s ? promocionVigente(s, hoy) : null;
  const vigente = s ? precioVigente(s, hoy) : 0;
  const mesAPagar = mesDe(s?.proxima_fecha_cobro ?? hoy);
  // Lo que paga aparte del plan (facturación, delivery, sucursales y cajas adicionales) y el total
  // del mes (0147). Mismo número que ve VIM en su panel.
  const desglose = d ? desgloseMensual(d.plan, s, d.addons, hoy) : null;

  return (
    <>
      <PageHeader titulo="Plan y pagos" subtitulo="Tu plan de VIM POS, cuándo toca pagar y tus pagos." migas={[{ label: "Configuración" }, { label: "Plan y pagos" }]} />
      <PageBody>
        {error && <Aviso tono="danger" role="alert" className="max-w-[640px]">{error}</Aviso>}
        {!d && !error && <p className="text-13 text-ink-3">Cargando…</p>}
        {d && (
          <div className="flex max-w-[640px] flex-col gap-4">
            <section className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-12 font-semibold uppercase tracking-wide text-ink-3">Tu plan</p>
                  <p className="mt-1 font-display text-20 font-semibold tracking-tight">{d.plan?.nombre ?? "Sin plan asignado"}</p>
                  {s && (
                    <p className="mt-0.5 text-14 text-ink-2 tabular-nums">
                      {anual ? `${mxn(vigente * 12)} al año` : `${mxn(vigente)} al mes`}
                      {promo && <> hasta el {fechaLegible(promo.hasta)}, después {anual ? `${mxn(promo.lista * 12)} al año` : `${mxn(promo.lista)} al mes`}</>}
                    </p>
                  )}
                  {promo?.nombre && <p className="mt-0.5 text-12 text-ink-3">Precio de promoción: {promo.nombre}</p>}
                  {/* Hasta dónde puede crecer hoy, con las mismas palabras que usa VIM (0147). */}
                  {textoLimites(d.limites) && <p className="mt-1 text-13 text-ink-2">{textoLimites(d.limites)}</p>}
                </div>
                {s?.estado === "ACTIVA" && <StatusChip tone={TONO[estado.tipo]} punto>{textoEstadoCobro(estado)}</StatusChip>}
                {s?.estado === "PAUSADA" && <StatusChip tone="neutral">Cobro en pausa</StatusChip>}
              </div>

              {/* El desglose solo aparece si hay algo además del plan: con una sola línea no dice nada. */}
              {desglose && desglose.renglones.length > (s ? 1 : 0) && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-12 font-semibold uppercase tracking-wide text-ink-3">Lo que tienes contratado</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {desglose.renglones.map((r) => (
                      <li key={r.clave} className="flex items-baseline justify-between gap-3 text-14">
                        <span className="min-w-0">
                          {r.concepto}
                          {r.detalle && <span className="text-ink-3"> · {r.detalle}</span>}
                        </span>
                        <span className="tabular-nums text-ink-2">{r.importe > 0 ? `${mxn(r.importe)} al mes` : "—"}</span>
                      </li>
                    ))}
                  </ul>
                  {s && desglose.hayExtras && (
                    <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2 text-14 font-semibold">
                      <span>Total al mes</span>
                      <span className="font-display text-16 tabular-nums">{mxn(desglose.total)}</span>
                    </p>
                  )}
                  {anual && desglose.hayExtras && (
                    <p className="mt-1 text-12 text-ink-3">Tu plan se cobra por año; aquí se muestra lo que equivale al mes.</p>
                  )}
                  {!s && desglose.hayExtras && (
                    <p className="mt-2 text-12 text-ink-3">
                      Se empieza a cobrar junto con tu plan{d.negocio?.estado === "TRIAL" ? ", cuando termine tu prueba" : ""}.
                    </p>
                  )}
                </div>
              )}

              {s?.estado === "ACTIVA" && s.proxima_fecha_cobro && (
                <p className="mt-4 text-14 text-ink-2">
                  Siguiente pago: <b className="text-ink">{fechaLegible(s.proxima_fecha_cobro)}</b>
                </p>
              )}
              <AvisoPrueba estado={d.negocio?.estado} pruebaHasta={d.negocio?.prueba_hasta} className="mt-4" />
              {!s && d.negocio?.estado !== "TRIAL" && (
                <p className="mt-4 text-14 text-ink-2">Todavía no tienes un cobro activo.</p>
              )}
              {estado.tipo === "VENCIDO" && (
                <Aviso tono="danger" className="mt-4">
                  Tu pago está vencido. Si ya lo hiciste, mándanos el comprobante para registrarlo; si no, abajo están los datos para pagar.
                </Aviso>
              )}
              {(estado.tipo === "POR_VENCER" || estado.tipo === "HOY") && (
                <Aviso tono="warning" className="mt-4">
                  Tu pago se acerca. Cuando pagues, VIM lo registra y aquí verás la fecha del siguiente.
                </Aviso>
              )}
            </section>

            <ComoPagar datos={d.datosPago} negocio={d.negocio?.nombre_comercial ?? ""} mes={mesAPagar} />

            <section className="rounded-lg border border-line bg-surface">
              <h2 className="border-b border-line px-5 py-3 font-display text-16 font-semibold tracking-tight">Pagos registrados</h2>
              {d.pagos.length === 0 ? (
                <p className="px-5 py-4 text-13 text-ink-3">Aún no hay pagos registrados.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.pagos.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
                      <div>
                        <p className={p.anulado_at ? "text-14 text-ink-3 line-through" : "text-14 font-medium"}>
                          Del {fechaLegible(p.cubre_desde)} al {fechaLegible(p.cubre_hasta)}
                        </p>
                        <p className="text-12 text-ink-3">
                          {ETIQUETA_METODO_COBRO[p.metodo] ?? p.metodo} · pagado el {fechaLegible(p.pagado_el)}
                          {p.referencia ? ` · ${p.referencia}` : ""}
                          {p.anulado_at ? " · anulado" : ""}
                        </p>
                      </div>
                      <span className={p.anulado_at ? "text-14 tabular-nums text-ink-3 line-through" : "font-display text-15 font-semibold tabular-nums"}>
                        {mxn(Number(p.monto_mxn))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </PageBody>
    </>
  );
}

/** Un renglón con su botón de copiar. */
function Dato({ titulo, valor, mostrar, copiar }: { titulo: string; valor: string; mostrar?: string; copiar?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-12 text-ink-3">{titulo}</p>
        <p className="break-words font-mono text-14 tabular-nums">{mostrar ?? valor}</p>
      </div>
      {copiar && <BotonCopiar valor={valor} etiqueta={titulo.toLowerCase()} />}
    </div>
  );
}

/**
 * A dónde pagar y a quién mandar el comprobante (0141). Los datos los captura VIM en su panel; si
 * todavía no hay, se dice que se escriba a VIM y no se inventa nada — un dato de pago falso es peor
 * que ninguno.
 */
function ComoPagar({ datos, negocio, mes }: { datos: DatosPago | null; negocio: string; mes: string }) {
  if (!datos || !hayDatosPago(datos)) {
    return (
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-16 font-semibold tracking-tight">Cómo pagar</h2>
        <p className="mt-1 text-14 text-ink-2">Pídele a VIM los datos para pagar; te los damos por el mismo medio por el que te dimos de alta.</p>
      </section>
    );
  }
  const wa = enlaceWhatsapp(datos.whatsapp, mensajeComprobante(negocio, mes));
  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-5 py-3">
        <h2 className="font-display text-16 font-semibold tracking-tight">Cómo pagar</h2>
        <p className="text-13 text-ink-3">Transfiere y mándanos el comprobante. Registramos tu pago y aquí ves la fecha del siguiente.</p>
      </div>
      <div className="divide-y divide-line px-5">
        {datos.banco && <Dato titulo="Banco" valor={datos.banco} />}
        {datos.titular && <Dato titulo="A nombre de" valor={datos.titular} copiar />}
        {datos.clabe && <Dato titulo="CLABE" valor={datos.clabe} mostrar={clabeLegible(datos.clabe)} copiar />}
        {datos.correo && <Dato titulo="Correo para el comprobante" valor={datos.correo} copiar />}
      </div>
      {datos.instrucciones && <p className="px-5 pb-1 pt-2 text-13 text-ink-2">{datos.instrucciones}</p>}
      {wa && (
        <div className="px-5 pb-5 pt-3">
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center rounded bg-accent px-4 text-14 font-semibold text-white transition-colors hover:bg-accent-hover active:scale-[.97]"
          >
            Mandar comprobante por WhatsApp
          </a>
          <p className="mt-1.5 text-12 text-ink-3">Se abre con el mensaje ya escrito; solo adjunta la foto o el PDF.</p>
        </div>
      )}
    </section>
  );
}
