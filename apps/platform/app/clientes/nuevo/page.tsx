"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSesion } from "../../lib/sesion";
import { VERTICALES, fmtMxn, input, label } from "../../lib/formato";
import type { Plan } from "../../lib/tipos";

/** Nombre comercial → slug: minúsculas, sin acentos, guiones en vez de espacios. */
function aSlug(texto: string): string {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // quita acentos y diéresis
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function NuevoClientePage() {
  const { api } = useSesion();
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  // El código se deriva del nombre mientras nadie lo edite a mano. Se tecleaba aparte y ya costó
  // un "vim-pruevas" que quedó permanente: el código va en URLs y datos, y corregirlo después es
  // más caro que evitarlo. Quien necesite otro distinto lo escribe y deja de derivarse.
  const [codigoTocado, setCodigoTocado] = useState(false);
  const [ownerNombre, setOwnerNombre] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerTel, setOwnerTel] = useState("");
  const [vertical, setVertical] = useState("QUICK_SERVICE");
  // El plan sale del catálogo de la base, no de una lista escrita aquí: los precios los cambia
  // una migración y el panel tiene que enseñar los vigentes sin que nadie recuerde tocar este
  // archivo. Arranca en Negocio, que es el que se recomienda en la página de precios.
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [planCodigo, setPlanCodigo] = useState("NEGOCIO");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ email: string } | null>(null);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const lista = ((await api("/api/planes")).planes ?? []) as Plan[];
        setPlanes(lista);
        // Si el catálogo cambiara y Negocio ya no existiera, se cae al primero antes que
        // mandar un código que el provisioning no reconoce.
        if (lista.length > 0 && !lista.some((p) => p.codigo === "NEGOCIO")) setPlanCodigo(lista[0]!.codigo);
      } catch {
        /* el error se ve al intentar crear; no vale la pena un aviso extra en el formulario */
      }
    })();
  }, [api]);

  async function provisionar() {
    setError(null); setResultado(null);
    if (!codigo || !nombre || !ownerNombre || !ownerEmail) { setError("Completa código, nombre, dueño y correo"); return; }
    if (!planCodigo) { setError("Elige un plan"); return; }
    setCreando(true);
    try {
      const data = await api("/api/provisionar", {
        method: "POST",
        body: JSON.stringify({ codigo, nombre_comercial: nombre, nombre_owner: ownerNombre, email_owner: ownerEmail, telefono_owner: ownerTel, vertical, plan_codigo: planCodigo }),
      });
      if (!data.ok) throw new Error(String(data.detalle ?? data.error ?? "No se pudo crear"));
      setResultado({ email: ownerEmail });
      setCodigo(""); setNombre(""); setCodigoTocado(false); setOwnerNombre(""); setOwnerEmail(""); setOwnerTel("");
      setTimeout(() => router.push("/clientes"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="max-w-[460px]">
      <h1 className="mb-1 font-display text-[18px] font-semibold tracking-tight">Nuevo cliente</h1>
      <p className="mb-4 text-[12.5px] text-ink-3">Da de alta el negocio y la cuenta de su dueño. Queda en periodo de prueba, y al dueño le llega una invitación por correo para entrar.</p>
      <div className="flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-5">
        <div>
          <label className={label} htmlFor="codigo">Código (slug)</label>
          <input id="codigo" className={input} value={codigo} maxLength={50} onChange={(e) => { setCodigoTocado(true); setCodigo(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} placeholder="knockout-burger" />
        </div>
        <div>
          <label className={label} htmlFor="nombre">Nombre comercial</label>
          <input id="nombre" className={input} value={nombre} maxLength={150} onChange={(e) => { const v = e.target.value; setNombre(v); if (!codigoTocado) setCodigo(aSlug(v)); }} placeholder="Knock-Out Burger" />
        </div>
        <div>
          <label className={label} htmlFor="vertical">Vertical</label>
          <select id="vertical" className={input} value={vertical} onChange={(e) => setVertical(e.target.value)}>
            {VERTICALES.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
          </select>
          <p className="mt-1 text-[12px] text-ink-3">Configura el producto. No influye en el precio.</p>
        </div>
        <div>
          <label className={label} htmlFor="plan">Plan</label>
          <select id="plan" className={input} value={planCodigo} onChange={(e) => setPlanCodigo(e.target.value)}>
            {planes.length === 0 && <option value="">Cargando…</option>}
            {planes.map((p) => <option key={p.id} value={p.codigo}>{p.nombre} · {fmtMxn(Number(p.precio_mensual_mxn))} al mes</option>)}
          </select>
          <p className="mt-1 text-[12px] text-ink-3">Esto es lo que paga. Los precios son los publicados en el sitio.</p>
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
          <label className={label} htmlFor="ot">Teléfono · opcional</label>
          <input id="ot" className={input} value={ownerTel} maxLength={20} onChange={(e) => setOwnerTel(e.target.value)} />
        </div>
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {resultado && (
          <div className="rounded border border-[#D6E8DD] bg-[#EAF3EE] px-3 py-2.5 text-[12.5px] text-success">
            <div className="font-semibold">Cliente creado.</div>
            <div className="mt-1 text-ink-2">Invitación enviada a <b>{resultado.email}</b>. El dueño recibirá un correo para crear su contraseña y entrar al panel.</div>
          </div>
        )}
        <button onClick={provisionar} disabled={creando} className="btn mt-1 h-11 w-full rounded bg-accent text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
          {creando ? "Creando…" : "Provisionar cliente"}
        </button>
      </div>
    </div>
  );
}
