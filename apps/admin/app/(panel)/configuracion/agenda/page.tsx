"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { Tarjeta } from "../../../components/tarjeta";
import { Interruptor } from "../../../components/interruptor";
import { input, label } from "../../../components/campos";
import {
  BASES_COMISION, COBRO_MODOS, PERIODOS_COMISION, guardarConfigAgenda, horasCancelarValidas, leerConfigAgenda, pctValido,
  toleranciaValida, type ConfigAgenda,
} from "../../../lib/agenda";
import { mensajeError } from "../../../lib/errores";

const radio = "h-5 w-5 flex-shrink-0 accent-ink";
const casilla = "flex min-h-[40px] cursor-pointer items-center gap-3 text-14 text-ink";

/** Lo que se teclea, tal cual; se valida al guardar. */
type Borrador = {
  tolerancia: string; cobroModo: ConfigAgenda["cobroModo"]; cancelarHoras: string;
  comisionBase: ConfigAgenda["comisionBase"]; conProductos: boolean; productosPct: string; periodo: ConfigAgenda["periodo"];
};

const borradorDe = (c: ConfigAgenda): Borrador => ({
  tolerancia: String(c.tolerancia), cobroModo: c.cobroModo, cancelarHoras: String(c.cancelarHoras), comisionBase: c.comisionBase,
  conProductos: c.comisionProductosPct !== null, productosPct: c.comisionProductosPct === null ? "" : String(c.comisionProductosPct), periodo: c.periodo,
});

