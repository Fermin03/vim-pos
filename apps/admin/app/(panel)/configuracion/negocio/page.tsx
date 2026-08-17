"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { actualizarNegocio, guardarLogoNegocio, leerNegocio, negocioSchema, LOGO_MAX_BYTES, type Negocio } from "../../../lib/configuracion";
import { reescalarImagen } from "../../../lib/imagen";
import { mensajeError } from "../../../lib/errores";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const TIMEZONES = [
  "America/Mexico_City",
  "America/Tijuana",
  "America/Hermosillo",
  "America/Mazatlan",
  "America/Cancun",
];

const VERT_LABEL: Record<string, string> = {
  QUICK_SERVICE: "Quick Service",
  FULL_SERVICE: "Full Service",
  CAFE_BAR: "Café & Bar",
  FOODTRUCK: "Foodtruck",
  DARK_KITCHEN: "Dark Kitchen",
  ENTERPRISE: "Enterprise",
};

export default function NegocioPage() {
  const [neg, setNeg] = useState<Negocio | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [logoOcupado, setLogoOcupado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [tz, setTz] = useState("America/Mexico_City");
  const [hora, setHora] = useState("03:00");

  async function recargar() {
    try {
      const n = await leerNegocio();
      setNeg(n);
      if (n) {
        setNombre(n.nombre_comercial);
        setCodigo(n.codigo);
        setTz(n.timezone);
        setHora((n.hora_cierre_dia_contable ?? "03:00:00").slice(0, 5));
      }
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar"));
      setNeg(null);
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  async function guardar() {
    setError(null);
    setOkMsg(null);
    const parsed = negocioSchema.safeParse({
      nombre_comercial: nombre,
      codigo,
      timezone: tz,
      hora_cierre_dia_contable: hora,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      await actualizarNegocio(parsed.data);
      setOkMsg("Guardado.");
      setTimeout(() => setOkMsg(null), 2500);
      recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Datos del negocio"
        subtitulo="La información comercial básica de tu restaurante. Aparece en los tickets, reportes y comunicaciones del sistema."
        migas={[{ label: "Configuración" }, { label: "Datos del negocio" }]}
      />
      <PageBody>
        {neg === undefined && <p className="text-sm text-ink-3">Cargando…</p>}
        {neg === null && error && <p className="text-sm font-medium text-danger">{error}</p>}
        {neg && (
          <div className="max-w-[640px]">
            <div className="mb-5 rounded-lg border border-line bg-surface p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
                <div>
                  <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Vertical</div>
                  <div className="mt-0.5 font-medium">{VERT_LABEL[neg.vertical_principal] ?? neg.vertical_principal}</div>
                </div>
                <div>
                  <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Estado</div>
                  <div className="mt-0.5 font-medium">{neg.estado}</div>
                </div>
              </div>
            </div>

            {/* Logo del negocio — sale en la pantalla principal del POS y encima del ticket. */}
            <div className="mb-5 rounded-lg border border-line bg-surface p-4">
              <div className="text-[13px] font-semibold">Logotipo</div>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                Aparece en la pantalla principal de la caja y en la parte superior del ticket del cliente.
                PNG o JPG, preferentemente cuadrado. Se reduce solo antes de guardarse.
              </p>
              <div className="mt-3 flex items-center gap-4">
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-hover">
                  {neg.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data URI local, no remoto
                    <img src={neg.logo_url} alt="Logotipo del negocio" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-[11px] text-ink-3">Sin logo</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className={["inline-flex cursor-pointer items-center justify-center rounded border border-line-strong px-3 py-2 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink", logoOcupado ? "pointer-events-none opacity-50" : ""].join(" ")}>
                    {logoOcupado ? "Procesando…" : neg.logo_url ? "Cambiar logotipo" : "Subir logotipo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = ""; // permite volver a elegir el MISMO archivo tras un error
                        if (!f) return;
                        setError(null); setOkMsg(null); setLogoOcupado(true);
                        try {
                          const dataUri = await reescalarImagen(f, { ladoMax: 512, maxBytes: LOGO_MAX_BYTES });
                          await guardarLogoNegocio(dataUri);
                          setOkMsg("Logotipo actualizado. Aparecerá en la caja al sincronizar.");
                          setTimeout(() => setOkMsg(null), 3500);
                          await recargar();
                        } catch (err) {
                          setError(mensajeError(err, "No se pudo guardar el logotipo"));
                        } finally { setLogoOcupado(false); }
                      }}
                    />
                  </label>
                  {neg.logo_url && (
                    <button
                      type="button"
                      disabled={logoOcupado}
                      onClick={async () => {
                        setError(null); setOkMsg(null); setLogoOcupado(true);
                        try {
                          await guardarLogoNegocio(null);
                          await recargar();
                        } catch (err) {
                          setError(mensajeError(err, "No se pudo quitar el logotipo"));
                        } finally { setLogoOcupado(false); }
                      }}
                      className="text-[12.5px] font-semibold text-ink-3 transition hover:text-danger disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <label className={label} htmlFor="n-nombre">Nombre comercial</label>
                <input id="n-nombre" className={input} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="n-codigo">Código (slug)</label>
                <input id="n-codigo" className={input} value={codigo} maxLength={50} onChange={(e) => setCodigo(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
                <p className="mt-1 text-[11.5px] text-ink-3">Usado en subdominios y prefijos de folio. Solo minúsculas, números y guiones.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="n-tz">Zona horaria</label>
                  <select id="n-tz" className={input} value={tz} onChange={(e) => setTz(e.target.value)}>
                    {TIMEZONES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="n-hora">Cierre de día contable</label>
                  <input id="n-hora" type="time" className={input} value={hora} onChange={(e) => setHora(e.target.value)} />
                  <p className="mt-1 text-[11.5px] text-ink-3">Las ventas hasta esta hora cuentan en el día anterior.</p>
                </div>
              </div>

              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
              {okMsg && <p className="text-sm font-medium text-success">{okMsg}</p>}

              <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
                <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
