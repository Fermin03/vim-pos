"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import {
  actualizarDatosFiscales,
  datosFiscalesSchema,
  leerDatosFiscales,
  REGIMENES_FISCALES,
  type DatosFiscales,
} from "../../../lib/configuracion";
import { mensajeError } from "../../../lib/errores";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const RFC_REGEX = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

export default function FiscalPage() {
  const [datos, setDatos] = useState<DatosFiscales | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [rfc, setRfc] = useState("");
  const [razon, setRazon] = useState("");
  // Sin valor de fábrica: antes arrancaba en "612" (persona física), y con un RFC de persona moral
  // la lista enseñaba 601 mientras se guardaba 612 (revisión de diseño, sep 2026).
  const [regimen, setRegimen] = useState("");
  const [rfcTocado, setRfcTocado] = useState(false);
  const [cp, setCp] = useState("");
  const [email, setEmail] = useState("");

  // El tipo de persona se deriva del RFC: 12 chars = moral, 13 = física.
  const personaPorRfc: "MORAL" | "FISICA" | null = useMemo(() => {
    if (rfc.length === 12) return "MORAL";
    if (rfc.length === 13) return "FISICA";
    return null;
  }, [rfc]);
  const rfcValido = RFC_REGEX.test(rfc);

  async function recargar() {
    try {
      const d = await leerDatosFiscales();
      setDatos(d);
      setRfc(d.rfc);
      setRazon(d.razon_social);
      setRegimen(d.regimen_fiscal ?? "");
      setCp(d.codigo_postal_fiscal);
      setEmail(d.email_fiscal);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar"));
      setDatos(null);
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  async function guardar() {
    setError(null);
    setOkMsg(null);
    if (!regimenValido) {
      setError(
        personaPorRfc
          ? `Elige tu régimen fiscal: el guardado no corresponde a una persona ${personaPorRfc === "MORAL" ? "moral" : "física"}.`
          : "Elige tu régimen fiscal, tal como aparece en tu Constancia de Situación Fiscal.",
      );
      return;
    }
    const parsed = datosFiscalesSchema.safeParse({
      rfc,
      razon_social: razon,
      regimen_fiscal: regimen,
      codigo_postal_fiscal: cp,
      email_fiscal: email,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      await actualizarDatosFiscales(parsed.data);
      /* La advertencia sobre las facturas ya timbradas se dice AQUÍ, al guardar,
         y no en un cartel permanente arriba de la pantalla.

         Es cierta y no es obvia —cambiar el RFC no reescribe lo ya emitido—,
         pero un aviso que está siempre deja de leerse: se convierte en parte
         del decorado y ocupa el sitio del contenido. Dicho justo después del
         cambio, llega cuando de verdad aplica. */
      setOkMsg(
        datos?.facturacionActiva
          ? "Datos fiscales guardados. Aplican solo a las facturas nuevas: las ya emitidas conservan los datos con que se timbraron."
          : "Datos fiscales guardados.",
      );
      setTimeout(() => setOkMsg(null), datos?.facturacionActiva ? 7000 : 2500);
      recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  // Régimenes filtrados por el tipo de persona detectado (si hay RFC válido).
  const regimenesVisibles = personaPorRfc
    ? REGIMENES_FISCALES.filter((r) => r.persona === personaPorRfc)
    : REGIMENES_FISCALES;
  // Lo que se ve es lo que se guarda: si el régimen no está en la lista del tipo de persona, el
  // campo sale vacío y pide elegir, en vez de enseñar la primera opción y guardar otra.
  const regimenValido = regimenesVisibles.some((r) => r.codigo === regimen);

  return (
    <>
      <PageHeader
        titulo="Datos fiscales"
        subtitulo="La información con la que VIM POS emitirá tus facturas (CFDI). Debe coincidir exactamente con tu Constancia de Situación Fiscal del SAT."
        migas={[{ label: "Configuración" }, { label: "Datos fiscales" }]}
      />
      <PageBody>
        {datos === undefined && <p className="text-sm text-ink-3">Cargando…</p>}
        {datos === null && error && <p className="text-sm font-medium text-danger">{error}</p>}
        {datos && (
          <div className="max-w-[680px]">
            {/* ── Identificación fiscal ── */}
            <div className="mb-6 rounded-lg border border-line bg-surface p-5">
              <div className="mb-1 font-display text-[16px] font-semibold tracking-tight">Identificación fiscal</div>
              <p className="mb-4 text-[12.5px] text-ink-3">Tal como aparece en tu Constancia de Situación Fiscal (CSF).</p>

              {/* Tipo de persona: se deriva del RFC, no se elige. Antes era un control segmentado que
                  parecía clicable y no hacía nada. */}
              <p className="mb-4 text-[13px] text-ink-2">
                {personaPorRfc
                  ? <><b className="font-semibold text-ink">Persona {personaPorRfc === "MORAL" ? "moral" : "física"}</b> <span className="text-ink-3">(detectada por tu RFC)</span></>
                  : <span className="text-ink-3">El tipo de persona se detecta al capturar el RFC.</span>}
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="f-rfc">RFC *</label>
                  <input
                    id="f-rfc"
                    className={input}
                    value={rfc}
                    maxLength={13}
                    autoCapitalize="characters"
                    onChange={(e) => setRfc(e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, ""))}
                    onBlur={() => setRfcTocado(true)}
                    placeholder="XAXX010101000"
                  />
                  {/* Se valida al salir del campo o al completar la longitud, no desde la primera letra. */}
                  {rfc.length > 0 && (rfcTocado || rfc.length >= 12 || rfcValido) && (
                    <p className={`mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold ${rfcValido ? "text-success" : "text-danger"}`}>
                      {rfcValido ? "✓ RFC con formato válido" : "✗ Formato de RFC incompleto"}
                    </p>
                  )}
                </div>
                <div>
                  <label className={label} htmlFor="f-regimen">Régimen fiscal *</label>
                  <select id="f-regimen" className={input} value={regimenValido ? regimen : ""} onChange={(e) => setRegimen(e.target.value)}>
                    {!regimenValido && <option value="" disabled>Elige tu régimen…</option>}
                    {regimenesVisibles.map((r) => (
                      <option key={r.codigo} value={r.codigo}>{r.codigo} · {r.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className={label} htmlFor="f-razon">Razón social *</label>
                <input
                  id="f-razon"
                  className={input}
                  value={razon}
                  maxLength={255}
                  onChange={(e) => setRazon(e.target.value)}
                  placeholder="VIM MARKETING SA DE CV"
                />
                <p className="mt-1.5 text-[11.5px] text-ink-3">
                  Sin el régimen societario para persona física. Para moral, incluye "SA DE CV", "S DE RL", etc.
                </p>
              </div>
            </div>

            {/* ── Domicilio fiscal ── */}
            <div className="mb-6 rounded-lg border border-line bg-surface p-5">
              <div className="mb-1 font-display text-[16px] font-semibold tracking-tight">Domicilio fiscal</div>
              <p className="mb-4 text-[12.5px] text-ink-3">
                El código postal del domicilio fiscal registrado ante el SAT. Es obligatorio en el CFDI 4.0 (lugar de expedición).
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="f-cp">Código postal fiscal *</label>
                  <input
                    id="f-cp"
                    className={input}
                    value={cp}
                    maxLength={5}
                    inputMode="numeric"
                    onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))}
                    placeholder="37000"
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-email">Correo para facturas</label>
                  <input
                    id="f-email"
                    className={input}
                    value={email}
                    maxLength={255}
                    type="email"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="facturas@negocio.mx"
                  />
                  <p className="mt-1.5 text-[11.5px] text-ink-3">Opcional · copia de cada CFDI emitido.</p>
                </div>
              </div>
            </div>

            {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
            {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
              <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
