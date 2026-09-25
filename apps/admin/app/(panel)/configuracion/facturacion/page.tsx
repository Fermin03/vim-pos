"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, useConfirmar } from "@vim/ui/styles";
import { fechaLegible } from "@vim/fecha";
import { PageHeader, PageBody } from "../../../components/page-header";
import {
  actualizarDatosFiscales,
  borrarCsd,
  cargarCsd,
  datosFiscalesSchema,
  guardarAjustesTicket,
  guardarCfdiEmisor,
  leerAjustesTicket,
  leerCfdiEmisor,
  leerDatosFiscales,
  REGIMENES_FISCALES,
  type CfdiEmisor,
  type DatosFiscales,
} from "../../../lib/configuracion";
import { PERIODICIDADES } from "../../../lib/facturacion";
import { diasHasta, estadoFacturacion } from "../../../lib/facturacion-estado";
import { mensajeError } from "../../../lib/errores";

/**
 * Facturación: una sola pantalla que contesta "¿ya puedo facturar?".
 *
 * Antes eran dos ("Datos fiscales" y "CFDI / PAC"), la segunda enlazada solo desde el menú, el RFC
 * se capturaba dos veces y el "Modo" arrancaba en "Pruebas (sandbox)" sin decir que así no se
 * emite nada válido. Ahora son tres pasos en orden —tus datos, tu sello, activar— con el estado
 * arriba, y cada paso guarda y avisa en su propio lugar: subir el sello ya no pisa lo que se
 * estaba editando en otro lado.
 */

const input =
  "h-11 w-full rounded border border-line-strong bg-surface px-3 text-[15px] outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-ink focus-visible:shadow-[0_0_0_3px_rgba(22,22,26,.08)] aria-[invalid=true]:border-danger";
const label = "mb-1.5 block text-[14px] font-semibold text-ink";
const ayuda = "mt-1.5 text-[13px] leading-snug text-ink-2";
const RFC_REGEX = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

type Aviso = { tono: "ok" | "error"; texto: string } | null;

function AvisoPaso({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <p
      role={aviso.tono === "error" ? "alert" : "status"}
      className={`mt-4 rounded border px-3 py-2 text-[14px] font-medium ${aviso.tono === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-success/30 bg-success-soft text-success"}`}
    >
      {aviso.texto}
    </p>
  );
}

