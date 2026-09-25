"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { use } from "react";
import { Button, LogoVim } from "@vim/ui/styles";
import { fechaLegible } from "@vim/fecha";
import {
  buscarNegocio, buscarTicket, descargar, enviarPorCorreo, recuperar, timbrar, ErrorPortal,
  CORREO_VALIDO, RFC_VALIDO,
  type Negocio, type Receptor, type TicketEncontrado, type Timbrado,
} from "../lib/portal";

/**
 * Portal de autofactura. Es la única pantalla del producto que usa gente que no es cliente nuestra
 * ni empleada del negocio: alguien que acaba de comer y escaneó un QR, probablemente de pie, con
 * una mano ocupada y el celular al sol.
 *
 * Todo lo de aquí está ordenado por esa persona:
 *   · el folio llega en la URL, así que lo normal es que NO tenga que escribir nada para empezar;
 *   · arriba va el restaurante, no VIM: tiene que ver que está facturando donde comió;
 *   · el formulario pide cinco datos, agrupados como vienen en su constancia;
 *   · los errores dicen qué hacer, junto al campo que hay que corregir;
 *   · la factura no se pierde: si cierra la pantalla, vuelve con su folio y su RFC.
 *
 * Cada campo de más es gente que abandona y acaba pidiendo la factura en el mostrador, que es
 * justo el trabajo que este portal existe para quitarle al negocio.
 */

// 16 px en los campos: con menos, iOS hace zoom en cada uno.
const input =
  "h-12 w-full rounded-lg border bg-surface px-3.5 text-[16px] text-ink outline-none transition-[border-color,box-shadow] duration-150 " +
  "focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_rgb(var(--accent)/0.3)] " +
  // Con error sigue rojo aunque tenga el foco: el azul del foco borraba justo la señal del error.
  "aria-[invalid=true]:focus-visible:border-danger aria-[invalid=true]:focus-visible:shadow-[0_0_0_3px_rgb(var(--danger)/0.25)]";
const inputOk = "border-line-strong";
const inputMal = "border-danger shadow-[0_0_0_3px_rgb(var(--danger)/0.15)]";
const label = "mb-1.5 block text-[15px] font-semibold text-ink";
// Las ayudas son lo que rescata a quien no sabe qué poner: legibles con sol (14 px, ink-2).
const ayuda = "mt-1.5 text-[14px] leading-snug text-ink-2";
const errorCampo = "mt-1.5 text-[14px] font-semibold leading-snug text-danger";

const mxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/** Los datos del receptor se pueden recordar en ESTE teléfono, si la persona lo pide. */
const CLAVE_RECORDAR = "vim.factura.receptor";

type Campo = keyof Receptor;
type Errores = Partial<Record<Campo, string>>;

function validar(r: Receptor, usosValidos: string[]): Errores {
  const e: Errores = {};
  if (!RFC_VALIDO.test(r.rfc)) {
    e.rfc = r.rfc.length === 0
      ? "Escribe tu RFC."
      : "Revisa tu RFC: persona física lleva 13 caracteres; empresa, 12.";
  }
  if (r.razonSocial.trim().length < 3) e.razonSocial = "Escribe tu nombre o razón social.";
  if (!/^\d{5}$/.test(r.codigoPostal)) e.codigoPostal = "El código postal son 5 dígitos.";
  if (!r.regimenFiscal) e.regimenFiscal = "Elige tu régimen fiscal.";
  else if (!usosValidos.includes(r.usoCfdi)) e.usoCfdi = "Elige el uso de la factura.";
  if (r.email.trim() && !CORREO_VALIDO.test(r.email.trim())) e.email = "Revisa el correo: le falta algo.";
  return e;
}

const ORDEN_CAMPOS: Campo[] = ["rfc", "razonSocial", "codigoPostal", "regimenFiscal", "usoCfdi", "email"];

