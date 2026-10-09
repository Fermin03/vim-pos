"use client";
// «Mi cuenta»: una página para leer (pedidos, datos, direcciones) donde cada cambio se hace en una
// hoja, con su botón al alcance del pulgar. Lo que más se abre va primero: los pedidos.
// Aquí solo se pinta: reglas, textos y «pedir de nuevo» están en lib/cuenta.ts.
//
// La sesión es una cookie que este código no ve. Si la función dice que ya no vale
// (`SESION_INVALIDA`, el servidor ya la borró), se va a «Entrar» y de ahí se vuelve aquí.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, botonClases, cn } from "@vim/ui/styles";
import {
  borrarDireccion, cambiarPassword, eliminarCuenta, guardarCuenta, guardarDireccion, leerCuenta, misPedidos, salir,
} from "../lib/api";
import type { Cuenta, DireccionGuardada, MiCuenta, PedidoDeCuenta } from "../lib/contrato";
import { LIMITES } from "../lib/cliente";
import {
  FORMULARIOS, LIMITES_DE_CUENTA, PASSWORD, datosDeCuenta, dejarPorRepetir, direccionEnUnaLinea, direccionPorGuardar, enlaceDeAcceso,
  erroresDeCuenta, erroresDeDireccion, fechaDeNacimiento, fechaDePedido, formularioDeCuenta, formularioDeDireccion, rutaDelMenu,
  textoDeCuenta, textoDePasswordActual, type CampoDeDireccion,
} from "../lib/cuenta";
import { formatoMxn } from "../lib/dinero";
import { formatoTelefono } from "../lib/telefono";
import { textoDeEstado } from "../lib/textos";
import { irA } from "./acceso";
import { CampoDePassword, CampoDeTexto, useAccion, useCampos } from "./campo";
import { CUERPO, Hoja, PIE } from "./hoja";
import { FOCO, PARTE, PRINCIPAL } from "./piezas";

type Negocio = { slug: string; nombre: string; sucursales: { id: string; nombre: string }[] };

const TOPE_DE_DIRECCIONES = 5;
const TITULO = "font-display text-18 font-semibold";
const SECCION = "flex flex-col gap-3 border-t border-line py-6";
const GHOST = cn(botonClases({ variant: "ghost" }), "h-12 w-full");
const CHICO = cn(botonClases({ variant: "ghost" }), "h-11 flex-shrink-0 px-4");
const PELIGRO = cn(botonClases({ variant: "danger" }), "h-14 w-full px-5 text-16");
const DE_TEXTO = cn("inline-flex min-h-11 items-center text-15 font-medium text-ink underline underline-offset-4", FOCO);

/** Lo que se dice de un rechazo. Con la sesión terminada no se dice nada: se va a «Entrar» y de ahí se vuelve. */
const rechazoDe = (slug: string, error: string, texto: (codigo: string) => string = textoDeCuenta): string | Promise<never> =>
  error === "SESION_INVALIDA" ? irA(enlaceDeAcceso(slug, "entrar", `/${slug}/cuenta`)) : texto(error);

/** El contenido de una hoja: lo que se desplaza, y abajo el error (junto al pulgar) y los botones. */
function Formulario({ alEnviar, error, pie, children }: { alEnviar: () => void; error: string | null; pie: ReactNode; children: ReactNode }) {
  return (
    <form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={(e: FormEvent) => { e.preventDefault(); alEnviar(); }}>
      <div className={cn(CUERPO, "flex flex-col gap-4 px-4 py-5")}>{children}</div>
      <div className={cn(PIE, "flex flex-col gap-2")}>
        {error && <Aviso tono="danger" role="alert" className="!text-14">{error}</Aviso>}
        {pie}
      </div>
    </form>
  );
}

