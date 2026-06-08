"use client";
import { useCallback, useEffect, useState } from "react";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const VERTICALES = [
  { v: "QUICK_SERVICE", l: "Quick Service", plan: "QS" },
  { v: "FULL_SERVICE", l: "Full Service", plan: "FS" },
  { v: "CAFE_BAR", l: "Café & Bar", plan: "CB" },
  { v: "DARK_KITCHEN", l: "Dark Kitchen", plan: "DK" },
  { v: "FOODTRUCK", l: "Foodtruck", plan: "FT" },
  { v: "ENTERPRISE", l: "Enterprise", plan: "ENT" },
];

const COLOR_ESTADO: Record<string, string> = {
  ACTIVO: "bg-[#EAF3EE] text-success", TRIAL: "bg-[#FBF0EC] text-[#CF4525]",
  SUSPENDIDO: "bg-[#FCF3E6] text-warning", CANCELADO: "bg-[#FBECEA] text-danger", INTERNO: "bg-sel text-ink-3",
};
const fmtMxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

type Tenant = {
  id: string; codigo: string; nombre_comercial: string; estado: string; vertical_principal: string;
  fecha_alta: string | null; plan?: { codigo: string; nombre: string; precio_mensual_mxn: number } | null;
  onboarding?: { fase: string; fecha_go_live: string | null } | null;
};
type Metricas = { totalTenants: number; activos: number; trial: number; suspendidos: number; cancelados: number; porVertical: Record<string, number>; mrr: number; foliosVendidos30d: number };
type Detalle = { tenant: Record<string, unknown>; foliosSaldo: number; nSucursales: number };
type Plan = { id: string; codigo: string; nombre: string; vertical: string; precio_mensual_mxn: number };

