"use client";
import { useCallback, useMemo, useState } from "react";
import { hoyMx } from "@vim/fecha";
import { useSesion } from "../lib/sesion";
import { textoActualizado, useRefresco } from "../lib/refresco";
import { fechaCorta, fechaHoraMx, input } from "../lib/formato";
import { fechaBloqueo } from "../lib/bloqueo";
import { Seccion } from "../components/seccion";
import { DialogoConfirmar } from "../components/dialogo-confirmar";
import type { CajaParque, VersionCaja } from "../lib/tipos";

/**
 * Versiones de la caja (ADR 0014, entrega 4).
 *
 * Antes no había forma de saber qué versión corría cada cliente: se preguntaba por teléfono.
 * Arriba va el parque, porque la pregunta que se hace al abrir esta pantalla no es "¿qué
 * publiqué?" sino "¿quién está atrás?".
 *
 * Exigir una versión mínima que bloquee es lo más agresivo de todo el panel y lo único que la
 * caja decide sola: por eso viene apagado, se enciende escribiendo BLOQUEAR y con una fecha.
 */
export default function VersionesPage() {
  const { api } = useSesion();
  const [versiones, setVersiones] = useState<VersionCaja[] | null>(null);
  const [cajas, setCajas] = useState<CajaParque[]>([]);
  const [minima, setMinima] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [soloAtras, setSoloAtras] = useState(false);

  const [manifiesto, setManifiesto] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [publicado, setPublicado] = useState<string | null>(null);
  /** Acción del historial pendiente de confirmar. */
  const [accion, setAccion] = useState<{ tipo: string; v: VersionCaja } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api("/api/versiones");
      setVersiones((r.versiones ?? []) as VersionCaja[]);
      setCajas((r.cajas ?? []) as CajaParque[]);
      setMinima((r.minima ?? null) as string | null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api]);
  const { hace, recargar } = useRefresco(cargar);

  const cifras = useMemo(() => {
    let alDia = 0, atras = 0, sinLatido = 0;
    for (const c of cajas) {
      if (c.sinLatido) sinLatido += 1;
      else if (c.desactualizada) atras += 1;
      else alDia += 1;
    }
    return { alDia, atras, sinLatido };
  }, [cajas]);

  const listadas = soloAtras ? cajas.filter((c) => c.desactualizada) : cajas;

  async function publicar(motivo: string) {
    setBusy(true); setError(null);
    try {
      const r = await api("/api/versiones", {
        method: "POST",
        body: JSON.stringify({ manifiesto, motivo }),
      });
      setManifiesto("");
      setPublicando(false);
      setPublicado(String(r.version ?? ""));
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function aplicar(motivo: string, graciaDias?: number) {
    if (!accion) return;
    setBusy(true); setError(null);
    try {
      await api("/api/versiones", {
        method: "PATCH",
        body: JSON.stringify({
          accion: accion.tipo,
          version: accion.v.version,
          motivo,
          // La fecha se calcula con el mismo helper que la suspensión: 06:00 de México del día
          // hoy + gracia, cuando el corte del día anterior ya está cerrado en cualquier
          // restaurante. Así el bloqueo nunca cae a media jornada.
          bloquea_desde: accion.tipo === "bloquear" && graciaDias ? fechaBloqueo(hoyMx(), graciaDias) : undefined,
        }),
      });
      setAccion(null);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const parseable = (() => {
    try { return typeof JSON.parse(manifiesto).version === "string"; } catch { return false; }
  })();

  return (
    <div>
      <h1 className="mb-1 font-display text-[18px] font-semibold tracking-tight">Versiones de la caja</h1>
      <p className="mb-5 text-[12.5px] text-ink-3">
        Qué versión corre cada caja, y desde dónde se publica la siguiente. Publicar no obliga a
        nadie: la caja se actualiza sola cuando le toca. Exigir una versión mínima sí puede
        impedirle vender, y por eso se enciende aparte.
      </p>

      {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}

      {/* ── El parque ────────────────────────────────────────────────────────── */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Cifra n={cifras.alDia} texto="al día" />
        <Cifra n={cifras.atras} texto={minima ? `por debajo de ${minima}` : "desactualizadas"} alerta={cifras.atras > 0} />
        <Cifra n={cifras.sinLatido} texto="sin reportar versión" />
      </div>

      <section className="rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-[16px] font-semibold tracking-tight">Parque de cajas</h2>
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input type="checkbox" checked={soloAtras} onChange={(e) => setSoloAtras(e.target.checked)} />
            Solo desactualizadas
          </label>
        </div>
        {versiones === null && !error && <p className="p-4 text-sm text-ink-3">Cargando…</p>}
        {versiones !== null && listadas.length === 0 && (
          <p className="p-6 text-center text-[13px] text-ink-3">
            {soloAtras ? "Ninguna caja está por debajo de la mínima." : "Todavía no hay cajas activas."}
          </p>
        )}
        {listadas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2 font-semibold">Cliente</th>
                  <th className="px-4 py-2 font-semibold">Sucursal</th>
                  <th className="px-4 py-2 font-semibold">Caja</th>
                  <th className="px-4 py-2 font-semibold">Versión</th>
                  <th className="px-4 py-2 font-semibold">Sistema</th>
                  <th className="px-4 py-2 font-semibold">Último latido</th>
                </tr>
              </thead>
              <tbody>
                {listadas.map((c) => (
                  <tr key={c.id} className={["border-b border-line last:border-0", c.sinLatido ? "text-ink-3" : ""].join(" ")}>
                    <td className="px-4 py-2 font-medium">{c.cliente}</td>
                    <td className="px-4 py-2">{c.sucursal}</td>
                    <td className="px-4 py-2">{c.nombre}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {c.versionApp ?? <span className="text-ink-3">anterior a 0.4.60</span>}
                      {c.desactualizada && (
                        <span className="ml-2 rounded-full bg-[#FCF3E6] px-2 py-0.5 text-[11px] font-semibold text-warning">
                          por actualizar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-2">{c.so ?? "—"}</td>
                    <td className="px-4 py-2 text-ink-2">
                      {c.ultimoLatido ? fechaHoraMx(c.ultimoLatido, "corto") : "nunca"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cifras.sinLatido > 0 && !soloAtras && (
          <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-ink-3">
            Las cajas en gris no reportan versión porque instalaron VIM POS antes de la 0.4.60. No
            están caídas: se pondrán al corriente en cuanto se actualicen.
          </p>
        )}
      </section>

      {/* ── Publicar ─────────────────────────────────────────────────────────── */}
      <div className="mt-6">
        <Seccion
          id="publicar"
          titulo="Publicar una versión"
          descripcion="Pega el contenido de desktop/dist/latest.json, tal cual lo escribió release-manifest."
        >
          <textarea
            id="ver-manifiesto"
            aria-label="Manifiesto de la versión"
            className={`${input} h-40 py-2 font-mono text-[12px]`}
            value={manifiesto}
            onChange={(e) => { setManifiesto(e.target.value); setPublicado(null); }}
            placeholder={'{\n  "version": "0.4.62",\n  "url": "https://github.com/…",\n  "sha512": "…",\n  "notas": "…"\n}'}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setPublicando(true)}
              disabled={busy || !parseable}
              className="btn h-11 rounded bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Publicar
            </button>
            {manifiesto.trim().length > 0 && !parseable && (
              <span className="text-[12.5px] text-ink-3">Eso todavía no es un JSON con versión.</span>
            )}
          </div>
          {publicado && (
            <p className="mt-3 rounded border border-line bg-sel px-3 py-2 text-[12.5px] text-ink-2">
              Publicada la <b>{publicado}</b>. El CDN puede seguir sirviendo la versión anterior
              hasta un minuto: si compruebas el enlace ahora mismo y ves la vieja, no es un error.
            </p>
          )}
        </Seccion>
      </div>

      {/* ── Historial ────────────────────────────────────────────────────────── */}
      <div className="mt-6">
        <Seccion id="historial" titulo="Publicadas" descripcion="La más alta publicada es la que se recomienda a las cajas.">
          {versiones !== null && versiones.length === 0 && (
            <p className="text-[13px] text-ink-3">Todavía no se ha publicado ninguna versión desde el panel.</p>
          )}
          <div className="flex flex-col">
            {(versiones ?? []).map((v) => (
              <div key={v.version} className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-3 last:border-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[14.5px] font-semibold tabular-nums">{v.version}</span>
                    {v.es_minima && (
                      <span className="rounded-full bg-sel px-2 py-0.5 text-[11px] font-semibold text-ink-2">mínima</span>
                    )}
                    {v.bloquea_bajo_minima && (
                      <span className="rounded-full bg-[#FBECEA] px-2 py-0.5 text-[11px] font-semibold text-danger">
                        exigida
                      </span>
                    )}
                    {!v.publicada && (
                      <span className="rounded-full bg-sel px-2 py-0.5 text-[11px] font-semibold text-ink-3">retirada</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    {fechaCorta(v.fecha ?? v.created_at.slice(0, 10))}
                    {v.bloquea_desde && ` · bloquea desde el ${fechaHoraMx(v.bloquea_desde, "corto")}`}
                  </div>
                  {v.notas && <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-snug text-ink-2">{v.notas}</p>}
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                  {!v.es_minima && v.publicada && (
                    <Boton onClick={() => setAccion({ tipo: "marcar_minima", v })} disabled={busy}>Marcar mínima</Boton>
                  )}
                  {v.es_minima && !v.bloquea_bajo_minima && (
                    <Boton onClick={() => setAccion({ tipo: "bloquear", v })} disabled={busy} peligroso>Exigirla…</Boton>
                  )}
                  {v.es_minima && v.bloquea_bajo_minima && (
                    <Boton onClick={() => setAccion({ tipo: "no_bloquear", v })} disabled={busy}>Dejar de exigirla</Boton>
                  )}
                  {v.es_minima && (
                    <Boton onClick={() => setAccion({ tipo: "quitar_minima", v })} disabled={busy}>Quitar mínima</Boton>
                  )}
                  {!v.es_minima && v.publicada && (
                    <Boton onClick={() => setAccion({ tipo: "despublicar", v })} disabled={busy}>Retirar</Boton>
                  )}
                  {!v.publicada && (
                    <Boton onClick={() => setAccion({ tipo: "publicar", v })} disabled={busy}>Volver a publicar</Boton>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11.5px] text-ink-3">{textoActualizado(hace)}</p>
        </Seccion>
      </div>

      <DialogoConfirmar
        abierto={publicando}
        onCerrar={() => setPublicando(false)}
        titulo="Publicar la versión"
        descripcion={
          <>
            Todas las cajas de todos los clientes empezarán a ofrecer esta actualización. No las
            obliga a instalarla ahora mismo, pero el instalador que descarguen será este.
          </>
        }
        nombreEsperado="TODOS"
        etiquetaBoton="Publicar"
        ocupado={busy}
        onConfirmar={({ motivo }) => publicar(motivo)}
      />

      <DialogoConfirmar
        abierto={accion !== null}
        onCerrar={() => setAccion(null)}
        titulo={TITULO[accion?.tipo ?? ""] ?? "Confirmar"}
        descripcion={descripcionDe(accion?.tipo ?? "", accion?.v.version ?? "")}
        nombreEsperado={accion?.tipo === "bloquear" ? "BLOQUEAR" : "TODOS"}
        etiquetaBoton={TITULO[accion?.tipo ?? ""] ?? "Aplicar"}
        peligroso={accion?.tipo === "bloquear"}
        conGracia={accion?.tipo === "bloquear"}
        conEntiendo={
          accion?.tipo === "bloquear"
            ? "Entiendo que una caja por debajo de esa versión y sin internet no podrá salir del bloqueo sola."
            : undefined
        }
        ocupado={busy}
        onConfirmar={({ motivo, graciaDias }) => aplicar(motivo, graciaDias)}
      />
    </div>
  );
}

const TITULO: Record<string, string> = {
  marcar_minima: "Marcar como mínima",
  quitar_minima: "Quitar la mínima",
  bloquear: "Exigir esta versión",
  no_bloquear: "Dejar de exigirla",
  despublicar: "Retirar la versión",
  publicar: "Volver a publicarla",
};

function descripcionDe(tipo: string, version: string) {
  if (tipo === "bloquear") {
    return (
      <>
        A partir de esa fecha, una caja por debajo de la <b>{version}</b> <b>no podrá vender</b>{" "}
        hasta actualizarse. La pantalla le ofrece el botón de instalar y el teléfono de soporte,
        pero si esa caja se queda sin internet no podrá salir del bloqueo sola.
      </>
    );
  }
  if (tipo === "marcar_minima") {
    return <>Las cajas por debajo de la <b>{version}</b> aparecerán como desactualizadas. Todavía podrán vender.</>;
  }
  if (tipo === "no_bloquear") {
    return <>Las cajas por debajo de la <b>{version}</b> volverán a poder vender, aunque sigan desactualizadas.</>;
  }
  if (tipo === "despublicar") {
    return <>Deja de recomendarse. Las cajas que ya la tengan no se desinstalan; las demás se quedan en la anterior.</>;
  }
  if (tipo === "quitar_minima") {
    return <>Ninguna versión quedará marcada como mínima y nadie aparecerá como desactualizado.</>;
  }
  return <>Volverá a ser candidata para las cajas que estén por debajo.</>;
}

function Cifra({ n, texto, alerta }: { n: number; texto: string; alerta?: boolean }) {
  return (
    <div className={["rounded-lg border bg-surface px-4 py-3", alerta ? "border-warning/40" : "border-line"].join(" ")}>
      <div className={["font-display text-[22px] font-semibold tabular-nums", alerta ? "text-warning" : ""].join(" ")}>{n}</div>
      <div className="text-[12px] text-ink-3">{texto}</div>
    </div>
  );
}

function Boton({ onClick, disabled, peligroso, children }: { onClick: () => void; disabled?: boolean; peligroso?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "btn h-8 rounded border px-3 text-[12.5px] font-semibold disabled:opacity-50",
        peligroso ? "border-danger/40 text-danger hover:bg-danger/5" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
