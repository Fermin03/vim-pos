"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, LogoVim } from "@vim/ui/styles";
import { entrar } from "../lib/supabase";
import { mensajeError } from "../lib/errores";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Los valores son los de la base; las etiquetas, como las diría el dueño (antes en inglés).
const VERTICALES = [
  { v: "QUICK_SERVICE", l: "Comida rápida · hamburguesas, pizza, pollo" },
  { v: "FULL_SERVICE", l: "Restaurante con meseros" },
  { v: "CAFE_BAR", l: "Cafetería o bar" },
  { v: "DARK_KITCHEN", l: "Cocina solo para apps de entrega" },
  { v: "FOODTRUCK", l: "Food truck" },
  { v: "ENTERPRISE", l: "Cadena con varias sucursales" },
];

const ERR_LABELS: Record<string, string> = {
  CODIGO_YA_USADO: "Esa dirección ya la usa otro negocio. Prueba con otra.",
  EMAIL_INVALIDO: "Revisa tu correo: parece que le falta algo.",
  PASSWORD_DEBIL: "La contraseña debe tener al menos 8 caracteres.",
  CODIGO_INVALIDO: "La dirección solo lleva minúsculas, números y guiones (de 3 a 50).",
  VERTICAL_INVALIDA: "Elige el tipo de negocio.",
};

