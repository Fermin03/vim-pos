"use client";
// «Envío a domicilio» de una sucursal en la tienda (0179): por zonas (como siempre) o por distancia,
// con los tramos «hasta X km → $Y» y el punto de la sucursal en el mapa. Va dentro de la tarjeta de
// la sucursal y guarda aparte, con su propio botón: el borrador de la tarjeta no lo toca.
// TEXTOS PROVISIONALES (James).
import { useId, useState } from "react";
import Link from "next/link";
import { Button, cn } from "@vim/ui/styles";
import { MapaConPin } from "@vim/ui/mapa";
import { AccionFila } from "./controles";
import { input } from "./campos";
import { LineaMensaje, type MensajeTienda } from "./tienda-mensaje";
import { MAX_TRAMOS, erroresDeEnvio, hayCambiosDeEnvio, type EnvioSucursal, type SucursalTienda } from "../lib/tienda-reglas";

/** Sin punto todavía, el mapa abre sobre el país: el dueño se acerca y toca su sucursal. */
const MEXICO = { lat: 23.6345, lng: -102.5528 };
const radio = "h-5 w-5 flex-shrink-0 accent-ink";
const casilla = "flex min-h-[44px] cursor-pointer items-center gap-3 text-14 text-ink";

export function EnvioDeSucursal({ sucursal: s, guardando, ocupado, soloLectura, mensaje, onGuardar }: {
  sucursal: SucursalTienda;
  guardando: boolean;
  ocupado: boolean;
  soloLectura: boolean;
  mensaje: MensajeTienda | null;
  /** true = se guardó. */
  onGuardar: (id: string, envio: EnvioSucursal) => Promise<boolean>;
}) {
  const id = useId();
  /** null = sin tocar: se pinta lo guardado. */
  const [borrador, setBorrador] = useState<EnvioSucursal | null>(null);
  const [tocado, setTocado] = useState(false);
  const valor = borrador ?? s.envio;
  const sinGuardar = borrador !== null && hayCambiosDeEnvio(borrador, s.envio);
  const quieto = ocupado || soloLectura;
  const errores = erroresDeEnvio(valor);
  const conError = errores.general !== null || Object.keys(errores.porTramo).length > 0;
  const ultimo = valor.tramos.at(-1)?.hastaKm.trim();

  const cambiar = (c: Partial<EnvioSucursal>) => {
    const nuevo = { ...valor, ...c };
    setBorrador(hayCambiosDeEnvio(nuevo, s.envio) ? nuevo : null);
  };
  const cambiarTramo = (i: number, c: Partial<EnvioSucursal["tramos"][number]>) =>
    cambiar({ tramos: valor.tramos.map((t, j) => (j === i ? { ...t, ...c } : t)) });

  async function guardar() {
    setTocado(true);
    if (!borrador || !sinGuardar || conError) return;
    if (await onGuardar(s.id, borrador)) { setBorrador(null); setTocado(false); }
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 border-t border-line pt-4">
      <legend className="text-14 font-semibold text-ink">Envío a domicilio en la tienda</legend>
      <div role="radiogroup" aria-label="Cómo se cobra el envío" className="flex flex-wrap gap-x-6">
        <label className={casilla}>
          <input type="radio" name={`${id}-cobro`} className={radio} checked={valor.cobro === "ZONAS"} disabled={quieto} onChange={() => cambiar({ cobro: "ZONAS" })} />
          Por zonas
        </label>
        <label className={casilla}>
          <input type="radio" name={`${id}-cobro`} className={radio} checked={valor.cobro === "DISTANCIA"} disabled={quieto} onChange={() => cambiar({ cobro: "DISTANCIA", ...(valor.tramos.length === 0 && { tramos: [{ hastaKm: "", costo: "" }] }) })} />
          Por distancia
        </label>
      </div>

      {valor.cobro === "ZONAS" ? (
        <p className={cn("text-13", s.zonasActivas === 0 ? "font-medium text-warning" : "text-ink-2")}>
          Tus clientes eligen su zona. {s.zonasActivas === 1 ? "1 zona de envío" : `${s.zonasActivas} zonas de envío`}
          {s.zonasActivas === 0 && ": necesitas al menos una"}.{" "}
          <Link href="/configuracion/envios" className="whitespace-nowrap font-semibold underline underline-offset-2">Administrar zonas</Link>
        </p>
      ) : (
        <>
          <p className="text-13 text-ink-2">
            Tus clientes ponen su ubicación en un mapa y el envío se cobra según la distancia en calles desde tu sucursal.
          </p>
          <div className="flex flex-col gap-1">
            <p className="text-13 font-medium text-ink-2">Dónde está tu sucursal</p>
            <MapaConPin centro={valor.punto ?? MEXICO} pin={valor.punto} zoom={valor.punto ? 15 : 4.5}
              alMover={(punto) => cambiar({ punto })}
              etiqueta={`Mapa con el punto de ${s.nombre}. Toca el mapa o arrastra el pin para moverlo.`}
              textoCentro="Poner el pin en el centro del mapa"
              textoFallo="No pudimos cargar el mapa." textoReintentar="Volver a intentar" />
            {!valor.punto && <p className="text-13 text-ink-2">Acerca el mapa y toca donde está tu sucursal.</p>}
          </div>
        </>
      )}

      {/* Los tramos se conservan aunque se cobre por zonas: así volver a «Por distancia» no los pierde. */}
      {valor.cobro === "DISTANCIA" && (
        <div className="flex flex-col gap-2">
          <p id={`${id}-tramos`} className="text-13 font-medium text-ink-2">Precio por distancia</p>
          <ol aria-labelledby={`${id}-tramos`} className="flex flex-col gap-2">
            {valor.tramos.map((t, i) => (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-14 text-ink">
                  <label htmlFor={`${id}-km-${i}`}>Hasta</label>
                  <input id={`${id}-km-${i}`} inputMode="decimal" value={t.hastaKm} disabled={quieto} maxLength={4}
                    aria-invalid={tocado && errores.porTramo[i] ? true : undefined} aria-describedby={errores.porTramo[i] ? `${id}-error-${i}` : undefined}
                    onChange={(e) => cambiarTramo(i, { hastaKm: e.target.value })}
                    className={cn(input, "w-20 tabular-nums")} />
                  <span>km</span>
                  <label htmlFor={`${id}-costo-${i}`} className="ml-2">cuesta $</label>
                  <input id={`${id}-costo-${i}`} inputMode="decimal" value={t.costo} disabled={quieto} maxLength={7}
                    aria-invalid={tocado && errores.porTramo[i] ? true : undefined}
                    onChange={(e) => cambiarTramo(i, { costo: e.target.value })}
                    className={cn(input, "w-28 tabular-nums")} />
                  <AccionFila peligro disabled={quieto} onClick={() => cambiar({ tramos: valor.tramos.filter((_, j) => j !== i) })}
                    className="ml-auto min-h-[44px] px-1" aria-label={`Quitar el tramo ${i + 1}`}>Quitar</AccionFila>
                </div>
                {errores.porTramo[i] && (tocado || t.hastaKm || t.costo) && (
                  <p id={`${id}-error-${i}`} className="text-13 font-medium text-danger">{errores.porTramo[i]}</p>
                )}
              </li>
            ))}
          </ol>
          {valor.tramos.length < MAX_TRAMOS && (
            <button type="button" disabled={quieto}
              onClick={() => cambiar({ tramos: [...valor.tramos, { hastaKm: "", costo: "" }] })}
              className="h-10 self-start rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink active:scale-[.97] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              Agregar tramo
            </button>
          )}
          {ultimo && !errores.porTramo[valor.tramos.length - 1] && (
            <p className="text-13 text-ink-2">Más lejos de {ultimo} km no se entrega a domicilio: la tienda ofrece recoger.</p>
          )}
        </div>
      )}

      {errores.general && (tocado || sinGuardar) && <p role="alert" className="text-13 font-medium text-danger">{errores.general}</p>}

      {(sinGuardar || mensaje) && (
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {(mensaje?.tipo === "error" || !sinGuardar) && <LineaMensaje mensaje={mensaje} />}
          {sinGuardar && !guardando && <p className="text-13 text-ink-2">Cambios sin guardar</p>}
          <Button onClick={() => void guardar()} disabled={quieto || !sinGuardar}>
            {guardando ? "Guardando…" : "Guardar envío"}
          </Button>
        </div>
      )}
    </fieldset>
  );
}
