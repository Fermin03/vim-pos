"use client";
// Entrar, crear cuenta y recuperar la contraseña. Formularios cortos, una acción principal cada uno,
// y enlaces entre ellos que conservan a dónde iba el cliente (`volver`, ya validado en el servidor).
// Aquí solo se pinta: las reglas de los campos y las palabras de cada error están en lib/cuenta.ts.
//
// Al entrar (o salir) se navega con una carga completa, no con el enrutador: el marco del negocio
// se pinta en el servidor mirando la cookie, y solo así cambia «Entrar» por «Mi cuenta».
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Aviso, Captcha, SITE_KEY_TURNSTILE, botonClases, cn, type AccionCaptcha } from "@vim/ui/styles";
import { entrar, recuperarAplicar, recuperarPedir, registrar } from "../lib/api";
import { FORMULARIOS, LIMITES_DE_CUENTA, PASSWORD, datosDeRegistro, enlaceDeAcceso, erroresDeCuenta, pasoDelEnlace, textoDeCuenta } from "../lib/cuenta";
import { CampoDePassword, CampoDeTexto, useAccion, useCampos } from "./campo";
import { FOCO, PARTE, PRINCIPAL } from "./piezas";

const ENLACE = cn("inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4", FOCO);
const GHOST = cn(botonClases({ variant: "ghost" }), "h-12 w-full");
const AYUDA_DE_PASSWORD = `Mínimo ${PASSWORD.min} caracteres.`;

/** Carga completa hacia `ruta`. La promesa no termina: el botón sigue ocupado hasta que la página cambia. */
export function irA(ruta: string): Promise<never> {
  location.replace(ruta);
  return new Promise(() => {});
}

/** «Seguir sin cuenta»: a donde iba, salvo que fuera «Mi cuenta» (sin cuenta, de ahí lo regresarían aquí): entonces, al menú. */
const sinCuenta = (slug: string, volver: string): string => (volver.startsWith(`/${slug}/cuenta`) ? `/${slug}` : volver);

/** El marco de las tres pantallas: título, una línea de apoyo y el contenido. El foco llega al título. */
function Pantalla({ titulo, apoyo, children }: { titulo: string; apoyo?: ReactNode; children: ReactNode }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  // Al título, no a un campo: el teclado no se abre solo. Y al cambiar de paso, quien no ve la pantalla lo oye.
  useEffect(() => { h1.current?.focus(); }, [titulo]);
  return (
    <main className="flex flex-col gap-5 px-4 pb-10">
      <header className="flex flex-col gap-2">
        <h1 ref={h1} tabIndex={-1} className="font-display text-24 font-semibold leading-tight outline-none">{titulo}</h1>
        {apoyo && <p className={cn("text-16 leading-relaxed text-ink-2", PARTE)}>{apoyo}</p>}
      </header>
      {children}
    </main>
  );
}

function Enviar({ ocupado, haciendo, children }: { ocupado: boolean; haciendo: string; children: string }) {
  return (
    <>
      <p aria-live="polite" className="sr-only">{ocupado ? haciendo : ""}</p>
      <button type="submit" disabled={ocupado} aria-busy={ocupado} className={cn(PRINCIPAL, "h-14 w-full px-5 text-16")}>{ocupado ? haciendo : children}</button>
    </>
  );
}

const alEnviar = (hacer: () => void) => (e: FormEvent) => { e.preventDefault(); hacer(); };

/**
 * El antirobot de un formulario. `esperar` entrega el token (vacío si no hay llave: en local la
 * función tampoco lo comprueba) o null si no llegó a tiempo. Un token sirve una vez: `gastar` pide otro.
 */
function useAntirobot(accion: AccionCaptcha) {
  const token = useRef("");
  const [reinicio, setReinicio] = useState(0);
  return {
    widget: <Captcha onToken={(t) => { token.current = t; }} accion={accion} reinicio={reinicio} />,
    // ponytail: espera mirando cada 200 ms, hasta 20 s; con una promesa por token sobraría, y esto se lee.
    async esperar(): Promise<string | null> {
      if (!SITE_KEY_TURNSTILE) return "";
      for (let i = 0; i < 100 && !token.current; i++) await new Promise((r) => setTimeout(r, 200));
      return token.current || null;
    },
    gastar() { token.current = ""; setReinicio((n) => n + 1); },
  };
}

