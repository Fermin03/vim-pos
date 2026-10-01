"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { hace, type Api } from "../lib/tipos";
import { fechaHoraMx, input, nombreVertical } from "../lib/formato";
import { textoActualizado, useRefresco } from "../lib/refresco";
import {
  COLOR_ESTADO_PROSPECTO,
  ESTADOS_PROSPECTO,
  NOMBRE_ESTADO_PROSPECTO,
  NOTA_MAXIMA,
  type EstadoProspecto,
  type Prospecto,
} from "../lib/prospectos";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Fila = Prospecto & { enlace: string | null };
type Filtro = EstadoProspecto | "TODOS";

const btnFantasma = "btn h-9 rounded border border-line-strong px-3 text-13 font-semibold hover:bg-hover disabled:opacity-50";

/** "4771234567" → "477 123 4567". Lo que no son 10 dígitos se enseña como llegó. */
function telefono(w: string): string {
  const d = w.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : w;
}

/** Un dato con su etiqueta, o nada si viene vacío: una tarjeta llena de "—" no se lee. */
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-12 font-semibold uppercase tracking-wide text-ink-3">{etiqueta}</dt>
      <dd className="break-words text-13 text-ink">{children}</dd>
    </div>
  );
}

/**
 * Una tarjeta por prospecto. La nota se edita aquí mismo y solo se guarda al pulsar: el refresco
 * automático (cada 60 s) no pisa lo que se está escribiendo, igual que las notas de la ficha.
 */
