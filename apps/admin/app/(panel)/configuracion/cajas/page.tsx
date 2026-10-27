"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Cargando, Button, DialogoPeligro, Modal, useConfirmar, Icono } from "@vim/ui/styles";
import { haceCuanto } from "@vim/fecha";
import { PageHeader, PageBody } from "../../../components/page-header";
import { ModalCaja } from "../../../components/modal-caja";
import { codigoVinculacion, eliminarCaja, listarCajas, provisionarDispositivo, type Caja, type CodigoVinculacion, type CredencialesDispositivo } from "../../../lib/configuracion";
import { mensajeError } from "../../../lib/errores";

/** Una caja de escritorio late cada 10 min; si la última señal es más vieja que esto, no está
 *  prendida ahora (cerraron el local, se fue la luz) aunque siga vinculada. */
const EN_LINEA_MIN = 20;

function enLinea(c: Caja, ahora: number): boolean {
  return c.ultimoLatido !== null && ahora - new Date(c.ultimoLatido).getTime() < EN_LINEA_MIN * 60_000;
}

export default function CajasPage() {
  const [confirmar, dialogoConfirmar] = useConfirmar();
  const [list, setList] = useState<Caja[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ caja: Caja | null } | null>(null);
  const [borrar, setBorrar] = useState<Caja | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [generando, setGenerando] = useState<string | null>(null);
  const [creds, setCreds] = useState<CredencialesDispositivo | null>(null);
  const [codigo, setCodigo] = useState<(CodigoVinculacion & { cajaId: string }) | null>(null);

  /**
   * Da un código de 6 caracteres para vincular la caja. Generarlo no cambia nada: la clave de la
   * caja se renueva cuando alguien CAPTURA el código. En una caja que ya está en uso eso la deja sin
   * sincronizar hasta que se capture ahí mismo — el modo de falla del incidente de Knock-Out del
   * 8 sep —, así que en ese caso se pregunta antes.
   */
  async function generarDispositivo(caja: Caja) {
    if (caja.ultimoLatido !== null) {
      const ok = await confirmar({
        titulo: `¿Vincular otra vez ${caja.nombre}?`,
        mensaje: (
          <>
            Esta caja ya está vinculada (última señal {haceCuanto(caja.ultimoLatido)}). Cuando se capture el
            código, <b className="text-ink">la computadora vinculada ahora dejará de sincronizar</b> hasta que
            lo captures en ella.
          </>
        ),
        boton: "Generar código",
      });
      if (!ok) return;
    }
    setError(null);
    setGenerando(caja.id);
    try {
      setCodigo({ ...(await codigoVinculacion(caja.id)), cajaId: caja.id });
    } catch (e) {
      setError(mensajeError(e, "No se pudo generar el código"));
    } finally {
      setGenerando(null);
    }
  }

  /** Las credenciales largas: para cajas con una versión anterior y para la pantalla de cocina. */
  async function mostrarCredenciales(cajaId: string) {
    setCodigo(null);
    setError(null);
    setGenerando(cajaId);
    try {
      setCreds(await provisionarDispositivo(cajaId));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron generar las credenciales"));
    } finally {
      setGenerando(null);
    }
  }

  async function recargar() {
    setError(null);
    try {
      setList(await listarCajas());
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar"));
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  // Agrupa por sucursal para mejor lectura
  const grupos = useMemo(() => {
    const m = new Map<string, { sucursalNombre: string; cajas: Caja[] }>();
    for (const c of list ?? []) {
      const g = m.get(c.sucursal_id);
      if (g) g.cajas.push(c);
      else m.set(c.sucursal_id, { sucursalNombre: c.sucursalNombre, cajas: [c] });
    }
    return Array.from(m.values());
  }, [list]);

  async function confirmarBorrado() {
    if (!borrar) return;
    setBorrando(true);
    try {
      await eliminarCaja(borrar.id);
      setBorrar(null);
      setBorrando(false);
      await recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo eliminar"));
      setBorrando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Cajas"
        subtitulo="Los puntos de cobro de cada sucursal. Cada caja maneja su propio turno, fondo y arqueo."
        migas={[{ label: "Configuración" }, { label: "Cajas" }]}
        right={
          <div className="flex flex-wrap gap-2">
          <Link
            href="/configuracion/cajas/descargar"
            className="inline-flex h-11 items-center gap-2 rounded border border-line-strong px-4 text-14 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            <Icono nombre="descargar" className="h-[17px] w-[17px]" />
            Descargar VIM POS
          </Link>
          <Button onClick={() => setModal({ caja: null })}>
            <Icono nombre="mas" className="h-[17px] w-[17px]" />
            Nueva caja
          </Button>
          </div>
        }
      />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {list === null && <Cargando />}

        {list !== null && list.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="font-display text-lg font-semibold">Aún no hay cajas</p>
            <p className="mt-1 text-sm text-ink-2">Crea una caja para empezar a operar.</p>
            <div className="mt-4"><Button onClick={() => setModal({ caja: null })}>Crear caja</Button></div>
          </div>
        )}

        {list !== null && list.length > 0 && (
          <div className="flex flex-col gap-6">
            {grupos.map((g) => (
              <div key={g.cajas[0]?.sucursal_id} className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="border-b border-line bg-sel px-4 py-2.5">
                  <h2 className="font-display text-14 font-semibold">{g.sucursalNombre}</h2>
                </div>
                <div className="tabla-caja tabla-caja-sm">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="w-[80px] border-b border-line px-4 py-[11px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">N°</th>
                        <th className="border-b border-line px-4 py-[11px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">Caja</th>
                        <th className="w-[110px] border-b border-line px-4 py-[11px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">Estado</th>
                        <th className="w-[210px] border-b border-line px-4 py-[11px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">Dispositivo</th>
                        <th className="w-[140px] border-b border-line px-4 py-[11px]"><span className="sr-only">Acciones</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.cajas.map((c) => (
                        <tr key={c.id} className="group cursor-pointer border-b border-line last:border-none hover:bg-hover" onClick={() => setModal({ caja: c })}>
                          <td className="px-4 py-3 font-display text-14 font-bold tabular-nums">{c.numero}</td>
                          <td className="px-4 py-3 text-15 font-semibold">{c.nombre}</td>
                          <td className="px-4 py-3">
                            {c.bloqueada ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-[11px] py-1 text-13 font-semibold text-danger">
                                <span className="h-1.5 w-1.5 rounded-full bg-danger" />Bloqueada
                              </span>
                            ) : (
                              <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-13 font-semibold", c.activa ? "bg-success-soft text-success" : "bg-hover text-ink-3"].join(" ")}>
                                <span className={["h-1.5 w-1.5 rounded-full", c.activa ? "bg-success" : "bg-ink-3"].join(" ")} />
                                {c.activa ? "Activa" : "Inactiva"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {/* Vincular la computadora es el primer valor real del producto, y antes no se veía
                                en ningún lado si una caja estaba vinculada o no. */}
                            {c.ultimoLatido === null ? (
                              <span className="text-13 text-ink-3">Sin vincular</span>
                            ) : (
                              <span className="flex items-center gap-2 text-13">
                                <span className={["h-2 w-2 shrink-0 rounded-full", enLinea(c, Date.now()) ? "bg-success" : "bg-ink-3"].join(" ")} aria-hidden />
                                <span className="text-ink-2">
                                  {enLinea(c, Date.now()) ? "En línea" : "Sin señal"} · {haceCuanto(c.ultimoLatido)}
                                  {c.versionApp && <span className="text-ink-3"> · {c.versionApp}</span>}
                                </span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <span className="inline-flex gap-1">
                              <button type="button" disabled={generando === c.id} onClick={() => { void generarDispositivo(c); }} className="h-9 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:opacity-40">
                                {generando === c.id ? "Generando…" : c.ultimoLatido === null ? "Vincular" : "Vincular otra vez"}
                              </button>
                              <button type="button" title="Editar" aria-label={`Editar ${c.nombre}`} onClick={() => setModal({ caja: c })} className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-9 lg:w-9 text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink">
                                <Icono nombre="editar" className="h-4 w-4" />
                              </button>
                              <button type="button" title="Eliminar" aria-label={`Eliminar ${c.nombre}`} onClick={() => setBorrar(c)} className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-9 lg:w-9 text-ink-3 transition hover:border-danger-line hover:text-danger">
                                <Icono nombre="eliminar" className="h-4 w-4" />
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>

      {modal && (
        <ModalCaja
          caja={modal.caja}
          onCerrar={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            recargar();
          }}
        />
      )}

      {borrar && (
        <DialogoPeligro
          error={error}
          titulo="¿Eliminar esta caja?"
          consecuencia={
            <>
              Se elimina <b className="text-ink">{borrar.nombre}</b>.
            </>
          }
          boton="Eliminar"
          ocupado={borrando}
          textoOcupado="Eliminando…"
          ancho="sm"
          onConfirmar={confirmarBorrado}
          onCerrar={() => setBorrar(null)}
        />
      )}

      {dialogoConfirmar}

      {/* El código se puede volver a generar sin costo, así que este sí se cierra con Esc o clic afuera. */}
      {codigo && (
        <Modal open onClose={() => setCodigo(null)} title="Código para vincular" className="w-full max-w-[440px] rounded-lg border border-line bg-surface p-6 shadow-xl">
          <p className="text-13 text-ink-2">
            Escríbelo en VIM POS, en la computadora de <b className="text-ink">{codigo.caja_nombre}</b>.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <code className="rounded border border-line-strong bg-sel px-5 py-3 font-mono text-32 font-bold tracking-[0.15em] tabular-nums">
              {codigo.codigo.slice(0, 3)}-{codigo.codigo.slice(3)}
            </code>
          </div>
          <p className="mt-3 text-center text-13 text-ink-3">
            Sirve una vez y vence a las {new Date(codigo.expira_en).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}.
          </p>
          <p className="mt-4 text-13 text-ink-2">
            ¿Aún no instalas VIM POS en esa computadora?{" "}
            <Link href="/configuracion/cajas/descargar" className="font-semibold text-ink underline underline-offset-2">Descárgalo aquí</Link>.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => { void mostrarCredenciales(codigo.cajaId); }} className="text-13 font-semibold text-ink-3 underline underline-offset-2 hover:text-ink">
              ¿Te pide identificador y clave?
            </button>
            <Button onClick={() => { setCodigo(null); void recargar(); }}>Listo</Button>
          </div>
        </Modal>
      )}

      {/* La clave se muestra UNA vez y la anterior ya no sirve: cerrarla por un Esc o un clic afuera
          dejaba la caja sin forma de vincularse. Solo se cierra con el botón. */}
      {creds && (
        <Modal open onClose={() => { /* solo con «Ya la capturé» */ }} title="Credenciales del dispositivo" className="w-full max-w-[480px] rounded-lg border border-line bg-surface p-6 shadow-xl">
          <p className="text-13 text-ink-2">Captura esto <b>una sola vez</b> en VIM POS, en la computadora de <b className="text-ink">{creds.caja_nombre}</b> (pantalla «Vincular este dispositivo»).</p>
          <p className="mt-2 text-13 text-ink-2">
            ¿Aún no instalas VIM POS en esa computadora?{" "}
            <Link href="/configuracion/cajas/descargar" className="font-semibold text-ink underline underline-offset-2">Descárgalo aquí</Link>.
          </p>
          <div className="mt-4 space-y-3">
            <CampoCopiable label="Identificador del dispositivo" valor={creds.identificador} />
            <CampoCopiable label="Clave del dispositivo" valor={creds.clave} />
          </div>
          <div className="mt-4 rounded border border-warning-line bg-warning-soft px-3 py-2 text-13 font-medium text-warning">
            La clave no se vuelve a mostrar. Si la pierdes, genera otra (esta dejará de servir).
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => { setCreds(null); void recargar(); }}>Ya la capturé</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CampoCopiable({ label, valor }: { label: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div>
      <div className="mb-1 text-12 font-medium text-ink-3">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border border-line-strong bg-sel px-3 py-2 font-mono text-13">{valor}</code>
        {/* Ancho fijo para que el botón no brinque al cambiar el texto, y "Copiado" solo si el
            portapapeles de verdad aceptó el texto. */}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(valor).then(
              () => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); },
              () => { /* sin permiso de portapapeles: el texto sigue a la vista para copiarlo a mano */ },
            );
          }}
          className="w-[92px] shrink-0 rounded border border-line-strong px-3 py-2 text-center text-13 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink"
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
