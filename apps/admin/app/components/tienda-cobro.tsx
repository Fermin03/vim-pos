"use client";
// TEXTOS PROVISIONALES: todo lo que aquí lee el dueño lo revisa James antes de publicar.
import { Aviso, Button } from "@vim/ui/styles";
import { input, label } from "./campos";
import { AccionFila } from "./controles";
import { Tarjeta } from "./tarjeta";
import { LineaMensaje, type MensajeTienda } from "./tienda-mensaje";
import { precioMxn } from "../lib/catalogo";
import { fechaHoraMx } from "../lib/reportes-inventario";
import type { ConexionTienda } from "../lib/tienda-conexion";
import { PAGOS_A_LA_VISTA, type PagoTienda } from "../lib/tienda";
import { cuentaDePrueba, cuentaQueCobra, cuentasActivas, hayQueElegir, lista, nombreDeCuenta, seDesconectaDesdeElAdmin } from "../lib/tienda-cobro";
import type { SucursalTienda } from "../lib/tienda-reglas";

const subtitulo = "mb-2 text-13 font-semibold text-ink";
const TONO_ESTADO: Record<PagoTienda["estado"], string> = {
  "Pagado": "bg-success-soft text-success",
  "Devuelto": "bg-sel text-ink-2",
  "Devolución en proceso": "bg-warning-soft text-warning",
  "No completado": "bg-sel text-ink-3",
};

