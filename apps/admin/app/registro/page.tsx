"use client";
import { useState, type FormEvent } from "react";
import { Button, LogoVim } from "@vim/ui/styles";
import { errorDeRegistro, telefonoMx10 } from "@vim/db/registro";
import { mensajeError } from "../lib/errores";
import { ERRORES_REGISTRO, registrarNegocio } from "../lib/registro";
import { Captcha, SITE_KEY_TURNSTILE } from "../components/captcha";
import { ReenviarConfirmacion } from "../components/reenviar-confirmacion";

// Registro PÚBLICO desde el sitio (0142, ADR 0022): contacto obligatorio, términos aceptados,
// captcha y correo verificado. Al terminar NO entra: le llega un enlace para confirmar su correo.
const TERMINOS_URL = "https://vimpos.com.mx/terminos";
const AVISO_URL = "https://vimpos.com.mx/aviso-privacidad";

// Los valores son los de la base; las etiquetas, como las diría el dueño (antes en inglés).
const VERTICALES = [
  { v: "QUICK_SERVICE", l: "Comida rápida · hamburguesas, pizza, pollo" },
  { v: "FULL_SERVICE", l: "Restaurante con meseros" },
  { v: "CAFE_BAR", l: "Cafetería o bar" },
  { v: "DARK_KITCHEN", l: "Cocina solo para apps de entrega" },
  { v: "FOODTRUCK", l: "Food truck" },
  { v: "ENTERPRISE", l: "Cadena con varias sucursales" },
];

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
  "w-full rounded border border-line-strong bg-surface px-[13px] py-3 text-15 outline-none transition-[border-color,box-shadow] focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-[7px] block text-14 font-medium text-ink-2";
const ayuda = "mt-1.5 text-13 text-ink-2";