/** Un grupo de radios con nombre. */
function Opciones<V extends string>({ nombre, etiqueta, opciones, valor, onCambiar }: {
  nombre: string; etiqueta: string; opciones: readonly { v: V; l: string }[]; valor: V; onCambiar: (v: V) => void;
}) {
  return (
    <fieldset>
      <legend className={label}>{etiqueta}</legend>
      <div role="radiogroup" aria-label={etiqueta} className="flex flex-col">
        {opciones.map((o) => (
          <label key={o.v} className={casilla}>
            <input type="radio" name={nombre} className={radio} checked={valor === o.v} onChange={() => onCambiar(o.v)} />
            {o.l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Las reglas de la agenda (0218, 0221): tolerancia para llegar, cuándo se cobra la cita y cómo se
 * calculan las comisiones. Cada tarjeta guarda lo suyo.
 */
export default function AgendaConfigPage() {
  const [actual, setActual] = useState<ConfigAgenda | null>(null);
  const [b, setB] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    leerConfigAgenda()
      .then((c) => { setActual(c); setB(borradorDe(c)); })
      .catch((e) => setError(mensajeError(e, "No se pudo leer la agenda")));
  }, []);

  async function guardar(cambio: Partial<ConfigAgenda>, aviso: string) {
    setGuardando(true);
    setError(null);
    try {
      await guardarConfigAgenda(cambio);
      setActual((a) => (a ? { ...a, ...cambio } : a));
      setOkMsg(aviso);
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  const cambiar = (c: Partial<Borrador>) => setB((x) => (x ? { ...x, ...c } : x));

  return (
    <>
      <PageHeader titulo="Agenda" subtitulo="Cómo trata la recepción a los clientes, cuándo se cobra la cita y cómo se pagan las comisiones."
        migas={[{ label: "Configuración" }, { label: "Agenda" }]} />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {okMsg && <p className="mb-4 text-sm font-medium text-success">{okMsg}</p>}
        {!actual || !b ? (
          !error && <p className="text-sm text-ink-3">Cargando…</p>
        ) : (
          <div className="flex max-w-[720px] flex-col gap-5">
            <Tolerancia b={b} actual={actual} guardando={guardando} cambiar={cambiar}
              guardar={() => void guardar({ tolerancia: Number(b.tolerancia) }, "Tolerancia guardada.")} />
            <Cobro b={b} actual={actual} guardando={guardando} cambiar={cambiar}
              guardar={() => void guardar({ cobroModo: b.cobroModo, cancelarHoras: Number(b.cancelarHoras) }, "Cobro guardado.")} />
            <Comisiones b={b} actual={actual} guardando={guardando} cambiar={cambiar}
              guardar={() => void guardar({
                comisionBase: b.comisionBase, periodo: b.periodo, comisionProductosPct: b.conProductos ? Number(b.productosPct) : null,
              }, "Comisiones guardadas.")} />
          </div>
        )}
      </PageBody>
    </>
  );
}

type PropsTarjeta = { b: Borrador; actual: ConfigAgenda; guardando: boolean; cambiar: (c: Partial<Borrador>) => void; guardar: () => void };

function Tolerancia({ b, actual, guardando, cambiar, guardar }: PropsTarjeta) {
  const valido = toleranciaValida(b.tolerancia);
  const sinCambio = valido && Number(b.tolerancia) === actual.tolerancia;
  return (
    <Tarjeta titulo="Tolerancia" descripcion="Pasados estos minutos, la cita se ve como «Pasó la tolerancia». Marcar «No llegó» siempre lo decide la recepción.">
      <form className="flex max-w-[320px] items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (valido) guardar(); }}>
        <div className="flex-1">
          <label className={label} htmlFor="agenda-tolerancia">Tolerancia para llegar (minutos)</label>
          <input id="agenda-tolerancia" className={input} inputMode="numeric" value={b.tolerancia} onChange={(e) => cambiar({ tolerancia: e.target.value })} aria-invalid={!valido} />
        </div>
        <Button type="submit" disabled={guardando || !valido || sinCambio}>Guardar</Button>
      </form>
      {!valido && <p className="mt-2 text-13 text-danger">Escribe de 0 a 120 minutos.</p>}
    </Tarjeta>
  );
}

function Cobro({ b, actual, guardando, cambiar, guardar }: PropsTarjeta) {
  const valido = horasCancelarValidas(b.cancelarHoras);
  const sinCambio = valido && b.cobroModo === actual.cobroModo && Number(b.cancelarHoras) === actual.cancelarHoras;
  return (
    <Tarjeta titulo="Cobro" descripcion="Cuándo paga el cliente su cita. El anticipo de cada servicio se pone en Servicios.">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (valido) guardar(); }}>
        <Opciones nombre="cobro-modo" etiqueta="Cuándo se cobra" opciones={COBRO_MODOS} valor={b.cobroModo} onCambiar={(cobroModo) => cambiar({ cobroModo })} />
        <div className="max-w-[320px]">
          <label className={label} htmlFor="agenda-cancelar">Límite para cancelar con devolución (horas antes)</label>
          <input id="agenda-cancelar" className={input} inputMode="numeric" value={b.cancelarHoras} onChange={(e) => cambiar({ cancelarHoras: e.target.value })} aria-invalid={!valido} />
          {valido
            ? <p className="mt-1.5 text-13 text-ink-2">Si cancela después, o no llega, el anticipo no se devuelve.</p>
            : <p className="mt-1.5 text-13 text-danger">Escribe de 0 a 168 horas (una semana).</p>}
        </div>
        <div className="flex justify-end border-t border-line pt-4">
          <Button type="submit" disabled={guardando || !valido || sinCambio}>Guardar</Button>
        </div>
      </form>
    </Tarjeta>
  );
}

function Comisiones({ b, actual, guardando, cambiar, guardar }: PropsTarjeta) {
  const pctOk = !b.conProductos || pctValido(b.productosPct);
  const pct = b.conProductos ? Number(b.productosPct) : null;
  const sinCambio = pctOk && b.comisionBase === actual.comisionBase && b.periodo === actual.periodo && pct === actual.comisionProductosPct;
  return (
    <Tarjeta titulo="Comisiones" descripcion="La comisión de cada servicio se pone en Servicios. Un cambio aquí cuenta para las ventas nuevas; lo ya vendido conserva su comisión.">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (pctOk) guardar(); }}>
        <Opciones nombre="comision-base" etiqueta="Cómo se calcula el porcentaje" opciones={BASES_COMISION} valor={b.comisionBase} onCambiar={(comisionBase) => cambiar({ comisionBase })} />
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <Interruptor encendido={b.conProductos} onCambiar={(conProductos) => cambiar({ conProductos })}
            etiqueta="Comisión por vender productos"
            descripcion={b.conProductos ? "Quien vende un producto (shampoo, crema…) se lleva este porcentaje." : "Vender productos no da comisión."} />
          {b.conProductos && (
            <div className="max-w-[200px]">
              <label className={label} htmlFor="agenda-productos-pct">Porcentaje (%)</label>
              <input id="agenda-productos-pct" className={`${input} tabular-nums`} inputMode="decimal" placeholder="10" value={b.productosPct}
                onChange={(e) => cambiar({ productosPct: e.target.value })} aria-invalid={!pctOk} />
              {!pctOk && <p className="mt-1.5 text-13 text-danger">Escribe de 0 a 100.</p>}
            </div>
          )}
        </div>
        <div className="border-t border-line pt-4">
          <Opciones nombre="comision-periodo" etiqueta="Cada cuándo se pagan" opciones={PERIODOS_COMISION} valor={b.periodo} onCambiar={(periodo) => cambiar({ periodo })} />
          <p className="mt-1 text-13 text-ink-2">
            {b.periodo === "SEMANAL" ? "De lunes a domingo." : "Del 1 al 15 y del 16 al fin de mes."} El sueldo de cada colaborador es por este periodo.
          </p>
        </div>
        <div className="flex justify-end border-t border-line pt-4">
          <Button type="submit" disabled={guardando || !pctOk || sinCambio}>Guardar</Button>
        </div>
      </form>
    </Tarjeta>
  );
}
