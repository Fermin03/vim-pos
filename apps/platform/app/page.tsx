"use client";
import { useCallback, useEffect, useState } from "react";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const VERTICALES = [
  { v: "QUICK_SERVICE", l: "Quick Service", plan: "QS" },
  { v: "FULL_SERVICE", l: "Full Service", plan: "FS" },
  { v: "CAFE_BAR", l: "Café & Bar", plan: "CB" },
  { v: "DARK_KITCHEN", l: "Dark Kitchen", plan: "DK" },
  { v: "FOODTRUCK", l: "Foodtruck", plan: "FT" },
  { v: "ENTERPRISE", l: "Enterprise", plan: "ENT" },
];

type Tenant = {
  id: string;
  codigo: string;
  nombre_comercial: string;
  estado: string;
  vertical_principal: string;
  created_at: string;
};

export default function PlatformHome() {
  // El secreto de plataforma se captura una vez (herramienta interna de VIM; sustituir por
  // login de super-admin cuando exista el modelo). Se guarda solo en memoria de la sesión.
  const [platformKey, setPlatformKey] = useState("");
  const [autenticado, setAutenticado] = useState(false);

  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [ownerNombre, setOwnerNombre] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerTel, setOwnerTel] = useState("");
  const [vertical, setVertical] = useState("QUICK_SERVICE");

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ codigo: string; email: string; pass?: string } | null>(null);
  const [creando, setCreando] = useState(false);

  const cargarTenants = useCallback(async (key: string) => {
    try {
      const res = await fetch("/api/tenants", { headers: { "X-Platform-Key": key } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No autorizado");
      setTenants(data.tenants ?? []);
      setAutenticado(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setAutenticado(false);
    }
  }, []);

  useEffect(() => {
    if (autenticado && platformKey) cargarTenants(platformKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function entrar() {
    setError(null);
    if (!platformKey) {
      setError("Ingresa la clave de plataforma");
      return;
    }
    await cargarTenants(platformKey);
  }

  async function provisionar() {
    setError(null);
    setResultado(null);
    if (!codigo || !nombre || !ownerNombre || !ownerEmail) {
      setError("Completa código, nombre, dueño y correo");
      return;
    }
    const plan = VERTICALES.find((x) => x.v === vertical)?.plan ?? "QS";
    setCreando(true);
    try {
      const res = await fetch("/api/provisionar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Platform-Key": platformKey },
        body: JSON.stringify({
          codigo,
          nombre_comercial: nombre,
          nombre_owner: ownerNombre,
          email_owner: ownerEmail,
          telefono_owner: ownerTel,
          vertical,
          plan_codigo: plan,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.detalle ?? data.error ?? "No se pudo crear el cliente");
      setResultado({ codigo, email: ownerEmail, pass: data.password_temporal });
      setCodigo("");
      setNombre("");
      setOwnerNombre("");
      setOwnerEmail("");
      setOwnerTel("");
      await cargarTenants(platformKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al provisionar");
    } finally {
      setCreando(false);
    }
  }

  if (!autenticado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sel p-6">
        <div className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink"><span className="font-display text-[15px] font-bold text-white">V</span></div>
            <span className="font-display text-[17px] font-bold tracking-tight">VIM Plataforma</span>
          </div>
          <p className="mb-5 text-[13px] text-ink-3">Panel interno de provisioning. Acceso restringido a VIM.</p>
          <label className={label} htmlFor="pk">Clave de plataforma</label>
          <input id="pk" type="password" className={input} value={platformKey}
            onChange={(e) => setPlatformKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} />
          {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
          <button onClick={entrar} className="mt-4 h-11 w-full rounded bg-ink text-sm font-semibold text-white transition hover:opacity-90">Entrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface px-8 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink"><span className="font-display text-[15px] font-bold text-white">V</span></div>
          <span className="font-display text-[17px] font-bold tracking-tight">VIM Plataforma</span>
          <span className="ml-2 rounded-full bg-sel px-2 py-0.5 text-[11px] font-semibold text-ink-3">Provisioning</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1100px] grid-cols-[400px_1fr] gap-8 p-8">
        {/* Alta de cliente */}
        <section>
          <h2 className="mb-1 font-display text-[18px] font-semibold tracking-tight">Nuevo cliente</h2>
          <p className="mb-4 text-[12.5px] text-ink-3">Crea el tenant y la cuenta del dueño. Queda en TRIAL, fase INVITADO.</p>
          <div className="flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-5">
            <div>
              <label className={label} htmlFor="codigo">Código (slug)</label>
              <input id="codigo" className={input} value={codigo} maxLength={50}
                onChange={(e) => setCodigo(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="knockout-burger" />
            </div>
            <div>
              <label className={label} htmlFor="nombre">Nombre comercial</label>
              <input id="nombre" className={input} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} placeholder="Knock-Out Burger" />
            </div>
            <div>
              <label className={label} htmlFor="vertical">Vertical</label>
              <select id="vertical" className={input} value={vertical} onChange={(e) => setVertical(e.target.value)}>
                {VERTICALES.map((x) => <option key={x.v} value={x.v}>{x.l} · plan {x.plan}</option>)}
              </select>
            </div>
            <div className="h-px bg-line" />
            <div>
              <label className={label} htmlFor="on">Nombre del dueño</label>
              <input id="on" className={input} value={ownerNombre} maxLength={150} onChange={(e) => setOwnerNombre(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="oe">Correo del dueño</label>
              <input id="oe" type="email" className={input} value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="dueno@negocio.mx" />
            </div>
            <div>
              <label className={label} htmlFor="ot">Teléfono · <span className="text-ink-3">opcional</span></label>
              <input id="ot" className={input} value={ownerTel} maxLength={20} onChange={(e) => setOwnerTel(e.target.value)} />
            </div>

            {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
            {resultado && (
              <div className="rounded border border-[#D6E8DD] bg-[#EAF3EE] px-3 py-2.5 text-[12.5px] text-success">
                <div className="font-semibold">Cliente <b>{resultado.codigo}</b> creado.</div>
                <div className="mt-1 text-ink-2">Dueño: {resultado.email}</div>
                {resultado.pass && <div className="mt-0.5 text-ink-2">Contraseña temporal: <code className="font-mono">{resultado.pass}</code> (comunícala al cliente)</div>}
              </div>
            )}

            <button onClick={provisionar} disabled={creando}
              className="mt-1 h-11 w-full rounded bg-ink text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
              {creando ? "Creando…" : "Provisionar cliente"}
            </button>
          </div>
        </section>

        {/* Lista de tenants */}
        <section>
          <h2 className="mb-1 font-display text-[18px] font-semibold tracking-tight">Clientes ({tenants.length})</h2>
          <p className="mb-4 text-[12.5px] text-ink-3">Todos los tenants provisionados.</p>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Nombre</th>
                  <th className="px-4 py-2.5">Vertical</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-3">Sin clientes todavía.</td></tr>
                )}
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 font-mono text-[12px]">{t.codigo}</td>
                    <td className="px-4 py-2.5 font-medium">{t.nombre_comercial}</td>
                    <td className="px-4 py-2.5 text-ink-2">{t.vertical_principal}</td>
                    <td className="px-4 py-2.5">
                      <span className={[
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        t.estado === "ACTIVO" ? "bg-[#EAF3EE] text-success" : t.estado === "TRIAL" ? "bg-[#FBF0EC] text-[#CF4525]" : "bg-sel text-ink-3",
                      ].join(" ")}>{t.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