// ── Entrar ───────────────────────────────────────────────────────────────────────────────────────
export function Entrar({ slug, negocio, volver }: { slug: string; negocio: string; volver: string }) {
  const campos = useCampos(FORMULARIOS.entrar, { email: "", passwordActual: "" }, (f) => erroresDeCuenta(FORMULARIOS.entrar, f));
  const accion = useAccion();
  const enviar = () => {
    if (!campos.revisar()) return;
    void accion.correr(async () => {
      const r = await entrar(slug, campos.f.email.trim().toLowerCase(), campos.f.passwordActual);
      return r.ok ? irA(volver) : textoDeCuenta(r.error);
    });
  };
  return (
    <Pantalla titulo="Entrar" apoyo={`Con tu cuenta de ${negocio} no vuelves a escribir tus datos.`}>
      <form noValidate onSubmit={alEnviar(enviar)} className="flex flex-col gap-4">
        <CampoDeTexto {...campos.de("email")} etiqueta="Correo" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={LIMITES_DE_CUENTA.email} />
        <CampoDePassword {...campos.de("passwordActual")} etiqueta="Contraseña" />
        {/* Un solo error para todo: no dice si falló el correo o la contraseña, ni si la cuenta existe. */}
        {accion.error && <Aviso tono="danger" role="alert" className="!text-14">{accion.error}</Aviso>}
        <Enviar ocupado={accion.ocupado} haciendo="Entrando…">Entrar</Enviar>
      </form>
      <nav aria-label="Otras opciones" className="flex flex-col items-start text-15">
        <Link href={enlaceDeAcceso(slug, "recuperar", volver)} className={ENLACE}>¿Olvidaste tu contraseña?</Link>
        <Link href={enlaceDeAcceso(slug, "registro", volver)} className={ENLACE}>Crear cuenta</Link>
        <Link href={sinCuenta(slug, volver)} className={cn(ENLACE, "font-normal text-ink-2")}>Seguir sin cuenta</Link>
      </nav>
    </Pantalla>
  );
}

// ── Crear cuenta ─────────────────────────────────────────────────────────────────────────────────
const REGISTRO_VACIO = { nombre: "", apellido: "", email: "", telefono: "", password: "" };