export default function RegistroPage() {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
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
  const [ciudad, setCiudad] = useState("");
  const [pass, setPass] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [reinicioCaptcha, setReinicioCaptcha] = useState(0);
  // Paso 3: a qué correo se mandó la confirmación, y si de verdad salió.
  const [enviadoA, setEnviadoA] = useState("");
  const [correoSalio, setCorreoSalio] = useState(true);

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
    const correo = email.trim().toLowerCase();
    const falta = errorDeRegistro({
      nombre_owner: nombreOwner, telefono_owner: tel, email_owner: correo, ciudad, password: pass, acepta_terminos: acepta,
    });
    if (falta) { setError(falta); return; }
    if (SITE_KEY_TURNSTILE && !captcha) {
      setError("Estamos comprobando que no eres un robot. Intenta de nuevo en un segundo.");
      return;
    }

    setCreando(true);
    try {
      const r = await registrarNegocio({
        codigo,
        nombre_comercial: nombre.trim(),
        vertical,
        nombre_owner: nombreOwner.trim(),
        telefono_owner: telefonoMx10(tel) ?? "",
        email_owner: correo,
        ciudad: ciudad.trim(),
        password: pass,
        acepta_terminos: acepta,
        captcha,
      });
      if (!r.ok) {
        if (r.error === "EMAIL_YA_REGISTRADO") {
          setYaTieneCuenta(true);
        } else if (r.error === "CODIGO_YA_USADO" || r.error === "CODIGO_INVALIDO") {
          // El error es del paso 1: volver ahí, donde está el campo.
          setPaso(1);
          setError(ERRORES_REGISTRO[r.error]!);
        } else {
          setError(ERRORES_REGISTRO[r.error ?? ""] ?? r.detalle ?? "No se pudo crear la cuenta. Intenta de nuevo.");
        }
        return;
      }
      // Ya no entra solo: primero confirma su correo (el enlace lo lleva a la primera vez).
      setPass("");
      setEnviadoA(correo);
      setCorreoSalio(r.correoEnviado !== false);
      setPaso(3);
    } catch (err) {
      setError(mensajeError(err, "Sin conexión. Revisa tu internet e intenta de nuevo."));
    } finally {
      setCreando(false);
      setReinicioCaptcha((n) => n + 1);   // el token ya se usó
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-sel px-5 py-10 sm:p-6">
      <div className="flex w-full max-w-[460px] flex-col">
        <div className="mb-8 flex flex-col items-center gap-4">
          <LogoVim className="h-[46px] w-[46px]" />
          <div className="font-display text-20 font-bold tracking-tight">VIM POS<span className="text-accent">.</span></div>
        </div>

        <div className="mb-6 text-center">
          <h1 className="mb-1.5 font-display text-28 font-semibold tracking-tight">{paso === 3 ? "Revisa tu correo" : "Prueba VIM POS 30 días"}</h1>
          <p className="text-15 text-ink-2">
            {paso === 1 ? "Cuéntanos de tu negocio · paso 1 de 2" : paso === 2 ? "Crea tu cuenta de dueño · paso 2 de 2" : "Ya casi: confirma tu correo"}
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
                <label className={label} htmlFor="tel">Tu WhatsApp</label>
                <input id="tel" type="tel" inputMode="tel" className={input} value={tel} maxLength={20} autoComplete="tel"
                  aria-describedby="tel-ayuda" onChange={(e) => setTel(e.target.value)} placeholder="477 123 4567" />
                <p id="tel-ayuda" className={ayuda}>10 dígitos. Por aquí te escribimos si algo sale mal con tu cuenta.</p>
              </div>
              <div>
                <label className={label} htmlFor="ciudad">Ciudad</label>
                <input id="ciudad" className={input} value={ciudad} maxLength={80} autoComplete="address-level2"
                  onChange={(e) => setCiudad(e.target.value)} placeholder="León, Gto." />
              </div>
              <div>
                <label className={label} htmlFor="pass">Contraseña</label>
                <input id="pass" type="password" className={input} value={pass} autoComplete="new-password"
                  aria-describedby="pass-ayuda" onChange={(e) => setPass(e.target.value)} />
                <p id="pass-ayuda" className={ayuda}>Mínimo 8 caracteres.</p>
              </div>

              <label className="flex items-start gap-2.5 text-14 text-ink-2">
                <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)}
                  className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 accent-[rgb(var(--accent))]" />
                <span>
                  Acepto los{" "}
                  <a href={TERMINOS_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-2">términos</a>{" "}
                  y el{" "}
                  <a href={AVISO_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-2">aviso de privacidad</a>.
                </span>
              </label>

              <Captcha onToken={setCaptcha} reinicio={reinicioCaptcha} />

              {yaTieneCuenta && (
                <p className="rounded border border-line-strong bg-sel px-3 py-2.5 text-14 text-ink-2" role="alert">
                  Ese correo ya tiene una cuenta.{" "}
                  <a href="/" className="font-semibold text-ink underline underline-offset-2">Inicia sesión</a>
                  {" "}(si no la has confirmado, ahí mismo puedes pedir otro correo).
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

          {paso === 3 && (
            <div className="flex flex-col gap-4">
              {correoSalio ? (
                <p className="text-15 text-ink-2">
                  Te mandamos un correo a <b className="break-all text-ink">{enviadoA}</b> para confirmar tu cuenta. Abre el enlace y
                  entras directo a configurar tu negocio.
                </p>
              ) : (
                <p className="text-15 text-ink-2">
                  Tu cuenta quedó creada, pero no pudimos mandar el correo a <b className="break-all text-ink">{enviadoA}</b>. Pide que te
                  lo reenviemos:
                </p>
              )}
              <p className="text-13 text-ink-3">
                Si no llega en unos minutos, revisa la carpeta de spam o promociones. Tu prueba de 30 días ya empezó.
              </p>
              <ReenviarConfirmacion email={enviadoA} />
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-14 text-ink-2">
          ¿Ya tienes cuenta? <a href="/" className="font-medium text-ink underline-offset-2 hover:underline">Inicia sesión</a>
        </p>
      </div>
    </main>
  );
}
