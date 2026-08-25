"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import {
  cfdiEmisorSchema,
  guardarAjustesTicket,
  guardarCfdiEmisor,
  leerAjustesTicket,
  leerCfdiEmisor,
  borrarCsd,
  cargarCsd,
  diasParaVencer,
  type CfdiEmisor,
} from "../../../lib/configuracion";
import { PERIODICIDADES } from "../../../lib/facturacion";
import { mensajeError } from "../../../lib/errores";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const ESTADOS = [
  { v: "PRUEBA", l: "Pruebas (sandbox)" },
  { v: "ACTIVO", l: "Activo (producción)" },
  { v: "INACTIVO", l: "Inactivo" },
] as const;

export default function CfdiPage() {
  const [emisor, setEmisor] = useState<CfdiEmisor | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [qrTicket, setQrTicket] = useState(false);

  const [rfc, setRfc] = useState("");
  // El PAC lo decide VIM en el entorno del servidor: `obtenerPac()` elige según qué credenciales
  // existen e IGNORA este campo. El selector que había aquí no controlaba nada y encima escribía
  // la elección en `tickets_cfdi.pac_proveedor`, así que el registro del comprobante podía decir
  // "Finkok" mientras timbraba Facturama. Se conserva el valor para no pisarlo al guardar.
  const [pac, setPac] = useState("FACTURAMA");
  const [ref, setRef] = useState("");
  const [vig, setVig] = useState("");
  const [estado, setEstado] = useState("PRUEBA");
  const [cer, setCer] = useState<File | null>(null);
  const [llave, setLlave] = useState<File | null>(null);
  // La contraseña de la llave vive en este estado solo hasta que se envía; se limpia al terminar.
  const [passCsd, setPassCsd] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [periodicidad, setPeriodicidad] = useState("04");

  async function recargar() {
    try {
      const e = await leerCfdiEmisor();
      setEmisor(e);
      setRfc(e.rfc);
      setPac(e.proveedor_pac);
      setRef(e.facturama_issuer_ref ?? "");
      setVig(e.csd_vigencia_hasta ?? "");
      setEstado(e.estado);
      setPeriodicidad(e.periodicidad_global);
      setQrTicket((await leerAjustesTicket()).mostrarQrFactura);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar"));
      setEmisor(null);
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  async function guardar() {
    setError(null);
    setOkMsg(null);
    const parsed = cfdiEmisorSchema.safeParse({
      rfc,
      proveedor_pac: pac,
      facturama_issuer_ref: ref,
      csd_vigencia_hasta: vig,
      estado,
      periodicidad_global: periodicidad,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      await guardarCfdiEmisor(parsed.data);
      await guardarAjustesTicket({ mostrarQrFactura: qrTicket });
      setOkMsg("Configuración CFDI guardada.");
      setTimeout(() => setOkMsg(null), 2500);
      recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  async function subirSello() {
    setError(null);
    setOkMsg(null);
    if (!cer || !llave || !passCsd) {
      setError("Faltan el .cer, el .key o la contraseña de la llave.");
      return;
    }
    setSubiendo(true);
    try {
      const r = await cargarCsd(cer, llave, passCsd);
      setOkMsg(`${r.reemplazado ? "Sello renovado" : "Sello cargado"}. Certificado ${r.numeroCertificado}, vigente hasta el ${r.vigenciaHasta}.`);
      setCer(null);
      setLlave(null);
      setPassCsd("");
      recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar el sello"));
    } finally {
      // Pase lo que pase, la contraseña no se queda en memoria más de lo necesario.
      setPassCsd("");
      setSubiendo(false);
    }
  }

  async function quitarSello() {
    if (!confirm("¿Retirar el sello digital de este negocio? Dejará de poder facturar hasta que se cargue de nuevo.")) return;
    setError(null);
    setOkMsg(null);
    setSubiendo(true);
    try {
      await borrarCsd();
      setOkMsg("Sello retirado.");
      recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo retirar el sello"));
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Facturación electrónica"
        subtitulo="Conecta tu PAC (Proveedor Autorizado de Certificación) para que VIM POS timbre facturas CFDI 4.0 automáticamente al cobrar."
        migas={[{ label: "Configuración" }, { label: "CFDI / PAC" }]}
      />
      <PageBody>
        {emisor === undefined && <p className="text-sm text-ink-3">Cargando…</p>}
        {emisor === null && error && <p className="text-sm font-medium text-danger">{error}</p>}
        {emisor && (
          <div className="max-w-[680px]">
            <div className="mb-5 rounded-lg border border-[#CDE0F0] bg-[#EEF5FC] px-4 py-3 text-[12.5px] font-medium text-info">
              Mientras no haya credenciales de PAC configuradas en el servidor, el timbrado usa un
              <b> emisor de pruebas</b> (no genera CFDI válidos ante el SAT). Para producción se carga el CSD
              y la API key del PAC del lado del servidor.
            </div>

            <div className="mb-6 rounded-lg border border-line bg-surface p-5">
              <div className="mb-4 font-display text-[16px] font-semibold tracking-tight">Emisor</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="c-rfc">RFC emisor *</label>
                  <input id="c-rfc" className={input} value={rfc} maxLength={13}
                    onChange={(e) => setRfc(e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, ""))} />
                </div>
                <div>
                  <label className={label} htmlFor="c-estado">Modo</label>
                  <select id="c-estado" className={input} value={estado} onChange={(e) => setEstado(e.target.value)}>
                    {ESTADOS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-line bg-surface p-5">
              <div className="mb-1 font-display text-[16px] font-semibold tracking-tight">Factura global</div>
              <p className="mb-4 text-[12.5px] text-ink-3">
                La factura que ampara las ventas del periodo en las que nadie pidió comprobante.
              </p>
              <div className="max-w-[380px]">
                <label className={label} htmlFor="c-per">Periodicidad</label>
                <select id="c-per" className={input} value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}>
                  {PERIODICIDADES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                </select>
                <p className="mt-1.5 text-[11.5px] text-ink-3">
                  Cada cuánto la emites.{" "}
                  <b>Define hasta cuándo puede facturar tu cliente</b>: con periodicidad diaria, el
                  ticket de ayer ya no se puede facturar hoy.
                </p>
                {periodicidad === "05" && (
                  <p className="mt-2 rounded border border-[#F0DCC0] bg-[#FCF3E6] px-3 py-2 text-[12.5px] font-medium text-warning">
                    El SAT solo admite periodicidad bimestral si tu régimen fiscal es <b>621
                    (Incorporación Fiscal)</b>. Con cualquier otro, el timbrado se rechaza.
                  </p>
                )}
              </div>
            </div>

            {/* ── Sello digital (CSD) ───────────────────────────────────────────────────────
                Los datos del sello se LEEN del propio certificado al cargarlo. Antes la vigencia
                se tecleaba, y una fecha mal escrita hacía creer que el negocio podía facturar
                cuando su sello ya había vencido. */}
            <div className="mb-6 rounded-lg border border-line bg-surface p-5">
              <div className="mb-1 font-display text-[16px] font-semibold tracking-tight">Sello digital (CSD)</div>
              <p className="mb-4 text-[12.5px] text-ink-3">
                Son los dos archivos que el SAT te entrega al tramitar tu Certificado de Sello Digital:
                uno <b>.cer</b> y uno <b>.key</b>, más la contraseña que capturaste al generarlos.
                <b> No es tu e.firma.</b>
              </p>

              {emisor.csd.numeroCertificado ? (
                <div className="mb-4 rounded border border-line bg-bg px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold">Certificado {emisor.csd.numeroCertificado}</span>
                    {emisor.csd.vigenciaHasta && (() => {
                      const dias = diasParaVencer(emisor.csd.vigenciaHasta);
                      const tono = dias < 0 ? "text-danger" : dias <= 60 ? "text-warning" : "text-ink-3";
                      return (
                        <span className={`text-[12.5px] font-medium ${tono}`}>
                          {dias < 0
                            ? `Venció el ${emisor.csd.vigenciaHasta}`
                            : `Vigente hasta el ${emisor.csd.vigenciaHasta} · ${dias} días`}
                        </span>
                      );
                    })()}
                  </div>
                  {emisor.csd.vigenciaHasta && diasParaVencer(emisor.csd.vigenciaHasta) <= 60 && (
                    <p className="mt-2 text-[12.5px] font-medium text-warning">
                      Tramita la renovación en el SAT antes de que venza: sin sello vigente no se puede
                      timbrar ninguna factura.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={quitarSello}
                    disabled={subiendo}
                    className="mt-3 text-[12.5px] font-medium text-danger underline underline-offset-2 disabled:opacity-50"
                  >
                    Retirar el sello
                  </button>
                </div>
              ) : (
                <p className="mb-4 rounded border border-[#F0DCC0] bg-[#FCF3E6] px-3 py-2 text-[12.5px] font-medium text-warning">
                  Todavía no hay sello cargado. Sin él no se puede emitir ninguna factura.
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="c-cer">Archivo .cer</label>
                  <input id="c-cer" type="file" accept=".cer" className={`${input} pt-2.5`}
                    onChange={(e) => setCer(e.target.files?.[0] ?? null)} />
                </div>
                <div>
                  <label className={label} htmlFor="c-key">Archivo .key</label>
                  <input id="c-key" type="file" accept=".key" className={`${input} pt-2.5`}
                    onChange={(e) => setLlave(e.target.files?.[0] ?? null)} />
                </div>
              </div>
              <div className="mt-4">
                <label className={label} htmlFor="c-pass">Contraseña de la llave privada</label>
                <input id="c-pass" type="password" className={input} value={passCsd} autoComplete="off"
                  onChange={(e) => setPassCsd(e.target.value)} />
                <p className="mt-1.5 text-[11.5px] text-ink-3">
                  No la guardamos: viaja cifrada hasta el PAC y se descarta. Tampoco guardamos tu archivo .key.
                </p>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={subirSello} disabled={subiendo || !cer || !llave || !passCsd}>
                  {subiendo ? "Cargando…" : emisor.csd.numeroCertificado ? "Reemplazar sello" : "Cargar sello"}
                </Button>
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-line bg-surface p-5">
              <div className="mb-1 font-display text-[16px] font-semibold tracking-tight">Ticket del cliente</div>
              <p className="mb-4 text-[12.5px] text-ink-3">
                Qué se imprime en el ticket respecto a facturación.
              </p>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-[3px] h-4 w-4 flex-shrink-0 accent-[#0078C9]"
                  checked={qrTicket}
                  onChange={(e) => setQrTicket(e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">Imprimir el QR de autofacturación</span>
                  <span className="block text-[12.5px] leading-[1.5] text-ink-3">
                    Agrega al pie del ticket &quot;¿Necesitas factura? Escanea el código&quot; con el enlace al
                    portal. Actívalo solo cuando el portal esté publicado y el CSD cargado: si no, el
                    cliente escanea y no encuentra nada.
                  </span>
                </span>
              </label>
              {qrTicket && estado !== "ACTIVO" && (
                <p className="mt-3 rounded border border-[#F0DCC0] bg-[#FCF3E6] px-3 py-2 text-[12.5px] font-medium text-warning">
                  El emisor no está en modo <b>Activo (producción)</b>, así que hoy no se pueden generar
                  CFDI válidos. El ticket ofrecerá una factura que el negocio todavía no puede emitir.
                </p>
              )}
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