export function Registro({ slug, negocio, volver }: { slug: string; negocio: string; volver: string }) {
  const campos = useCampos(FORMULARIOS.registro, REGISTRO_VACIO, (f) => erroresDeCuenta(FORMULARIOS.registro, f));
  const accion = useAccion();
  const robot = useAntirobot("tienda_registro");
  /** El correo al que se le escribió, cuando la respuesta no trajo cuenta. */
  const [porCorreo, setPorCorreo] = useState<string | null>(null);

  const enviar = () => {
    if (!campos.revisar()) return;
    void accion.correr(async () => {
      const captcha = await robot.esperar();
      if (captcha === null) return textoDeCuenta("CAPTCHA_INVALIDO");
      const datos = datosDeRegistro(campos.f);
      const r = await registrar(slug, { ...datos, captcha });
      robot.gastar();
      if (!r.ok) return textoDeCuenta(r.error);
      if (r.datos.cuenta) return irA(volver);
      setPorCorreo(datos.email);
      return null;
    });
  };

  // Sin cuenta en la respuesta: el mismo camino que un alta que pidiera confirmar. No se dice por qué.
  if (porCorreo) {
    return (
      <Pantalla titulo="Revisa tu correo para continuar" apoyo={<>Te escribimos a <strong className="font-semibold text-ink">{porCorreo}</strong> con lo que sigue. Si no lo ves en unos minutos, revisa también tu correo no deseado.</>}>
        <div className="flex flex-col gap-2">
          <Link href={enlaceDeAcceso(slug, "entrar", volver)} className={GHOST}>Entrar</Link>
          <Link href={sinCuenta(slug, volver)} className={cn(ENLACE, "self-center text-15")}>Seguir sin cuenta</Link>
        </div>
      </Pantalla>
    );
  }

  const largo = Array.from(campos.f.password).length;
  return (
    <Pantalla titulo="Crear cuenta" apoyo={`Guarda tus datos y tus direcciones en ${negocio}, y vuelve a pedir lo de siempre en un toque.`}>
      <form noValidate onSubmit={alEnviar(enviar)} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <CampoDeTexto {...campos.de("nombre")} etiqueta="Nombre" autoComplete="given-name" autoCapitalize="words" maxLength={LIMITES_DE_CUENTA.nombre} />
          <CampoDeTexto {...campos.de("apellido")} etiqueta="Apellido" autoComplete="family-name" autoCapitalize="words" maxLength={LIMITES_DE_CUENTA.apellido} />
        </div>
        <CampoDeTexto {...campos.de("email")} etiqueta="Correo" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={LIMITES_DE_CUENTA.email} />
        <CampoDeTexto {...campos.de("telefono")} etiqueta="Teléfono" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={LIMITES_DE_CUENTA.telefono} ayuda="10 dígitos, con lada." />
        <CampoDePassword {...campos.de("password")} etiqueta="Contraseña" nueva
          ayuda={largo >= PASSWORD.min ? `Bien: tiene ${PASSWORD.min} caracteres o más.` : largo > 0 ? `${AYUDA_DE_PASSWORD} Llevas ${largo}.` : AYUDA_DE_PASSWORD} />
        <p className="text-13 leading-relaxed text-ink-2">
          Al crear tu cuenta aceptas el{" "}
          <Link href={`/${slug}/privacidad`} target="_blank" rel="noopener" className={cn("font-medium text-ink underline underline-offset-4", FOCO)}>aviso de privacidad</Link>.
        </p>
        {robot.widget}
        {accion.error && <Aviso tono="danger" role="alert" className="!text-14">{accion.error}</Aviso>}
        <Enviar ocupado={accion.ocupado} haciendo="Creando tu cuenta…">Crear cuenta</Enviar>
      </form>
      <nav aria-label="Otras opciones" className="flex flex-col items-start text-15">
        <Link href={enlaceDeAcceso(slug, "entrar", volver)} className={ENLACE}>Ya tengo cuenta: entrar</Link>
        <Link href={sinCuenta(slug, volver)} className={cn(ENLACE, "font-normal text-ink-2")}>Seguir sin cuenta</Link>
      </nav>
    </Pantalla>
  );
}

// ── Recuperar la contraseña ──────────────────────────────────────────────────────────────────────
/**
 * Sin enlace pide el correo; con el enlace del correo (`#t=<token>`) pide la contraseña nueva. El
 * token va en el fragmento, que el servidor nunca ve: qué paso toca se sabe aquí, al montar.
 */
