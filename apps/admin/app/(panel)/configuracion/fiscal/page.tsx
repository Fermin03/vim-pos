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
  const [regimen, setRegimen] = useState("612");
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
      setRegimen(d.regimen_fiscal ?? "612");
      setCp(d.codigo_postal_fiscal);
      setEmail(d.email_fiscal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setDatos(null);
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  async function guardar() {
    setError(null);
    setOkMsg(null);
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
      setOkMsg("Datos fiscales guardados.");
      setTimeout(() => setOkMsg(null), 2500);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  // Régimenes filtrados por el tipo de persona detectado (si hay RFC válido).
  const regimenesVisibles = personaPorRfc
    ? REGIMENES_FISCALES.filter((r) => r.persona === personaPorRfc)
    : REGIMENES_FISCALES;

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
            {datos.facturacionActiva && (
              <div className="mb-5 rounded-lg border border-[#E8DCC0] bg-[#F6EEDD] px-4 py-3 text-[12.5px] font-medium text-warning">
                La facturación electrónica está activa. Si cambias estos datos, solo aplicarán a las facturas
                nuevas; las ya emitidas conservan los datos con que se timbraron.
              </div>
            )}

            {/* ── Identificación fiscal ── */}
            <div className="mb-6 rounded-lg border border-line bg-surface p-5">
              <div className="mb-1 font-display text-[16px] font-semibold tracking-tight">Identificación fiscal</div>
              <p className="mb-4 text-[12.5px] text-ink-3">Tal como aparece en tu Constancia de Situación Fiscal (CSF).</p>

              {/* Segmento persona (derivado del RFC) */}
              <div className="mb-4 inline-flex gap-0.5 rounded border border-line bg-hover p-[3px]">
                {(["MORAL", "FISICA"] as const).map((p) => (
                  <span
                    key={p}
                    className={[
                      "rounded-[4px] px-4 py-1.5 text-[12.5px] font-semibold transition",
                      personaPorRfc === p ? "bg-surface text-ink shadow-sm" : "text-ink-3",
                    ].join(" ")}
                  >
                    {p === "MORAL" ? "Persona moral" : "Persona física"}
                  </span>
                ))}
                {!personaPorRfc && (
                  <span className="px-2 py-1.5 text-[11.5px] text-ink-3">se detecta por el RFC</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="f-rfc">RFC *</label>
                  <input
                    id="f-rfc"
                    className={input}
                    value={rfc}
                    maxLength={13}
                    autoCapitalize="characters"
                    onChange={(e) => setRfc(e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, ""))}
                    placeholder="XAXX010101000"
                  />
                  {rfc.length > 0 && (
                    <p className={`mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold ${rfcValido ? "text-success" : "text-danger"}`}>
                      {rfcValido ? "✓ RFC con formato válido" : "✗ Formato de RFC incompleto"}
                    </p>
                  )}
                </div>
                <div>
                  <label className={label} htmlFor="f-regimen">Régimen fiscal *</label>
                  <select id="f-regimen" className={input} value={regimen} onChange={(e) => setRegimen(e.target.value)}>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="f-cp">Código postal fiscal *</label>
                  <input
                    id="f-cp"
                    className={input}
                    value={cp}
                    maxLength={5}
                    inputMode="numeric"
                    onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))}
                    placeholder="37150"
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