export default function PlatformHome() {
  const [platformKey, setPlatformKey] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [tab, setTab] = useState<"metricas" | "empresas" | "nuevo">("metricas");

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "X-Platform-Key": platformKey, ...(init?.body ? { "Content-Type": "application/json" } : {}) } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? data.detalle ?? "Error");
      return data;
    },
    [platformKey],
  );

  async function entrar() {
    setKeyError(null);
    if (!platformKey) { setKeyError("Ingresa la clave de plataforma"); return; }
    try { await api("/api/tenants"); setAutenticado(true); }
    catch (e) { setKeyError(e instanceof Error ? e.message : "Error al entrar"); }
  }

  if (!autenticado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sel p-6">
        <div className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink"><span className="font-display text-[15px] font-bold text-white">V</span></div>
            <span className="font-display text-[17px] font-bold tracking-tight">VIM Plataforma</span>
          </div>
          <p className="mb-5 text-[13px] text-ink-3">Panel de control interno de VIM. Acceso restringido.</p>
          <label className={label} htmlFor="pk">Clave de plataforma</label>
          <input id="pk" type="password" className={input} value={platformKey} onChange={(e) => setPlatformKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} />
          {keyError && <p className="mt-3 text-sm font-medium text-danger">{keyError}</p>}
          <button onClick={entrar} className="mt-4 h-11 w-full rounded bg-ink text-sm font-semibold text-white transition hover:opacity-90">Entrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center gap-4 border-b border-line bg-surface px-8 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink"><span className="font-display text-[15px] font-bold text-white">V</span></div>
          <span className="font-display text-[17px] font-bold tracking-tight">VIM Plataforma</span>
        </div>
        <nav className="ml-4 flex gap-1">
          {([["metricas", "Métricas"], ["empresas", "Empresas"], ["nuevo", "Nuevo cliente"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={["rounded px-3 py-1.5 text-[13px] font-semibold transition", tab === k ? "bg-ink text-white" : "text-ink-2 hover:bg-hover"].join(" ")}>{l}</button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1100px] p-8">
        {tab === "metricas" && <Metricas api={api} />}
        {tab === "empresas" && <Empresas api={api} />}
        {tab === "nuevo" && <NuevoCliente api={api} onCreado={() => setTab("empresas")} />}
      </main>
    </div>
  );
}

type Api = (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;

function Card({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{titulo}</div>
      <div className="mt-1 font-display text-[26px] font-bold tabular-nums">{valor}</div>
      {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

function Metricas({ api }: { api: Api }) {
  const [m, setM] = useState<Metricas | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { (async () => { try { setM((await api("/api/metricas")) as unknown as Metricas); } catch (e) { setError(e instanceof Error ? e.message : "Error"); } })(); }, [api]);
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!m) return <p className="text-sm text-ink-3">Cargando…</p>;
  return (
    <>
      <h2 className="mb-4 font-display text-[18px] font-semibold tracking-tight">Métricas globales</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card titulo="MRR" valor={fmtMxn(m.mrr)} sub="suscripciones activas" />
        <Card titulo="Clientes" valor={String(m.totalTenants)} sub={`${m.activos} activos · ${m.trial} trial`} />
        <Card titulo="Suspendidos / Cancelados" valor={`${m.suspendidos} / ${m.cancelados}`} />
        <Card titulo="Folios vendidos" valor={String(m.foliosVendidos30d)} sub="últimos 30 días" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Por vertical</div>
          {Object.entries(m.porVertical).map(([v, n]) => (
            <div key={v} className="flex items-center justify-between border-b border-line py-1.5 text-[13px] last:border-0"><span>{v}</span><span className="font-semibold tabular-nums">{n}</span></div>
          ))}
          {Object.keys(m.porVertical).length === 0 && <p className="text-[13px] text-ink-3">Sin clientes.</p>}
        </div>
      </div>
    </>
  );
}

function Empresas({ api }: { api: Api }) {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try { setTenants(((await api("/api/tenants")).tenants ?? []) as Tenant[]); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, [api]);
  useEffect(() => { recargar(); }, [recargar]);

  const lista = (tenants ?? []).filter((t) => !q.trim() || `${t.codigo} ${t.nombre_comercial}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-[18px] font-semibold tracking-tight">Empresas {tenants ? `(${tenants.length})` : ""}</h2>
        <input className={`${input} w-[280px]`} placeholder="Buscar código o nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {tenants === null && <p className="text-sm text-ink-3">Cargando…</p>}
      {tenants && (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
              <th className="px-4 py-2.5">Código</th><th className="px-4 py-2.5">Nombre</th><th className="px-4 py-2.5">Vertical</th><th className="px-4 py-2.5">Plan</th><th className="px-4 py-2.5">Fase</th><th className="px-4 py-2.5">Estado</th>
            </tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-3">Sin clientes.</td></tr>}
              {lista.map((t) => (
                <tr key={t.id} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-hover" onClick={() => setSel(t.id)}>
                  <td className="px-4 py-2.5 font-mono text-[12px]">{t.codigo}</td>
                  <td className="px-4 py-2.5 font-medium">{t.nombre_comercial}</td>
                  <td className="px-4 py-2.5 text-ink-2">{t.vertical_principal}</td>
                  <td className="px-4 py-2.5 text-ink-2">{t.plan?.codigo ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-3 text-[12px]">{t.onboarding?.fase ?? "—"}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COLOR_ESTADO[t.estado] ?? "bg-sel text-ink-3"}`}>{t.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sel && <DetalleDrawer api={api} id={sel} onCerrar={() => setSel(null)} onCambio={recargar} />}
    </>
  );
}

function DetalleDrawer({ api, id, onCerrar, onCambio }: { api: Api; id: string; onCerrar: () => void; onCambio: () => void }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const det = (await api(`/api/tenants/${id}`)) as unknown as Detalle;
      setD(det);
      setNotas(String(((det.tenant.onboarding as { notas_internas?: string } | null)?.notas_internas) ?? ""));
      setPlanes(((await api("/api/planes")).planes ?? []) as Plan[]);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, [api, id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function accion(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try { await api(`/api/tenants/${id}`, { method: "PATCH", body: JSON.stringify(body) }); await cargar(); onCambio(); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  }

  const t = d?.tenant as Record<string, unknown> | undefined;
  const estado = String(t?.estado ?? "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onCerrar}>
      <div className="h-full w-[480px] overflow-y-auto bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {!d && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        {t && (
          <>
            <div className="mb-1 flex items-start justify-between">
              <div>
                <h3 className="font-display text-[20px] font-bold tracking-tight">{String(t.nombre_comercial)}</h3>
                <div className="font-mono text-[12px] text-ink-3">{String(t.codigo)} · {String(t.vertical_principal)}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${COLOR_ESTADO[estado] ?? "bg-sel text-ink-3"}`}>{estado}</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Card titulo="Plan" valor={String((t.plan as { codigo?: string } | null)?.codigo ?? "—")} sub={fmtMxn(Number((t.plan as { precio_mensual_mxn?: number } | null)?.precio_mensual_mxn ?? 0)) + "/mes"} />
              <Card titulo="Folios" valor={String(d.foliosSaldo)} sub={`${d.nSucursales} sucursal(es)`} />
            </div>

            {/* Datos fiscales */}
            <div className="mt-4 rounded-lg border border-line p-3 text-[12.5px]">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">Fiscal</div>
              <div>RFC: <b>{String(t.rfc ?? "—")}</b></div>
              <div>Razón social: {String(t.razon_social ?? "—")}</div>
              <div>Régimen: {String(t.regimen_fiscal ?? "—")} · CP {String(t.codigo_postal_fiscal ?? "—")}</div>
            </div>

            {/* Cambiar plan */}
            <div className="mt-4">
              <label className={label}>Plan</label>
              <select className={input} value={String((t.plan as { id?: string } | null)?.id ?? "")} onChange={(e) => accion({ accion: "cambiar_plan", plan_id: e.target.value })} disabled={busy}>
                <option value="">— elegir —</option>
                {planes.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre} ({fmtMxn(p.precio_mensual_mxn)})</option>)}
              </select>
            </div>

            {/* Notas internas */}
            <div className="mt-4">
              <label className={label}>Notas internas</label>
              <textarea className={`${input} h-20 py-2`} value={notas} onChange={(e) => setNotas(e.target.value)} />
              <button onClick={() => accion({ accion: "notas", notas })} disabled={busy} className="mt-2 h-9 rounded border border-line-strong px-3 text-[13px] font-semibold transition hover:bg-hover disabled:opacity-50">Guardar notas</button>
            </div>

            {/* Acciones de estado */}
            <div className="mt-5 border-t border-line pt-4">
              <label className={label}>Cambiar estado</label>
              <input className={`${input} mb-2`} placeholder="Motivo (suspensión/cancelación)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {estado !== "ACTIVO" && <button onClick={() => accion({ accion: "cambiar_estado", estado: "ACTIVO" })} disabled={busy} className="h-9 rounded bg-success px-3 text-[13px] font-semibold text-white disabled:opacity-50">Activar</button>}
                {estado !== "SUSPENDIDO" && <button onClick={() => accion({ accion: "cambiar_estado", estado: "SUSPENDIDO", motivo })} disabled={busy} className="h-9 rounded bg-warning px-3 text-[13px] font-semibold text-white disabled:opacity-50">Suspender</button>}
                {estado !== "CANCELADO" && <button onClick={() => { if (confirm("¿Cancelar este cliente?")) accion({ accion: "cambiar_estado", estado: "CANCELADO", motivo }); }} disabled={busy} className="h-9 rounded bg-danger px-3 text-[13px] font-semibold text-white disabled:opacity-50">Cancelar</button>}
              </div>
            </div>

            <button onClick={onCerrar} className="mt-6 h-10 w-full rounded border border-line-strong text-[13px] font-semibold transition hover:bg-hover">Cerrar</button>
          </>
        )}
      </div>
    </div>
  );
}

function NuevoCliente({ api, onCreado }: { api: Api; onCreado: () => void }) {
  const [codigo, setCodigo] = useState(""); const [nombre, setNombre] = useState("");
  const [ownerNombre, setOwnerNombre] = useState(""); const [ownerEmail, setOwnerEmail] = useState(""); const [ownerTel, setOwnerTel] = useState("");
  const [vertical, setVertical] = useState("QUICK_SERVICE");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ email: string; pass?: string } | null>(null);
  const [creando, setCreando] = useState(false);

  async function provisionar() {
    setError(null); setResultado(null);
    if (!codigo || !nombre || !ownerNombre || !ownerEmail) { setError("Completa código, nombre, dueño y correo"); return; }
    const plan = VERTICALES.find((x) => x.v === vertical)?.plan ?? "QS";
    setCreando(true);
    try {
      const data = await api("/api/provisionar", { method: "POST", body: JSON.stringify({ codigo, nombre_comercial: nombre, nombre_owner: ownerNombre, email_owner: ownerEmail, telefono_owner: ownerTel, vertical, plan_codigo: plan }) });
      if (!data.ok) throw new Error(String(data.detalle ?? data.error ?? "No se pudo crear"));
      setResultado({ email: ownerEmail, pass: data.password_temporal as string | undefined });
      setCodigo(""); setNombre(""); setOwnerNombre(""); setOwnerEmail(""); setOwnerTel("");
      onCreado();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setCreando(false); }
  }

  return (
    <div className="max-w-[460px]">
      <h2 className="mb-1 font-display text-[18px] font-semibold tracking-tight">Nuevo cliente</h2>
      <p className="mb-4 text-[12.5px] text-ink-3">Crea el tenant y la cuenta del dueño. Queda en TRIAL, fase INVITADO.</p>
      <div className="flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-5">
        <div><label className={label} htmlFor="codigo">Código (slug)</label><input id="codigo" className={input} value={codigo} maxLength={50} onChange={(e) => setCodigo(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="knockout-burger" /></div>
        <div><label className={label} htmlFor="nombre">Nombre comercial</label><input id="nombre" className={input} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} placeholder="Knock-Out Burger" /></div>
        <div><label className={label} htmlFor="vertical">Vertical</label><select id="vertical" className={input} value={vertical} onChange={(e) => setVertical(e.target.value)}>{VERTICALES.map((x) => <option key={x.v} value={x.v}>{x.l} · plan {x.plan}</option>)}</select></div>
        <div className="h-px bg-line" />
        <div><label className={label} htmlFor="on">Nombre del dueño</label><input id="on" className={input} value={ownerNombre} maxLength={150} onChange={(e) => setOwnerNombre(e.target.value)} /></div>
        <div><label className={label} htmlFor="oe">Correo del dueño</label><input id="oe" type="email" className={input} value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="dueno@negocio.mx" /></div>
        <div><label className={label} htmlFor="ot">Teléfono · opcional</label><input id="ot" className={input} value={ownerTel} maxLength={20} onChange={(e) => setOwnerTel(e.target.value)} /></div>
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {resultado && <div className="rounded border border-[#D6E8DD] bg-[#EAF3EE] px-3 py-2.5 text-[12.5px] text-success"><div className="font-semibold">Cliente creado.</div><div className="mt-1 text-ink-2">Dueño: {resultado.email}</div>{resultado.pass && <div className="mt-0.5 text-ink-2">Contraseña temporal: <code className="font-mono">{resultado.pass}</code></div>}</div>}
        <button onClick={provisionar} disabled={creando} className="mt-1 h-11 w-full rounded bg-ink text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{creando ? "Creando…" : "Provisionar cliente"}</button>
      </div>
    </div>
  );
}
