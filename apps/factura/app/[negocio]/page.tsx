"use client";
import { useCallback, useEffect, useState } from "react";
import { use } from "react";
import { LogoVim } from "@vim/ui/styles";
import {
  buscarTicket, descargar, timbrar, ErrorPortal, REGIMENES, USOS,
  type Receptor, type TicketEncontrado, type Timbrado,
} from "../lib/portal";

/**
 * Portal de autofactura. Es la única pantalla del producto que usa gente que no es cliente nuestra
 * ni empleada del negocio: alguien que acaba de comer y escaneó un QR, probablemente de pie y con
 * una mano ocupada.
 *
 * Todo lo de aquí está ordenado por esa persona:
 *   · el folio llega en la URL, así que lo normal es que NO tenga que escribir nada para empezar;
 *   · el formulario pide cinco datos y ni uno más;
 *   · los errores dicen qué hacer, no qué falló. El del código postal —el más frecuente de todos,
 *     porque casi nadie se sabe el de su constancia— manda a buscarlo donde está.
 *
 * Cada campo de más es gente que abandona y acaba pidiendo la factura en el mostrador, que es
 * justo el trabajo que este portal existe para quitarle al negocio.
 */

const input =
  "h-12 w-full rounded-lg border border-line-strong px-3.5 text-[15px] outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const mxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export default function PortalFactura({
  params,
  searchParams,
}: {
  params: Promise<{ negocio: string }>;
  searchParams: Promise<{ folio?: string }>;
}) {
  const { negocio } = use(params);
  const { folio: folioUrl } = use(searchParams);

  const [folio, setFolio] = useState(folioUrl ?? "");
  const [encontrado, setEncontrado] = useState<TicketEncontrado | null>(null);
  const [timbrado, setTimbrado] = useState<Timbrado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campoMal, setCampoMal] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const [r, setR] = useState<Receptor>({
    rfc: "", razonSocial: "", regimenFiscal: "", codigoPostal: "", usoCfdi: "G03", email: "",
  });

  const buscar = useCallback(async (f: string) => {
    if (!f.trim()) return;
    setCargando(true);
    setError(null);
    try {
      setEncontrado(await buscarTicket(negocio, f.trim()));
    } catch (e) {
      setEncontrado(null);
      setError(e instanceof ErrorPortal ? e.message : "No se pudo buscar el ticket.");
    } finally {
      setCargando(false);
    }
  }, [negocio]);

  // Con el folio en la URL —el caso normal, viene del QR— se busca solo. Obligar a pulsar un botón
  // para algo que ya sabemos sería pedirle trabajo a quien no tiene por qué hacerlo.
  useEffect(() => {
    if (folioUrl) buscar(folioUrl);
  }, [folioUrl, buscar]);

  async function emitir() {
    setCargando(true);
    setError(null);
    setCampoMal(null);
    try {
      setTimbrado(await timbrar(negocio, folio.trim(), r));
    } catch (e) {
      setError(e instanceof ErrorPortal ? e.message : "No se pudo emitir la factura.");
      setCampoMal(e instanceof ErrorPortal ? e.campo : null);
    } finally {
      setCargando(false);
    }
  }

  const usosValidos = encontrado?.usosPorRegimen[r.regimenFiscal] ?? [];
  const completo =
    r.rfc.length >= 12 && r.razonSocial.trim().length >= 3 &&
    r.regimenFiscal !== "" && /^\d{5}$/.test(r.codigoPostal) && r.usoCfdi !== "";

  // ── Timbrada ────────────────────────────────────────────────────────────────
  if (timbrado) {
    return (
      <Marco>
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF3EE]">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-success" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-5 font-display text-[24px] font-semibold tracking-tight">Tu factura está lista</h1>
          <p className="mt-2 text-[14px] text-ink-3">
            {timbrado.negocio} · {mxn(timbrado.total)}
          </p>
          <p className="mt-1 break-all text-[11.5px] text-ink-3">Folio fiscal {timbrado.uuid}</p>

          {timbrado.correoEnviado && (
            <p className="mt-4 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed">
              También te la mandamos a <b>{timbrado.correo}</b>. Si no llega en unos minutos, revisa
              tu carpeta de correo no deseado.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2.5">
            {timbrado.pdf && (
              <button
                onClick={() => descargar(timbrado.pdf!, `factura-${timbrado.uuid}.pdf`, "application/pdf")}
                className="h-12 rounded-lg bg-accent text-[15px] font-semibold text-white transition hover:bg-accent-hover"
              >
                Descargar PDF
              </button>
            )}
            {timbrado.xml && (
              <button
                onClick={() => descargar(timbrado.xml!, `factura-${timbrado.uuid}.xml`, "application/xml")}
                className="h-12 rounded-lg border border-line-strong text-[15px] font-semibold transition hover:bg-hover"
              >
                Descargar XML
              </button>
            )}
          </div>
          <p className="mt-5 text-[12.5px] leading-relaxed text-ink-3">
            Guarda los dos archivos. El <b>XML</b> es la factura ante el SAT; el PDF es solo su
            representación impresa.
          </p>
        </div>
      </Marco>
    );
  }

  // ── Buscar el ticket ────────────────────────────────────────────────────────
  if (!encontrado) {
    return (
      <Marco>
        <h1 className="font-display text-[24px] font-semibold leading-tight tracking-tight">
          Factura tu consumo
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-3">
          Escribe el folio que aparece en tu ticket.
        </p>

        <form
          className="mt-6"
          onSubmit={(e) => { e.preventDefault(); buscar(folio); }}
        >
          <label className={label} htmlFor="folio">Folio del ticket</label>
          <input
            id="folio"
            className={input}
            value={folio}
            autoFocus
            autoCapitalize="characters"
            onChange={(e) => setFolio(e.target.value.toUpperCase())}
            placeholder="A-0001"
          />
          {error && <p className="mt-3 text-[13.5px] font-medium text-danger" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={cargando || !folio.trim()}
            className="mt-4 h-12 w-full rounded-lg bg-accent text-[15px] font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
          >
            {cargando ? "Buscando…" : "Continuar"}
          </button>
        </form>
      </Marco>
    );
  }

  // ── Datos fiscales ──────────────────────────────────────────────────────────
  return (
    <Marco>
      <div className="rounded-lg border border-line bg-surface px-4 py-3">
        <div className="text-[13px] font-semibold">{encontrado.negocio}</div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="text-[12.5px] text-ink-3">
            Folio {encontrado.ticket.folio} · {encontrado.ticket.fecha}
          </span>
          <span className="font-display text-[18px] font-semibold tabular-nums">
            {mxn(encontrado.ticket.total)}
          </span>
        </div>
      </div>

      <h1 className="mt-6 font-display text-[20px] font-semibold tracking-tight">Tus datos fiscales</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        Como aparecen en tu <b>Constancia de Situación Fiscal</b>. Si no la tienes a mano, la
        descargas del portal del SAT.
      </p>

      <form className="mt-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); emitir(); }}>
        <div>
          <label className={label} htmlFor="rfc">RFC</label>
          <input
            id="rfc" className={input} value={r.rfc} maxLength={13} autoCapitalize="characters"
            onChange={(e) => setR({ ...r, rfc: e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, "") })}
          />
        </div>

        <div>
          <label className={label} htmlFor="razon">Nombre o razón social</label>
          <input
            id="razon" className={input} value={r.razonSocial}
            onChange={(e) => setR({ ...r, razonSocial: e.target.value.toUpperCase() })}
          />
          <p className="mt-1.5 text-[11.5px] text-ink-3">
            En mayúsculas y <b>sin</b> S.A. de C.V. ni S. de R.L.
          </p>
        </div>

        <div>
          <label className={label} htmlFor="cp">Código postal</label>
          <input
            id="cp" className={input} value={r.codigoPostal} inputMode="numeric" maxLength={5}
            onChange={(e) => setR({ ...r, codigoPostal: e.target.value.replace(/\D/g, "") })}
          />
          <p className="mt-1.5 text-[11.5px] text-ink-3">
            El de tu constancia, no el de tu casa si son distintos.
          </p>
        </div>

        <div>
          <label className={label} htmlFor="regimen">Régimen fiscal</label>
          <select
            id="regimen" className={input} value={r.regimenFiscal}
            onChange={(e) => {
              const reg = e.target.value;
              const validos = encontrado.usosPorRegimen[reg] ?? [];
              // Si el uso elegido no aplica al régimen nuevo, se cambia solo. El PAC rechaza esa
              // combinación y su mensaje no dice cuál de los dos cambiar.
              setR({ ...r, regimenFiscal: reg, usoCfdi: validos.includes(r.usoCfdi) ? r.usoCfdi : (validos[0] ?? "") });
            }}
          >
            <option value="">Elige tu régimen…</option>
            {REGIMENES.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
          </select>
        </div>

        {r.regimenFiscal && (
          <div>
            <label className={label} htmlFor="uso">Uso de la factura</label>
            <select id="uso" className={input} value={r.usoCfdi} onChange={(e) => setR({ ...r, usoCfdi: e.target.value })}>
              {usosValidos.map((u) => <option key={u} value={u}>{USOS[u] ?? u}</option>)}
            </select>
            <p className="mt-1.5 text-[11.5px] text-ink-3">
              Solo se muestran los usos que el SAT admite para tu régimen.
            </p>
          </div>
        )}

        <div>
          <label className={label} htmlFor="email">Correo <span className="text-ink-3">· opcional</span></label>
          <input
            id="email" className={input} value={r.email} type="email" inputMode="email"
            onChange={(e) => setR({ ...r, email: e.target.value })}
          />
          <p className="mt-1.5 text-[11.5px] text-ink-3">
            Si lo dejas, te mandamos la factura ahí con el XML y el PDF. Si no, la descargas en la
            siguiente pantalla.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-[#F0C7C2] bg-[#FBECEA] px-3.5 py-3 text-[13.5px] font-medium leading-relaxed text-danger" role="alert">
            {error}
            {campoMal === "codigoPostal" && (
              <span className="mt-1 block font-normal">
                Está en la primera hoja de tu constancia, en «Datos de ubicación».
              </span>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando || !completo}
          className="h-12 rounded-lg bg-accent text-[15px] font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          {cargando ? "Emitiendo…" : "Emitir factura"}
        </button>
      </form>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col justify-center px-5 py-10">
      <div>{children}</div>
      <footer className="mt-10 flex items-center justify-center gap-2 text-[11.5px] text-ink-3">
        <LogoVim className="h-4 w-4" />
        Facturación por VIM POS
      </footer>
    </main>
  );
}