function Tarjeta({ p, ocupado, onCambio, onEliminar }: {
  p: Fila;
  ocupado: boolean;
  onCambio: (id: string, cambio: { estado?: EstadoProspecto; notas?: string }) => Promise<void>;
  onEliminar: (p: Fila) => void;
}) {
  const servidor = p.notas ?? "";
  const [nota, setNota] = useState(servidor);
  const [ultima, setUltima] = useState(servidor);
  useEffect(() => {
    setNota((actual) => (actual === ultima ? servidor : actual));
    setUltima(servidor);
  }, [servidor]); // eslint-disable-line react-hooks/exhaustive-deps
  const sucia = nota !== ultima;
  const origen = [p.origen, p.utm_source, p.utm_campaign].filter(Boolean).join(" · ");

  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-16 font-semibold tracking-tight">{p.negocio}</h3>
            <span className={`rounded-full px-2 py-0.5 text-12 font-semibold ${COLOR_ESTADO_PROSPECTO[p.estado] ?? "bg-sel text-ink-2"}`}>
              {NOMBRE_ESTADO_PROSPECTO[p.estado] ?? p.estado}
            </span>
          </div>
          <p className="mt-0.5 text-13 text-ink-2">
            {p.nombre} · pidió la demo {hace(p.creado_en)}
            <span className="text-ink-3"> ({fechaHoraMx(p.creado_en, "corto")})</span>
          </p>
        </div>
        {/* La única acción azul de la tarjeta: contestarle es lo que sigue. */}
        {p.enlace ? (
          <a
            href={p.enlace}
            target="_blank"
            rel="noopener noreferrer"
            className="btn flex h-10 shrink-0 items-center rounded bg-accent px-4 text-13 font-semibold text-white hover:bg-accent-hover"
          >
            WhatsApp {telefono(p.whatsapp)}
          </a>
        ) : (
          <span className="text-13 text-ink-2">Tel. {p.whatsapp} (no abre en WhatsApp)</span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Dato etiqueta="Cajas">{p.cajas}</Dato>
        <Dato etiqueta="Sucursales">{p.sucursales}</Dato>
        <Dato etiqueta="Giro">{p.giro ? nombreVertical(p.giro) : "No dijo"}</Dato>
        <Dato etiqueta="Origen">{origen || "—"}</Dato>
        {p.usa_hoy && <div className="col-span-2 sm:col-span-4"><Dato etiqueta="Qué usa hoy">{p.usa_hoy}</Dato></div>}
        {p.mensaje && <div className="col-span-2 sm:col-span-4"><Dato etiqueta="Mensaje">{p.mensaje}</Dato></div>}
      </dl>

      <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-[200px_1fr]">
        <div>
          <label className="mb-1 block text-12 font-semibold uppercase tracking-wide text-ink-3" htmlFor={`estado-${p.id}`}>Seguimiento</label>
          <select
            id={`estado-${p.id}`}
            className={`${input} h-10`}
            value={p.estado}
            disabled={ocupado}
            onChange={(e) => void onCambio(p.id, { estado: e.target.value as EstadoProspecto })}
          >
            {ESTADOS_PROSPECTO.map((e) => <option key={e} value={e}>{NOMBRE_ESTADO_PROSPECTO[e]}</option>)}
          </select>
          <p className="mt-1 text-12 text-ink-3">
            {p.estado_cambiado_en ? `Cambió ${hace(p.estado_cambiado_en)}` : "Sin mover desde que llegó"}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-12 font-semibold uppercase tracking-wide text-ink-3" htmlFor={`nota-${p.id}`}>Nota (opcional)</label>
          <div className="flex gap-2">
            <input
              id={`nota-${p.id}`}
              className={`${input} h-10`}
              value={nota}
              maxLength={NOTA_MAXIMA}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Le marco el lunes, pide precio anual…"
            />
            <button type="button" onClick={() => void onCambio(p.id, { notas: nota })} disabled={ocupado || !sucia} className={`${btnFantasma} h-10 shrink-0`}>
              Guardar
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {p.estado !== "GANADO" ? (
          <Link href={`/clientes/nuevo?prospecto=${p.id}`} className={`${btnFantasma} flex items-center`}>
            Convertir en cliente…
          </Link>
        ) : <span className="text-13 text-ink-2">Ya es cliente.</span>}
        {/* Aparte y sin relleno rojo: borrar es raro (entradas de prueba) y no compite con lo de arriba. */}
        <button type="button" onClick={() => onEliminar(p)} disabled={ocupado} className="text-13 font-semibold text-danger underline-offset-2 hover:underline disabled:opacity-50">
          Eliminar…
        </button>
      </div>
    </li>
  );
}

/**
 * Bandeja de prospectos de demo (0145). Lo que llega del formulario del sitio, lo más nuevo
 * primero, con el WhatsApp a un clic y el saludo ya escrito.
 *
 * Abre filtrada en lo que hay que contestar (NUEVO) si hay alguno; si no, en todos. El filtro
 * también se puede fijar por URL (`?estado=NUEVO`), que es a donde lleva la alerta de Atención.
 */
export function Prospectos({ api, estadoInicial }: { api: Api; estadoInicial: Filtro | null }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [filtro, setFiltro] = useState<Filtro | null>(estadoInicial);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aBorrar, setABorrar] = useState<Fila | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api("/api/prospectos");
      const lista = (r.prospectos ?? []) as Fila[];
      const c = (r.conteo ?? {}) as Record<string, number>;
      setFilas(lista);
      setConteo(c);
      // Primera carga sin filtro pedido: a lo pendiente si hay, a todo si no.
      setFiltro((f) => f ?? ((c.NUEVO ?? 0) > 0 ? "NUEVO" : "TODOS"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api]);
  const { hace: haceCarga, recargar } = useRefresco(cargar);

  const cambiar = useCallback(async (id: string, cambio: { estado?: EstadoProspecto; notas?: string }) => {
    setOcupado(true); setError(null);
    try {
      await api(`/api/prospectos/${id}`, { method: "PATCH", body: JSON.stringify(cambio) });
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(false);
    }
  }, [api, recargar]);

  if (error && !filas) return <p className="text-13 text-danger" role="alert">{error}</p>;
  if (!filas || filtro === null) return <p className="text-13 text-ink-2">Cargando…</p>;

  const total = filas.length;
  const lista = filtro === "TODOS" ? filas : filas.filter((p) => p.estado === filtro);
  const chips: [Filtro, string][] = [
    ["TODOS", `Todos (${total})`],
    ...ESTADOS_PROSPECTO
      // "No era real" solo aparece si hay alguno: es raro y no merece un botón fijo.
      .filter((e) => e !== "SPAM" || (conteo.SPAM ?? 0) > 0)
      .map((e): [Filtro, string] => [e, `${NOMBRE_ESTADO_PROSPECTO[e]} (${conteo[e] ?? 0})`]),
  ];

  return (
    <div>
      <h1 className="mb-1 font-display text-20 font-bold tracking-tight">Prospectos</h1>
      <p className="mb-4 text-13 text-ink-2">
        Quien pidió una demo en el sitio. El sitio promete contestar el mismo día hábil: lo que lleva más de 24 horas como nuevo sale en Atención.
      </p>
      {error && (
        <p className="mb-3 rounded border border-warning/30 bg-warning-soft px-3 py-2 text-13 font-medium text-warning" role="alert">{error}</p>
      )}

      <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Filtrar por seguimiento">
        {chips.map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filtro === k}
            onClick={() => setFiltro(k)}
            className={["btn rounded px-2.5 py-1.5 text-13 font-semibold", filtro === k ? "bg-ink text-white" : "text-ink-2 hover:bg-hover"].join(" ")}
          >
            {l}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-8 text-center">
          <div className="font-display text-18 font-semibold">Todavía no hay prospectos</div>
          <p className="mt-1 text-14 text-ink-2">Aquí aparece cada solicitud de demo del sitio en cuanto se envía.</p>
        </div>
      ) : lista.length === 0 ? (
        <p className="text-14 text-ink-2">Ninguno en «{filtro === "TODOS" ? "Todos" : NOMBRE_ESTADO_PROSPECTO[filtro]}».</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.map((p) => <Tarjeta key={p.id} p={p} ocupado={ocupado} onCambio={cambiar} onEliminar={setABorrar} />)}
        </ul>
      )}
      <p className="mt-4 text-13 text-ink-2">{textoActualizado(haceCarga)}</p>

      <DialogoConfirmar
        abierto={aBorrar !== null}
        onCerrar={() => setABorrar(null)}
        titulo="Eliminar prospecto"
        descripcion={<>Se borra la solicitud de <b>{aBorrar?.negocio}</b> con su nombre y su WhatsApp. No se puede deshacer. Para uno real que no cerró, mejor márcalo como «Perdido».</>}
        sinNombre
        nombreEsperado={aBorrar?.negocio ?? ""}
        etiquetaBoton="Eliminar"
        textoOcupado="Eliminando…"
        peligroso
        ocupado={ocupado}
        onConfirmar={async ({ motivo }) => {
          if (!aBorrar) return;
          setOcupado(true);
          try {
            await api(`/api/prospectos/${aBorrar.id}`, { method: "DELETE", body: JSON.stringify({ motivo }) });
            setABorrar(null);
            await recargar();
          } finally {
            setOcupado(false);
          }
        }}
      />
    </div>
  );
}