function Guardar({ ocupado, children }: { ocupado: boolean; children: string }) {
  return (
    <>
      <p aria-live="polite" className="sr-only">{ocupado ? "Guardando…" : ""}</p>
      <button type="submit" disabled={ocupado} aria-busy={ocupado} className={cn(PRINCIPAL, "h-14 w-full px-5 text-16")}>{ocupado ? "Guardando…" : children}</button>
    </>
  );
}

// ── Las hojas ────────────────────────────────────────────────────────────────────────────────────
function EditarDatos({ slug, cuenta, alGuardar }: { slug: string; cuenta: Cuenta; alGuardar: (c: Cuenta) => void }) {
  const campos = useCampos(FORMULARIOS.datos, formularioDeCuenta(cuenta), (f) => erroresDeCuenta(FORMULARIOS.datos, f));
  const accion = useAccion();
  const enviar = () => {
    if (!campos.revisar()) return;
    void accion.correr(async () => {
      const r = await guardarCuenta(slug, datosDeCuenta(campos.f));
      if (!r.ok) return rechazoDe(slug, r.error);
      alGuardar(r.datos);
      return null;
    });
  };
  return (
    <Formulario alEnviar={enviar} error={accion.error} pie={<Guardar ocupado={accion.ocupado}>Guardar mis datos</Guardar>}>
      <div className="grid grid-cols-2 gap-3">
        <CampoDeTexto {...campos.de("nombre")} etiqueta="Nombre" autoComplete="given-name" autoCapitalize="words" maxLength={LIMITES_DE_CUENTA.nombre} />
        <CampoDeTexto {...campos.de("apellido")} etiqueta="Apellido" autoComplete="family-name" autoCapitalize="words" maxLength={LIMITES_DE_CUENTA.apellido} />
      </div>
      <CampoDeTexto {...campos.de("telefono")} etiqueta="Teléfono" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={LIMITES_DE_CUENTA.telefono} ayuda="10 dígitos, con lada." />
      <CampoDeTexto {...campos.de("fechaNacimiento")} etiqueta="Fecha de nacimiento" type="date" autoComplete="bday" opcional min="1900-01-01" />
      <div className="flex flex-col gap-1">
        <p className="text-14 font-medium">Correo</p>
        <p className={cn("text-16", PARTE)}>{cuenta.email}</p>
        <p className="text-13 text-ink-2">Con él entras a tu cuenta; no se puede cambiar.</p>
      </div>
    </Formulario>
  );
}

function EditarDireccion({ slug, direccion, alGuardar }: { slug: string; direccion: DireccionGuardada | null; alGuardar: (d: DireccionGuardada[]) => void }) {
  const CAMPOS = ["etiqueta", "calle", "numeroExterior", "numeroInterior", "colonia", "codigoPostal", "ciudad", "estado", "referencias"] as const satisfies readonly CampoDeDireccion[];
  const campos = useCampos(CAMPOS, formularioDeDireccion(direccion), erroresDeDireccion);
  const accion = useAccion();
  const enviar = () => {
    if (!campos.revisar()) return;
    void accion.correr(async () => {
      const r = await guardarDireccion(slug, direccionPorGuardar(campos.f, direccion?.id ?? null));
      if (r.ok) { alGuardar(r.datos); return null; }
      // La función no dice qué campo: se señala el primero de la dirección, como en «Tus datos».
      if (r.error === "DIRECCION_INVALIDA") { campos.rechazar("calle", textoDeCuenta(r.error)); return null; }
      return rechazoDe(slug, r.error);
    });
  };
  return (
    <Formulario alEnviar={enviar} error={accion.error} pie={<Guardar ocupado={accion.ocupado}>Guardar dirección</Guardar>}>
      <CampoDeTexto {...campos.de("etiqueta")} etiqueta="Nombre de la dirección" maxLength={LIMITES_DE_CUENTA.etiqueta} autoComplete="off" ayuda="Para reconocerla al pedir: Casa, Oficina…" />
      <CampoDeTexto {...campos.de("calle")} etiqueta="Calle" autoComplete="address-line1" maxLength={LIMITES.calle} />
      <div className="grid grid-cols-2 gap-3">
        <CampoDeTexto {...campos.de("numeroExterior")} etiqueta="Núm. exterior" maxLength={LIMITES.numeroExterior} />
        <CampoDeTexto {...campos.de("numeroInterior")} etiqueta="Núm. interior" opcional maxLength={LIMITES.numeroInterior} />
      </div>
      <CampoDeTexto {...campos.de("colonia")} etiqueta="Colonia" autoComplete="address-level3" maxLength={LIMITES.colonia} />
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <CampoDeTexto {...campos.de("codigoPostal")} etiqueta="Código postal" inputMode="numeric" autoComplete="postal-code" maxLength={LIMITES.codigoPostal} />
        <CampoDeTexto {...campos.de("ciudad")} etiqueta="Ciudad" autoComplete="address-level2" maxLength={LIMITES.ciudad} />
      </div>
      <CampoDeTexto {...campos.de("estado")} etiqueta="Estado" autoComplete="address-level1" maxLength={LIMITES.estado} />
      <CampoDeTexto {...campos.de("referencias")} etiqueta="Referencias" multilinea opcional maxLength={LIMITES.referencias} ayuda="Entre qué calles, color de la casa, con quién dejarlo." />
    </Formulario>
  );
}

