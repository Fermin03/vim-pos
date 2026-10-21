"use client";
import { useEffect, useState } from "react";
import { OPERACION, moduloActivo, nombreGiro } from "@vim/db/operacion";
import { enlaceWhatsapp } from "@vim/db/soporte";
import { PageHeader, PageBody } from "../../../components/page-header";
import { useModulos, usePerfil } from "../../../components/admin-shell";
import { leerNegocio } from "../../../lib/configuracion";
import { leerAyuda, type AyudaAdmin } from "../../../lib/soporte";
import { conExistencias, mensajeCambiarModulos } from "../../../lib/operacion";
import { casillasMostrador, guardarConfigMostrador, leerConfigMostrador, type ConfigMostrador } from "../../../lib/mostrador";

/**
 * Lo que este negocio usa en VIM POS (ADR 0034). Solo se consulta: los módulos los ajusta VIM a
 * petición del dueño, por WhatsApp.
 */
export default function OperacionPage() {
  const m = useModulos();
  const perfil = usePerfil();
  const [giro, setGiro] = useState<string | null>(null);
  const [ayuda, setAyuda] = useState<AyudaAdmin | null>(null);
  useEffect(() => {
    leerNegocio().then((n) => setGiro(n?.vertical_principal ?? null)).catch(() => {});
    leerAyuda().then(setAyuda).catch(() => {});
  }, []);
  const [mostrador, setMostrador] = useState<ConfigMostrador | null>(null);
  const [errorMostrador, setErrorMostrador] = useState<string | null>(null);
  const casillas = casillasMostrador(giro);
  useEffect(() => {
    if (casillas.nombre) leerConfigMostrador().then(setMostrador).catch(() => {});
  }, [casillas.nombre]);
  async function cambiarMostrador(c: Partial<ConfigMostrador>) {
    if (!mostrador) return;
    const antes = mostrador;
    setMostrador({ ...mostrador, ...c });
    setErrorMostrador(null);
    try { await guardarConfigMostrador(c); } catch { setMostrador(antes); setErrorMostrador("No se pudo guardar. Intenta de nuevo."); }
  }
  const efectivos = m && m !== "error" ? m.efectivos : null;
  const wa = ayuda
    ? enlaceWhatsapp(ayuda.soporte.whatsapp, mensajeCambiarModulos({ usuario: perfil?.nombre, negocio: ayuda.negocio, codigo: ayuda.codigo }))
    : null;

  return (
    <>
      <PageHeader titulo="Cómo vende tu negocio" subtitulo="Lo que tu caja y tu panel enseñan, según cómo trabajas."
        migas={[{ label: "Configuración" }, { label: "Cómo vende tu negocio" }]} />
      <PageBody>
        <div className="max-w-[640px]">
          <p className="mb-4 text-14 text-ink-2">Giro: <b className="text-ink">{nombreGiro(giro)}</b></p>
          {m === null ? (
            <p className="text-sm text-ink-3">Cargando…</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
              {OPERACION.filter((mod) => mod.codigo !== "existencias" || conExistencias(m)).map((mod) => {
                const activo = moduloActivo(efectivos, mod.codigo);
                return (
                  <li key={mod.codigo} className="flex items-start justify-between gap-4 p-4">
                    <div>
                      <div className="text-14 font-semibold text-ink">{mod.nombre}</div>
                      <div className="text-13 text-ink-2">{mod.descripcion}</div>
                    </div>
                    <span className={["inline-flex shrink-0 items-center rounded-full px-[11px] py-1 text-13 font-semibold", activo ? "bg-success-soft text-success" : "bg-hover text-ink-3"].join(" ")}>
                      {activo ? "En uso" : "Apagado"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {casillas.nombre && (
            <section className="mt-6">
              <h2 className="mb-2 text-14 font-semibold text-ink">Mostrador</h2>
              <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
                <label className="flex min-h-[44px] items-center gap-3 p-4 text-14 text-ink">
                  <input type="checkbox" className="h-4 w-4 accent-ink" disabled={!mostrador} checked={mostrador?.pedirNombre ?? false} onChange={(e) => cambiarMostrador({ pedirNombre: e.target.checked })} />
                  Pedir el nombre del cliente al cobrar
                </label>
                {casillas.dondeComer && (
                  <label className="flex min-h-[44px] items-center gap-3 p-4 text-14 text-ink">
                    <input type="checkbox" className="h-4 w-4 accent-ink" disabled={!mostrador} checked={mostrador?.tieneDondeComer ?? false} onChange={(e) => cambiarMostrador({ tieneDondeComer: e.target.checked })} />
                    Tiene dónde comer (pregunta «¿para llevar o para comer aquí?»)
                  </label>
                )}
              </div>
              {errorMostrador && <p role="alert" className="mt-2 text-13 text-danger">{errorMostrador}</p>}
            </section>
          )}
          <p className="mt-4 text-13 text-ink-2">
            ¿Necesitas algo que está apagado o quieres quitar algo que no usas?{" "}
            {wa ? <a href={wa} target="_blank" rel="noreferrer" className="font-semibold text-ink underline">Escríbenos por WhatsApp</a> : "Escríbenos por WhatsApp"}
            {" "}y lo ajustamos.
          </p>
        </div>
      </PageBody>
    </>
  );
}