/** Bloque de pago en línea: la cuenta de Mercado Pago que cobra, lo que el dueño debe saber y los últimos pagos. */
export function TiendaCobro({
  cuentas,
  sucursales,
  pagos,
  cajasSinActualizar,
  dePrueba = false,
  ocupado,
  soloLectura,
  mensaje,
  onConectar,
  onDesconectar,
  onElegir,
}: {
  /** Las cuentas conectadas PARA LA TIENDA (no las de la terminal de tarjetas). */
  cuentas: ConexionTienda[];
  sucursales: SucursalTienda[];
  /** null = no se pudieron leer. */
  pagos: PagoTienda[] | null;
  /** Sucursales que venden en la tienda y cuya caja instalada no está actualizada. */
  cajasSinActualizar: string[];
  /**
   * La tienda está en MODO DE PRUEBA (lo pone VIM): los pagos en línea no son reales y cobra la cuenta
   * de prueba. Se avisa, y no se ofrece conectar Mercado Pago: la conexión real no se usa.
   */
  dePrueba?: boolean;
  /** Algo se está guardando en la página: una escritura a la vez. */
  ocupado: boolean;
  soloLectura: boolean;
  mensaje: MensajeTienda | null;
  onConectar: () => void;
  onDesconectar: (cuenta: ConexionTienda) => void;
  onElegir: (sucursalId: string, conexionId: string) => void;
}) {
  const activas = cuentasActivas(cuentas);
  const enError = cuentas.some((c) => c.estado === "ERROR");
  const enTienda = sucursales.filter((s) => s.participa);
  const laDePrueba = dePrueba ? cuentaDePrueba(cuentas) : null;

  return (
    <Tarjeta
      titulo="Pago en línea"
      descripcion="Tus clientes pagan con tarjeta al hacer su pedido. El dinero cae directo en tu cuenta de Mercado Pago: VIM no lo toca ni ve los datos de las tarjetas."
    >
      {/* TEXTO PROVISIONAL (James). No se cierra: mientras dure el modo de prueba, tiene que verse. */}
      {dePrueba && (
        <Aviso tono="info" className="mb-4">
          <strong className="font-semibold">Tu tienda está en modo de prueba: los pagos en línea no son reales.</strong>{" "}
          {laDePrueba
            ? `Cobra la cuenta de prueba «${nombreDeCuenta(laDePrueba)}». Ningún pago llega a una cuenta real.`
            : "Todavía no tiene su cuenta de prueba, así que el pago en línea no se ofrece. La configura VIM."}
        </Aviso>
      )}
      {cuentas.length === 0 ? (
        // En modo de prueba no se conecta nada desde aquí: la cuenta de prueba la pone VIM.
        dePrueba ? null : (
          <div>
            <p className="text-13 text-ink-2">Para ofrecerlo, conecta la cuenta de Mercado Pago de tu negocio. Ahí recibes el dinero de cada pedido.</p>
            <div className="mt-3"><Button onClick={onConectar} disabled={ocupado || soloLectura}>Conectar Mercado Pago</Button></div>
          </div>
        )
      ) : (
        <div>
          <h3 className={subtitulo}>{cuentas.length === 1 ? "Tu cuenta de Mercado Pago" : "Tus cuentas de Mercado Pago"}</h3>
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {cuentas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="min-w-0 break-words text-15 font-semibold">{nombreDeCuenta(c)}</span>
                {c.de_prueba && <span className="rounded-full bg-info-soft px-2.5 py-0.5 text-12 font-semibold text-info">De prueba: no cobra pedidos reales</span>}
                {dePrueba && !c.de_prueba && c.estado === "ACTIVA" && <span className="rounded-full bg-sel px-2.5 py-0.5 text-12 font-semibold text-ink-2">No se usa en modo de prueba</span>}
                {c.estado === "ERROR" && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-12 font-semibold text-danger">Hay que volver a conectarla</span>}
                {/* La cuenta de prueba la pone y la quita VIM: aquí no se desconecta. */}
                {seDesconectaDesdeElAdmin(c) && <AccionFila peligro className="ml-auto" disabled={ocupado || soloLectura} onClick={() => onDesconectar(c)}>Desconectar</AccionFila>}
              </li>
            ))}
          </ul>
          {!dePrueba && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button variant="ghost" onClick={onConectar} disabled={ocupado || soloLectura}>{enError ? "Reconectar Mercado Pago" : "Conectar otra cuenta"}</Button>
            </div>
          )}

          {hayQueElegir(cuentas, sucursales, dePrueba) && enTienda.length > 0 && (
            <div className="mt-5 grid grid-cols-1 gap-4">
              {enTienda.map((s) => {
                const cobra = cuentaQueCobra(cuentas, s.conexionId);
                // La elegida que ya no sirve se sigue viendo en el selector, para que el dueño sepa cuál era.
                const caida = s.conexionId !== null && !cobra ? cuentas.find((c) => c.id === s.conexionId) : undefined;
                return (
                  <div key={s.id}>
                    <label className={label} htmlFor={`cobro-${s.id}`}>¿Qué cuenta cobra en {s.nombre}?</label>
                    <select
                      id={`cobro-${s.id}`}
                      className={input}
                      value={cobra?.id ?? (s.conexionId !== null ? "caida" : "")}
                      disabled={ocupado || soloLectura}
                      onChange={(e) => { if (activas.some((c) => c.id === e.target.value && !c.de_prueba)) onElegir(s.id, e.target.value); }}
                    >
                      {s.conexionId === null && !cobra && <option value="">Elige una cuenta</option>}
                      {s.conexionId !== null && !cobra && <option value="caida">{caida ? `${nombreDeCuenta(caida)} (hay que volver a conectarla)` : "La cuenta que tenía ya no está conectada"}</option>}
                      {activas.filter((c) => !c.de_prueba).map((c) => <option key={c.id} value={c.id}>{nombreDeCuenta(c)}</option>)}
                    </select>
                    {!cobra && <p className="mt-1 text-12 font-medium text-warning">Mientras no elijas una cuenta, esta sucursal no ofrece el pago en línea.</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <LineaMensaje mensaje={mensaje} className="mt-3" />
      {activas.length > 0 && cajasSinActualizar.length > 0 && (
        <Aviso tono="warning" className="mt-3">
          En {lista(cajasSinActualizar)} el pago en línea no aparece: actualiza tu caja ahí.
        </Aviso>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <h3 className={subtitulo}>Lo que debes saber</h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-13 text-ink-2">
          <li>Mercado Pago cobra una comisión por cada pago en línea. Cuánto es depende de tu cuenta: revísalo en Mercado Pago.</li>
          <li>VIM no cobra comisión por pedido.</li>
          <li>Si rechazas o cancelas un pedido ya pagado, el dinero se le devuelve completo al cliente, sin que tengas que hacer nada.</li>
          <li>El pago en línea solo aparece en las sucursales con la caja actualizada. Si en una no aparece, actualiza tu caja.</li>
        </ul>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <h3 className={subtitulo}>Últimos pagos en línea</h3>
        {pagos === null ? (
          <p className="text-13 text-ink-2">No se pudieron leer los pagos. Recarga la página para volver a intentar.</p>
        ) : pagos.length === 0 ? (
          <p className="text-13 text-ink-2">Todavía no hay pagos en línea.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line">
              {pagos.map((p) => (
                <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-14 font-medium">{p.folio ? `Pedido ${p.folio}` : "Pedido sin pagar"}</div>
                    <div className="text-12 text-ink-3">{fechaHoraMx(p.fecha)}</div>
                    {p.propina > 0 && <div className="text-12 tabular-nums text-ink-3">Incluye {precioMxn(p.propina)} de propina</div>}
                    {p.pagoMp && <div className="font-mono text-12 text-ink-3 [overflow-wrap:anywhere]">Mercado Pago: {p.pagoMp}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-14 font-semibold tabular-nums">{precioMxn(p.monto)}</span>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-12 font-semibold ${TONO_ESTADO[p.estado]}`}>{p.estado}</span>
                  </div>
                </li>
              ))}
            </ul>
            {pagos.length === PAGOS_A_LA_VISTA && <p className="mt-2 text-12 text-ink-3">Se muestran los últimos {PAGOS_A_LA_VISTA}.</p>}
          </>
        )}
      </div>
    </Tarjeta>
  );
}