function BorrarDireccion({ slug, direccion, alBorrar, alVolver }: { slug: string; direccion: DireccionGuardada; alBorrar: (d: DireccionGuardada[]) => void; alVolver: () => void }) {
  const accion = useAccion();
  const borrar = () => void accion.correr(async () => {
    const r = await borrarDireccion(slug, direccion.id);
    if (!r.ok) return rechazoDe(slug, r.error);
    alBorrar(r.datos);
    return null;
  });
  return (
    <Formulario alEnviar={borrar} error={accion.error} pie={
      <>
        <button type="button" onClick={alVolver} className={GHOST}>Volver</button>
        <button type="submit" disabled={accion.ocupado} aria-busy={accion.ocupado} className={PELIGRO}>{accion.ocupado ? "Borrando…" : "Borrar dirección"}</button>
      </>
    }>
      <p className={cn("text-16 leading-relaxed", PARTE)}>
        Se borra <strong className="font-semibold">{direccion.etiqueta}</strong> ({direccionEnUnaLinea(direccion)}) de tu cuenta. Los pedidos que ya hiciste a esa dirección no cambian.
      </p>
    </Formulario>
  );
}

function CambiarPassword({ slug, alCambiar }: { slug: string; alCambiar: () => void }) {
  const campos = useCampos(FORMULARIOS.cambiarPassword, { passwordActual: "", password: "" }, (f) => erroresDeCuenta(FORMULARIOS.cambiarPassword, f));
  const accion = useAccion();
  const enviar = () => {
    if (!campos.revisar()) return;
    void accion.correr(async () => {
      const r = await cambiarPassword(slug, campos.f.passwordActual, campos.f.password);
      if (r.ok) { alCambiar(); return null; }
      if (r.error === "CREDENCIALES_INVALIDAS") { campos.rechazar("passwordActual", textoDePasswordActual(r.error)); return null; }
      return rechazoDe(slug, r.error);
    });
  };
  return (
    <Formulario alEnviar={enviar} error={accion.error} pie={<Guardar ocupado={accion.ocupado}>Cambiar contraseña</Guardar>}>
      <CampoDePassword {...campos.de("passwordActual")} etiqueta="Contraseña actual" />
      <CampoDePassword {...campos.de("password")} etiqueta="Contraseña nueva" nueva ayuda={`Mínimo ${PASSWORD.min} caracteres.`} />
      <p className="text-14 leading-relaxed text-ink-2">Al cambiarla se cierran las sesiones que tengas abiertas en otros dispositivos. En este sigues dentro.</p>
    </Formulario>
  );
}