function Paso({
  numero, titulo, hecho, bloqueado, resumen, children, id,
}: {
  numero: number; titulo: string; hecho: boolean; bloqueado?: boolean; resumen?: React.ReactNode; children: React.ReactNode; id: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={`mb-5 scroll-mt-6 rounded-lg border bg-surface p-5 ${bloqueado ? "border-line opacity-60" : "border-line"}`}>
      <div className="flex items-start gap-3.5">
        <span
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-display text-[14px] font-bold ${hecho ? "bg-success text-white" : "bg-hover text-ink-2"}`}
          aria-hidden="true"
        >
          {hecho ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M20 6 9 17l-5-5" /></svg>
          ) : numero}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-titulo`} className="font-display text-[17px] font-semibold tracking-tight">
            {titulo}
            <span className="sr-only">{hecho ? " (listo)" : " (pendiente)"}</span>
          </h2>
          {resumen && <div className="mt-1 text-[14px] text-ink-2">{resumen}</div>}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default function FacturacionPage() {
  const [confirmar, dialogoConfirmar] = useConfirmar();
  const [datos, setDatos] = useState<DatosFiscales | null | undefined>(undefined);
  const [emisor, setEmisor] = useState<CfdiEmisor | null | undefined>(undefined);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Paso 1 · datos fiscales
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [rfc, setRfc] = useState("");
  const [razon, setRazon] = useState("");
  const [regimen, setRegimen] = useState("");
  const [cp, setCp] = useState("");
  const [email, setEmail] = useState("");
  const [rfcTocado, setRfcTocado] = useState(false);
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [avisoDatos, setAvisoDatos] = useState<Aviso>(null);

  // Paso 2 · sello
  const [cer, setCer] = useState<File | null>(null);
  const [llave, setLlave] = useState<File | null>(null);
  // La contraseña de la llave vive aquí solo hasta que se envía; se limpia al terminar.
  const [passCsd, setPassCsd] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [avisoSello, setAvisoSello] = useState<Aviso>(null);
  const [cambiandoSello, setCambiandoSello] = useState(false);

  // Paso 3 · activar
  const [activando, setActivando] = useState(false);
  const [avisoActivar, setAvisoActivar] = useState<Aviso>(null);

  // Ajustes
  const [periodicidad, setPeriodicidad] = useState("04");
  const [qrTicket, setQrTicket] = useState(false);
  const [guardandoAjustes, setGuardandoAjustes] = useState(false);
  const [avisoAjustes, setAvisoAjustes] = useState<Aviso>(null);

  const cargarDatos = useCallback(async () => {
    const d = await leerDatosFiscales();
    setDatos(d);
    setRfc(d.rfc);
    setRazon(d.razon_social);
    setRegimen(d.regimen_fiscal ?? "");
    setCp(d.codigo_postal_fiscal);
    setEmail(d.email_fiscal);
    return d;
  }, []);
  // Solo el emisor: recargarlo ya no reescribe lo que se está editando en otros pasos.
  const cargarEmisor = useCallback(async () => {
    const e = await leerCfdiEmisor();
    setEmisor(e);
    return e;
  }, []);

  useEffect(() => {
    Promise.all([cargarDatos(), cargarEmisor(), leerAjustesTicket()])
      .then(([d, e, a]) => {
        setPeriodicidad(e.periodicidad_global);
        setQrTicket(a.mostrarQrFactura);
        // Con los datos incompletos, el paso 1 arranca abierto.
        setEditandoDatos(!RFC_REGEX.test(d.rfc) || !d.razon_social.trim() || !d.regimen_fiscal || !/^\d{5}$/.test(d.codigo_postal_fiscal));
      })
      .catch((e) => {
        setErrorCarga(mensajeError(e, "No se pudo cargar"));
        setDatos(null);
        setEmisor(null);
      });
  }, [cargarDatos, cargarEmisor]);

  const estado = useMemo(
    () => (datos && emisor ? estadoFacturacion(datos, emisor) : null),
    [datos, emisor],
  );

  // ── Paso 1 ────────────────────────────────────────────────────────────────────────────────
  const personaPorRfc: "MORAL" | "FISICA" | null = rfc.length === 12 ? "MORAL" : rfc.length === 13 ? "FISICA" : null;
  const regimenesVisibles = personaPorRfc ? REGIMENES_FISCALES.filter((r) => r.persona === personaPorRfc) : REGIMENES_FISCALES;
  // Lo que se ve es lo que se guarda: un régimen que no es del tipo de persona sale vacío.
  const regimenValido = regimenesVisibles.some((r) => r.codigo === regimen);
  const rfcValido = RFC_REGEX.test(rfc);

  async function guardarDatos() {
    setAvisoDatos(null);
    setRfcTocado(true);
    if (!rfcValido) return setAvisoDatos({ tono: "error", texto: "Revisa el RFC: persona física lleva 13 caracteres; empresa, 12." });
    if (!regimenValido) return setAvisoDatos({ tono: "error", texto: "Elige tu régimen fiscal, tal como aparece en tu Constancia de Situación Fiscal." });
    const parsed = datosFiscalesSchema.safeParse({ rfc, razon_social: razon, regimen_fiscal: regimen, codigo_postal_fiscal: cp, email_fiscal: email });
    if (!parsed.success) return setAvisoDatos({ tono: "error", texto: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    setGuardandoDatos(true);
    try {
      await actualizarDatosFiscales(parsed.data);
      const eraActiva = datos?.facturacionActiva;
      await cargarDatos();
      setEditandoDatos(false);
      setAvisoDatos({
        tono: "ok",
        texto: eraActiva
          ? "Datos guardados. Aplican a las facturas nuevas: las ya emitidas conservan los datos con que se timbraron."
          : "Datos guardados.",
      });
    } catch (e) {
      setAvisoDatos({ tono: "error", texto: mensajeError(e, "No se pudieron guardar los datos") });
    } finally {
      setGuardandoDatos(false);
    }
  }

  // ── Paso 2 ────────────────────────────────────────────────────────────────────────────────
  async function subirSello() {
    setAvisoSello(null);
    if (!cer || !llave || !passCsd) {
      return setAvisoSello({ tono: "error", texto: "Faltan el archivo .cer, el .key o la contraseña de la llave." });
    }
    setSubiendo(true);
    try {
      const r = await cargarCsd(cer, llave, passCsd);
      setCer(null);
      setLlave(null);
      setCambiandoSello(false);
      await cargarEmisor();
      setAvisoSello({
        tono: "ok",
        texto: `${r.reemplazado ? "Sello renovado" : "Sello cargado"}. Vigente hasta el ${fechaLegible(r.vigenciaHasta)}.`,
      });
    } catch (e) {
      setAvisoSello({ tono: "error", texto: mensajeError(e, "No se pudo cargar el sello") });
    } finally {
      // Pase lo que pase, la contraseña no se queda en memoria más de lo necesario.
      setPassCsd("");
      setSubiendo(false);
    }
  }

  async function quitarSello() {
    if (!(await confirmar({
      titulo: "¿Retirar el sello digital?",
      mensaje: "El negocio dejará de poder facturar, también en el portal de autofactura, hasta que se cargue de nuevo.",
      boton: "Retirar sello",
    }))) return;
    setAvisoSello(null);
    setSubiendo(true);
    try {
      await borrarCsd();
      await cargarEmisor();
      setAvisoSello({ tono: "ok", texto: "Sello retirado." });
    } catch (e) {
      setAvisoSello({ tono: "error", texto: mensajeError(e, "No se pudo retirar el sello") });
    } finally {
      setSubiendo(false);
    }
  }

  // ── Paso 3 ────────────────────────────────────────────────────────────────────────────────
  async function cambiarEstado(nuevo: "ACTIVO" | "INACTIVO") {
    if (!emisor || !datos) return;
    const activar = nuevo === "ACTIVO";
    if (!(await confirmar(
      activar
        ? {
            titulo: "¿Reanudar la facturación?",
            mensaje: "Se vuelven a emitir facturas desde el admin y desde el portal de autofactura, y consumen folios de tu saldo.",
            boton: "Reanudar facturación",
          }
        : {
            titulo: "¿Pausar la facturación?",
            mensaje: "No se emitirán facturas nuevas, tampoco desde el portal de autofactura, hasta que la reanudes. Las ya emitidas no cambian.",
            boton: "Pausar facturación",
          },
    ))) return;
    setAvisoActivar(null);
    setActivando(true);
    try {
      // El RFC del emisor sale de los datos fiscales: ya no se captura dos veces.
      await guardarCfdiEmisor({
        rfc: datos.rfc,
        proveedor_pac: emisor.proveedor_pac,
        facturama_issuer_ref: emisor.facturama_issuer_ref,
        csd_vigencia_hasta: emisor.csd_vigencia_hasta,
        estado: nuevo,
        periodicidad_global: emisor.periodicidad_global,
      });
      await Promise.all([cargarEmisor(), cargarDatos()]);
      setAvisoActivar({ tono: "ok", texto: activar ? "Facturación reanudada." : "Facturación en pausa." });
    } catch (e) {
      setAvisoActivar({ tono: "error", texto: mensajeError(e, "No se pudo cambiar el estado") });
    } finally {
      setActivando(false);
    }
  }

  // ── Ajustes ───────────────────────────────────────────────────────────────────────────────
  async function guardarAjustes() {
    if (!emisor || !datos) return;
    setAvisoAjustes(null);
    if (!RFC_REGEX.test(datos.rfc)) {
      return setAvisoAjustes({ tono: "error", texto: "Primero guarda tus datos fiscales (paso 1)." });
    }
    setGuardandoAjustes(true);
    try {
      await guardarCfdiEmisor({
        rfc: datos.rfc,
        proveedor_pac: emisor.proveedor_pac,
        facturama_issuer_ref: emisor.facturama_issuer_ref,
        csd_vigencia_hasta: emisor.csd_vigencia_hasta,
        estado: emisor.estado,
        periodicidad_global: periodicidad as CfdiEmisor["periodicidad_global"],
      });
      await guardarAjustesTicket({ mostrarQrFactura: qrTicket });
      await cargarEmisor();
      setAvisoAjustes({ tono: "ok", texto: "Ajustes guardados." });
    } catch (e) {
      setAvisoAjustes({ tono: "error", texto: mensajeError(e, "No se pudieron guardar los ajustes") });
    } finally {
      setGuardandoAjustes(false);
    }
  }

  const regimenNombre = (c: string | null) => REGIMENES_FISCALES.find((r) => r.codigo === c)?.label ?? c ?? "—";
  const diasSello = emisor?.csd.vigenciaHasta ? diasHasta(emisor.csd.vigenciaHasta, new Date()) : null;
  const mostrarFormSello = !!emisor && (!emisor.csd.numeroCertificado || cambiandoSello || !!estado?.selloVencido);

  return (
    <>
      {dialogoConfirmar}
      <PageHeader
        titulo="Facturación"
        subtitulo="Tus datos fiscales y tu sello digital: con los dos, tu negocio emite facturas CFDI 4.0. El timbrado lo pone VIM."
        migas={[{ label: "Configuración" }, { label: "Facturación" }]}
      />
      <PageBody>
        {(datos === undefined || emisor === undefined) && !errorCarga && <p className="text-sm text-ink-2">Cargando…</p>}
        {errorCarga && <p className="text-sm font-medium text-danger" role="alert">{errorCarga}</p>}

        {datos && emisor && estado && (
          <div className="max-w-[720px]">
            {/* ── ¿Ya puedo facturar? ── */}
            <div
              role="status"
              className={`mb-6 flex items-center gap-3.5 rounded-lg border p-4 ${estado.lista ? "border-success/30 bg-success-soft" : estado.selloVencido ? "border-danger/30 bg-danger-soft" : estado.pausada ? "border-warning/30 bg-warning-soft" : "border-line bg-surface"}`}
            >
              <span
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${estado.lista ? "bg-success text-white" : estado.selloVencido ? "bg-danger text-white" : estado.pausada ? "bg-warning text-white" : "bg-hover text-ink-2"}`}
                aria-hidden="true"
              >
                {estado.lista ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  <span className="font-display text-[16px] font-bold">{estado.faltan.length}</span>
                )}
              </span>
              <div className="min-w-0">
                <div className="font-display text-[18px] font-bold leading-tight">
                  {estado.lista
                    ? "Lista para facturar"
                    : estado.selloVencido
                      ? "No puedes facturar: el sello venció"
                      : estado.pausada && estado.faltan.length === 1
                        ? "La facturación está en pausa"
                        : `Te ${estado.faltan.length === 1 ? "falta 1 paso" : `faltan ${estado.faltan.length} pasos`} para facturar`}
                </div>
                <div className="text-[14px] text-ink-2">
                  {estado.faltan.length === 0
                    ? "Tus clientes ya pueden pedir factura en el portal y tú emitirlas desde Facturación."
                    : `Falta: ${estado.faltan.join(", ")}.`}
                </div>
              </div>
            </div>

            {/* ── Paso 1 · Datos fiscales ── */}
            <Paso
              id="datos"
              numero={1}
              titulo="Tus datos fiscales"
              hecho={estado.datosCompletos}
              resumen={!editandoDatos && estado.datosCompletos ? (
                <>
                  <b className="font-semibold text-ink">{datos.razon_social}</b> · RFC {datos.rfc} · {regimenNombre(datos.regimen_fiscal)} · CP {datos.codigo_postal_fiscal}
                </>
              ) : "Tal como aparecen en tu Constancia de Situación Fiscal del SAT."}
            >
              {!editandoDatos ? (
                <Button variant="ghost" onClick={() => { setEditandoDatos(true); setAvisoDatos(null); }}>Editar datos</Button>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); void guardarDatos(); }} noValidate>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={label} htmlFor="f-rfc">RFC</label>
                      <input
                        id="f-rfc" className={input} value={rfc} maxLength={13} autoCapitalize="characters" spellCheck={false}
                        aria-invalid={rfcTocado && !rfcValido ? true : undefined}
                        onChange={(e) => setRfc(e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, ""))}
                        onBlur={() => setRfcTocado(true)}
                      />
                      <p className={ayuda}>
                        {personaPorRfc
                          ? <>Persona <b className="text-ink">{personaPorRfc === "MORAL" ? "moral" : "física"}</b> (se detecta por el RFC).</>
                          : "Persona física: 13 caracteres. Empresa: 12."}
                      </p>
                    </div>
                    <div>
                      <label className={label} htmlFor="f-regimen">Régimen fiscal</label>
                      <select id="f-regimen" className={input} value={regimenValido ? regimen : ""} onChange={(e) => setRegimen(e.target.value)}>
                        {!regimenValido && <option value="" disabled>Elige tu régimen…</option>}
                        {regimenesVisibles.map((r) => <option key={r.codigo} value={r.codigo}>{r.codigo} · {r.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className={label} htmlFor="f-razon">Nombre o razón social</label>
                    <input id="f-razon" className={input} value={razon} maxLength={255} onChange={(e) => setRazon(e.target.value)} />
                    <p className={ayuda}>Como en tu constancia. Si es empresa, el «SA DE CV» lo quitamos al facturar: así lo pide el CFDI 4.0.</p>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={label} htmlFor="f-cp">Código postal fiscal</label>
                      <input id="f-cp" className={input} value={cp} maxLength={5} inputMode="numeric" onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))} />
                      <p className={ayuda}>El de tu domicilio fiscal: es el lugar de expedición de tus facturas.</p>
                    </div>
                    <div>
                      <label className={label} htmlFor="f-email">Correo para copias <span className="font-normal text-ink-2">· opcional</span></label>
                      <input id="f-email" className={input} value={email} maxLength={255} type="email" autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
                      <p className={ayuda}>Recibe una copia de cada factura emitida.</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled={guardandoDatos}>{guardandoDatos ? "Guardando…" : "Guardar datos"}</Button>
                    {estado.datosCompletos && (
                      <Button type="button" variant="ghost" onClick={() => { void cargarDatos(); setEditandoDatos(false); setAvisoDatos(null); }}>Cancelar</Button>
                    )}
                  </div>
                </form>
              )}
              <AvisoPaso aviso={avisoDatos} />
            </Paso>

            {/* ── Paso 2 · Sello digital ── */}
            <Paso
              id="sello"
              numero={2}
              titulo="Tu sello digital (CSD)"
              hecho={estado.selloVigente}
              resumen={
                emisor.csd.numeroCertificado && emisor.csd.vigenciaHasta ? (
                  <span className={diasSello !== null && diasSello < 0 ? "font-semibold text-danger" : diasSello !== null && diasSello <= 60 ? "font-semibold text-warning" : undefined}>
                    {diasSello !== null && diasSello < 0
                      ? `Venció el ${fechaLegible(emisor.csd.vigenciaHasta)}. Tramita uno nuevo en el SAT y cárgalo aquí.`
                      : `Vigente hasta el ${fechaLegible(emisor.csd.vigenciaHasta)}${diasSello !== null && diasSello <= 60 ? ` · faltan ${diasSello} días: tramita la renovación` : ""}.`}
                  </span>
                ) : (
                  <>Los dos archivos que te da el SAT al tramitar tu Certificado de Sello Digital (<b>.cer</b> y <b>.key</b>) y su contraseña. <b>No es tu e.firma.</b></>
                )
              }
            >
              {emisor.csd.numeroCertificado && !mostrarFormSello && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[14px] text-ink-2">Certificado {emisor.csd.numeroCertificado}</span>
                  <Button variant="ghost" onClick={() => { setCambiandoSello(true); setAvisoSello(null); }}>Reemplazar sello</Button>
                  <button type="button" onClick={() => void quitarSello()} disabled={subiendo} className="h-11 rounded px-2 text-[14px] font-semibold text-danger transition-colors hover:bg-danger-soft disabled:opacity-50">
                    Retirar sello
                  </button>
                </div>
              )}
              {mostrarFormSello && (
                <form onSubmit={(e) => { e.preventDefault(); void subirSello(); }} noValidate>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={label} htmlFor="c-cer">Archivo .cer</label>
                      <input id="c-cer" type="file" accept=".cer" className={`${input} pt-2`} onChange={(e) => setCer(e.target.files?.[0] ?? null)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="c-key">Archivo .key</label>
                      <input id="c-key" type="file" accept=".key" className={`${input} pt-2`} onChange={(e) => setLlave(e.target.files?.[0] ?? null)} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className={label} htmlFor="c-pass">Contraseña de la llave privada</label>
                    {/* new-password: así el navegador no autollena la del panel y el error dice "contraseña incorrecta". */}
                    <input id="c-pass" type="password" className={input} value={passCsd} autoComplete="new-password" onChange={(e) => setPassCsd(e.target.value)} />
                    <p className={ayuda}>No la guardamos: viaja cifrada hasta el PAC y se descarta. Tampoco guardamos tu archivo .key.</p>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled={subiendo}>{subiendo ? "Cargando…" : emisor.csd.numeroCertificado ? "Cargar el sello nuevo" : "Cargar sello"}</Button>
                    {cambiandoSello && (
                      <Button type="button" variant="ghost" onClick={() => { setCambiandoSello(false); setCer(null); setLlave(null); setPassCsd(""); }}>Cancelar</Button>
                    )}
                  </div>
                </form>
              )}
              <AvisoPaso aviso={avisoSello} />
            </Paso>

            {/* ── Paso 3 · Activa o en pausa ──
                 Solo "pausada" bloquea el timbrado; activa es lo normal. No se promete que "activar"
                 vuelva válidas las facturas: con datos y sello, ya lo son. */}
            <Paso
              id="activar"
              numero={3}
              titulo={estado.pausada ? "Facturación en pausa" : "Facturación activa"}
              hecho={estado.lista}
              resumen={
                estado.pausada
                  ? "No se emite ninguna factura nueva, tampoco desde el portal de autofactura. Las ya emitidas no cambian."
                  : estado.datosCompletos && estado.selloVigente
                    ? "Tus facturas y las que pidan tus clientes en el portal se timbran y consumen folios de tu saldo."
                    : "En cuanto termines los pasos 1 y 2 podrás emitir facturas."
              }
            >
              {estado.pausada ? (
                <Button onClick={() => void cambiarEstado("ACTIVO")} disabled={activando}>
                  {activando ? "Reanudando…" : "Reanudar facturación"}
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={() => void cambiarEstado("INACTIVO")}
                  disabled={activando}
                  className="-ml-2 h-11 rounded px-2 text-[14px] font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
                >
                  Pausar facturación
                </button>
              )}
              <AvisoPaso aviso={avisoActivar} />
            </Paso>

            {/* ── Ajustes ── */}
            <section aria-labelledby="ajustes-titulo" className="mb-6 rounded-lg border border-line bg-surface p-5">
              <h2 id="ajustes-titulo" className="font-display text-[17px] font-semibold tracking-tight">Ajustes</h2>
              <div className="mt-4 max-w-[400px]">
                <label className={label} htmlFor="c-per">Factura global: cada cuánto la emites</label>
                <select id="c-per" className={input} value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}>
                  {PERIODICIDADES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                </select>
                <p className={ayuda}>
                  Es la factura de las ventas en que nadie pidió comprobante. <b className="text-ink">Define hasta cuándo puede
                  facturar tu cliente</b>: con periodicidad diaria, el ticket de ayer ya no se puede facturar hoy.
                </p>
                {periodicidad === "05" && (
                  <p className="mt-2 rounded border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning">
                    El SAT solo admite bimestral con régimen <b>621 (Incorporación Fiscal)</b>. Con otro, el timbrado se rechaza.
                  </p>
                )}
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-[3px] h-5 w-5 flex-shrink-0 accent-accent" checked={qrTicket} onChange={(e) => setQrTicket(e.target.checked)} />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">Imprimir el QR de autofactura en el ticket</span>
                  <span className="block text-[13px] leading-snug text-ink-2">
                    «¿Necesitas factura? Escanea el código» al pie del ticket, con el enlace al portal.
                  </span>
                </span>
              </label>
              {qrTicket && !estado.lista && (
                <p className="mt-3 rounded border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning">
                  Todavía no puedes facturar: el ticket ofrecería una factura que aún no puedes emitir.
                </p>
              )}
              <div className="mt-5">
                <Button onClick={() => void guardarAjustes()} disabled={guardandoAjustes}>{guardandoAjustes ? "Guardando…" : "Guardar ajustes"}</Button>
              </div>
              <AvisoPaso aviso={avisoAjustes} />
            </section>
          </div>
        )}
      </PageBody>
    </>
  );
}
