"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { type DatosCaja, type Turno, fmtMxn } from "../lib/turno";
import { registrarMovimiento, TIPOS_MOVIMIENTO, type DefMovimiento, type TipoMovimiento } from "../lib/movimientos";
import { leerReporteX } from "../lib/cierre";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

/** Roles que tienen `caja.sangria` y `caja.deposito` (matriz §2.2). */
const ROLES_CAJA = ["SUPERVISOR", "ADMIN", "DUENO"];
// El cajero normalmente NO tiene caja.sangria — solo supervisor+. Verificar con BD.

const OTRO = "__otro__";

function IconoRetiro() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
      <path d="M12 19V5M5 12l7 7 7-7" />
    </svg>
  );
}
function IconoDeposito() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
      <path d="M12 5v14M5 12l7-7 7 7" />
    </svg>
  );
}

/**
 * Retiro / Depósito de efectivo (mockups P-096 y P-098).
 *
 * Dos operaciones, no cuatro: lo único que la caja necesita saber es si el dinero SALE o ENTRA.
 * El resto —a quién, para qué, con qué folio— es el motivo, y va en su propio campo con los
 * motivos frecuentes a un toque. Ver `lib/movimientos.ts` para por qué el enum de la BD no
 * cambia y cómo mapea cada botón.
 *
 * Del mockup se porta lo que le falta al cajero para decidir sin salir de aquí: cuánto efectivo
 * hay ahora, cuánto va a quedar, y el aviso cuando el retiro deja la caja por debajo del fondo
 * con el que abrió. Antes se capturaba a ciegas y el descuadre aparecía hasta el corte.
 */