function EliminarCuenta({ slug, negocio, alVolver }: { slug: string; negocio: string; alVolver: () => void }) {
  const campos = useCampos(FORMULARIOS.eliminar, { passwordActual: "" }, (f) => erroresDeCuenta(FORMULARIOS.eliminar, f));
  const accion = useAccion();
  const [seguro, setSeguro] = useState(false);
  const [faltaConfirmar, setFaltaConfirmar] = useState(false);
  const casilla = useRef<HTMLInputElement>(null);
  const enviar = () => {
    if (!campos.revisar()) return;
    if (!seguro) { setFaltaConfirmar(true); casilla.current?.focus(); return; }
    void accion.correr(async () => {
      const r = await eliminarCuenta(slug, campos.f.passwordActual);
      if (r.ok) return irA(`/${slug}`);
      if (r.error === "CREDENCIALES_INVALIDAS") { campos.rechazar("passwordActual", textoDePasswordActual(r.error)); return null; }
      return rechazoDe(slug, r.error);
    });
  };
  return (
    <Formulario alEnviar={enviar} error={accion.error} pie={
      <>
        <button type="button" onClick={alVolver} className={GHOST}>Volver</button>
        <button type="submit" disabled={accion.ocupado} aria-busy={accion.ocupado} className={PELIGRO}>{accion.ocupado ? "Eliminando…" : "Eliminar mi cuenta"}</button>
      </>
    }>
      <p className={cn("text-16 leading-relaxed", PARTE)}>
        Se borra tu cuenta, tus direcciones guardadas y el acceso a tu historial. {negocio} conserva en su sistema los pedidos que ya le hiciste.
      </p>
      <CampoDePassword {...campos.de("passwordActual")} etiqueta="Tu contraseña" ayuda="Para confirmar que eres tú." />
      <div className="flex flex-col gap-1">
        <label className="flex min-h-12 cursor-pointer items-center gap-3 text-16">
          <input ref={casilla} type="checkbox" checked={seguro} onChange={(e) => { setSeguro(e.target.checked); setFaltaConfirmar(false); }}
            aria-invalid={faltaConfirmar} aria-describedby={faltaConfirmar ? "eliminar-falta" : undefined} className="h-5 w-5 flex-shrink-0 accent-ink" />
          Entiendo que esto no se puede deshacer
        </label>
        {faltaConfirmar && <p id="eliminar-falta" role="alert" className="text-14 font-medium text-danger">Marca la casilla para eliminar tu cuenta.</p>}
      </div>
    </Formulario>
  );
}

// ── La página ────────────────────────────────────────────────────────────────────────────────────
type HojaAbierta =
  | { tipo: "datos" } | { tipo: "password" } | { tipo: "eliminar" }
  | { tipo: "direccion"; direccion: DireccionGuardada | null } | { tipo: "borrar"; direccion: DireccionGuardada };

const TITULO_DE_HOJA = (h: HojaAbierta): string =>
  h.tipo === "datos" ? "Tus datos" : h.tipo === "password" ? "Cambiar contraseña" : h.tipo === "eliminar" ? "Eliminar cuenta"
    : h.tipo === "borrar" ? "Borrar dirección" : h.direccion ? "Editar dirección" : "Agregar dirección";

