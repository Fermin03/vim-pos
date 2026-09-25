"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { activarComboUpsell, leerComboUpsellActivo, listarCombos, type ComboResumen } from "../../../lib/combos";
import { precioMxn } from "../../../lib/catalogo";
import { mensajeError } from "../../../lib/errores";

// Mismo estilo que BADGE en catalogo/productos/page.tsx: un combo también puede quedar AGOTADO
// (el formulario de producto lo permite), y sin esta entrada el fallback lo mostraba como "Pausado".
const ESTADO: Record<string, { txt: string; cls: string; dot: string }> = {
  ACTIVO: { txt: "Activo", cls: "bg-success-soft text-success", dot: "bg-success" },
  PAUSADO: { txt: "Pausado", cls: "bg-hover text-ink-3", dot: "bg-ink-3" },
  AGOTADO: { txt: "Agotado", cls: "bg-[#FBF1EF] text-danger", dot: "bg-danger" },
};

function Pasos({ n }: { n: number }) {
  return n === 0 ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-[11px] py-1 text-[12.5px] font-semibold text-warning">
      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      Sin pasos: la caja no lo puede vender
    </span>
  ) : (
    <span className="text-[14px] text-ink-2">
      <span className="font-display font-semibold tabular-nums">{n}</span> {n === 1 ? "paso" : "pasos"}
    </span>
  );
}