/** «Knock-Out Burger» → «knock-out-burger»: sin acentos, minúsculas y guiones. */
function direccionDesde(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

const input =
  "w-full rounded border border-line-strong bg-surface px-[13px] py-3 text-[15px] outline-none transition-[border-color,box-shadow] focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-[7px] block text-[13.5px] font-medium text-ink-2";
const ayuda = "mt-1.5 text-[13px] text-ink-2";

export default function RegistroPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Correo ya registrado: se ofrece entrar en vez de solo decirlo.
  const [yaTieneCuenta, setYaTieneCuenta] = useState(false);

  // Paso 1: negocio. La dirección se sugiere a partir del nombre hasta que la edites.
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoEditado, setCodigoEditado] = useState(false);
  const [vertical, setVertical] = useState("QUICK_SERVICE");
  // Paso 2: dueño
  const [nombreOwner, setNombreOwner] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [pass, setPass] = useState("");

  function cambiarNombre(v: string) {
    setNombre(v);
    if (!codigoEditado) setCodigo(direccionDesde(v));
  }

  function siguiente(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) { setError("Escribe el nombre de tu negocio."); return; }
    if (codigo.length < 3 || !/^[a-z0-9-]+$/.test(codigo)) {
      setError("La dirección necesita al menos 3 caracteres: minúsculas, números y guiones.");
      return;
    }
    setPaso(2);
  }

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setYaTieneCuenta(false);
    if (!nombreOwner.trim()) { setError("Escribe tu nombre."); return; }
    if (!email.trim()) { setError("Escribe tu correo."); return; }
    if (pass.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }

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
        if (data.error === "EMAIL_YA_REGISTRADO") {
          setYaTieneCuenta(true);
        } else if (data.error === "CODIGO_YA_USADO" || data.error === "CODIGO_INVALIDO") {
          // El error es del paso 1: volver ahí, donde está el campo.
          setPaso(1);
          setError(ERR_LABELS[data.error]!);
        } else {
          setError(ERR_LABELS[data.error] ?? data.detalle ?? "No se pudo crear la cuenta. Intenta de nuevo.");
        }
        setCreando(false);
        return;
      }
      // Entra solo y va directo a la lista de pasos: antes caía en un dashboard vacío.
      await entrar(email.trim().toLowerCase(), pass);
      router.replace("/bienvenida");
    } catch (err) {
      setError(mensajeError(err, "Sin conexión. Revisa tu internet e intenta de nuevo."));
      setCreando(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-sel px-5 py-10 sm:p-6">
      <div className="flex w-full max-w-[460px] flex-col">
        <div className="mb-8 flex flex-col items-center gap-4">
          <LogoVim className="h-[46px] w-[46px]" />
          <div className="font-display text-[19px] font-bold tracking-tight">VIM POS<span className="text-accent">.</span></div>
        </div>

        <div className="mb-6 text-center">
          <h1 className="mb-1.5 font-display text-[26px] font-semibold tracking-tight">Empieza con VIM POS</h1>
          <p className="text-[14.5px] text-ink-2">
            {paso === 1 ? "Cuéntanos de tu negocio" : "Crea tu cuenta de dueño"} · paso {paso} de 2
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6">
          {paso === 1 && (
            <form className="flex flex-col gap-4" onSubmit={siguiente} noValidate>
              <div>
                <label className={label} htmlFor="nombre">Nombre de tu negocio</label>
                <input id="nombre" className={input} value={nombre} maxLength={150} autoFocus autoComplete="organization"
                  onChange={(e) => cambiarNombre(e.target.value)} placeholder="Knock-Out Burger" />
              </div>
              <div>
                <label className={label} htmlFor="codigo">Dirección de tu portal de facturas</label>
                <input id="codigo" className={input} value={codigo} maxLength={50} autoCapitalize="none" spellCheck={false}
                  aria-describedby="codigo-ayuda"
                  onChange={(e) => { setCodigoEditado(true); setCodigo(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }}
                  placeholder="knock-out-burger" />
                <p id="codigo-ayuda" className={ayuda}>
                  Tus clientes piden su factura en
                  <span className="block break-all font-medium text-ink">factura.vimpos.com.mx/{codigo || "tu-negocio"}</span>
                </p>
              </div>
              <div>
                <label className={label} htmlFor="vertical">Tipo de negocio</label>
                <select id="vertical" className={input} value={vertical} onChange={(e) => setVertical(e.target.value)}>
                  {VERTICALES.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                </select>
              </div>

              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}

              <Button type="submit" size="lg" className="mt-1 w-full">Continuar</Button>
            </form>
          )}

          {paso === 2 && (
            <form className="flex flex-col gap-4" onSubmit={registrar} noValidate>
              <div>
                <label className={label} htmlFor="on">Tu nombre</label>
                <input id="on" className={input} value={nombreOwner} maxLength={150} autoFocus autoComplete="name"
                  onChange={(e) => setNombreOwner(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="email">Correo electrónico</label>
                <input id="email" type="email" className={input} value={email} autoComplete="email" autoCapitalize="none"
                  onChange={(e) => setEmail(e.target.value)} placeholder="tu@negocio.mx" />
              </div>
              <div>
                <label className={label} htmlFor="tel">Teléfono <span className="font-normal text-ink-2">· opcional</span></label>
                <input id="tel" type="tel" inputMode="tel" className={input} value={tel} maxLength={20} autoComplete="tel"
                  onChange={(e) => setTel(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="pass">Contraseña</label>
                <input id="pass" type="password" className={input} value={pass} autoComplete="new-password"
                  aria-describedby="pass-ayuda" onChange={(e) => setPass(e.target.value)} />
                <p id="pass-ayuda" className={ayuda}>Mínimo 8 caracteres.</p>
              </div>

              {yaTieneCuenta && (
                <p className="rounded border border-line-strong bg-sel px-3 py-2.5 text-[14px] text-ink-2" role="alert">
                  Ese correo ya tiene una cuenta.{" "}
                  <a href="/" className="font-semibold text-ink underline underline-offset-2">Inicia sesión</a>
                </p>
              )}
              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}

              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => { setError(null); setYaTieneCuenta(false); setPaso(1); }} disabled={creando}>Atrás</Button>
                <Button type="submit" size="lg" className="flex-1" disabled={creando}>
                  {creando ? "Creando…" : "Crear mi cuenta"}
                </Button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[14px] text-ink-2">
          ¿Ya tienes cuenta? <a href="/" className="font-medium text-ink underline-offset-2 hover:underline">Inicia sesión</a>
        </p>
      </div>
    </main>
  );
}