function Pedido({ pedido, sucursal, variasSucursales, alRepetir }: { pedido: PedidoDeCuenta; sucursal: string | null; variasSucursales: boolean; alRepetir: (() => void) | null }) {
  const cuando = fechaDePedido(pedido.recibido_at);
  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex items-baseline justify-between gap-3">
        {/* El estado, tal cual lo da el servidor al cargar la página; aquí no se actualiza solo. */}
        <p className={cn("font-display text-16 font-semibold", pedido.estado === "CANCELADO" && "text-danger")}>{textoDeEstado(pedido.estado, null).titulo}</p>
        <p className="flex-shrink-0 font-display text-16 font-semibold tabular-nums">{formatoMxn(pedido.total_mxn)}</p>
      </div>
      <p className={cn("text-14 text-ink-2", PARTE)}>
        Pedido <span className="font-display font-semibold tabular-nums text-ink">{pedido.folio_corto}</span>
        {cuando && `, ${cuando}`}, {pedido.modo === "RECOGER" ? "para recoger" : "a domicilio"}
        {variasSucursales && sucursal && ` en ${sucursal}`}
      </p>
      <ul className="flex flex-col gap-1">
        {pedido.renglones.map((r, i) => (
          <li key={i} className="flex gap-2 text-15 leading-snug">
            <span className="w-7 flex-shrink-0 font-display font-semibold tabular-nums">{r.cantidad}×</span>
            <span className={cn("min-w-0", PARTE)}>{r.nombre}{r.detalle && <span className="block text-14 text-ink-2">{r.detalle}</span>}</span>
          </li>
        ))}
      </ul>
      {alRepetir && <button type="button" onClick={alRepetir} className={cn(CHICO, "mt-1 self-start")} aria-label={`Pedir de nuevo el pedido ${pedido.folio_corto}`}>Pedir de nuevo</button>}
    </li>
  );
}