export default function PortalFactura({
  params,
  searchParams,
}: {
  params: Promise<{ negocio: string }>;
  searchParams: Promise<{ folio?: string }>;
}) {
  const { negocio } = use(params);
  const { folio: folioUrl } = use(searchParams);

  const [marca, setMarca] = useState<Negocio | null>(null);
  const [folio, setFolio] = useState(folioUrl ?? "");
  const [encontrado, setEncontrado] = useState<TicketEncontrado | null>(null);
  const [yaFacturado, setYaFacturado] = useState<TicketEncontrado["ticket"] | null>(null);
  const [timbrado, setTimbrado] = useState<TimbradoConRfc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const [cargando, setCargando] = useState(false);
  const [lento, setLento] = useState(false);
  const [recordar, setRecordar] = useState(false);

  const [r, setR] = useState<Receptor>({
    rfc: "", razonSocial: "", regimenFiscal: "", codigoPostal: "", usoCfdi: "", email: "",
  });

  // El restaurante, desde el primer paso: logo y nombre arriba, y en la pestaña.
  useEffect(() => {
    buscarNegocio(negocio)
      .then(setMarca)
      .catch((e) => {
        if (e instanceof ErrorPortal && typeof e.datos.negocio === "string") {
          setMarca({ nombre: e.datos.negocio, logo: (e.datos.logo as string) ?? null });
        }
      });
  }, [negocio]);
  useEffect(() => {
    if (marca) document.title = `Factura tu ticket · ${marca.nombre}`;
  }, [marca]);

  // Datos recordados en este teléfono (solo si la persona lo pidió la vez anterior).
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_RECORDAR);
      if (!guardado) return;
      const d = JSON.parse(guardado) as Partial<Receptor>;
      setR((prev) => ({ ...prev, ...d }));
      setRecordar(true);
    } catch {
      /* sin almacenamiento o datos viejos: se escribe a mano */
    }
  }, []);

  const buscar = useCallback(async (f: string) => {
    if (!f.trim()) {
      setError("Escribe el folio de tu ticket.");
      return;
    }
    setCargando(true);
    setError(null);
    setYaFacturado(null);
    try {
      const t = await buscarTicket(negocio, f.trim());
      setEncontrado(t);
      setMarca((m) => m ?? { nombre: t.negocio, logo: t.logo });
    } catch (e) {
      setEncontrado(null);
      if (e instanceof ErrorPortal && e.estado === "YA_FACTURADO") {
        setYaFacturado((e.datos.ticket as TicketEncontrado["ticket"]) ?? null);
      } else {
        setError(e instanceof ErrorPortal ? e.message : "No se pudo buscar el ticket.");
      }
    } finally {
      setCargando(false);
    }
  }, [negocio]);

  // Con el folio en la URL —el caso normal, viene del QR— se busca solo. Obligar a pulsar un botón
  // para algo que ya sabemos sería pedirle trabajo a quien no tiene por qué hacerlo.
  useEffect(() => {
    if (folioUrl) buscar(folioUrl);
  }, [folioUrl, buscar]);

  // Timbrar tarda (PAC + SAT + descarga + correo): a los 3 s se explica, para que nadie se vaya.
  useEffect(() => {
    if (!cargando) {
      setLento(false);
      return;
    }
    const t = setTimeout(() => setLento(true), 3000);
    return () => clearTimeout(t);
  }, [cargando]);

  const refs = useRef<Partial<Record<Campo, HTMLInputElement | HTMLSelectElement | null>>>({});
  const errorGeneralRef = useRef<HTMLParagraphElement>(null);

  function enfocarPrimerError(es: Errores) {
    const campo = ORDEN_CAMPOS.find((c) => es[c]);
    const el = campo ? refs.current[campo] : errorGeneralRef.current;
    el?.scrollIntoView({ block: "center" });
    if (campo) el?.focus({ preventScroll: true });
  }

  async function emitir() {
    const usosValidos = encontrado?.usosPorRegimen[r.regimenFiscal] ?? [];
    const es = validar(r, usosValidos);
    setErrores(es);
    setError(null);
    if (Object.keys(es).length > 0) {
      enfocarPrimerError(es);
      return;
    }
    setCargando(true);
    try {
      const t = await timbrar(negocio, folio.trim(), { ...r, email: r.email.trim() });
      try {
        if (recordar) window.localStorage.setItem(CLAVE_RECORDAR, JSON.stringify({ ...r, email: r.email.trim() }));
        else window.localStorage.removeItem(CLAVE_RECORDAR);
      } catch {
        /* sin almacenamiento: no pasa nada */
      }
      setTimbrado(t);
      window.scrollTo({ top: 0 });
    } catch (e) {
      const campo = e instanceof ErrorPortal ? (e.campo as Campo | null) : null;
      const mensaje = e instanceof ErrorPortal ? e.message : "No se pudo emitir la factura.";
      if (campo && ORDEN_CAMPOS.includes(campo)) {
        const es2 = { [campo]: mensaje } as Errores;
        setErrores(es2);
        enfocarPrimerError(es2);
      } else {
        setError(mensaje);
        setTimeout(() => enfocarPrimerError({}), 0);
      }
    } finally {
      setCargando(false);
    }
  }

  const cambiar = (campo: Campo, valor: string) => {
    setR((prev) => ({ ...prev, [campo]: valor }));
    if (errores[campo]) setErrores((prev) => ({ ...prev, [campo]: undefined }));
  };

  // ── Paso 3: la factura ──────────────────────────────────────────────────────────────────────
  if (timbrado) {
    return (
      <Marco marca={marca} paso={3}>
        <FacturaLista
          timbrado={timbrado}
          onEnviar={(email) => enviarPorCorreo(negocio, folio.trim(), (r.rfc || timbrado.rfcRecuperado) ?? "", email)}
        />
      </Marco>
    );
  }

  // ── Ya facturado: recuperar con el RFC ──────────────────────────────────────────────────────
  if (yaFacturado) {
    return (
      <Marco marca={marca} paso={1}>
        <Recuperar
          ticket={yaFacturado}
          rfcInicial={r.rfc}
          onRecuperar={async (rfc) => {
            const t = await recuperar(negocio, folio.trim(), rfc);
            setR((prev) => ({ ...prev, rfc }));
            setTimbrado({ ...t, rfcRecuperado: rfc });
          }}
          onOtroFolio={() => { setYaFacturado(null); setFolio(""); }}
        />
      </Marco>
    );
  }

  // ── Paso 1: el ticket ───────────────────────────────────────────────────────────────────────
  if (!encontrado) {
    return (
      <Marco marca={marca} paso={1}>
        <form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); buscar(folio); }} noValidate>
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">Factura tu consumo</h1>
          <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
            Escribe el folio que viene en tu ticket.
          </p>

          <div className="mt-6">
            <label className={label} htmlFor="folio">Folio del ticket</label>
            <input
              id="folio"
              className={`${input} ${error ? inputMal : inputOk} font-display tracking-wide`}
              value={folio}
              // Con el folio en la URL la búsqueda ya corre sola: abrir el teclado estorbaría.
              autoFocus={!folioUrl}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "folio-error" : "folio-ayuda"}
              onChange={(e) => { setFolio(e.target.value.toUpperCase()); setError(null); }}
              placeholder="Como aparece en tu ticket"
            />
            {error ? (
              <p id="folio-error" className={errorCampo} role="alert">{error}</p>
            ) : (
              <p id="folio-ayuda" className={ayuda}>Va completo, con letras y guiones.</p>
            )}
          </div>

          <BarraAccion>
            <Button type="submit" size="lg" disabled={cargando} className="h-14 w-full text-[17px]">
              {cargando ? <><Girando /> Buscando…</> : "Continuar"}
            </Button>
          </BarraAccion>
        </form>
      </Marco>
    );
  }

  // ── Paso 2: los datos fiscales ──────────────────────────────────────────────────────────────
  const usosValidos = encontrado.usosPorRegimen[r.regimenFiscal] ?? [];
  const regimen = encontrado.regimenes.find((x) => x.clave === r.regimenFiscal);
  const propsCampo = (campo: Campo) => ({
    ref: (el: HTMLInputElement | HTMLSelectElement | null) => { refs.current[campo] = el; },
    "aria-invalid": errores[campo] ? true : undefined,
    "aria-describedby": errores[campo] ? `${campo}-error` : `${campo}-ayuda`,
  });
  const MensajeCampo = ({ campo, children }: { campo: Campo; children?: React.ReactNode }) =>
    errores[campo] ? (
      <p id={`${campo}-error`} className={errorCampo}>
        {errores[campo]}
        {campo === "codigoPostal" && <span className="block font-normal">Está en la primera hoja de tu constancia, en «Datos de ubicación».</span>}
      </p>
    ) : children ? (
      <p id={`${campo}-ayuda`} className={ayuda}>{children}</p>
    ) : null;

  return (
    <Marco marca={marca} paso={2}>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <div className="min-w-0">
          <div className="font-display text-[16px] font-semibold tabular-nums">Folio {encontrado.ticket.folio}</div>
          <div className="text-[14px] text-ink-2">{fechaLegible(encontrado.ticket.fecha)}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-[20px] font-semibold tabular-nums">{mxn(encontrado.ticket.total)}</div>
          <button
            type="button"
            onClick={() => { setEncontrado(null); setErrores({}); setError(null); }}
            className="text-[14px] font-semibold text-accent underline-offset-2 hover:underline"
          >
            ¿No es tu ticket?
          </button>
        </div>
      </div>

      <h1 className="mt-7 font-display text-[24px] font-semibold tracking-tight">Tus datos fiscales</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
        Como aparecen en tu <b>Constancia de Situación Fiscal</b>. Si no la tienes a mano, la
        descargas en{" "}
        <a href="https://www.sat.gob.mx" target="_blank" rel="noreferrer" className="font-semibold text-accent underline underline-offset-2">
          sat.gob.mx
        </a>
        .
      </p>

      <form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); emitir(); }} noValidate>
        <Grupo titulo="Quién eres">
          <div>
            <label className={label} htmlFor="rfc">RFC</label>
            <input
              id="rfc" className={`${input} ${errores.rfc ? inputMal : inputOk} font-display tracking-wide`} value={r.rfc} maxLength={13}
              autoCapitalize="characters" autoComplete="off" spellCheck={false} enterKeyHint="next"
              {...propsCampo("rfc")}
              onChange={(e) => cambiar("rfc", e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, ""))}
            />
            <MensajeCampo campo="rfc">Persona física: 13 caracteres. Empresa: 12.</MensajeCampo>
          </div>
          <div>
            <label className={label} htmlFor="razonSocial">Nombre o razón social</label>
            <input
              id="razonSocial" className={`${input} ${errores.razonSocial ? inputMal : inputOk}`} value={r.razonSocial}
              autoComplete="name" autoCapitalize="characters" enterKeyHint="next"
              {...propsCampo("razonSocial")}
              onChange={(e) => cambiar("razonSocial", e.target.value.toUpperCase())}
            />
            <MensajeCampo campo="razonSocial">En mayúsculas y <b>sin</b> S.A. de C.V. ni S. de R.L., con acentos y Ñ.</MensajeCampo>
          </div>
        </Grupo>

        <Grupo titulo="Tu constancia">
          <div>
            <label className={label} htmlFor="codigoPostal">Código postal</label>
            <input
              id="codigoPostal" className={`${input} ${errores.codigoPostal ? inputMal : inputOk} tabular-nums`} value={r.codigoPostal}
              inputMode="numeric" maxLength={5} autoComplete="postal-code" enterKeyHint="next"
              {...propsCampo("codigoPostal")}
              onChange={(e) => cambiar("codigoPostal", e.target.value.replace(/\D/g, ""))}
            />
            <MensajeCampo campo="codigoPostal">El de tu constancia, no el de tu casa si son distintos.</MensajeCampo>
          </div>

          <div>
            <label className={label} htmlFor="regimenFiscal">Régimen fiscal</label>
            <select
              id="regimenFiscal" className={`${input} ${errores.regimenFiscal ? inputMal : inputOk}`} value={r.regimenFiscal}
              {...propsCampo("regimenFiscal")}
              onChange={(e) => {
                const reg = e.target.value;
                const validos = encontrado.usosPorRegimen[reg] ?? [];
                // Si el uso elegido no aplica al régimen nuevo, se cambia solo al recomendado. El
                // PAC rechaza esa combinación y su mensaje no dice cuál de los dos cambiar.
                setR((prev) => ({ ...prev, regimenFiscal: reg, usoCfdi: validos.includes(prev.usoCfdi) ? prev.usoCfdi : (validos[0] ?? "") }));
                setErrores((prev) => ({ ...prev, regimenFiscal: undefined, usoCfdi: undefined }));
              }}
            >
              <option value="">Elige tu régimen…</option>
              {encontrado.regimenes.map((x) => <option key={x.clave} value={x.clave}>{x.nombre} ({x.clave})</option>)}
            </select>
            <MensajeCampo campo="regimenFiscal">Viene en tu constancia, en «Regímenes».</MensajeCampo>
          </div>

          {r.regimenFiscal && (
            <div className="animate-vim-fade motion-reduce:animate-none">
              <label className={label} htmlFor="usoCfdi">Uso de la factura</label>
              <select
                id="usoCfdi" className={`${input} ${errores.usoCfdi ? inputMal : inputOk}`} value={r.usoCfdi}
                {...propsCampo("usoCfdi")}
                onChange={(e) => cambiar("usoCfdi", e.target.value)}
              >
                {usosValidos.map((u) => <option key={u} value={u}>{encontrado.usos[u] ?? u} ({u})</option>)}
              </select>
              <MensajeCampo campo="usoCfdi">
                {usosValidos[0] === "G03"
                  ? "«Gastos en general» es lo normal para un consumo en restaurante."
                  : `Con «${regimen?.nombre ?? "tu régimen"}» el SAT solo admite «Sin efectos fiscales».`}
              </MensajeCampo>
            </div>
          )}
        </Grupo>

        <Grupo titulo="Cómo la recibes">
          <div>
            <label className={label} htmlFor="email">Correo <span className="font-normal text-ink-2">· opcional</span></label>
            <input
              id="email" className={`${input} ${errores.email ? inputMal : inputOk}`} value={r.email} type="email"
              inputMode="email" autoComplete="email" enterKeyHint="done"
              {...propsCampo("email")}
              onChange={(e) => cambiar("email", e.target.value)}
            />
            <MensajeCampo campo="email">Te la mandamos con el XML y el PDF. Igual la descargas en la siguiente pantalla.</MensajeCampo>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
            <input
              type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)}
              className="h-5 w-5 flex-shrink-0 accent-[rgb(var(--accent))]"
            />
            Recordar mis datos en este teléfono
          </label>
        </Grupo>

        {error && (
          <p
            ref={errorGeneralRef}
            tabIndex={-1}
            className="mt-6 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[15px] font-semibold leading-relaxed text-danger outline-none"
            role="alert"
          >
            {error}
          </p>
        )}

        <BarraAccion>
          {/* Siempre activo: si falta algo, al tocarlo se dice qué y se lleva al campo. Antes se
              quedaba gris sin explicar por qué. */}
          <Button type="submit" size="lg" disabled={cargando} className="h-14 w-full text-[17px]">
            {cargando ? <><Girando /> Emitiendo tu factura…</> : "Emitir factura"}
          </Button>
          {lento && (
            <p className="mt-2 text-center text-[14px] leading-snug text-ink-2" role="status">
              Conectando con el SAT, puede tardar unos segundos. No cierres esta pantalla.
            </p>
          )}
        </BarraAccion>
      </form>
    </Marco>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────────────────────