export function ModalMovimientoCaja({
  token,
  empleado,
  caja,
  turno,
  onRegistrado,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  caja: DatosCaja;
  turno: Turno;
  onRegistrado: (mov: { id: string; folio: string; etiqueta: string; monto: number }) => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoMovimiento>("SANGRIA");
  const [montoStr, setMontoStr] = useState("");
  const [motivoElegido, setMotivoElegido] = useState<string>(TIPOS_MOVIMIENTO[0]!.motivos[0]!);
  const [motivoLibre, setMotivoLibre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);
  /** Efectivo en caja ahora mismo. `null` mientras carga: nunca se inventa un número. */
  const [caja_, setCaja_] = useState<{ efectivo: number; fondo: number } | null>(null);

  const def: DefMovimiento = TIPOS_MOVIMIENTO.find((t) => t.codigo === tipo) ?? TIPOS_MOVIMIENTO[0]!;
  const monto = Number(montoStr || 0);
  const tienePermiso = ROLES_CAJA.includes(empleado.rol);
  const esOtro = motivoElegido === OTRO;
  const motivo = (esOtro ? motivoLibre : motivoElegido).trim();

  // El mismo dato que ve el corte X: se lee una vez al abrir. Si falla, la pantalla sigue
  // funcionando sin el bloque de saldos — capturar el movimiento importa más que mostrarlo.
  useEffect(() => {
    let vivo = true;
    leerReporteX(token, turno.id)
      .then((x) => vivo && setCaja_({ efectivo: x.efectivoEsperado, fondo: x.fondoApertura }))
      .catch(() => {});
    return () => { vivo = false; };
  }, [token, turno.id]);

  const saldoDespues = caja_ ? caja_.efectivo + def.signo * monto : null;
  const dejaEnRojo = saldoDespues !== null && saldoDespues < 0;
  const bajoFondo = saldoDespues !== null && caja_ !== null && !dejaEnRojo && saldoDespues < caja_.fondo;

  function cambiarTipo(t: DefMovimiento) {
    setTipo(t.codigo);
    setMotivoElegido(t.motivos[0]!);
    setMotivoLibre("");
    setError(null);
  }

  function payload(): PayloadAutorizacion {
    return {
      accion: `movimiento_${def.codigo.toLowerCase()}`,
      permisoCodigo: def.permiso,
      entidadTipo: "movimiento_caja",
      entidadId: null,
      monto,
      motivo,
      cajaId: turno.caja_id,
      turnoId: turno.id,
    };
  }

  async function ejecutarConAutorizacion(a: Autorizacion | null) {
    setProcesando(true);
    setError(null);
    try {
      const mov = await registrarMovimiento(token, {
        tenantId: caja.tenant_id,
        sucursalId: caja.sucursal_id,
        cajaId: turno.caja_id,
        turnoId: turno.id,
        diaContable: turno.dia_contable,
        tipo,
        montoMxn: monto,
        motivo,
        descripcion: descripcion.trim() || null,
        usuarioSolicitanteId: empleado.id,
        autorizacionPinId: a?.autorizacionPinId ?? null,
      });
      onRegistrado({ id: mov.id, folio: mov.folio, etiqueta: def.label, monto });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el movimiento");
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  async function onConfirmar() {
    setError(null);
    if (monto <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    if (dejaEnRojo) {
      setError("No puedes retirar más efectivo del que hay en la caja.");
      return;
    }
    if (motivo.length === 0) {
      setError("Elige o escribe el motivo");
      return;
    }
    if (!tienePermiso) {
      setPidiendoPin(true);
      return;
    }
    setProcesando(true);
    try {
      const a = await autorizacionPropia(token, payload());
      await ejecutarConAutorizacion(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar el movimiento");
      setProcesando(false);
    }
  }

  if (pidiendoPin) {
    return (
      <ModalAutorizacionPin
        token={token}
        accion={payload().accion}
        permisoCodigo={def.permiso}
        descripcion={`${def.label} · ${fmtMxn(monto)} · ${motivo}`}
        ejecutaNombre={empleado.nombre}
        monto={monto}
        entidadTipo="movimiento_caja"
        entidadId={null}
        cajaId={turno.caja_id}
        turnoId={turno.id}
        motivo={motivo}
        onAutorizado={(a) => ejecutarConAutorizacion(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  const campo =
    "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none transition-colors focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
  const etiqueta = "mb-1.5 flex items-baseline gap-2 text-[13px] font-medium text-ink-2";
  const sale = def.signo < 0;

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Movimiento de caja"
      hideTitle
      className="w-[440px] overflow-hidden rounded-lg border border-line bg-surface shadow-[0_20px_50px_rgba(22,22,26,.2)]"
    >
      {/* Cabecera con el ícono del mockup: el color dice, antes de leer, para dónde va el dinero. */}
      <div className="flex items-center gap-3 border-b border-line px-5 pb-4 pt-5">
        <div
          className={[
            "flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[11px]",
            sale ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
          ].join(" ")}
        >
          {sale ? <IconoRetiro /> : <IconoDeposito />}
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
            {sale ? "Retirar efectivo de caja" : "Depositar efectivo en caja"}
          </h2>
          <p className="text-[12.5px] text-ink-3">
            Turno {turno.codigo_turno} · {caja.nombre}
          </p>
        </div>
      </div>

      <div className="px-5 py-4">
        {/* Efectivo actual — el dato con el que el cajero decide cuánto puede sacar. */}
        <div className="mb-4 flex items-center justify-between rounded-lg border border-line bg-sel px-3.5 py-3">
          <span className="text-[13px] font-medium text-ink-2">Efectivo actual en caja</span>
          <span className="font-display text-[19px] font-bold tabular-nums">
            {caja_ ? fmtMxn(caja_.efectivo) : "—"}
          </span>
        </div>

        {/* Tipo: dos, y cada uno dice qué le pasa al efectivo. */}
        <div className={etiqueta}>Tipo de movimiento</div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {TIPOS_MOVIMIENTO.map((t) => {
            const activo = tipo === t.codigo;
            const negativo = t.signo < 0;
            return (
              <button
                key={t.codigo}
                type="button"
                onClick={() => cambiarTipo(t)}
                aria-pressed={activo}
                className={[
                  "rounded-lg border px-3.5 py-3 text-left transition-colors",
                  activo
                    ? "border-ink bg-sel shadow-[inset_0_0_0_1.5px_#16161A]"
                    : "border-line bg-surface hover:border-line-strong",
                ].join(" ")}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={[
                      "font-display text-[15px] font-bold leading-none tabular-nums",
                      negativo ? "text-danger" : "text-success",
                    ].join(" ")}
                  >
                    {negativo ? "−" : "+"}
                  </span>
                  <span className="text-[14.5px] font-semibold">{t.label}</span>
                </div>
                <div className="mt-1 text-[12px] leading-tight text-ink-3">{t.descripcion}</div>
              </button>
            );
          })}
        </div>

        {/* Monto */}
        <label className={etiqueta} htmlFor="mov-monto">
          {sale ? "Monto a retirar" : "Monto a depositar"}
          <span className="text-[11.5px] font-normal text-ink-3">Obligatorio</span>
        </label>
        <div className="relative mb-4">
          <input
            id="mov-monto"
            className={campo}
            value={montoStr}
            inputMode="decimal"
            autoFocus
            onChange={(e) => setMontoStr(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-3">MXN</span>
        </div>

        {/* Motivo: los que antes eran botones de tipo viven aquí. */}
        <label className={etiqueta} htmlFor="mov-motivo">
          Motivo
          <span className="text-[11.5px] font-normal text-ink-3">Obligatorio</span>
        </label>
        <select
          id="mov-motivo"
          className={`${campo} mb-2 bg-surface`}
          value={motivoElegido}
          onChange={(e) => setMotivoElegido(e.target.value)}
        >
          {def.motivos.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value={OTRO}>Otro…</option>
        </select>
        {esOtro && (
          <input
            className={`${campo} mb-2`}
            value={motivoLibre}
            maxLength={100}
            autoFocus
            onChange={(e) => setMotivoLibre(e.target.value)}
            placeholder="Escribe el motivo"
          />
        )}

        {/* Descripción opcional */}
        <label className={`${etiqueta} mt-2`} htmlFor="mov-desc">
          Descripción
          <span className="text-[11.5px] font-normal text-ink-3">Opcional</span>
        </label>
        <textarea
          id="mov-desc"
          className={`${campo} mb-4 h-[68px] resize-none py-2`}
          value={descripcion}
          maxLength={300}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Folio de la ficha, beneficiario, a quién se entregó…"
        />

        {/* Saldo después — con el aviso del mockup cuando el retiro deja la caja bajo el fondo. */}
        {caja_ && monto > 0 && (
          <div
            className={[
              "mb-4 rounded-lg border px-3.5 py-3",
              dejaEnRojo
                ? "border-danger/30 bg-danger-soft"
                : bajoFondo
                  ? "border-warning/30 bg-warning-soft"
                  : "border-line bg-sel",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-2">
                {sale ? "Saldo después del retiro" : "Saldo después del depósito"}
              </span>
              <span
                className={[
                  "font-display text-[19px] font-bold tabular-nums",
                  dejaEnRojo ? "text-danger" : bajoFondo ? "text-warning" : "text-ink",
                ].join(" ")}
              >
                {fmtMxn(saldoDespues ?? 0)}
              </span>
            </div>
            {dejaEnRojo && (
              <p className="mt-1 text-[12px] font-medium leading-snug text-danger" role="alert">
                No hay tanto efectivo en la caja: solo puedes retirar hasta {fmtMxn(caja_.efectivo)}.
              </p>
            )}
            {bajoFondo && (
              <p className="mt-1 text-[12px] font-medium leading-snug text-warning">
                Queda por debajo del fondo con el que abrió la caja ({fmtMxn(caja_.fondo)}).
              </p>
            )}
          </div>
        )}

        <div
          className={[
            "mb-4 rounded border px-3 py-2 text-[12.5px] font-medium",
            tienePermiso ? "border-success/25 bg-success-soft text-success" : "border-warning/25 bg-warning-soft text-warning",
          ].join(" ")}
        >
          {tienePermiso ? "Dentro de tu rol · no requiere autorización." : "Requiere PIN de un supervisor."}
        </div>

        {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Cancelar</Button>
          <Button onClick={onConfirmar} disabled={procesando || monto <= 0 || dejaEnRojo}>
            {procesando
              ? "Registrando…"
              : tienePermiso
                ? `${def.label} de ${fmtMxn(monto)}`
                : `${def.label} con autorización`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