export function MiCuentaDelNegocio({ negocio }: { negocio: Negocio }) {
  const { slug } = negocio;
  const router = useRouter();
  const [mi, setMi] = useState<MiCuenta | null>(null);
  /** null = todavía no llegan; "error" = no se pudieron leer (la cuenta sí se ve). */
  const [pedidos, setPedidos] = useState<PedidoDeCuenta[] | "error" | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const [turno, setTurno] = useState(0);
  const [hoja, setHoja] = useState<HojaAbierta | null>(null);
  /** La hoja se cierra con su contenido puesto (si no, se vacía mientras baja); `vez` reinicia el formulario al abrir. */
  const [abierta, setAbierta] = useState(false);
  const [vez, setVez] = useState(0);
  const [aviso, setAviso] = useState<{ tono: "success" | "danger"; texto: string } | null>(null);
  const salida = useAccion();

  useEffect(() => {
    const corte = new AbortController();
    setFalla(null);
    void Promise.all([leerCuenta(slug, corte.signal), misPedidos(slug, corte.signal)]).then(([c, p]) => {
      if (corte.signal.aborted) return;
      const sinSesion = [c, p].some((r) => !r.ok && r.error === "SESION_INVALIDA");
      if (sinSesion) { void irA(enlaceDeAcceso(slug, "entrar", `/${slug}/cuenta`)); return; }
      if (!c.ok) { setFalla(textoDeCuenta(c.error)); return; }
      setMi(c.datos);
      setPedidos(p.ok ? p.datos : "error");
    });
    return () => corte.abort();
  }, [slug, turno]);

  const abrir = (h: HojaAbierta) => { setHoja(h); setVez((n) => n + 1); setAbierta(true); setAviso(null); };
  const cerrar = () => setAbierta(false);
  const hecho = (texto: string) => { cerrar(); setAviso({ tono: "success", texto }); };

  if (!mi) {
    return (
      <main className="flex flex-col gap-3 px-4 pb-10" aria-live="polite">
        <h1 className="font-display text-24 font-semibold">Mi cuenta</h1>
        {falla ? (
          <>
            <Aviso tono="danger" role="alert" className="!text-14">{falla}</Aviso>
            <button type="button" onClick={() => setTurno((n) => n + 1)} className={cn(GHOST, "sm:w-auto sm:self-start sm:px-5")}>Volver a intentar</button>
          </>
        ) : <p className="text-16 text-ink-2">Cargando tu cuenta…</p>}
      </main>
    );
  }

  const { cuenta, direcciones } = mi;
  const llenas = direcciones.length >= TOPE_DE_DIRECCIONES;
  const nacimiento = cuenta.fecha_nacimiento && fechaDeNacimiento(cuenta.fecha_nacimiento);
  const repetir = (p: PedidoDeCuenta) => {
    if (dejarPorRepetir(slug, p)) router.push(rutaDelMenu(negocio, p.sucursal_id));
    else setAviso({ tono: "danger", texto: "No pudimos armar tu pedido en este teléfono. Ábrelo desde el menú." });
  };
  const cerrarSesion = () => void salida.correr(async () => {
    await salir(slug);   // la cookie se borra aunque falle
    return irA(`/${slug}`);
  });

  return (
    <main className="px-4 pb-10">
      <header className="flex flex-col gap-1 pb-6">
        <h1 className="font-display text-24 font-semibold leading-tight">Mi cuenta</h1>
        <p className={cn("text-15 text-ink-2", PARTE)}>{cuenta.email}</p>
      </header>

      {/* Lo que se hizo o no se pudo hacer, sin robar el foco. Se quita con su ×. */}
      <div aria-live="polite">
        {aviso && <Aviso tono={aviso.tono} className="mb-6 !text-14" onCerrar={() => setAviso(null)}>{aviso.texto}</Aviso>}
      </div>

      <section aria-labelledby="cuenta-pedidos" className={SECCION}>
        <h2 id="cuenta-pedidos" className={TITULO}>Mis pedidos</h2>
        {pedidos === null && <p className="text-15 text-ink-2">Cargando tus pedidos…</p>}
        {pedidos === "error" && (
          <>
            <p className="text-15 text-ink-2">No pudimos cargar tus pedidos.</p>
            <button type="button" onClick={() => setTurno((n) => n + 1)} className={cn(CHICO, "self-start")}>Volver a intentar</button>
          </>
        )}
        {Array.isArray(pedidos) && pedidos.length === 0 && (
          <>
            <p className="text-15 leading-relaxed text-ink-2">Todavía no tienes pedidos con esta cuenta. Aquí aparecen los que hagas con tu sesión abierta.</p>
            <Link href={`/${slug}`} className={cn(CHICO, "self-start")}>Ver el menú</Link>
          </>
        )}
        {Array.isArray(pedidos) && pedidos.length > 0 && (
          <ul className="-my-1 divide-y divide-line">
            {pedidos.map((p, i) => {
              const sucursal = negocio.sucursales.find((s) => s.id === p.sucursal_id);
              // Sin `items` (pedido ya anonimizado) o si la sucursal ya no está, no hay qué repetir.
              return <Pedido key={`${p.folio_corto}-${i}`} pedido={p} sucursal={sucursal?.nombre ?? null} variasSucursales={negocio.sucursales.length > 1}
                alRepetir={p.items && sucursal ? () => repetir(p) : null} />;
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="cuenta-datos" className={SECCION}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="cuenta-datos" className={TITULO}>Tus datos</h2>
          <button type="button" onClick={() => abrir({ tipo: "datos" })} className={CHICO} aria-label="Editar tus datos">Editar</button>
        </div>
        <dl className="flex flex-col gap-2 text-16">
          <div><dt className="text-13 text-ink-2">Nombre</dt><dd className={PARTE}>{[cuenta.nombre, cuenta.apellido].filter(Boolean).join(" ")}</dd></div>
          <div><dt className="text-13 text-ink-2">Teléfono</dt><dd className="tabular-nums">{formatoTelefono(cuenta.telefono)}</dd></div>
          {nacimiento && <div><dt className="text-13 text-ink-2">Fecha de nacimiento</dt><dd>{nacimiento}</dd></div>}
        </dl>
      </section>

      <section aria-labelledby="cuenta-direcciones" className={SECCION}>
        <h2 id="cuenta-direcciones" className={TITULO}>Direcciones</h2>
        {direcciones.length === 0
          ? <p className="text-15 leading-relaxed text-ink-2">No tienes direcciones guardadas. Guarda una y al pedir a domicilio solo la eliges.</p>
          : (
            <ul className="-my-1 divide-y divide-line">
              {direcciones.map((d) => (
                <li key={d.id} className="flex flex-col gap-1 py-3">
                  <p className={cn("text-16 font-semibold", PARTE)}>{d.etiqueta}</p>
                  <p className={cn("text-15 text-ink-2", PARTE)}>{direccionEnUnaLinea(d)}</p>
                  <div className="flex gap-5">
                    <button type="button" onClick={() => abrir({ tipo: "direccion", direccion: d })} className={DE_TEXTO} aria-label={`Editar la dirección ${d.etiqueta}`}>Editar</button>
                    <button type="button" onClick={() => abrir({ tipo: "borrar", direccion: d })} className={cn(DE_TEXTO, "!text-danger")} aria-label={`Borrar la dirección ${d.etiqueta}`}>Borrar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        {llenas
          ? <p className="text-14 text-ink-2">{textoDeCuenta("DIRECCIONES_LLENAS")}</p>
          : <button type="button" onClick={() => abrir({ tipo: "direccion", direccion: null })} className={cn(CHICO, "self-start")}>Agregar dirección</button>}
      </section>

      <section aria-labelledby="cuenta-sesion" className={SECCION}>
        <h2 id="cuenta-sesion" className={TITULO}>Contraseña y sesión</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => abrir({ tipo: "password" })} className={CHICO}>Cambiar contraseña</button>
          <button type="button" onClick={cerrarSesion} disabled={salida.ocupado} aria-busy={salida.ocupado} className={CHICO}>{salida.ocupado ? "Cerrando sesión…" : "Cerrar sesión"}</button>
        </div>
      </section>

      {/* Aparte y al final: lo que no tiene vuelta no convive con lo de todos los días. */}
      <section aria-labelledby="cuenta-eliminar" className={cn(SECCION, "mt-6")}>
        <h2 id="cuenta-eliminar" className={TITULO}>Eliminar cuenta</h2>
        <p className={cn("text-15 leading-relaxed text-ink-2", PARTE)}>
          Se borra tu cuenta, tus direcciones guardadas y el acceso a tu historial. {negocio.nombre} conserva en su sistema los pedidos que ya le hiciste.
        </p>
        <button type="button" onClick={() => abrir({ tipo: "eliminar" })} className={cn(CHICO, "self-start !border-danger-line !text-danger")}>Eliminar mi cuenta</button>
      </section>

      <Hoja abierta={abierta} alCerrar={cerrar} titulo={hoja ? TITULO_DE_HOJA(hoja) : "Mi cuenta"}>
        {hoja?.tipo === "datos" && <EditarDatos key={vez} slug={slug} cuenta={cuenta} alGuardar={(c) => { setMi({ cuenta: c, direcciones }); hecho("Guardamos tus datos."); }} />}
        {hoja?.tipo === "direccion" && <EditarDireccion key={vez} slug={slug} direccion={hoja.direccion} alGuardar={(d) => { setMi({ cuenta, direcciones: d }); hecho("Guardamos tu dirección."); }} />}
        {hoja?.tipo === "borrar" && <BorrarDireccion key={vez} slug={slug} direccion={hoja.direccion} alVolver={cerrar} alBorrar={(d) => { setMi({ cuenta, direcciones: d }); hecho("Borramos la dirección."); }} />}
        {hoja?.tipo === "password" && <CambiarPassword key={vez} slug={slug} alCambiar={() => hecho("Cambiamos tu contraseña. Se cerraron tus sesiones en otros dispositivos.")} />}
        {hoja?.tipo === "eliminar" && <EliminarCuenta key={vez} slug={slug} negocio={negocio.nombre} alVolver={cerrar} />}
      </Hoja>
    </main>
  );
}