type TimbradoConRfc = Timbrado & { rfcRecuperado?: string };

function FacturaLista({ timbrado, onEnviar }: { timbrado: TimbradoConRfc; onEnviar: (email: string) => Promise<void> }) {
  const [copiado, setCopiado] = useState(false);
  const [email, setEmail] = useState("");
  const [envio, setEnvio] = useState<{ estado: "idle" | "enviando" | "ok" | "error"; texto?: string }>({ estado: "idle" });
  const correoFallo = timbrado.correo != null && !timbrado.correoEnviado;

  async function enviar() {
    if (!CORREO_VALIDO.test(email.trim())) {
      setEnvio({ estado: "error", texto: "Revisa el correo: le falta algo." });
      return;
    }
    setEnvio({ estado: "enviando" });
    try {
      await onEnviar(email.trim());
      setEnvio({ estado: "ok", texto: `Listo. La enviamos a ${email.trim()}.` });
    } catch (e) {
      setEnvio({ estado: "error", texto: e instanceof ErrorPortal ? e.message : "No pudimos enviar el correo." });
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center">
        {/* Una sola vez, al llegar: confirma un momento de nervios. Nunca desde scale(0). */}
        <div className="mx-auto flex h-16 w-16 animate-vim-pop items-center justify-center rounded-full bg-success-soft motion-reduce:animate-none">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="mt-5 font-display text-[26px] font-semibold tracking-tight">Tu factura está lista</h1>
        <p className="mt-1.5 text-[16px] text-ink-2">
          {timbrado.negocio} · <span className="tabular-nums">{mxn(timbrado.total)}</span>
        </p>
      </div>

      {timbrado.correoEnviado && (
        <p className="mt-5 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-[15px] leading-relaxed text-ink" role="status">
          También te la mandamos a <b>{timbrado.correo}</b>. Si no llega en unos minutos, revisa tu
          carpeta de correo no deseado.
        </p>
      )}
      {correoFallo && (
        <p className="mt-5 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-[15px] leading-relaxed text-ink" role="alert">
          <b>No pudimos enviarla a {timbrado.correo}.</b> Descárgala ahora, o prueba otra vez abajo.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
        {timbrado.pdf && (
          <Button size="lg" className="h-14 text-[17px]" onClick={() => descargar(timbrado.pdf!, `factura-${timbrado.uuid}.pdf`, "application/pdf")}>
            Descargar PDF
          </Button>
        )}
        {timbrado.xml && (
          <Button variant="ghost" size="lg" className="h-14 text-[17px] text-ink" onClick={() => descargar(timbrado.xml!, `factura-${timbrado.uuid}.xml`, "application/xml")}>
            Descargar XML
          </Button>
        )}
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
        Guarda los dos. El <b>XML</b> es la factura ante el SAT; el PDF es su versión para imprimir.
      </p>

      <div className="mt-6 rounded-lg border border-line bg-surface px-4 py-3">
        <div className="text-[14px] font-semibold text-ink-2">Folio fiscal</div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 break-all font-display text-[15px] tabular-nums text-ink">{timbrado.uuid}</span>
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(timbrado.uuid).then(() => setCopiado(true)); }}
            className="h-11 flex-shrink-0 rounded-md border border-line-strong px-3 text-[14px] font-semibold text-ink transition-transform duration-150 ease-vim active:scale-[.97]"
          >
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>

      <form className="mt-6" onSubmit={(e) => { e.preventDefault(); void enviar(); }} noValidate>
        <label className={label} htmlFor="reenviar">{timbrado.correoEnviado ? "Mandarla a otro correo" : "Enviármela por correo"}</label>
        <div className="flex gap-2">
          <input
            id="reenviar" type="email" inputMode="email" autoComplete="email" enterKeyHint="send"
            className={`${input} ${envio.estado === "error" ? inputMal : inputOk}`}
            value={email} onChange={(e) => { setEmail(e.target.value); if (envio.estado !== "enviando") setEnvio({ estado: "idle" }); }}
          />
          <Button type="submit" variant="ghost" size="lg" disabled={envio.estado === "enviando"} className="h-12 flex-shrink-0 px-5 text-[16px] text-ink">
            {envio.estado === "enviando" ? <Girando /> : "Enviar"}
          </Button>
        </div>
        {envio.texto && (
          <p className={envio.estado === "error" ? errorCampo : "mt-1.5 text-[14px] font-semibold text-success"} role="status">{envio.texto}</p>
        )}
      </form>

      <p className="mt-6 text-[14px] leading-relaxed text-ink-2">
        Si cierras esta página sin descargarla, vuelve con el QR de tu ticket y tu RFC: la vuelves a
        bajar sin pedirla otra vez.
      </p>
    </div>
  );
}

function Recuperar({
  ticket,
  rfcInicial,
  onRecuperar,
  onOtroFolio,
}: {
  ticket: TicketEncontrado["ticket"] | null;
  rfcInicial: string;
  onRecuperar: (rfc: string) => Promise<void>;
  onOtroFolio: () => void;
}) {
  const [rfc, setRfc] = useState(rfcInicial);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    if (!RFC_VALIDO.test(rfc)) {
      setError("Revisa tu RFC: persona física lleva 13 caracteres; empresa, 12.");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      await onRecuperar(rfc);
    } catch (e) {
      setError(e instanceof ErrorPortal ? e.message : "No pudimos recuperar la factura.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void enviar(); }} noValidate>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">Este ticket ya tiene factura</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
        {ticket ? <>Folio {ticket.folio} · {mxn(ticket.total)}. </> : null}
        Si la pediste tú, escribe tu RFC para descargarla otra vez.
      </p>
      <div className="mt-6">
        <label className={label} htmlFor="rfc-recuperar">Tu RFC</label>
        <input
          id="rfc-recuperar" className={`${input} ${error ? inputMal : inputOk} font-display tracking-wide`} value={rfc} maxLength={13}
          autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false} enterKeyHint="go"
          aria-invalid={error ? true : undefined} aria-describedby={error ? "rfc-recuperar-error" : undefined}
          onChange={(e) => { setRfc(e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, "")); setError(null); }}
        />
        {error ? (
          <p id="rfc-recuperar-error" className={errorCampo} role="alert">{error}</p>
        ) : (
          <p className={ayuda}>El mismo con que la pediste.</p>
        )}
      </div>
      <button type="button" onClick={onOtroFolio} className="mt-4 self-start text-[15px] font-semibold text-accent underline-offset-2 hover:underline">
        Es otro ticket
      </button>
      <BarraAccion>
        <Button type="submit" size="lg" disabled={cargando} className="h-14 w-full text-[17px]">
          {cargando ? <><Girando /> Buscando…</> : "Descargar mi factura"}
        </Button>
      </BarraAccion>
    </form>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-7 flex flex-col gap-5">
      <legend className="mb-4 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-2">{titulo}</legend>
      {children}
    </fieldset>
  );
}