export default function CombosPage() {
  const router = useRouter();
  const [combos, setCombos] = useState<ComboResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [ofrecer, setOfrecer] = useState<boolean | null>(null);
  const [cambiando, setCambiando] = useState(false);

  async function recargar() {
    setError(null);
    try {
      setCombos(await listarCombos());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los combos"));
    }
  }
  useEffect(() => {
    recargar();
    leerComboUpsellActivo().then(setOfrecer).catch(() => setOfrecer(true));
  }, []);

  /** Enciende o apaga "¿Lo hacemos combo?" en caja (migración 0111, docs/diseno/pos.md). */
  async function cambiarOfrecer(activo: boolean) {
    setCambiando(true);
    setError(null);
    try {
      await activarComboUpsell(activo);
      setOfrecer(activo);
      setOkMsg(
        activo
          ? "La caja va a ofrecer el combo en unos minutos, o al momento si el cajero toca “Actualizar menú”."
          : "La caja va a dejar de ofrecer el combo en unos minutos, o al momento si el cajero toca “Actualizar menú”.",
      );
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar si la caja ofrece el combo"));
    } finally {
      setCambiando(false);
    }
  }

  const sinNada = combos !== null && combos.length === 0;

  return (
    <>
      <PageHeader
        titulo="Combos"
        subtitulo="Un producto por pasos: la caja va preguntando qué elige el cliente en cada uno."
        migas={[{ label: "Catálogo" }, { label: "Combos" }]}
        right={
          <Button onClick={() => router.push("/catalogo/combos/nuevo")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[17px] w-[17px]">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo combo
          </Button>
        }
      />
      <CatalogoTabs />
      <PageBody>
        {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}
        {error && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4">
          <div className="grid gap-1">
            <div className="flex items-center gap-3">
              <button
                type="button" role="switch" aria-checked={!!ofrecer} aria-labelledby="ofrecer-combo" disabled={ofrecer === null || cambiando}
                onClick={() => cambiarOfrecer(!ofrecer)}
                className={`relative h-6 w-11 rounded-full transition-colors ${ofrecer ? "bg-accent" : "bg-line-strong"} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${ofrecer ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <span id="ofrecer-combo" className="text-sm font-semibold">Ofrecer el combo en la caja {ofrecer === null ? "" : ofrecer ? "· Encendido" : "· Apagado"}</span>
            </div>
            <p className="text-[12.5px] text-ink-2">
              Cuando el cajero agrega suelto un producto que es principal de un combo (por
              ejemplo, una hamburguesa), la caja le pregunta si lo hace combo y le muestra cuánto
              cuesta de más. Apagado, el combo se sigue armando a mano desde su propia pantalla.
            </p>
          </div>
        </div>

        {combos === null && <p className="text-sm text-ink-2">Cargando…</p>}

        {/* En el celular, tarjetas; en lg, tabla. Antes era una fila con onClick: solo se abría
            con el mouse, ni con el teclado ni con un lector de pantalla. Ahora el nombre es un
            enlace y toda la fila lo sigue. */}
        {combos !== null && combos.length > 0 && (
          <ul className="flex flex-col gap-2.5 lg:hidden">
            {combos.map((c) => {
              const e = ESTADO[c.estado] ?? ESTADO.PAUSADO!;
              return (
                <li key={c.id}>
                  <Link href={`/catalogo/combos/${c.id}`} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 transition-[border-color,transform] duration-150 ease-vim hover:border-ink active:scale-[.99]">
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-[15px] font-semibold">{c.nombre}</span>
                      <span className="flex-shrink-0 font-display text-[15px] font-semibold tabular-nums">{precioMxn(c.precio_base_mxn)}</span>
                    </span>
                    <span className="text-[13px] text-ink-2">{c.categoriaNombre}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Pasos n={c.nSlots} />
                      <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[12.5px] font-semibold", e.cls].join(" ")}>
                        <span className={["h-1.5 w-1.5 rounded-full", e.dot].join(" ")} />
                        {e.txt}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {combos !== null && (
          <div className={`overflow-hidden rounded-lg border border-line bg-surface ${sinNada ? "" : "hidden lg:block"}`}>
            <table className={`w-full border-collapse ${sinNada ? "hidden" : ""}`}>
              <thead>
                <tr>
                  <th className="border-b border-line bg-sel px-4 py-[13px] text-left text-[12px] font-semibold uppercase tracking-wide text-ink-2">Combo</th>
                  <th className="w-[180px] border-b border-line bg-sel px-4 py-[13px] text-left text-[12px] font-semibold uppercase tracking-wide text-ink-2">Categoría</th>
                  <th className="w-[120px] border-b border-line bg-sel px-4 py-[13px] text-right text-[12px] font-semibold uppercase tracking-wide text-ink-2">Precio base</th>
                  <th className="w-[240px] border-b border-line bg-sel px-4 py-[13px] text-left text-[12px] font-semibold uppercase tracking-wide text-ink-2">Pasos</th>
                  <th className="w-[110px] border-b border-line bg-sel px-4 py-[13px] text-left text-[12px] font-semibold uppercase tracking-wide text-ink-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((c) => {
                  const e = ESTADO[c.estado] ?? ESTADO.PAUSADO!;
                  return (
                    <tr key={c.id} className="cursor-pointer border-b border-line last:border-none hover:bg-hover" onClick={() => router.push(`/catalogo/combos/${c.id}`)}>
                      <td className="px-4 py-3.5 text-[15px] font-semibold">
                        <Link href={`/catalogo/combos/${c.id}`} className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" onClick={(ev) => ev.stopPropagation()}>
                          {c.nombre}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-[14px] text-ink-2">{c.categoriaNombre}</td>
                      <td className="px-4 py-3.5 text-right font-display text-[15px] font-semibold tabular-nums">{precioMxn(c.precio_base_mxn)}</td>
                      <td className="px-4 py-3.5">
                        <Pasos n={c.nSlots} />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[12.5px] font-semibold", e.cls].join(" ")}>
                          <span className={["h-1.5 w-1.5 rounded-full", e.dot].join(" ")} />
                          {e.txt}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {sinNada && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold">Aún no hay combos</p>
                <p className="max-w-sm text-sm text-ink-2">
                  Un combo es un producto por pasos: la caja pregunta qué hamburguesa, qué acompañamiento y qué bebida.
                </p>
                <Button onClick={() => router.push("/catalogo/combos/nuevo")}>Crear el primer combo</Button>
              </div>
            )}
          </div>
        )}

        {combos !== null && combos.length > 0 && (
          <>
            <p className="mt-4 text-[13px] text-ink-2">
              <b className="text-ink">{combos.length}</b> {combos.length === 1 ? "combo" : "combos"}
            </p>
            {/* Un combo nuevo nace PAUSADO (lib/combos.ts: crearCombo). Sin este aviso, el dueño
                ve "Pausado" en la tabla y no sabe que le toca a él publicarlo. */}
            <p className="mt-1 text-[13px] text-ink-2">
              Un combo nuevo nace <b className="text-ink">Pausado</b> porque todavía no tiene
              pasos. Ábrelo, agrégale sus pasos y elige <b className="text-ink">Se vende</b> para
              que la caja lo ofrezca.
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}