export function Recuperar({ slug, volver }: { slug: string; volver: string }) {
  // El token vive solo aquí, en memoria: sale de la barra de direcciones (y de esa entrada del
  // historial) en cuanto se lee, para que no quede en una captura, en un marcador ni en lo que se comparta.
  const token = useRef<string | null>(null);
  // null = todavía no se sabe si hay enlace (el servidor no lo ve): no se pinta ningún paso, para
  // no enseñar «pedir enlace» un instante a quien llega con uno.
  const [paso, setPaso] = useState<"pedir" | "enviado" | "nueva" | "invalido" | null>(null);
  useEffect(() => {
    const leer = () => {
      const enlace = pasoDelEnlace(location.hash);
      // Sin enlace solo se decide la primera vez: en desarrollo este efecto corre dos veces, y la
      // segunda ya no lo encuentra en la barra.
      if (enlace.paso === "pedir") { setPaso((p) => p ?? "pedir"); return; }
      token.current = enlace.paso === "nueva" ? enlace.token : null;
      history.replaceState(null, "", location.pathname + location.search);
      setPaso(enlace.paso);
    };
    leer();
    // Abrir el enlace del correo en esta misma pestaña solo cambia el fragmento: la página no se recarga.
    addEventListener("hashchange", leer);
    return () => removeEventListener("hashchange", leer);
  }, []);

  const correo = useCampos(FORMULARIOS.recuperar, { email: "" }, (f) => erroresDeCuenta(FORMULARIOS.recuperar, f));
  const nueva = useCampos(FORMULARIOS.nuevaPassword, { password: "" }, (f) => erroresDeCuenta(FORMULARIOS.nuevaPassword, f));
  const accion = useAccion();
  const robot = useAntirobot("tienda_recuperar");

  const pedir = () => {
    if (!correo.revisar()) return;
    void accion.correr(async () => {
      const captcha = await robot.esperar();
      if (captcha === null) return textoDeCuenta("CAPTCHA_INVALIDO");
      const r = await recuperarPedir(slug, correo.f.email.trim().toLowerCase(), captcha);
      robot.gastar();
      if (!r.ok) return textoDeCuenta(r.error);
      setPaso("enviado");
      return null;
    });
  };
  const aplicar = () => {
    if (!nueva.revisar()) return;
    const t = token.current;
    if (!t) { setPaso("invalido"); return; }
    void accion.correr(async () => {
      const r = await recuperarAplicar(slug, t, nueva.f.password);
      if (r.ok) return irA(`/${slug}/cuenta`);
      if (r.error === "ENLACE_INVALIDO") { setPaso("invalido"); return null; }
      return textoDeCuenta(r.error);
    });
  };

  if (paso === null) return <main aria-busy="true" className="min-h-64 px-4 pb-10" />;
  if (paso === "invalido") {
    return (
      <Pantalla titulo="Este enlace ya no sirve" apoyo="Los enlaces para cambiar la contraseña duran 30 minutos y funcionan una sola vez. Pide uno nuevo.">
        <button type="button" onClick={() => setPaso("pedir")} className={cn(PRINCIPAL, "h-14 w-full px-5 text-16")}>Pedir otro enlace</button>
      </Pantalla>
    );
  }
  if (paso === "enviado") {
    // La misma respuesta exista o no la cuenta: aquí nadie averigua quién es cliente.
    return (
      <Pantalla titulo="Revisa tu correo" apoyo="Si hay una cuenta con ese correo, te mandamos un enlace. Revisa también tu correo no deseado.">
        <Link href={enlaceDeAcceso(slug, "entrar", volver)} className={GHOST}>Volver a entrar</Link>
      </Pantalla>
    );
  }
  if (paso === "nueva") {
    const largo = Array.from(nueva.f.password).length;
    return (
      <Pantalla titulo="Elige una contraseña nueva" apoyo="Al guardarla entras a tu cuenta y se cierran las sesiones que tuvieras abiertas en otros dispositivos.">
        <form noValidate onSubmit={alEnviar(aplicar)} className="flex flex-col gap-4">
          <CampoDePassword {...nueva.de("password")} etiqueta="Contraseña nueva" nueva
            ayuda={largo >= PASSWORD.min ? `Bien: tiene ${PASSWORD.min} caracteres o más.` : AYUDA_DE_PASSWORD} />
          {accion.error && <Aviso tono="danger" role="alert" className="!text-14">{accion.error}</Aviso>}
          <Enviar ocupado={accion.ocupado} haciendo="Guardando…">Guardar y entrar</Enviar>
        </form>
      </Pantalla>
    );
  }
  return (
    <Pantalla titulo="Recuperar tu contraseña" apoyo="Escribe el correo de tu cuenta y te mandamos un enlace para elegir una contraseña nueva.">
      <form noValidate onSubmit={alEnviar(pedir)} className="flex flex-col gap-4">
        <CampoDeTexto {...correo.de("email")} etiqueta="Correo" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={LIMITES_DE_CUENTA.email} />
        {robot.widget}
        {accion.error && <Aviso tono="danger" role="alert" className="!text-14">{accion.error}</Aviso>}
        <Enviar ocupado={accion.ocupado} haciendo="Enviando…">Mandarme el enlace</Enviar>
      </form>
      <nav aria-label="Otras opciones" className="flex flex-col items-start text-15">
        <Link href={enlaceDeAcceso(slug, "entrar", volver)} className={ENLACE}>Volver a entrar</Link>
      </nav>
    </Pantalla>
  );
}
