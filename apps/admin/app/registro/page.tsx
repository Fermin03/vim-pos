"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { entrar } from "../lib/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const VERTICALES = [
  { v: "QUICK_SERVICE", l: "Quick Service · hamburguesas, pizza, pollo" },
  { v: "FULL_SERVICE", l: "Full Service · restaurante con mesero" },
  { v: "CAFE_BAR", l: "Café & Bar" },
  { v: "DARK_KITCHEN", l: "Dark Kitchen · solo apps" },
  { v: "FOODTRUCK", l: "Foodtruck" },
  { v: "ENTERPRISE", l: "Enterprise · cadena multi-sucursal" },
];

const ERR_LABELS: Record<string, string> = {
  EMAIL_YA_REGISTRADO: "Ese correo ya tiene una cuenta. Inicia sesión.",
  CODIGO_YA_USADO: "Ese código ya está en uso. Prueba otro.",
  EMAIL_INVALIDO: "Correo inválido.",
  PASSWORD_DEBIL: "La contraseña debe tener al menos 8 caracteres.",
  CODIGO_INVALIDO: "El código solo lleva minúsculas, números y guiones (3-50).",
  VERTICAL_INVALIDA: "Tipo de negocio inválido.",
};

const input =
  "w-full rounded border border-line-strong bg-surface px-[13px] py-3 text-[15px] outline-none transition focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-[7px] block text-[13px] font-medium text-ink-2";

export default function RegistroPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paso 1: negocio
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [vertical, setVertical] = useState("QUICK_SERVICE");
  // Paso 2: dueño
  const [nombreOwner, setNombreOwner] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [pass, setPass] = useState("");

  function siguiente() {
    setError(null);
    if (codigo.length < 3 || !/^[a-z0-9-]+$/.test(codigo)) {
      setError("Código inválido (mínimo 3, solo minúsculas/números/guiones)");
      return;
    }
    if (!nombre.trim()) { setError("Nombre comercial obligatorio"); return; }
    setPaso(2);
  }

  async function registrar() {
    setError(null);
    if (!nombreOwner.trim()) { setError("Tu nombre es obligatorio"); return; }
    if (!email.trim()) { setError("Correo obligatorio"); return; }
    if (pass.length < 8) { setError("Contraseña mínimo 8 caracteres"); return; }

    setCreando(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/signup-tenant`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          nombre_comercial: nombre.trim(),
          nombre_owner: nombreOwner.trim(),
          email_owner: email.trim().toLowerCase(),
          telefono_owner: tel.trim() || null,
          vertical,
          password: pass,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(ERR_LABELS[data.error] ?? data.detalle ?? data.error ?? "No se pudo crear la cuenta");
        setCreando(false);
        return;
      }
      // Login automático para que entre directo a su admin nuevo.
      await entrar(email.trim().toLowerCase(), pass);
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
      setCreando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-sel p-6">
      <div className="flex w-full max-w-[460px] flex-col">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="relative flex h-[46px] w-[46px] items-center justify-center rounded-[11px] bg-ink">
            <span className="font-display text-2xl font-bold leading-none tracking-tight text-white">V</span>
            <span className="absolute bottom-[9px] right-2 h-[5px] w-[5px] rounded-full bg-accent" />
          </div>
          <div className="font-display text-[19px] font-bold tracking-tight">VIM POS<span className="text-accent">.</span></div>
        </div>

        <div className="mb-6 text-center">
          <h1 className="mb-1.5 font-display text-[26px] font-semibold tracking-tight">Empieza con VIM POS</h1>
          <p className="text-sm text-ink-2">
            {paso === 1 ? "Cuéntanos de tu negocio" : "Crea tu cuenta de dueño"} · paso {paso} de 2
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6">
          {paso === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className={label} htmlFor="codigo">Código del negocio (slug)</label>
                <input id="codigo" className={input} value={codigo} maxLength={50}
                  onChange={(e) => setCodigo(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="knockout-burger" />
                <p className="mt-1.5 text-[11.5px] text-ink-3">Usado en subdominios y prefijos de folio. Mínimo 3 caracteres.</p>
              </div>
              <div>
                <label className={label} htmlFor="nombre">Nombre comercial</label>
                <input id="nombre" className={input} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} placeholder="Knock-Out Burger" />
              </div>
              <div>
                <label className={label} htmlFor="vertical">Tipo de negocio</label>
                <select id="vertical" className={input} value={vertical} onChange={(e) => setVertical(e.target.value)}>
                  {VERTICALES.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                </select>
              </div>

              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}

              <Button size="lg" className="mt-1 w-full" onClick={siguiente}>Continuar</Button>
            </div>
          )}

          {paso === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className={label} htmlFor="on">Tu nombre</label>
                <input id="on" className={input} value={nombreOwner} maxLength={150} onChange={(e) => setNombreOwner(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="email">Correo electrónico</label>
                <input id="email" type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@negocio.mx" />
              </div>
              <div>
                <label className={label} htmlFor="tel">Teléfono · <span className="text-ink-3">opcional</span></label>
                <input id="tel" className={input} value={tel} maxLength={20} onChange={(e) => setTel(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="pass">Contraseña</label>
                <input id="pass" type="password" className={input} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="mínimo 8 caracteres" />
              </div>

              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}

              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setPaso(1)} disabled={creando}>Atrás</Button>
                <Button size="lg" className="flex-1" onClick={registrar} disabled={creando}>
                  {creando ? "Creando…" : "Crear mi cuenta"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[13px] text-ink-3">
          ¿Ya tienes cuenta? <a href="/" className="font-medium text-ink underline-offset-2 hover:underline">Inicia sesión</a>
        </p>
      </div>
    </main>
  );
}
