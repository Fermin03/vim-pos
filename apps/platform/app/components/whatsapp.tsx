"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { hace, type Api } from "../lib/tipos";
import { fechaHoraMx } from "../lib/formato";
import { textoActualizado, useRefresco } from "../lib/refresco";
import {
  agenteCallado,
  COLOR_ESTADO_WA,
  ESTADOS_WA,
  etiquetaEstado,
  type ConversacionWa,
  type MensajeWa,
} from "../lib/whatsapp";
import { Seccion } from "./seccion";

type Filtro = string;
type Detalle = ConversacionWa & { enlace: string | null };

const btnFantasma = "btn h-9 rounded border border-line-strong px-3 text-13 font-semibold hover:bg-hover disabled:opacity-50";

/** El número como llegó de Meta, con "+". */
const numero = (waId: string) => `+${waId}`;
const nombre = (c: ConversacionWa) => c.nombre_perfil || numero(c.wa_id);

function Estado({ estado }: { estado: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-12 font-semibold ${COLOR_ESTADO_WA[estado as keyof typeof COLOR_ESTADO_WA] ?? "bg-sel text-ink-2"}`}>
      {etiquetaEstado(estado)}
    </span>
  );
}

function Callado({ c }: { c: ConversacionWa }) {
  if (!agenteCallado(c.pausado_hasta, new Date())) return null;
  return <span className="rounded-full bg-sel px-2 py-0.5 text-12 font-semibold text-ink-2">Agente callado</span>;
}

/** Bandeja: lo más reciente primero, con el interruptor de la oferta «Negocio fundador». */
export function Whatsapp({ api }: { api: Api }) {
  const [filas, setFilas] = useState<ConversacionWa[] | null>(null);
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [fundador, setFundador] = useState<boolean | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api("/api/whatsapp");
      setFilas((r.conversaciones ?? []) as ConversacionWa[]);
      setConteo((r.conteo ?? {}) as Record<string, number>);
      setFundador(r.fundador_abierta as boolean);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api]);
  const { hace: haceCarga, recargar } = useRefresco(cargar);

  const alternarFundador = async () => {
    setOcupado(true); setError(null);
    try {
      await api("/api/whatsapp", { method: "POST", body: JSON.stringify({ accion: "fundador", abierta: !fundador }) });
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(false);
    }
  };

  if (error && !filas) return <p className="text-13 text-danger" role="alert">{error}</p>;
  if (!filas) return <p className="text-13 text-ink-2">Cargando…</p>;

  const total = ESTADOS_WA.reduce((s, e) => s + (conteo[e] ?? 0), 0);
  const lista = filtro === "TODOS" ? filas : filas.filter((c) => c.estado === filtro);
  const chips: [Filtro, string][] = [
    ["TODOS", `Todas (${total})`],
    ...ESTADOS_WA.map((e): [Filtro, string] => [e, `${etiquetaEstado(e)} (${conteo[e] ?? 0})`]),
  ];

  return (
    <div>
      <h1 className="mb-1 font-display text-20 font-bold tracking-tight">WhatsApp</h1>
      <p className="mb-4 text-13 text-ink-2">Las conversaciones del agente. Lo urgente y los prospectos calientes ya te avisaron por WhatsApp; aquí está el historial.</p>
      {error && (
        <p className="mb-3 rounded border border-warning/30 bg-warning-soft px-3 py-2 text-13 font-medium text-warning" role="alert">{error}</p>
      )}

      <Seccion id="fundador" titulo="Oferta «Negocio fundador»" descripcion="Mientras esté abierta, el agente la ofrece a prospectos con negocio nuevo.">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-14 font-semibold">{fundador === null ? "…" : fundador ? "Abierta" : "Cerrada"}</span>
          <button type="button" onClick={() => void alternarFundador()} disabled={ocupado || fundador === null} className={btnFantasma}>
            {fundador ? "Cerrar la oferta" : "Abrir la oferta"}
          </button>
        </div>
      </Seccion>

      <div className="mb-4 mt-6 flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
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

      {filas.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-8 text-center">
          <div className="font-display text-18 font-semibold">Todavía no hay conversaciones</div>
          <p className="mt-1 text-14 text-ink-2">Aquí aparece cada persona que le escribe al agente.</p>
        </div>
      ) : lista.length === 0 ? (
        <p className="text-14 text-ink-2">Ninguna en «{filtro === "TODOS" ? "Todas" : etiquetaEstado(filtro)}».</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.map((c) => (
            <li key={c.id}>
              <Link href={`/whatsapp/${c.id}`} className="block rounded-lg border border-line bg-surface p-4 hover:bg-hover">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-16 font-semibold tracking-tight">{nombre(c)}</h3>
                  <Estado estado={c.estado} />
                  <Callado c={c} />
                </div>
                <p className="mt-0.5 text-13 text-ink-2">
                  {numero(c.wa_id)} · último mensaje {hace(c.ultimo_mensaje_en)}
                  {c.prospecto && <> · Prospecto: {c.prospecto.negocio}</>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-13 text-ink-2">{textoActualizado(haceCarga)}</p>
    </div>
  );
}

const AUTOR: Record<MensajeWa["autor"], string> = { CLIENTE: "Cliente", AGENTE: "Agente", FERMIN: "Fermín" };

/** Una conversación: el chat, quién lo lleva y el cierre. */
export function ConversacionWhatsapp({ api, id }: { api: Api; id: string }) {
  const [conv, setConv] = useState<Detalle | null>(null);
  const [mensajes, setMensajes] = useState<MensajeWa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api(`/api/whatsapp/${id}`);
      setConv(r.conversacion as Detalle);
      setMensajes((r.mensajes ?? []) as MensajeWa[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api, id]);
  const { hace: haceCarga, recargar } = useRefresco(cargar);

  const resolver = async () => {
    setOcupado(true); setError(null);
    try {
      await api(`/api/whatsapp/${id}`, { method: "POST", body: JSON.stringify({ accion: "resolver" }) });
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo resolver");
    } finally {
      setOcupado(false);
    }
  };

  if (error && !conv) return <p className="text-13 text-danger" role="alert">{error}</p>;
  if (!conv) return <p className="text-13 text-ink-2">Cargando…</p>;

  return (
    <div>
      <Link href="/whatsapp" className="text-13 font-semibold text-ink-2 hover:text-ink">← WhatsApp</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-20 font-bold tracking-tight">{nombre(conv)}</h1>
            <Estado estado={conv.estado} />
            <Callado c={conv} />
          </div>
          <p className="mt-0.5 text-13 text-ink-2">
            {numero(conv.wa_id)} · último mensaje {hace(conv.ultimo_mensaje_en)}
            {conv.prospecto && <> · Prospecto: <Link href="/prospectos" className="underline underline-offset-2">{conv.prospecto.negocio}</Link></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {conv.enlace && (
            <a href={conv.enlace} target="_blank" rel="noopener noreferrer" className="btn flex h-10 items-center rounded bg-accent px-4 text-13 font-semibold text-white hover:bg-accent-hover">
              Abrir en WhatsApp
            </a>
          )}
          {conv.estado !== "RESUELTO" && (
            <button type="button" onClick={() => void resolver()} disabled={ocupado} className={`${btnFantasma} h-10`}>
              {ocupado ? "Guardando…" : "Marcar resuelto"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="mb-3 rounded border border-warning/30 bg-warning-soft px-3 py-2 text-13 font-medium text-warning" role="alert">{error}</p>
      )}

      {conv.resumen && (
        <div className="mb-4">
          <Seccion id="resumen" titulo="Resumen del agente">
            <p className="whitespace-pre-wrap text-14">{conv.resumen}</p>
          </Seccion>
        </div>
      )}

      <Seccion id="mensajes" titulo="Mensajes" descripcion={mensajes.length >= 200 ? "Los últimos 200." : undefined}>
        {mensajes.length === 0 ? (
          <p className="text-14 text-ink-2">Sin mensajes.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mensajes.map((m) => (
              <li key={m.id} className={["max-w-[85%] rounded-lg px-3 py-2", m.autor === "CLIENTE" ? "self-start bg-sel" : "self-end bg-info-soft"].join(" ")}>
                <div className="text-12 font-semibold text-ink-3">
                  {AUTOR[m.autor] ?? m.autor} · {fechaHoraMx(m.creado_en, "corto")}
                </div>
                <p className="whitespace-pre-wrap break-words text-14">{m.texto ?? "(sin texto)"}</p>
              </li>
            ))}
          </ul>
        )}
      </Seccion>
      <p className="mt-4 text-13 text-ink-2">{textoActualizado(haceCarga)}</p>
    </div>
  );
}