/**
 * El botón principal, al alcance del pulgar: pegado abajo en el celular (con el margen del gesto
 * de inicio del iPhone), en su lugar normal en pantallas grandes.
 */
function BarraAccion({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto border-t border-line bg-bg/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      {children}
    </div>
  );
}

function Girando() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const PASOS = ["Tu ticket", "Tus datos", "Tu factura"] as const;

function Marco({ marca, paso, children }: { marca: Negocio | null; paso: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[460px] flex-col px-5 pt-6 sm:justify-center sm:py-10">
      {/* El restaurante manda arriba: quien escaneó el QR tiene que reconocer dónde comió. */}
      <header className="flex items-center gap-3">
        {marca?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={marca.logo} alt="" className="h-11 w-11 flex-shrink-0 rounded-lg border border-line bg-surface object-contain" />
        ) : (
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-ink font-display text-[18px] font-bold text-white" aria-hidden="true">
            {(marca?.nombre ?? " ").trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate font-display text-[18px] font-semibold leading-tight">{marca?.nombre ?? " "}</div>
          <div className="text-[14px] text-ink-2">Facturación en línea</div>
        </div>
      </header>

      <ol className="mt-5 grid grid-cols-3 gap-1.5" aria-label={`Paso ${paso} de 3: ${PASOS[paso - 1]}`}>
        {PASOS.map((p, i) => (
          <li key={p} aria-current={i + 1 === paso ? "step" : undefined}>
            <div className={["h-1.5 rounded-full transition-colors duration-200", i + 1 <= paso ? "bg-accent" : "bg-line-strong"].join(" ")} />
            <div className={["mt-1.5 text-[13px] font-semibold", i + 1 === paso ? "text-ink" : "text-ink-2"].join(" ")}>{p}</div>
          </li>
        ))}
      </ol>

      <div key={paso} className="mt-7 flex flex-1 animate-vim-fade flex-col motion-reduce:animate-none sm:flex-none">{children}</div>

      <footer className="mt-10 flex items-center justify-center gap-2 pb-6 text-[13px] text-ink-2">
        <LogoVim className="h-4 w-4" />
        Facturación por VIM POS
      </footer>
    </main>
  );
}
