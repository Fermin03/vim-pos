"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSesion } from "../lib/sesion";
import { textoActualizado, useRefresco } from "../lib/refresco";
import { fechaHoraMx, input, label } from "../lib/formato";
import { Seccion } from "../components/seccion";
import { DialogoConfirmar } from "../components/dialogo-confirmar";
import type { AvisoPanel, Tenant } from "../lib/tipos";

const NIVEL: Record<string, { pastilla: string; nombre: string }> = {
  info: { pastilla: "bg-[#EAF3FB] text-[#0063A8]", nombre: "Informativo" },
  warning: { pastilla: "bg-[#F6EEDD] text-warning", nombre: "Atención" },
  danger: { pastilla: "bg-[#FBECEA] text-danger", nombre: "Importante" },
};

const CUERPO_MAX = 600;

/**
 * Avisos a las cajas (ADR 0014, entrega 3).
 *
 * Lo que hace útil esta pantalla es el conteo de lecturas: mandar un aviso sin saber si llegó es
 * gritar al vacío. Por eso cada fila dice "visto por N de M cajas" y no solo que se envió.
 */
export default function AvisosPage() {
  const { api } = useSesion();
  const [avisos, setAvisos] = useState<AvisoPanel[] | null>(null);
  const [clientes, setClientes] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [borrando, setBorrando] = useState<AvisoPanel | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const [f, setF] = useState({
    tenant_id: "", nivel: "info", titulo: "", cuerpo: "", vigente_hasta: "", requiere_confirmacion: false,
  });

  // Se llega aquí desde la ficha de un cliente con "Escribirle un aviso": el destinatario viene
  // en la URL para que el formulario viva en un solo sitio.
  const params = useSearchParams();
  const clientePorUrl = params.get("cliente");
  useEffect(() => {
    if (clientePorUrl) setF((x) => ({ ...x, tenant_id: clientePorUrl }));
  }, [clientePorUrl]);

  const cargar = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([api("/api/avisos"), api("/api/tenants")]);
      setAvisos((a.avisos ?? []) as AvisoPanel[]);
      setClientes((t.tenants ?? []) as Tenant[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api]);
  const { hace, recargar } = useRefresco(cargar);

  const esGlobal = f.tenant_id === "";
  // Un aviso importante a TODOS los clientes es lo más ruidoso que se puede hacer desde aquí:
  // se confirma escribiendo TODOS, igual que lo destructivo se confirma con el nombre del cliente.
  const necesitaConfirmar = esGlobal && f.nivel === "danger";
  const nombreCliente = clientes.find((c) => c.id === f.tenant_id)?.nombre_comercial ?? "";
  const listo = f.titulo.trim().length > 0 && f.cuerpo.trim().length > 0 && f.cuerpo.length <= CUERPO_MAX;

  async function crear(motivo: string) {
    setBusy(true); setError(null);
    try {
      await api("/api/avisos", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: f.tenant_id || null,
          nivel: f.nivel,
          titulo: f.titulo.trim(),
          cuerpo: f.cuerpo.trim(),
          requiere_confirmacion: f.requiere_confirmacion,
          vigente_hasta: f.vigente_hasta ? new Date(f.vigente_hasta).toISOString() : null,
          motivo,
        }),
      });
      setF({ tenant_id: "", nivel: "info", titulo: "", cuerpo: "", vigente_hasta: "", requiere_confirmacion: false });
      setConfirmando(false);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function borrar(motivo: string) {
    if (!borrando) return;
    setBusy(true); setError(null);
    try {
      await api(`/api/avisos?id=${borrando.id}&motivo=${encodeURIComponent(motivo)}`, { method: "DELETE" });
      setBorrando(null);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const vigentes = (avisos ?? []).filter((a) => !a.borrado);
  const pasados = (avisos ?? []).filter((a) => a.borrado);

  return (
    <div>
      <h1 className="mb-1 font-display text-[18px] font-semibold tracking-tight">Avisos a las cajas</h1>
      <p className="mb-5 text-[12.5px] text-ink-3">
        Lo que escribas aquí le sale al cajero en su pantalla, dentro de los 10 minutos siguientes.
        Un aviso nunca impide vender.
      </p>

      {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* ── Lista ─────────────────────────────────────────────────────────── */}
        <div>
          {avisos === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
          {avisos && vigentes.length === 0 && (
            <div className="rounded-lg border border-line bg-surface p-10 text-center">
              <div className="font-display text-[17px] font-semibold">Ningún aviso vigente</div>
              <p className="mt-1 text-[13px] text-ink-3">Las cajas no están viendo nada de tu parte ahora mismo.</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {vigentes.map((a) => (
              <article key={a.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${NIVEL[a.nivel]?.pastilla ?? "bg-sel text-ink-3"}`}>
                        {NIVEL[a.nivel]?.nombre ?? a.nivel}
                      </span>
                      <span className="font-display text-[14.5px] font-semibold">{a.titulo}</span>
                      {a.requiereConfirmacion && <span className="text-[11px] font-semibold text-ink-3">pide confirmación</span>}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-3">
                      {a.tenantNombre ?? "Todos los clientes"}
                      {a.vigenteHasta ? ` · hasta el ${fechaHoraMx(a.vigenteHasta, "corto")}` : " · sin fecha de fin"}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <span className="text-[12.5px] tabular-nums text-ink-2">
                      visto por <b>{a.vistos}</b> de {a.cajasAlcance} {a.cajasAlcance === 1 ? "caja" : "cajas"}
                    </span>
                    <button onClick={() => setBorrando(a)} disabled={busy} className="btn h-8 rounded border border-line-strong px-3 text-[12.5px] font-semibold text-ink-3 hover:text-danger disabled:opacity-50">
                      Retirar…
                    </button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-snug text-ink-2">{a.cuerpo}</p>
              </article>
            ))}
          </div>

          {pasados.length > 0 && (
            <details className="mt-5">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">Retirados ({pasados.length})</summary>
              <div className="mt-2 flex flex-col gap-1">
                {pasados.map((a) => (
                  <div key={a.id} className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 text-[12.5px] last:border-0">
                    <span className="truncate text-ink-2">{a.titulo} · {a.tenantNombre ?? "Todos"}</span>
                    <span className="flex-shrink-0 tabular-nums text-ink-3">lo vieron {a.vistos}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p className="mt-4 text-[11.5px] text-ink-3">{textoActualizado(hace)}</p>
        </div>

        {/* ── Formulario ────────────────────────────────────────────────────── */}
        <Seccion id="nuevo" titulo="Escribir un aviso" descripcion="Texto plano. Lo verá el cajero, no el dueño.">
          <div className="flex flex-col gap-3">
            <div>
              <label className={label} htmlFor="av-dest">Para</label>
              <select id="av-dest" className={input} value={f.tenant_id} onChange={(e) => setF({ ...f, tenant_id: e.target.value })}>
                <option value="">Todos los clientes</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_comercial}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="av-nivel">Nivel</label>
              <select id="av-nivel" className={input} value={f.nivel} onChange={(e) => setF({ ...f, nivel: e.target.value })}>
                <option value="info">Informativo</option>
                <option value="warning">Atención</option>
                <option value="danger">Importante</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="av-titulo">Título</label>
              <input id="av-titulo" className={input} maxLength={120} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="av-cuerpo">Mensaje</label>
              <textarea id="av-cuerpo" className={`${input} h-28 py-2`} maxLength={CUERPO_MAX} value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} />
              <div className="mt-1 text-right text-[11.5px] text-ink-3">{f.cuerpo.length} / {CUERPO_MAX}</div>
            </div>
            <div>
              <label className={label} htmlFor="av-hasta">Dejar de mostrarlo · opcional</label>
              <input id="av-hasta" type="date" className={input} value={f.vigente_hasta} onChange={(e) => setF({ ...f, vigente_hasta: e.target.value })} />
            </div>
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" className="mt-0.5" checked={f.requiere_confirmacion} onChange={(e) => setF({ ...f, requiere_confirmacion: e.target.checked })} />
              <span>Pedir que el cajero confirme que lo leyó</span>
            </label>
            <button
              onClick={() => setConfirmando(true)}
              disabled={busy || !listo}
              className="btn mt-1 h-11 w-full rounded bg-accent text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Enviar aviso
            </button>
          </div>
        </Seccion>
      </div>

      <DialogoConfirmar
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        titulo="Enviar aviso"
        descripcion={
          esGlobal
            ? <>Lo verán los cajeros de <b>todos los clientes</b> en su próxima conexión.</>
            : <>Lo verán los cajeros de <b>{nombreCliente}</b> en su próxima conexión.</>
        }
        nombreEsperado={necesitaConfirmar ? "TODOS" : (nombreCliente || "TODOS")}
        etiquetaBoton="Enviar"
        peligroso={f.nivel === "danger"}
        ocupado={busy}
        onConfirmar={({ motivo }) => crear(motivo)}
      />

      <DialogoConfirmar
        abierto={borrando !== null}
        onCerrar={() => setBorrando(null)}
        titulo="Retirar aviso"
        descripcion={<>Dejará de aparecer en las cajas en su próxima conexión. Lo que ya se leyó queda registrado.</>}
        nombreEsperado={borrando?.tenantNombre ?? "TODOS"}
        etiquetaBoton="Retirar"
        peligroso
        ocupado={busy}
        onConfirmar={({ motivo }) => borrar(motivo)}
      />
    </div>
  );
}
